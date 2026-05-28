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
import { DEFAULT_TRANSPORT_KEY_EXCHANGE_PATH, shouldExcludeTransportPath, shouldHandleTransportPath } from './kit-transport-paths.js'

const MAX_ENCRYPTED_BODY = 1_048_576
const ENCRYPTABLE_RESPONSE_CONTENT_TYPES = ['application/json', 'text/sveltekit-data']

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

  const keyExchangePath = config.keyExchangePath ?? DEFAULT_TRANSPORT_KEY_EXCHANGE_PATH
  const excludePaths = config.excludePaths ?? []
  const encryptResponse = config.encryptResponse ?? true
  const requireEncryption = config.requireEncryption ?? true

  // 初始化传输加密管理器
  const result = config.crypto.transport.createServer({
    keyStore: config.keyStore,
    maxClients: config.maxClients,
  })
  if (!result.success) {
    // 安全策略：transport 已启用但服务端管理器不可用时，受保护路由必须 fail-closed，禁止明文透传。
    return createUnavailableTransportMiddleware(keyExchangePath, excludePaths)
  }
  const manager = result.data

  return async (context, next) => {
    const { event } = context
    const pathname = getRequestPathname(event.request)

    // 密钥交换端点：委托给 keyExchangeHandler
    if (pathname === keyExchangePath && event.request.method === 'POST') {
      return handleKeyExchange(manager, event.request)
    }

    // 仅对同源 API endpoint 与 SvelteKit __data 请求启用 transport；
    // 页面文档、静态资源等仍透传，避免首页 HTML 被误拦截。
    if (!shouldHandleTransportPath(pathname, keyExchangePath)) {
      return next()
    }

    // 排除路径不做加解密
    if (shouldExcludeTransportPath(pathname, excludePaths, keyExchangePath)) {
      return next()
    }

    // 请求头中无 X-Client-Id 时的处理
    const clientId = event.request.headers.get(TRANSPORT_PROTOCOL.CLIENT_ID_HEADER)
    if (!clientId) {
      if (requireEncryption) {
        // 强制加密模式：缺少 X-Client-Id 说明未完成密钥交换，拒绝请求
        return jsonError(kitM('kit_transportClientIdRequired'), 400)
      }
      // 非强制模式：透传明文（渐进式迁移兼容）
      return next()
    }

    // 检查客户端是否已注册
    const clientPublicKey = await manager.getClientPublicKey(clientId)
    if (!clientPublicKey) {
      return jsonError(kitM('kit_transportClientKeyNotFound'), 400)
    }

    // ── 解密请求 ──
    if (hasBody(event.request.method) && !isRequestBodyEmpty(event.request)) {
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

    // 只允许可安全加密的响应体离开受保护路由；无法加密时 fail-closed，禁止明文泄露。
    if (isEmptyResponse(response)) {
      return response
    }

    const contentType = response.headers.get('Content-Type') ?? ''
    if (!canEncryptResponseContentType(contentType)) {
      return jsonError(kitM('kit_transportEncryptFailed'), 500)
    }
    const contentLength = response.headers.get('Content-Length')
    if (contentLength && Number.parseInt(contentLength, 10) > MAX_ENCRYPTED_BODY) {
      return jsonError(kitM('kit_transportEncryptFailed'), 500)
    }

    try {
      const responseBody = await response.clone().text()
      if (!responseBody) {
        return response
      }

      const encryptedPayload = await manager.encryptResponse(clientId, responseBody)
      if (!encryptedPayload.success) {
        return jsonError(kitM('kit_transportEncryptFailed'), 500)
      }
      const headers = new Headers(response.headers)
      headers.set(TRANSPORT_PROTOCOL.ENCRYPTED_HEADER, TRANSPORT_PROTOCOL.ENCRYPTED_HEADER_VALUE)
      headers.delete('Content-Length')
      return new Response(JSON.stringify(encryptedPayload.data), {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    }
    catch {
      return jsonError(kitM('kit_transportEncryptFailed'), 500)
    }
  }
}

function canEncryptResponseContentType(contentType: string): boolean {
  return ENCRYPTABLE_RESPONSE_CONTENT_TYPES.some(type => contentType.includes(type))
}

function createUnavailableTransportMiddleware(
  keyExchangePath: string,
  excludePaths: string[],
): Middleware {
  return async (context, next) => {
    const pathname = getRequestPathname(context.event.request)
    if (pathname === keyExchangePath) {
      return jsonError(kitM('kit_transportKeyGenerationFailed'), 500)
    }
    if (!shouldHandleTransportPath(pathname, keyExchangePath)) {
      return next()
    }
    if (shouldExcludeTransportPath(pathname, excludePaths, keyExchangePath)) {
      return next()
    }
    return jsonError(kitM('kit_transportKeyGenerationFailed'), 500)
  }
}

function isEmptyResponse(response: Response): boolean {
  if ([204, 304].includes(response.status))
    return true
  return response.headers.get('Content-Length') === '0'
}

function getRequestPathname(request: Request): string {
  return new URL(request.url).pathname
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
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
      return jsonError(kitM('kit_transportInvalidPayload'), 400)
    }

    const clientId = await manager.registerClientKey(body.clientPublicKey)
    const serverPublicKey = manager.getServerPublicKey()

    return new Response(
      JSON.stringify({ serverPublicKey, clientId }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }
  catch {
    return jsonError(kitM('kit_transportKeyExchangeFailed'), 500)
  }
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

/** 判断请求是否真实携带 body，避免空 POST 被误判为非法密文。 */
function isRequestBodyEmpty(request: Request): boolean {
  if (request.body === null)
    return true

  const contentLength = request.headers.get('Content-Length')
  if (contentLength !== null)
    return Number.parseInt(contentLength, 10) === 0

  return false
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
    return jsonError(kitM('kit_transportInvalidPayload'), 400)
  }

  const contentType = event.request.headers.get('Content-Type') ?? ''
  if (!contentType.includes('application/json')) {
    if (!requireEncryption) {
      return null
    }
    return jsonError(kitM('kit_transportInvalidPayload'), 400)
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
    return jsonError(kitM('kit_transportDecryptFailed'), 400)
  }

  if (!isEncryptedPayloadShape(payload)) {
    if (!requireEncryption) {
      replaceRequestBody(event, bodyText)
      return null
    }
    return jsonError(kitM('kit_transportInvalidPayload'), 400)
  }

  const plaintext = manager.decryptRequest(payload)
  if (!plaintext.success) {
    return jsonError(kitM('kit_transportDecryptFailed'), 400)
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
