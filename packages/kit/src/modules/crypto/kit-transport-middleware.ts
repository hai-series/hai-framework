/**
 * @h-ai/kit — 传输加密中间件
 *
 * SvelteKit 中间件，自动对请求/响应进行传输加密解密。
 * @module kit-transport-middleware
 */

import type { EncryptedPayload, TransportEncryptionManager } from '@h-ai/crypto'
import type { Middleware } from '../../kit-types.js'
import type { TransportEncryptionConfig } from './kit-crypto-types.js'
import { TRANSPORT_PROTOCOL } from '@h-ai/crypto'
import { kitM } from '../../kit-i18n.js'

const DEFAULT_KEY_EXCHANGE_PATH = `/api${TRANSPORT_PROTOCOL.DEFAULT_KEY_EXCHANGE_PATH}`
const MAX_ENCRYPTED_BODY = 1_048_576

/**
 * 创建传输加密中间件
 *
 * @param config - 传输加密配置
 * @returns SvelteKit 中间件
 *
 * @example
 * ```ts
 * import { crypto } from '@h-ai/crypto'
 * import { kit } from '@h-ai/kit'
 *
 * // 传输加密通过 createHandle 的 crypto 配置自动启用：
 * export const handle = kit.createHandle({
 *   crypto: { crypto, transport: true },
 * })
 * ```
 */
export function transportEncryptionMiddleware(config: TransportEncryptionConfig): Middleware {
  // 未启用时直接透传
  if (!config.enabled) {
    return async (_context, next) => next()
  }

  const keyExchangePath = config.keyExchangePath ?? DEFAULT_KEY_EXCHANGE_PATH
  const excludePaths = config.excludePaths ?? []
  const encryptResponse = config.encryptResponse ?? true
  const requireEncryption = config.requireEncryption ?? true

  // 初始化传输加密管理器
  const result = config.crypto.transport.createServer({ maxClients: config.maxClients })
  if (!result.success) {
    // 密钥生成失败时降级为透传
    return async (_context, next) => next()
  }
  const manager = result.data

  return async (context, next) => {
    const { event } = context
    const pathname = event.url.pathname

    // 密钥交换端点：委托给 keyExchangeHandler
    if (pathname === keyExchangePath && event.request.method === 'POST') {
      return handleKeyExchange(manager, event.request)
    }

    // 排除路径不做加解密
    if (shouldExclude(pathname, excludePaths, keyExchangePath)) {
      return next()
    }

    // 请求头中无 X-Client-Id 时的处理
    const clientId = event.request.headers.get(TRANSPORT_PROTOCOL.CLIENT_ID_HEADER)
    if (!clientId) {
      if (requireEncryption) {
        // 强制加密模式：缺少 X-Client-Id 说明未完成密钥交换，拒绝请求
        return new Response(
          JSON.stringify({ error: kitM('kit_transportClientIdRequired') }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        )
      }
      // 非强制模式：透传明文（渐进式迁移兼容）
      return next()
    }

    // 检查客户端是否已注册
    const clientPublicKey = await manager.getClientPublicKey(clientId)
    if (!clientPublicKey) {
      return new Response(
        JSON.stringify({ error: kitM('kit_transportClientKeyNotFound') }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }

    // ── 解密请求 ──
    if (hasBody(event.request.method)) {
      const decryptResult = await decryptRequestBody(event, manager, requireEncryption)
      if (decryptResult) {
        return decryptResult
      }
    }

    // ── 执行后续中间件/端点 ──
    const response = await next()

    // ── 加密响应 ──
    if (!encryptResponse) {
      return response
    }

    // 跳过非 JSON 响应和大体积响应（>1MB），避免内存问题
    const contentType = response.headers.get('Content-Type') ?? ''
    if (!contentType.includes('application/json')) {
      return response
    }
    const contentLength = response.headers.get('Content-Length')
    if (contentLength && Number.parseInt(contentLength, 10) > MAX_ENCRYPTED_BODY) {
      return response
    }

    try {
      const responseBody = await response.clone().text()
      if (!responseBody) {
        return response
      }

      const encryptedPayload = await manager.encryptResponse(clientId, responseBody)
      if (!encryptedPayload.success) {
        return response
      }
      const headers = new Headers(response.headers)
      headers.set('Content-Type', 'application/json')
      headers.set(TRANSPORT_PROTOCOL.ENCRYPTED_HEADER, TRANSPORT_PROTOCOL.ENCRYPTED_HEADER_VALUE)
      headers.delete('Content-Length')
      return new Response(JSON.stringify(encryptedPayload.data), {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    }
    catch {
      // 加密失败时返回原始响应
      return response
    }
  }
}

/**
 * 处理密钥交换 POST 请求
 *
 * 接收客户端公钥，注册并返回服务端公钥与 clientId。
 *
 * @param manager - 传输加密管理器
 * @param request - 原始 Request
 * @returns JSON Response
 */
async function handleKeyExchange(
  manager: TransportEncryptionManager,
  request: Request,
): Promise<Response> {
  try {
    const body = await request.json() as { clientPublicKey?: string }

    if (!body.clientPublicKey || typeof body.clientPublicKey !== 'string') {
      return new Response(
        JSON.stringify({ error: kitM('kit_transportInvalidPayload') }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const clientId = await manager.registerClientKey(body.clientPublicKey)
    const serverPublicKey = manager.getServerPublicKey()

    return new Response(
      JSON.stringify({ serverPublicKey, clientId }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }
  catch {
    return new Response(
      JSON.stringify({ error: kitM('kit_transportKeyExchangeFailed') }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}

/**
 * 判断路径是否应排除传输加解密
 *
 * @param pathname - 当前请求路径
 * @param excludePaths - 配置的排除列表
 * @param keyExchangePath - 密钥交换端点路径
 * @returns 是否排除
 */
function shouldExclude(pathname: string, excludePaths: string[], keyExchangePath: string): boolean {
  if (pathname === keyExchangePath)
    return true
  return excludePaths.some(p => pathname === p || pathname.startsWith(`${p}/`))
}

/**
 * 判断 HTTP 方法是否可能携带请求体
 *
 * @param method - HTTP 方法字符串
 * @returns `true` 表示 POST / PUT / PATCH / DELETE
 */
function hasBody(method: string): boolean {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase())
}

interface RequestHolder {
  request: Request
}

/**
 * 重建 SvelteKit 事件中的 Request。
 *
 * `request.text()` 会消费 body；当请求不是加密载荷但允许明文透传时，必须把
 * 原始 body 放回去，避免后续端点再读取时得到空内容。
 *
 * @param event SvelteKit 请求事件
 * @param body 新请求体
 */
function replaceRequestBody(event: RequestHolder, body: string): void {
  const headers = new Headers(event.request.headers)
  headers.delete(TRANSPORT_PROTOCOL.ENCRYPTED_HEADER)
  headers.delete('Content-Length')
  headers.set('Content-Type', 'application/json; charset=utf-8')
  const newRequest = new Request(event.request.url, {
    method: event.request.method,
    headers,
    body,
  })
  Object.defineProperty(event, 'request', {
    value: newRequest,
    writable: true,
    configurable: true,
  })
}

/**
 * 尝试解密请求体。
 *
 * 非 JSON 请求体（例如 multipart/form-data 文件上传）无法承载传输加密 JSON
 * 载荷；在非强制加密模式下应原样透传，不读取 body，避免破坏浏览器生成的
 * multipart 边界。
 *
 * @param event SvelteKit 请求事件
 * @param manager 传输加密管理器
 * @param requireEncryption 是否强制要求请求加密
 * @returns 需要提前返回的错误响应；返回 null 表示继续后续中间件
 */
async function decryptRequestBody(
  event: RequestHolder,
  manager: TransportEncryptionManager,
  requireEncryption: boolean,
): Promise<Response | null> {
  const isEncrypted = event.request.headers.get(TRANSPORT_PROTOCOL.ENCRYPTED_HEADER)
    === TRANSPORT_PROTOCOL.ENCRYPTED_HEADER_VALUE
  if (!isEncrypted) {
    if (!requireEncryption)
      return null
    return new Response(
      JSON.stringify({ error: kitM('kit_transportInvalidPayload') }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const contentType = event.request.headers.get('Content-Type') ?? ''
  if (!contentType.includes('application/json')) {
    if (!requireEncryption) {
      return null
    }
    return new Response(
      JSON.stringify({ error: kitM('kit_transportInvalidPayload') }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const bodyText = await event.request.text()
  if (!bodyText) {
    return null
  }

  let payload: unknown
  try {
    payload = JSON.parse(bodyText) as unknown
  }
  catch {
    if (!requireEncryption) {
      replaceRequestBody(event, bodyText)
      return null
    }
    return new Response(
      JSON.stringify({ error: kitM('kit_transportDecryptFailed') }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  if (!isEncryptedPayloadShape(payload)) {
    if (!requireEncryption) {
      replaceRequestBody(event, bodyText)
      return null
    }
    return new Response(
      JSON.stringify({ error: kitM('kit_transportInvalidPayload') }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const plaintext = manager.decryptRequest(payload)
  if (!plaintext.success) {
    return new Response(
      JSON.stringify({ error: kitM('kit_transportDecryptFailed') }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }
  replaceRequestBody(event, plaintext.data)
  return null
}

function isEncryptedPayloadShape(payload: unknown): payload is EncryptedPayload {
  if (!payload || typeof payload !== 'object')
    return false
  const p = payload as Record<string, unknown>
  return typeof p.encryptedKey === 'string' && typeof p.ciphertext === 'string' && typeof p.iv === 'string'
}
