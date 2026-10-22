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
 * 从实际HTTP请求提取可信方法/路径/查询/客户端ID并有界认证；成功后才执行业务。
 * 拒绝缺少认证及头/正文重复承载，空请求也认证；不会由payload自证HTTP上下文。
 * @param manager - 使用共享原子nonce registry的已创建管理器。
 * @param request - 未消费正文的真实Request。
 * @returns 明文和响应关联上下文；认证失败无明文。
 * @throws RangeError超限；流读取/取消沿用原异常，HTTP适配器负责转响应。
 *
 * @example
 * ```ts
 * import { authenticateTransportRequest, TRANSPORT_PROTOCOL, type TransportEncryptionManager } from '@h-ai/crypto'
 * async function handle(manager: TransportEncryptionManager, request: Request): Promise<Response> {
 *   const verified = await authenticateTransportRequest(manager, request)
 *   if (!verified.success) return new Response(null, { status: 400 })
 *   const encrypted = await manager.encryptResponse(verified.data.context, JSON.stringify({ accepted: true }), 200)
 *   if (!encrypted.success) return new Response(null, { status: 500 })
 *   return Response.json(encrypted.data, { headers: { [TRANSPORT_PROTOCOL.ENCRYPTED_HEADER]: TRANSPORT_PROTOCOL.ENCRYPTED_HEADER_VALUE } })
 * }
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
