/**
 * @h-ai/kit — 传输加密中间件
 *
 * SvelteKit 中间件，自动对请求/响应进行传输加密解密。
 * @module kit-transport-middleware
 */

import type { TransportEncryptionManager, TransportMessageContext } from '@h-ai/crypto'
import type { Middleware } from '../../kit-types.js'
import type { TransportEncryptionConfig } from './kit-crypto-types.js'
import { authenticateTransportRequest, createTransportErrorResponse, isValidSM2PublicKey, readTransportBody, TRANSPORT_BODY_LIMITS, TRANSPORT_PROTOCOL, TransportBodyTooLargeError } from '@h-ai/crypto'
import { kitM } from '../../kit-i18n.js'
import { DEFAULT_TRANSPORT_KEY_EXCHANGE_PATH, shouldExcludeTransportPath, shouldHandleTransportPath } from './kit-transport-paths.js'

const ENCRYPTABLE_RESPONSE_CONTENT_TYPES = ['application/json', 'text/sveltekit-data']

/**
 * 创建传输加密中间件
 *
 * @param config - 传输加密配置
 * @returns SvelteKit 中间件
 * @example 模块内部上下文
 * ```ts
 * function install(config: TransportEncryptionConfig) {
 *   return transportEncryptionMiddleware(config) // 受管密钥环、共享 keyStore 与 crypto 生命周期由应用管理。
 * }
 * ```
 */
export function transportEncryptionMiddleware(config: TransportEncryptionConfig): Middleware {
  // 未启用时直接透传
  if (!config.enabled) {
    return async (_context, next) => next()
  }

  const keyExchangePath = config.keyExchangePath ?? DEFAULT_TRANSPORT_KEY_EXCHANGE_PATH
  const excludePaths = config.excludePaths ?? []

  // 初始化传输加密管理器
  const result = config.crypto.transport.createServer({
    serverKeyRing: config.serverKeyRing,
    keyStore: config.keyStore,
    maxPlaintextBytes: config.maxPlaintextBytes,
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
    if (!clientId)
      return jsonError(kitM('kit_transportClientIdRequired'), 400)

    // ── 解密请求 ──
    // 不依赖可伪造/省略的 Content-Length/Type 判空，非 null 流必须进入实际内容检查。
    let requestContext: TransportMessageContext
    try {
      const verified = await authenticateTransportRequest(manager, event.request)
      if (!verified.success)
        return jsonError(kitM('kit_transportDecryptFailed'), 400)
      requestContext = verified.data.context
      if (event.request.method !== 'GET' && event.request.method !== 'HEAD')
        replaceRequestBody(event, verified.data.plaintext)
    }
    catch (error) {
      if (error instanceof TransportBodyTooLargeError)
        return createTransportErrorResponse(error)
      return jsonError(kitM('kit_transportInvalidPayload'), error instanceof RangeError ? 413 : 400)
    }

    // ── 执行后续中间件/端点 ──
    const response = await next()

    // ── 加密响应 ──

    // 只允许可安全加密的响应体离开受保护路由；无法加密时 fail-closed，禁止明文泄露。
    const bodyless = event.request.method === 'HEAD' || isEmptyResponse(response)
    if (bodyless)
      void response.body?.cancel().catch(() => {})

    const contentType = response.headers.get('Content-Type') ?? ''
    if (!bodyless && !canEncryptResponseContentType(contentType)) {
      void response.body?.cancel().catch(() => {})
      return jsonError(kitM('kit_transportEncryptFailed'), 500)
    }
    try {
      const responseBody = bodyless
        ? ''
        : await readTransportBody(response.body, {
            maxBytes: manager.bodyLimits.plaintextBytes,
            direction: 'response',
            signal: event.request.signal,
          })
      const headers = new Headers(response.headers)
      headers.delete(TRANSPORT_PROTOCOL.ENCRYPTED_HEADER)
      headers.delete(TRANSPORT_PROTOCOL.ENVELOPE_HEADER)
      headers.delete('Content-Length')
      headers.delete('Content-Encoding')

      const encryptedPayload = await manager.encryptResponse(requestContext, responseBody, response.status)
      if (!encryptedPayload.success) {
        return jsonError(kitM('kit_transportEncryptFailed'), 500)
      }
      headers.set(TRANSPORT_PROTOCOL.ENCRYPTED_HEADER, TRANSPORT_PROTOCOL.ENCRYPTED_HEADER_VALUE)
      if (bodyless)
        headers.set(TRANSPORT_PROTOCOL.ENVELOPE_HEADER, JSON.stringify(encryptedPayload.data))
      return new Response(bodyless ? null : JSON.stringify(encryptedPayload.data), {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    }
    catch (error) {
      if (error instanceof TransportBodyTooLargeError)
        return createTransportErrorResponse(error, { manager, context: requestContext })
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
  // Content-Length 不能证明响应流为空，避免明文伪装零长度后绕过加密。
  return response.body === null
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
  let body: unknown
  try {
    body = JSON.parse(await readTransportBody(request.body, {
      maxBytes: TRANSPORT_BODY_LIMITS.keyExchangeBytes,
      signal: request.signal,
    }))
  }
  catch (error) {
    return jsonError(kitM('kit_transportInvalidPayload'), error instanceof RangeError ? 413 : 400)
  }
  if (!body || typeof body !== 'object' || !('clientPublicKey' in body)
    || !isValidSM2PublicKey(body.clientPublicKey)
    || new TextEncoder().encode(body.clientPublicKey).byteLength > TRANSPORT_BODY_LIMITS.publicKeyBytes) {
    return jsonError(kitM('kit_transportInvalidPayload'), 400)
  }

  try {
    const serverPublicKey = manager.getServerPublicKey()
    if (new TextEncoder().encode(serverPublicKey).byteLength > TRANSPORT_BODY_LIMITS.publicKeyBytes)
      return jsonError(kitM('kit_transportKeyExchangeFailed'), 500)
    const clientId = await manager.registerClientKey(body.clientPublicKey)

    return new Response(
      JSON.stringify({ serverKeyId: manager.getServerKeyId(), serverPublicKey, clientId, maxPlaintextBytes: manager.bodyLimits.plaintextBytes }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }
  catch {
    return jsonError(kitM('kit_transportKeyExchangeFailed'), 500)
  }
}

/**
 * 用于替换已验证请求正文的最小可写容器。
 * @example 模块内部上下文
 * ```ts
 * const holder: RequestHolder = { request: new Request('https://app.example.com/api/articles', { method: 'POST', body: '{}' }) }
 * replaceRequestBody(holder, JSON.stringify({ title: 'Example' }))
 * ```
 */
interface RequestHolder {
  request: Request
}

/**
 * 重建 SvelteKit 事件中的 Request。
 *
 * 有界认证会消费密文 body；只将成功认证的明文恢复给后续端点。
 *
 * @param event SvelteKit 请求事件
 * @param body 新请求体
 */
function replaceRequestBody(event: RequestHolder, body: string): void {
  const headers = new Headers(event.request.headers)
  headers.delete(TRANSPORT_PROTOCOL.ENCRYPTED_HEADER)
  headers.delete('Content-Length')
  headers.delete('Content-Encoding')
  headers.set('Content-Type', 'application/json; charset=utf-8')
  const newRequest = new Request(event.request.url, {
    method: event.request.method,
    headers,
    body,
    signal: event.request.signal,
  })
  Object.defineProperty(event, 'request', {
    value: newRequest,
    writable: true,
    configurable: true,
  })
}
