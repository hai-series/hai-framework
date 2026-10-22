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

import type { CryptoFunctions, TransportEncryptionManager, TransportKeyStore, TransportMessageContext, TransportServerKeyRing } from '@h-ai/crypto'
import type { MiddlewareHandler } from 'hono'
import { core } from '@h-ai/core'
import { authenticateTransportRequest, isValidSM2PublicKey, readTransportBody, TRANSPORT_BODY_LIMITS, TRANSPORT_PROTOCOL } from '@h-ai/crypto'
import { servM } from './serv-i18n.js'

const logger = core.logger.child({ module: 'serv', scope: 'transport' })

const ENCRYPTABLE_RESPONSE_CONTENT_TYPES = ['application/json']

/** {@link createApp} 的 `transport` 配置项。 */
export interface ServTransportConfig {
  /** 受管服务端密钥环，仅运行时从私有 Secret 注入。 */
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
 */
export function createTransportMiddleware(
  manager: TransportEncryptionManager,
  keyExchangePath: string,
  excludePaths: readonly string[] = [],
): MiddlewareHandler {
  return async (c, next) => {
    const pathname = new URL(c.req.url).pathname

    // Step 1：密钥协商端点直接短路处理，不进入下游业务逻辑。
    if (pathname === keyExchangePath && c.req.method === 'POST')
      return handleKeyExchange(c.req.raw, manager)

    // Step 2：健康检查 / 文档页等可配置排除路径直接跳过加解密。
    if (shouldExclude(pathname, excludePaths, keyExchangePath))
      return next()

    // Step 3：普通业务请求必须先确认 clientId 存在，且服务端已经保存过该客户端公钥。
    const clientId = c.req.header(TRANSPORT_PROTOCOL.CLIENT_ID_HEADER)
    if (!clientId)
      return jsonError(servM('serv_transportClientIdRequired'), 400)

    let requestContext: TransportMessageContext
    try {
      const verified = await authenticateTransportRequest(manager, c.req.raw)
      if (!verified.success)
        return jsonError(servM('serv_transportDecryptFailed'), 400)
      requestContext = verified.data.context
      if (c.req.method !== 'GET' && c.req.method !== 'HEAD')
        replaceRequestBody(c, verified.data.plaintext)
    }
    catch (error) {
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
            maxBytes: TRANSPORT_BODY_LIMITS.plaintextBytes,
            signal: c.req.raw.signal,
          })
    }
    catch (cause) {
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
    return new Response(JSON.stringify({ serverKeyId: manager.getServerKeyId(), serverPublicKey, clientId }), {
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
