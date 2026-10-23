/**
 * @h-ai/ai — 文生图 Provider 内部契约与 HTTP 辅助
 * @internal
 * @module image/providers/ai-image-provider
 */

import type { HaiResult } from '@h-ai/core'
import type { LookupFunction } from 'node:net'
import type { Response as UndiciResponse } from 'undici'
import type { ResolvedImageModel } from '../../ai-config.js'
import type { GeneratedImage, ImageSize, ReferenceImage } from '../ai-image-types.js'

import { Buffer } from 'node:buffer'
import dns from 'node:dns'
import { BlockList, isIP } from 'node:net'
import { err, ok } from '@h-ai/core'
import { Agent, fetch as fetchImage } from 'undici'
import { aiM } from '../../ai-i18n.js'
import { HaiAIError } from '../../ai-types.js'

/**
 * Provider 层文生图请求；signal 已包含整次操作的 deadline。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * function request(model: ResolvedImageModel): ProviderGenerateImageRequest {
 *   return { model, prompt: '一座山', referenceImages: [], maxImageBytes: 20 * 1024 * 1024, maxImages: 1 }
 * }
 * ```
 */
export interface ProviderGenerateImageRequest {
  model: ResolvedImageModel
  prompt: string
  size?: ImageSize
  referenceImages: ReferenceImage[]
  signal?: AbortSignal
  /** 单张图片字节上限；JSON 最多读取 max(64 KiB, 两倍图片上限)。 */
  maxImageBytes: number
  /** 单次图片数量上限。 */
  maxImages: number
}

/**
 * 文生图 Provider 内部接口。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * async function generate(provider: ImageProvider, request: ProviderGenerateImageRequest) {
 *   const result = await provider.generate(request)
 *   if (!result.success) return result
 *   return result.data.map(image => ({ mimeType: image.mimeType, bytes: image.data.byteLength }))
 * }
 * ```
 */
export interface ImageProvider {
  generate: (request: ProviderGenerateImageRequest) => Promise<HaiResult<GeneratedImage[]>>
}

/**
 * 受限上游错误诊断结构；保留状态与有限摘要，不包含完整请求或签名下载地址。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const details: ImageUpstreamErrorDetails = { status: 429, upstreamCode: 'rate_limit', requestId: 'request-1' }
 * const diagnostic = { status: details.status, requestId: details.requestId }
 * ```
 */
interface ImageUpstreamErrorDetails {
  status: number
  upstreamCode?: string
  upstreamMessage?: string
  requestId?: string
}

/** 地址拒绝只携带固定说明，不把厂商签名 URL 或 DNS 详情写进错误日志。 */
class ImageDownloadBlockedError extends Error {}

/**
 * 厂商请求使用全局 fetch，受限下载使用与 Agent 同版本的 undici fetch。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * async function read(response: ImageHttpResponse) {
 *   const result = await readJson(response, { maxImageBytes: 1024 })
 *   if (!result.success) return result
 *   return result.data
 * }
 * ```
 */
type ImageHttpResponse = Response | UndiciResponse

/** IANA 特殊用途地址不作为上游图片下载目标；IPv6 仅开放普通全局单播。 */
const blockedAddresses = new BlockList()
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) blockedAddresses.addSubnet(address, prefix, 'ipv4')
for (const [address, prefix] of [['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3ffe::', 16], ['3fff::', 20]] as const)
  blockedAddresses.addSubnet(address, prefix, 'ipv6')
const globalIpv6 = new BlockList()
globalIpv6.addSubnet('2000::', 3, 'ipv6')

/** 不接受映射/转换地址、回环、私网、链路本地、组播及保留地址。 */
function isPublicImageAddress(address: string): boolean {
  const family = isIP(address)
  return family === 4
    ? !blockedAddresses.check(address, 'ipv4')
    : family === 6 && globalIpv6.check(address, 'ipv6') && !blockedAddresses.check(address, 'ipv6')
}

/** 在真实 socket lookup 中校验并返回同一批地址，不能校验后再让 fetch 二次解析。 */
const imageLookup: LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
    if (error)
      return callback(error, '')
    if (!addresses.length || addresses.some(item => !isPublicImageAddress(item.address)))
      return callback(new ImageDownloadBlockedError('Image download address is blocked'), '')
    const candidates = options.family ? addresses.filter(item => item.family === options.family) : addresses
    if (!candidates.length)
      return callback(new ImageDownloadBlockedError('Image download address is blocked'), '')
    if (options.all)
      callback(null, candidates)
    else
      callback(null, candidates[0].address, candidates[0].family)
  })
}

/** 每一跳仅允许无 URL 凭证的公共 HTTPS；端口固定为 HTTPS 默认端口。 */
function checkedImageUrl(value: string, base?: URL): URL {
  let url: URL
  try {
    url = new URL(value, base)
  }
  catch {
    throw new ImageDownloadBlockedError('Image download URL is blocked')
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  if (url.protocol !== 'https:' || url.username || url.password || url.port
    || !hostname || (isIP(hostname) && !isPublicImageAddress(hostname))) {
    throw new ImageDownloadBlockedError('Image download URL is blocked')
  }
  return url
}

/** 逐块限流读取实际字节；取消、超限与格式失败均取消 reader，释放响应连接。 */
async function readImageBody(response: ImageHttpResponse, maxBytes: number, signal?: AbortSignal): Promise<Uint8Array> {
  const declared = response.headers.get('content-length')
  if (declared && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
    await response.body?.cancel()
    throw new RangeError('Image response exceeds byte limit')
  }
  if (!response.body)
    return new Uint8Array()
  const reader = response.body.getReader()
  const abort = () => {
    void reader.cancel(signal?.reason).catch(() => {})
  }
  signal?.addEventListener('abort', abort, { once: true })
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      signal?.throwIfAborted()
      const chunk = await reader.read()
      signal?.throwIfAborted()
      if (chunk.done)
        break
      length += chunk.value.byteLength
      if (length > maxBytes)
        throw new RangeError('Image response exceeds byte limit')
      chunks.push(chunk.value)
    }
    return new Uint8Array(Buffer.concat(chunks, length))
  }
  finally {
    signal?.removeEventListener('abort', abort)
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

/**
 * 校验允许的栅格 MIME 与文件魔数；这是类型识别，不是完整图片解码/尺寸验证。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const result = validateImageOutput({ data: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), mimeType: 'image/png' }, 1024)
 * if (result.success) {
 *   const mimeType = result.data.mimeType // 魔数识别不代替完整图片解码。
 * }
 * ```
 */
export function validateImageOutput(image: GeneratedImage, maxBytes: number): HaiResult<GeneratedImage> {
  if (image.data.byteLength > maxBytes)
    return err(HaiAIError.IMAGE_TOO_LARGE, aiM('ai_imageTooLarge'))
  const bytes = image.data
  const mime = image.mimeType.toLowerCase() === 'image/jpg' ? 'image/jpeg' : image.mimeType.toLowerCase()
  const prefix = (value: number[]) => value.every((byte, index) => bytes[index] === byte)
  const valid = mime === 'image/png'
    ? prefix([137, 80, 78, 71, 13, 10, 26, 10])
    : mime === 'image/jpeg'
      ? prefix([255, 216, 255])
      : mime === 'image/gif'
        ? ['GIF87a', 'GIF89a'].includes(Buffer.from(bytes.subarray(0, 6)).toString('ascii'))
        : mime === 'image/webp' && Buffer.from(bytes.subarray(0, 4)).toString('ascii') === 'RIFF' && Buffer.from(bytes.subarray(8, 12)).toString('ascii') === 'WEBP'
  return valid ? ok({ ...image, mimeType: mime }) : imageProtocolError()
}

/**
 * 先核验解码字节预算，再将 Base64 转为图片结构；超限抛 RangeError，由 Provider 边界转换。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const image = imageFromBase64('iVBORw0KGgo=', 'image/png', { maxImageBytes: 1024 })
 * const result = validateImageOutput(image, 1024)
 * if (!result.success) {
 *   const code = result.error.code
 * }
 * ```
 */
export function imageFromBase64(data: string, mimeType: string, options: { size?: ImageSize, maxImageBytes: number }): GeneratedImage {
  if (Buffer.byteLength(data, 'base64') > options.maxImageBytes)
    throw new RangeError('Image response exceeds byte limit')
  return {
    data: new Uint8Array(Buffer.from(data, 'base64')),
    mimeType,
    width: options.size?.width,
    height: options.size?.height,
  }
}

/**
 * 将参考图转换为厂商 JSON 接口通用的 Data URL
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const dataUrl = referenceImageDataUrl({ data: new Uint8Array([137, 80, 78, 71]), mimeType: 'image/png' })
 * const prefix = dataUrl.slice(0, dataUrl.indexOf(','))
 * ```
 */
export function referenceImageDataUrl(image: ReferenceImage): string {
  return `data:${image.mimeType};base64,${referenceImageBase64(image)}`
}

/**
 * 将参考图转换为不带 Data URL 前缀的 Base64
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const base64 = referenceImageBase64({ data: new Uint8Array([137, 80, 78, 71]), mimeType: 'image/png' })
 * const byteLength = Buffer.byteLength(base64, 'base64')
 * ```
 */
export function referenceImageBase64(image: ReferenceImage): string {
  return Buffer.from(image.data).toString('base64')
}

/**
 * 将参考图追加到 multipart 表单，并生成仅用于传输的安全文件名
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const form = new FormData()
 * appendReferenceImages(form, 'image[]', [{ data: new Uint8Array([137, 80, 78, 71]), mimeType: 'image/png' }])
 * const files = form.getAll('image[]')
 * ```
 */
export function appendReferenceImages(form: FormData, field: string, images: ReferenceImage[]): void {
  images.forEach((image, index) => {
    const subtype = image.mimeType.split('/')[1]?.replace(/[^a-z0-9.+-]/gi, '') || 'bin'
    const bytes = image.data.buffer.slice(image.data.byteOffset, image.data.byteOffset + image.data.byteLength) as ArrayBuffer
    form.append(field, new Blob([bytes], { type: image.mimeType }), `reference-${index + 1}.${subtype}`)
  })
}

/**
 * 有界读取成功 HTTP 响应 JSON；失败时转换为统一上游错误。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const result = await readJson(new Response('{"data":[]}', { headers: { 'Content-Type': 'application/json' } }), { maxImageBytes: 1024 })
 * if (result.success) {
 *   const body = result.data // unknown：厂商适配层继续验证响应结构。
 * }
 * ```
 */
export async function readJson(response: ImageHttpResponse, request: Pick<ProviderGenerateImageRequest, 'maxImageBytes' | 'signal'>): Promise<HaiResult<unknown>> {
  if (!response.ok)
    return imageUpstreamError(response, request.signal)
  try {
    return ok(JSON.parse(new TextDecoder().decode(await readImageBody(response, Math.max(64 * 1024, request.maxImageBytes * 2), request.signal))))
  }
  catch (error) {
    if (error instanceof RangeError || request.signal?.aborted)
      return imageProviderFailure(error)
    return err(HaiAIError.IMAGE_PROTOCOL_ERROR, aiM('ai_imageProtocolError'), error)
  }
}

/**
 * 限定公网 HTTPS 与实际 DNS 连接，逐跳校验重定向并有界读取，finally 销毁专属 Agent。
 * 网络/读取异常由外层 Provider 转成 HaiResult；禁止把 API 鉴权或 Cookie 带入此下载。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * async function download(url: string, request: ProviderGenerateImageRequest) {
 *   // url 来自厂商；下载器仍逐跳验证公共 HTTPS 地址并绑定实际 DNS 结果。
 *   const result = await downloadImage(url, request)
 *   if (!result.success) return result
 *   return result.data
 * }
 * ```
 */
export async function downloadImage(url: string, request: ProviderGenerateImageRequest): Promise<HaiResult<GeneratedImage>> {
  const dispatcher = new Agent({ connect: { lookup: imageLookup }, connections: 1 })
  try {
    let target = checkedImageUrl(url)
    for (let redirect = 0; redirect <= 3; redirect++) {
      request.signal?.throwIfAborted()
      const response = await fetchImage(target, { signal: request.signal, redirect: 'manual', dispatcher })
      if (![301, 302, 303, 307, 308].includes(response.status))
        return await readImageResponse(response, request)
      const location = response.headers.get('location')
      await response.body?.cancel()
      if (!location || redirect === 3)
        return imageProtocolError()
      target = checkedImageUrl(location, target)
    }
    return imageProtocolError()
  }
  finally {
    // 使用 destroy 而非等待未消费/中断的连接自然结束。
    await dispatcher.destroy()
  }
}

/**
 * 有界串行下载，避免上游数组并行放大连接数与内存；失败不返回部分图片。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * async function download(urls: string[], request: ProviderGenerateImageRequest) {
 *   const result = await downloadImages(urls, request)
 *   if (!result.success) return result
 *   return result.data.length // 失败时不发布部分下载结果。
 * }
 * ```
 */
export async function downloadImages(urls: string[], request: ProviderGenerateImageRequest): Promise<HaiResult<GeneratedImage[]>> {
  if (urls.length > request.maxImages)
    return err(HaiAIError.IMAGE_TOO_LARGE, aiM('ai_imageTooLarge'))
  const images: GeneratedImage[] = []
  for (const url of urls) {
    const downloaded = await downloadImage(url, request)
    if (!downloaded.success)
      return downloaded
    images.push(downloaded.data)
  }
  return ok(images)
}

/**
 * 按 MIME、实际流字节上限和魔数验证 HTTP 图片；读取异常由 Provider 边界处理。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * async function read(response: ImageHttpResponse, request: ProviderGenerateImageRequest) {
 *   const result = await readImageResponse(response, request)
 *   if (!result.success) return result
 *   return result.data.mimeType
 * }
 * ```
 */
export async function readImageResponse(response: ImageHttpResponse, request: ProviderGenerateImageRequest): Promise<HaiResult<GeneratedImage>> {
  if (!response.ok)
    return imageUpstreamError(response, request.signal)
  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
  if (!contentType || !['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'].includes(contentType)) {
    await response.body?.cancel()
    return imageProtocolError()
  }
  return validateImageOutput({
    data: await readImageBody(response, request.maxImageBytes, request.signal),
    mimeType: contentType,
    width: request.size?.width,
    height: request.size?.height,
  }, request.maxImageBytes)
}

/**
 * 将 Provider 异常转换为稳定的下载拒绝、超限、超时、取消或上游错误。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const result = imageProviderFailure(new RangeError('Image response exceeds byte limit'))
 * if (!result.success) {
 *   const tooLarge = result.error.code === HaiAIError.IMAGE_TOO_LARGE.code
 * }
 * ```
 */
export function imageProviderFailure(error: unknown): HaiResult<never> {
  let cause = error
  for (let depth = 0; depth < 4 && cause instanceof Error; depth++, cause = cause.cause) {
    if (cause instanceof ImageDownloadBlockedError)
      return err(HaiAIError.IMAGE_DOWNLOAD_BLOCKED, aiM('ai_imageDownloadBlocked'))
  }
  if (error instanceof RangeError)
    return err(HaiAIError.IMAGE_TOO_LARGE, aiM('ai_imageTooLarge'))
  if (error instanceof DOMException && error.name === 'TimeoutError')
    return err(HaiAIError.IMAGE_TIMEOUT, aiM('ai_imageTimeout'))
  if (error instanceof DOMException && error.name === 'AbortError')
    return err(HaiAIError.IMAGE_CANCELLED, aiM('ai_imageCancelled'), error)
  return err(HaiAIError.IMAGE_UPSTREAM_ERROR, aiM('ai_imageRequestFailed'), error)
}

/**
 * 创建响应格式错误
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const result = imageProtocolError()
 * if (!result.success) {
 *   const code = result.error.code
 * }
 * ```
 */
export function imageProtocolError(): HaiResult<never> {
  return err(HaiAIError.IMAGE_PROTOCOL_ERROR, aiM('ai_imageProtocolError'))
}

/** 提取安全、有限的上游错误摘要，供调用日志定位问题。 */
async function imageUpstreamError(response: ImageHttpResponse, signal?: AbortSignal): Promise<HaiResult<never>> {
  const details: ImageUpstreamErrorDetails = {
    status: response.status,
    requestId: response.headers.get('x-request-id') ?? response.headers.get('request-id') ?? undefined,
  }
  try {
    const body = JSON.parse(new TextDecoder().decode(await readImageBody(response, 64 * 1024, signal))) as {
      code?: unknown
      message?: unknown
      error?: { code?: unknown, message?: unknown, requestId?: unknown } | string
    }
    const nested = typeof body.error === 'object' && body.error ? body.error : undefined
    const code = nested?.code ?? body.code
    const message = nested?.message ?? body.message ?? (typeof body.error === 'string' ? body.error : undefined)
    if (typeof code === 'string')
      details.upstreamCode = code.slice(0, 120)
    if (typeof message === 'string')
      details.upstreamMessage = message.slice(0, 500)
    if (typeof nested?.requestId === 'string')
      details.requestId = nested.requestId.slice(0, 120)
  }
  catch {
    signal?.throwIfAborted()
    // 非 JSON 错误页只记录 HTTP 状态，避免日志泄漏任意响应正文。
  }

  const message = response.status === 401
    ? aiM('ai_imageAuthenticationFailed')
    : response.status === 402
      ? aiM('ai_imagePaymentRequired')
      : response.status === 403
        ? aiM('ai_imageAccessDenied')
        : aiM('ai_imageUpstreamError', { params: { status: response.status } })
  return err(HaiAIError.IMAGE_UPSTREAM_ERROR, message, details)
}
