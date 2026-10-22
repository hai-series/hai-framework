/**
 * @h-ai/crypto — serv/kit 共用的实际 HTTP 请求认证入口。
 * @module crypto-transport-request
 */
import type { HaiResult } from '@h-ai/core'
import type { EncryptedRequestPayload, TransportEncryptionManager, TransportMessageContext } from './crypto-transport-types.js'
import { ok } from '@h-ai/core'
import { readTransportBody, TRANSPORT_BODY_LIMITS } from './crypto-transport-body.js'
import { isValidEncryptedPayload, transportAuthenticationFailure } from './crypto-transport-codec.js'
import { TRANSPORT_PROTOCOL } from './crypto-transport-types.js'

/**
 * 有界读取并认证实际 HTTP 请求；包括 GET/HEAD，拒绝缺少认证或重复承载封装。
 * 方法、路径、查询串和客户端 ID 从 Request 提取，不能由 payload 自证。
 * @param manager - 使用共享原子防重放 registry 的服务端管理器。
 * @param request - 未消费正文的实际 HTTP 请求。
 * @returns 认证后的明文和供响应关联使用的上下文；失败无明文。
 * @throws 正文或头封装超限抛 RangeError；读取取消和网络流错误沿用原始流异常。
 * @example
 * ```ts
 * const verified = await authenticateTransportRequest(manager, request)
 * if (!verified.success) return new Response(null, { status: 400 })
 * const response = await manager.encryptResponse(verified.data.context, json, 200)
 * ```
 */
export async function authenticateTransportRequest(
  manager: TransportEncryptionManager,
  request: Request,
): Promise<HaiResult<{ plaintext: string, context: TransportMessageContext }>> {
  const reject = () => {
    void request.body?.cancel().catch(() => {})
    return transportAuthenticationFailure()
  }
  if (request.headers.get(TRANSPORT_PROTOCOL.ENCRYPTED_HEADER) !== TRANSPORT_PROTOCOL.ENCRYPTED_HEADER_VALUE)
    return reject()
  const clientId = request.headers.get(TRANSPORT_PROTOCOL.CLIENT_ID_HEADER)
  if (!clientId)
    return reject()
  const envelope = request.headers.get(TRANSPORT_PROTOCOL.ENVELOPE_HEADER)
  const bodyless = request.method === 'GET' || request.method === 'HEAD'
  if ((bodyless && (!envelope || request.body !== null)) || (!bodyless && envelope !== null))
    return reject()
  if (envelope && new TextEncoder().encode(envelope).byteLength > TRANSPORT_BODY_LIMITS.envelopeHeaderBytes)
    throw new RangeError('Transport request envelope byte limit exceeded')
  const text = envelope ?? await readTransportBody(request.body, {
    maxBytes: TRANSPORT_BODY_LIMITS.encryptedPayloadBytes,
    signal: request.signal,
  })
  let payload: unknown
  try {
    payload = JSON.parse(text)
  }
  catch {
    return transportAuthenticationFailure()
  }
  if (!isValidEncryptedPayload(payload) || payload.direction !== 'request' || payload.status !== 0)
    return transportAuthenticationFailure()
  const url = new URL(request.url)
  const decrypted = await manager.decryptRequest(payload as EncryptedRequestPayload, {
    clientId,
    method: request.method,
    path: url.pathname + url.search,
  })
  if (!decrypted.success)
    return decrypted
  if (new TextEncoder().encode(decrypted.data).byteLength > TRANSPORT_BODY_LIMITS.plaintextBytes)
    throw new RangeError('Transport request plaintext byte limit exceeded')
  if (bodyless && decrypted.data !== '')
    return transportAuthenticationFailure()
  return ok({ plaintext: decrypted.data, context: payload.context })
}
