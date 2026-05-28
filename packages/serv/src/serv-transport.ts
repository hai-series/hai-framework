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

import type { CryptoFunctions, EncryptedPayload, TransportEncryptionManager, TransportKeyStore } from '@h-ai/crypto'
import type { MiddlewareHandler } from 'hono'
import { core } from '@h-ai/core'
import { TRANSPORT_PROTOCOL } from '@h-ai/crypto'
import { servM } from './serv-i18n.js'

const logger = core.logger.child({ module: 'serv', scope: 'transport' })

/** 单次响应加密的体积上限（1 MiB）。超过则 fail-closed，避免内存放大和明文泄露。 */
const MAX_ENCRYPTED_BODY = 1_048_576
const ENCRYPTABLE_RESPONSE_CONTENT_TYPES = ['application/json']

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
  /** 共享客户端公钥存储；适用于多节点部署。 */
  readonly keyStore?: TransportKeyStore
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

    const clientPublicKey = await manager.getClientPublicKey(clientId)
    if (!clientPublicKey)
      return jsonError(servM('serv_transportClientKeyNotFound'), 400)

    // Step 4：对带 body 的请求先解密；解密后下游看到的是普通 JSON Request。
    // 空 body 请求（如无 input 的 POST 过程）无需解密；下游 Zod 校验会拒绝缺字段输入。
    if (hasBody(c.req.method) && !isEmptyBody(c.req.raw)) {
      const decErr = await decryptRequestInPlace(c, manager)
      if (decErr)
        return decErr
    }

    // Step 5：明文请求进入后续 Hono / oRPC 流程。
    await next()
    const response = c.res
    if (!response)
      return
    // Step 6：受保护路由响应必须加密；无法加密时 fail-closed，禁止明文透传。
    const contentType = response.headers.get('Content-Type') ?? ''
    if (isEmptyResponse(response))
      return
    if (!canEncryptResponseContentType(contentType)) {
      c.res = jsonError(servM('serv_transportEncryptFailed'), 500)
      return
    }
    const contentLength = response.headers.get('Content-Length')
    if (contentLength && Number.parseInt(contentLength, 10) > MAX_ENCRYPTED_BODY) {
      c.res = jsonError(servM('serv_transportEncryptFailed'), 500)
      return
    }

    let bodyText: string
    try {
      bodyText = await response.clone().text()
    }
    catch (cause) {
      logger.warn('Failed to read response body for encryption', { error: cause })
      c.res = jsonError(servM('serv_transportEncryptFailed'), 500)
      return
    }
    if (!bodyText)
      return
    // 二次防御：分块传输（chunked）等场景没有 Content-Length 头，需在读取后再校验体积。
    // 超过上限则 fail-closed，避免大 body 加密导致内存放大且禁止明文泄露。
    if (bodyText.length > MAX_ENCRYPTED_BODY) {
      c.res = jsonError(servM('serv_transportEncryptFailed'), 500)
      return
    }

    // Step 7：把下游返回的明文 JSON 重新加密后替换回响应对象。
    const encResult = await manager.encryptResponse(clientId, bodyText)
    if (!encResult.success) {
      logger.warn('Failed to encrypt response', { error: encResult.error })
      c.res = jsonError(servM('serv_transportEncryptFailed'), 500)
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
    // Step 1：读取客户端提交的公钥。
    body = await request.json() as { clientPublicKey?: unknown }
  }
  catch {
    return jsonError(servM('serv_transportInvalidPayload'), 400)
  }
  if (typeof body.clientPublicKey !== 'string' || body.clientPublicKey.length === 0)
    return jsonError(servM('serv_transportInvalidPayload'), 400)

  try {
    // Step 2：注册客户端公钥，换取稳定的 clientId；并返回服务端公钥给客户端完成协商。
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
  // Step A：请求必须显式声明自己是加密 payload，避免把普通 JSON 误当密文解析。
  const isEncrypted = c.req.header(TRANSPORT_PROTOCOL.ENCRYPTED_HEADER) === TRANSPORT_PROTOCOL.ENCRYPTED_HEADER_VALUE
  if (!isEncrypted)
    return jsonError(servM('serv_transportInvalidPayload'), 400)

  let payload: unknown
  try {
    // Step B：先以 JSON 读取密文载荷。
    payload = await c.req.raw.clone().json()
  }
  catch {
    return jsonError(servM('serv_transportInvalidPayload'), 400)
  }
  if (!isEncryptedPayloadShape(payload))
    return jsonError(servM('serv_transportInvalidPayload'), 400)

  // Step C：调用 transport manager 做真正的解密。
  const decResult = manager.decryptRequest(payload)
  if (!decResult.success) {
    logger.warn('Failed to decrypt request', { error: decResult.error })
    return jsonError(servM('serv_transportDecryptFailed'), 400)
  }

  // Step D：重建一个“明文 Request”回写到 `c.req.raw`，下游业务完全不需要感知加密协议。
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

function canEncryptResponseContentType(contentType: string): boolean {
  return ENCRYPTABLE_RESPONSE_CONTENT_TYPES.some(type => contentType.includes(type))
}

function isEmptyResponse(response: Response): boolean {
  if ([204, 304].includes(response.status))
    return true
  return response.headers.get('Content-Length') === '0'
}

function hasBody(method: string): boolean {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase())
}

/** 判断请求是否携带 body：Content-Length=0 或缺失 Content-Type 视为空 body。 */
function isEmptyBody(req: Request): boolean {
  if (req.body === null)
    return true
  const cl = req.headers.get('Content-Length')
  if (cl !== null)
    return Number.parseInt(cl, 10) === 0
  // 无 Content-Length 且无 Content-Type 的 body-bearing 请求按空 body 处理。
  return !req.headers.get('Content-Type')
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
