/** @h-ai/crypto — serv/kit 共用的容量拒绝响应。 */
import type { TransportBodyTooLargeError } from './crypto-transport-body.js'
import type { TransportEncryptionManager, TransportMessageContext } from './crypto-transport-types.js'
import { TRANSPORT_PROTOCOL } from './crypto-transport-types.js'

/**
 * 创建脱敏容量错误；已认证的响应错误继续加密，请求读取失败返回 HTTP 413。
 * @param error - 容量错误，不包含业务报文。
 * @param authenticated - 仅在请求已完整认证后提供管理器和上下文。
 * @param authenticated.manager - 使用原服务端预算的管理器。
 * @param authenticated.context - 已完整认证的请求上下文。
 * @returns 可诊断的失败响应；加密失败仍只返回错误，不发送原业务响应。
 * @example
 * ```ts
 * import { createTransportErrorResponse, TransportBodyTooLargeError } from '@h-ai/crypto'
 * const response = await createTransportErrorResponse(new TransportBodyTooLargeError(1024, 1025))
 * const status = response.status // 413
 * ```
 */
export async function createTransportErrorResponse(
  error: TransportBodyTooLargeError,
  authenticated?: { manager: TransportEncryptionManager, context: TransportMessageContext },
): Promise<Response> {
  const status = error.direction === 'request' ? 413 : 500
  const body = JSON.stringify({ success: false, error: { code: error.code, message: error.message, httpStatus: status, details: {
    direction: error.direction,
    stage: error.stage,
    limitBytes: error.limitBytes,
    actualBytes: error.actualBytes,
  } } })
  if (authenticated) {
    const encrypted = await authenticated.manager.encryptResponse(authenticated.context, body, status)
    if (encrypted.success) {
      return Response.json(encrypted.data, { status, headers: { [TRANSPORT_PROTOCOL.ENCRYPTED_HEADER]: TRANSPORT_PROTOCOL.ENCRYPTED_HEADER_VALUE } })
    }
  }
  return new Response(body, { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } })
}
