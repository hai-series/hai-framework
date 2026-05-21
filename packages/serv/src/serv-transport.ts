/**
 * @h-ai/serv — 传输加密集成
 *
 * 提供 Hono 中间件 + 密钥协商端点，直接依赖 `@h-ai/crypto` 的
 * `TransportEncryptionManager` 与 `TRANSPORT_PROTOCOL` 协议常量，
 * 确保前后端协议不漂移。
 *
 * @module serv-transport
 */

import type { CryptoFunctions, EncryptedPayload, TransportEncryptionManager } from '@h-ai/crypto'
import type { MiddlewareHandler } from 'hono'
import { core } from '@h-ai/core'
import { TRANSPORT_PROTOCOL } from '@h-ai/crypto'
import { servM } from './serv-i18n.js'

const logger = core.logger.child({ module: 'serv', scope: 'transport' })

/** 单次响应加密的体积上限（1 MiB）。超过则原样透传，避免内存炸裂。 */
const MAX_ENCRYPTED_BODY = 1_048_576

/** {@link createApp} 的 `transport` 配置项。 */
export interface ServTransportConfig {
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
  /** 服务端可缓存的客户端公钥数量上限。默认 10000。 */
  readonly maxClients?: number
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

    if (pathname === keyExchangePath && c.req.method === 'POST')
      return handleKeyExchange(c.req.raw, manager)

    if (shouldExclude(pathname, excludePaths, keyExchangePath))
      return next()

    const clientId = c.req.header(TRANSPORT_PROTOCOL.CLIENT_ID_HEADER)
    if (!clientId)
      return jsonError(servM('serv_transportClientIdRequired'), 400)

    const clientPublicKey = await manager.getClientPublicKey(clientId)
    if (!clientPublicKey)
      return jsonError(servM('serv_transportClientKeyNotFound'), 400)

    if (hasBody(c.req.method)) {
      const decErr = await decryptRequestInPlace(c, manager)
      if (decErr)
        return decErr
    }

    await next()
    const response = c.res
    if (!response)
      return
    const contentType = response.headers.get('Content-Type') ?? ''
    if (!contentType.includes('application/json'))
      return
    const contentLength = response.headers.get('Content-Length')
    if (contentLength && Number.parseInt(contentLength, 10) > MAX_ENCRYPTED_BODY)
      return

    let bodyText: string
    try {
      bodyText = await response.clone().text()
    }
    catch (cause) {
      logger.warn('Failed to read response body for encryption', { error: cause })
      return
    }
    if (!bodyText)
      return

    const encResult = await manager.encryptResponse(clientId, bodyText)
    if (!encResult.success) {
      logger.warn('Failed to encrypt response', { error: encResult.error })
      return
    }

    const headers = new Headers(response.headers)
    headers.set('Content-Type', 'application/json; charset=utf-8')
    headers.set(TRANSPORT_PROTOCOL.ENCRYPTED_HEADER, TRANSPORT_PROTOCOL.ENCRYPTED_HEADER_VALUE)
    headers.delete('Content-Length')
    c.res = new Response(JSON.stringify(encResult.data), {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  }
}

// ─── 内部 ───

async function handleKeyExchange(request: Request, manager: TransportEncryptionManager): Promise<Response> {
  let body: { clientPublicKey?: unknown }
  try {
    body = await request.json() as { clientPublicKey?: unknown }
  }
  catch {
    return jsonError(servM('serv_transportInvalidPayload'), 400)
  }
  if (typeof body.clientPublicKey !== 'string' || body.clientPublicKey.length === 0)
    return jsonError(servM('serv_transportInvalidPayload'), 400)

  try {
    const clientId = await manager.registerClientKey(body.clientPublicKey)
    const serverPublicKey = manager.getServerPublicKey()
    return new Response(JSON.stringify({ serverPublicKey, clientId }), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    })
  }
  catch (cause) {
    logger.error('Key exchange failed', { error: cause })
    return jsonError(servM('serv_transportKeyExchangeFailed'), 500)
  }
}

async function decryptRequestInPlace(
  c: Parameters<MiddlewareHandler>[0],
  manager: TransportEncryptionManager,
): Promise<Response | undefined> {
  const isEncrypted = c.req.header(TRANSPORT_PROTOCOL.ENCRYPTED_HEADER) === TRANSPORT_PROTOCOL.ENCRYPTED_HEADER_VALUE
  if (!isEncrypted)
    return jsonError(servM('serv_transportInvalidPayload'), 400)

  let payload: unknown
  try {
    payload = await c.req.raw.clone().json()
  }
  catch {
    return jsonError(servM('serv_transportInvalidPayload'), 400)
  }
  if (!isEncryptedPayloadShape(payload))
    return jsonError(servM('serv_transportInvalidPayload'), 400)

  const decResult = manager.decryptRequest(payload)
  if (!decResult.success) {
    logger.warn('Failed to decrypt request', { error: decResult.error })
    return jsonError(servM('serv_transportDecryptFailed'), 400)
  }

  const original = c.req.raw
  const newHeaders = new Headers(original.headers)
  newHeaders.delete(TRANSPORT_PROTOCOL.ENCRYPTED_HEADER)
  newHeaders.delete('Content-Length')
  newHeaders.set('Content-Type', 'application/json; charset=utf-8')
  const newRequest = new Request(original.url, {
    method: original.method,
    headers: newHeaders,
    body: decResult.data,
    // @ts-expect-error Node fetch 需要 duplex 才能携带流式 body。
    duplex: 'half',
  })
  ;(c.req as unknown as { raw: Request }).raw = newRequest
  return undefined
}

function shouldExclude(pathname: string, excludePaths: readonly string[], keyExchangePath: string): boolean {
  if (pathname === keyExchangePath)
    return true
  return excludePaths.some(p => pathname === p || pathname.startsWith(`${p}/`))
}

function hasBody(method: string): boolean {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase())
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

function isEncryptedPayloadShape(value: unknown): value is EncryptedPayload {
  if (!value || typeof value !== 'object')
    return false
  const p = value as Record<string, unknown>
  return typeof p.encryptedKey === 'string' && typeof p.ciphertext === 'string' && typeof p.iv === 'string'
}
