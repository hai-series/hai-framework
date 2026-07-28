/**
 * @h-ai/ai — 文生图 Provider 内部契约与 HTTP 辅助
 * @internal
 * @module image/providers/ai-image-provider
 */

import type { HaiResult } from '@h-ai/core'
import type { ResolvedImageModel } from '../../ai-config.js'
import type { GeneratedImage, ImageSize, ReferenceImage } from '../ai-image-types.js'

import { Buffer } from 'node:buffer'
import { err, ok } from '@h-ai/core'
import { aiM } from '../../ai-i18n.js'
import { HaiAIError } from '../../ai-types.js'

/** Provider 层文生图请求 */
export interface ProviderGenerateImageRequest {
  model: ResolvedImageModel
  prompt: string
  size?: ImageSize
  referenceImages: ReferenceImage[]
  signal?: AbortSignal
}

/** 文生图 Provider 内部接口 */
export interface ImageProvider {
  generate: (request: ProviderGenerateImageRequest) => Promise<HaiResult<GeneratedImage[]>>
}

interface ImageUpstreamErrorDetails {
  status: number
  upstreamCode?: string
  upstreamMessage?: string
  requestId?: string
}

/** 将 Base64 图片转换为公共图片结构 */
export function imageFromBase64(data: string, mimeType: string, size?: ImageSize): GeneratedImage {
  return {
    data: new Uint8Array(Buffer.from(data, 'base64')),
    mimeType,
    width: size?.width,
    height: size?.height,
  }
}

/** 将参考图转换为厂商 JSON 接口通用的 Data URL */
export function referenceImageDataUrl(image: ReferenceImage): string {
  return `data:${image.mimeType};base64,${referenceImageBase64(image)}`
}

/** 将参考图转换为不带 Data URL 前缀的 Base64 */
export function referenceImageBase64(image: ReferenceImage): string {
  return Buffer.from(image.data).toString('base64')
}

/** 将参考图追加到 multipart 表单，并生成仅用于传输的安全文件名 */
export function appendReferenceImages(form: FormData, field: string, images: ReferenceImage[]): void {
  images.forEach((image, index) => {
    const subtype = image.mimeType.split('/')[1]?.replace(/[^a-z0-9.+-]/gi, '') || 'bin'
    const bytes = image.data.buffer.slice(image.data.byteOffset, image.data.byteOffset + image.data.byteLength) as ArrayBuffer
    form.append(field, new Blob([bytes], { type: image.mimeType }), `reference-${index + 1}.${subtype}`)
  })
}

/** 读取成功 HTTP 响应 JSON；失败时转换为统一上游错误 */
export async function readJson(response: Response): Promise<HaiResult<unknown>> {
  if (!response.ok)
    return imageUpstreamError(response)
  try {
    return ok(await response.json())
  }
  catch (error) {
    return err(HaiAIError.IMAGE_PROTOCOL_ERROR, aiM('ai_imageProtocolError'), error)
  }
}

/** 下载厂商临时图片 URL，并立即转换为字节，避免链接过期泄漏到公共层 */
export async function downloadImage(url: string, signal?: AbortSignal, size?: ImageSize): Promise<HaiResult<GeneratedImage>> {
  const response = await fetch(url, { signal })
  return readImageResponse(response, size)
}

/** 将图片 HTTP 响应校验并转换为公共图片结构 */
export async function readImageResponse(response: Response, size?: ImageSize, fallbackMimeType = 'image/png'): Promise<HaiResult<GeneratedImage>> {
  if (!response.ok)
    return imageUpstreamError(response)
  const contentType = response.headers.get('content-type')?.split(';')[0] || fallbackMimeType
  if (!contentType.startsWith('image/'))
    return imageProtocolError()
  const data = new Uint8Array(await response.arrayBuffer())
  if (data.byteLength === 0)
    return imageProtocolError()
  return ok({
    data,
    mimeType: contentType,
    width: size?.width,
    height: size?.height,
  })
}

/** 将 Provider 抛出的异常转换为公共 HaiResult */
export function imageProviderFailure(error: unknown): HaiResult<never> {
  if (error instanceof DOMException && error.name === 'AbortError')
    return err(HaiAIError.IMAGE_CANCELLED, aiM('ai_imageCancelled'), error)
  return err(HaiAIError.IMAGE_UPSTREAM_ERROR, aiM('ai_imageRequestFailed'), error)
}

/** 创建响应格式错误 */
export function imageProtocolError(): HaiResult<never> {
  return err(HaiAIError.IMAGE_PROTOCOL_ERROR, aiM('ai_imageProtocolError'))
}

/** 提取安全、有限的上游错误摘要，供调用日志定位问题。 */
async function imageUpstreamError(response: Response): Promise<HaiResult<never>> {
  const details: ImageUpstreamErrorDetails = {
    status: response.status,
    requestId: response.headers.get('x-request-id') ?? response.headers.get('request-id') ?? undefined,
  }
  try {
    const body = await response.json() as {
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
