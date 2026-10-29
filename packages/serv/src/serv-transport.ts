/**
 * @h-ai/serv — 传输加密集成
 *
 * 提供 Hono 中间件 + 密钥协商端点，直接依赖 `@h-ai/crypto` 的
 * `TransportEncryptionManager` 与 `TRANSPORT_PROTOCOL` 协议常量，
 * 确保前后端协议不漂移。
 *
 * 单次请求的处理顺序：
 * 1. 特判密钥协商端点
 * 2. 跳过不参与加解密的路径
 * 3. 校验 clientId 与已注册公钥
 * 4. 解密请求体并把明文 request 回写给下游
 * 5. 执行业务逻辑
 * 6. 尝试加密 JSON 响应
 *
 * @module serv-transport
 */

import type { RequestAccessCheck } from '@h-ai/core'
import type { CryptoFunctions, TransportEncryptionManager, TransportKeyStore, TransportMessageContext, TransportServerKeyRing } from '@h-ai/crypto'
import type { MiddlewareHandler } from 'hono'
import { core, err, HaiCommonError } from '@h-ai/core'
import { authenticateTransportRequest, createTransportBodyPolicy, createTransportErrorResponse, isValidSM2PublicKey, readTransportBody, TRANSPORT_BODY_LIMITS, TRANSPORT_PROTOCOL, TransportBodyTooLargeError, TransportTimeError } from '@h-ai/crypto'
import { servM } from './serv-i18n.js'

const logger = core.logger.child({ module: 'serv', scope: 'transport' })

const ENCRYPTABLE_RESPONSE_CONTENT_TYPES = ['application/json']

/**
 * {@link createApp} 的 `transport` 配置项。
 *
 * @example
 * ```ts
 * import type { ServTransportConfig } from '@h-ai/serv'
 * import { serv } from '@h-ai/serv'
 *
 * import { crypto } from '@h-ai/crypto'
 *
 * function configure(serverKeyRing: ServTransportConfig['serverKeyRing'], keyStore: ServTransportConfig['keyStore']): ServTransportConfig {
 *   return { crypto, serverKeyRing, keyStore }
 * }
 * // 私有 keyring 跨节点共享并支持轮换；生产 keyStore 原子消费重放标识，不能用进程 Map。
 * ```
 */
export interface ServTransportConfig {
  /** 受管服务端密钥环，仅运行时从私有 Secret 注入。 */
  /** 双向业务明文 UTF-8 字节上限；默认 1 MiB，整数范围 1 KiB～64 MiB。 */
  readonly maxPlaintextBytes?: number
  /** 路由明文容量；* 匹配一个完整路径段。 */
  routePlaintextBytes?: Readonly<Record<string, number>>
  readonly serverKeyRing: TransportServerKeyRing
  /**
   * crypto 服务实例。serv 通过 `crypto.transport.createServer()` 创建
   * 传输加密管理器，并使用 `crypto.transport.protocol` 中的协议常量。
   */
  readonly crypto: CryptoFunctions
  /**
   * 密钥协商端点路径（相对于 `apiPrefix`）。默认 `/_hai/key-exchange`。
   */
  readonly keyExchangePath?: string
  /**
   * 不参与加解密的路径白名单（绝对路径完整匹配或前缀匹配）。
   * 健康检查、文档页等公共路由通常无需加密。
   */
  readonly excludePaths?: readonly string[]
  /** 共享客户端公钥存储；适用于多节点部署。 */
  readonly keyStore: TransportKeyStore
}

/**
 * 创建传输加密 Hono 中间件。
 *
 * 行为：
 * - `${keyExchangePath}` POST → 密钥协商
 * - 其他请求必须携带 `X-Client-Id` 且加密
 * - JSON 响应自动加密
 *
 * @param manager - 由 `crypto.transport.createServer()` 创建的管理器
 * @param keyExchangePath - 密钥协商绝对路径（已与 apiPrefix 拼接）
 * @param excludePaths - 不参与加解密的路径
 * @param policy - 共享容量准入，由 createApp 创建。
 * @param encryption - 已编译的路径/方法选择器；显式规则优先于宿主排除列表。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * function mount(manager: TransportEncryptionManager) {
 *   return createTransportMiddleware(manager, '/api/v1/_hai/key-exchange', ['/health'])
 * }
 * // 请求先验证 method/pathHash/clientId/requestId 完整性并原子防重放，之后才执行 handler。
 * ```
 */
export function createTransportMiddleware(
  manager: TransportEncryptionManager,
  keyExchangePath: string,
  excludePaths: readonly string[] = [],
  policy = createTransportBodyPolicy(manager.bodyLimits.plaintextBytes),
  encryption?: RequestAccessCheck['encryption'],
): MiddlewareHandler {
  return async (c, next) => {
    const pathname = new URL(c.req.url).pathname

    // OPTIONS 无业务密文；交由请求策略和 CORS 处理，不要求先建立密钥。
    if (c.req.method === 'OPTIONS')
      return next()

    // Step 1：密钥协商端点直接短路处理，不进入下游业务逻辑。
    if (pathname === keyExchangePath && c.req.method === 'POST')
      return handleKeyExchange(c.req.raw, manager)

    const mode = encryption?.(pathname, c.req.method)
    if (mode === 'disabled') {
      // 明文端点拒绝传输信封，防止把密文当业务数据处理或返回无法解密的成功响应。
      if (c.req.raw.headers.has(TRANSPORT_PROTOCOL.ENCRYPTED_HEADER) || c.req.raw.headers.has(TRANSPORT_PROTOCOL.ENVELOPE_HEADER))
        return Response.json(err({ ...HaiCommonError.VALIDATION_ERROR, message: servM('serv_transportPlaintextRequired'), traceId: core.context.get().traceId ?? core.context.get().requestId }), { status: 400 })
      return next()
    }
    // Step 2：未显式要求加密时，健康检查 / 文档页等宿主排除路径保持透传。
    if (mode !== 'required' && shouldExclude(pathname, excludePaths, keyExchangePath))
      return next()

    // Step 3：普通业务请求必须先确认 clientId 存在，且服务端已经保存过该客户端公钥。
    const clientId = c.req.header(TRANSPORT_PROTOCOL.CLIENT_ID_HEADER)
    if (!clientId)
      return jsonError(servM('serv_transportClientIdRequired'), 400)

    const lease = policy.acquire(pathname)
    if (!lease)
      return jsonError(servM('serv_transportBusy'), 503)
    try {
      let requestContext: TransportMessageContext
      try {
        const verified = await authenticateTransportRequest(manager, c.req.raw, lease.limits)
        if (!verified.success) {
          if (verified.error.cause instanceof TransportTimeError && verified.error.cause.context)
            return createTransportErrorResponse(verified.error.cause, { manager, context: verified.error.cause.context })
          return jsonError(servM('serv_transportDecryptFailed'), 400)
        }
        requestContext = verified.data.context
        if (c.req.method !== 'GET' && c.req.method !== 'HEAD')
          replaceRequestBody(c, verified.data.plaintext)
      }
      catch (error) {
        if (error instanceof TransportBodyTooLargeError)
          return createTransportErrorResponse(error)
        return jsonError(servM('serv_transportInvalidPayload'), error instanceof RangeError ? 413 : 400)
      }

      // Step 5：明文请求进入后续 Hono / oRPC 流程。
      await next()
      const response = c.res
      if (!response)
        return
      // Step 6：受保护路由响应必须加密；无法加密时 fail-closed，禁止明文透传。
      const contentType = response.headers.get('Content-Type') ?? ''
      const bodyless = c.req.method === 'HEAD' || isEmptyResponse(response)
      if (bodyless)
        void response.body?.cancel().catch(() => {})
      // Hono 的 res setter 会合并旧响应头，先清理其表征元数据，避免重新引入旧编码/长度。
      c.header('Content-Length', undefined)
      c.header('Content-Encoding', undefined)
      c.header(TRANSPORT_PROTOCOL.ENCRYPTED_HEADER, undefined)
      c.header(TRANSPORT_PROTOCOL.ENVELOPE_HEADER, undefined)
      if (!bodyless && !canEncryptResponseContentType(contentType)) {
        void response.body?.cancel().catch(() => {})
        c.res = jsonError(servM('serv_transportEncryptFailed'), 500)
        return
      }
      let bodyText: string
      try {
        bodyText = bodyless
          ? ''
          : await readTransportBody(response.body, {
              maxBytes: lease.limits.plaintextBytes,
              direction: 'response',
              signal: c.req.raw.signal,
            })
      }
      catch (cause) {
        if (cause instanceof TransportBodyTooLargeError) {
          c.res = await createTransportErrorResponse(cause, { manager, context: requestContext })
          return
        }
        logger.warn('Failed to read response body for encryption', { error: cause })
        c.res = jsonError(servM('serv_transportEncryptFailed'), 500)
        return
      }
      const headers = new Headers(response.headers)
      headers.delete(TRANSPORT_PROTOCOL.ENCRYPTED_HEADER)
      headers.delete('Content-Length')
      headers.delete('Content-Encoding')

      // Step 7：把下游返回的明文 JSON 重新加密后替换回响应对象。
      const encResult = await manager.encryptResponse(requestContext, bodyText, response.status)
      if (!encResult.success) {
        logger.warn('Failed to encrypt response', { error: encResult.error })
        c.res = jsonError(servM('serv_transportEncryptFailed'), 500)
        return
      }

      headers.set('Content-Type', 'application/json; charset=utf-8')
      headers.set(TRANSPORT_PROTOCOL.ENCRYPTED_HEADER, TRANSPORT_PROTOCOL.ENCRYPTED_HEADER_VALUE)
      if (bodyless)
        headers.set(TRANSPORT_PROTOCOL.ENVELOPE_HEADER, JSON.stringify(encResult.data))
      c.res = new Response(bodyless ? null : JSON.stringify(encResult.data), {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    }
    finally { lease.release() }
  }
}

// ─── 内部 ───

async function handleKeyExchange(request: Request, manager: TransportEncryptionManager): Promise<Response> {
  let body: unknown
  try {
    // Step 1：读取客户端提交的公钥。
    body = JSON.parse(await readTransportBody(request.body, {
      maxBytes: TRANSPORT_BODY_LIMITS.keyExchangeBytes,
      signal: request.signal,
    }))
  }
  catch (error) {
    return jsonError(servM('serv_transportInvalidPayload'), error instanceof RangeError ? 413 : 400)
  }
  if (!body || typeof body !== 'object' || !('clientPublicKey' in body)
    || !isValidSM2PublicKey(body.clientPublicKey)
    || new TextEncoder().encode(body.clientPublicKey).byteLength > TRANSPORT_BODY_LIMITS.publicKeyBytes) {
    return jsonError(servM('serv_transportInvalidPayload'), 400)
  }

  try {
    // Step 2：注册客户端公钥，换取稳定的 clientId；并返回服务端公钥给客户端完成协商。
    const serverPublicKey = manager.getServerPublicKey()
    if (new TextEncoder().encode(serverPublicKey).byteLength > TRANSPORT_BODY_LIMITS.publicKeyBytes)
      return jsonError(servM('serv_transportKeyExchangeFailed'), 500)
    const clientId = await manager.registerClientKey(body.clientPublicKey)
    return new Response(JSON.stringify({ serverKeyId: manager.getServerKeyId(), serverPublicKey, clientId, maxPlaintextBytes: manager.bodyLimits.plaintextBytes }), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    })
  }
  catch (cause) {
    logger.error('Key exchange failed', { error: cause })
    return jsonError(servM('serv_transportKeyExchangeFailed'), 500)
  }
}

/** 替换已消费的原始流并清空 Hono 正文缓存，保证 oRPC 与 c.req.json 均读取新正文。 */
function replaceRequestBody(c: Parameters<MiddlewareHandler>[0], body: string): void {
  const original = c.req.raw
  const newHeaders = new Headers(original.headers)
  newHeaders.delete(TRANSPORT_PROTOCOL.ENCRYPTED_HEADER)
  newHeaders.delete('Content-Length')
  newHeaders.delete('Content-Encoding')
  newHeaders.set('Content-Type', 'application/json; charset=utf-8')
  const newRequest = new Request(original.url, {
    method: original.method,
    headers: newHeaders,
    body,
    signal: original.signal,
    // @ts-expect-error Node fetch 需要 duplex 才能携带流式 body。
    duplex: 'half',
  })
  c.req.raw = newRequest
  c.req.bodyCache = {}
}

function shouldExclude(pathname: string, excludePaths: readonly string[], keyExchangePath: string): boolean {
  if (pathname === keyExchangePath)
    return true
  return excludePaths.some(p => pathname === p || pathname.startsWith(`${p}/`))
}

function canEncryptResponseContentType(contentType: string): boolean {
  return ENCRYPTABLE_RESPONSE_CONTENT_TYPES.some(type => contentType.includes(type))
}

function isEmptyResponse(response: Response): boolean {
  if ([204, 304].includes(response.status))
    return true
  // Content-Length 是可写元数据，不能据此放行实际仍含明文的响应流。
  return response.body === null
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}
