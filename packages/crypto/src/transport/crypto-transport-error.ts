/** @h-ai/crypto — serv/kit 共用的安全传输错误响应。 */
import type { TransportBodyTooLargeError } from './crypto-transport-body.js'
import type { TransportEncryptionManager, TransportMessageContext } from './crypto-transport-types.js'
import { cryptoM } from '../crypto-i18n.js'
import { HaiCryptoError } from '../crypto-types.js'
import { TRANSPORT_PROTOCOL } from './crypto-transport-types.js'

/**
 * 已认证请求的时间窗口错误；只提供校时建议，不调整时钟或放宽防重放窗口。
 * @example
 * ```ts
 * import { TransportTimeError } from '@h-ai/crypto'
 * const error = new TransportTimeError()
 * // 展示 error.message；同步设备/服务器时间后由用户刷新重试。
 * ```
 */
export class TransportTimeError extends Error {
  readonly code = HaiCryptoError.TRANSPORT_TIME_INVALID.code

  constructor(readonly context?: TransportMessageContext) {
    super(cryptoM('crypto_transportTimeInvalid'))
    this.name = 'TransportTimeError'
  }
}

/**
 * 创建脱敏传输错误；已验证绑定、签名和 MAC 的时间/响应容量错误继续加密，请求读取超限返回 HTTP 413。
 * @param error - 容量或时间错误，不包含业务报文。
 * @param authenticated - 仅在请求绑定、签名和 MAC 已验证后提供管理器和上下文。
 * @param authenticated.manager - 使用原服务端预算的管理器。
 * @param authenticated.context - 已验证请求绑定、签名和 MAC 的上下文；时间拒绝不会放行业务。
 * @returns 可诊断的失败响应；加密失败仍只返回错误，不发送原业务响应。
 * @example
 * ```ts
 * import { createTransportErrorResponse, TransportBodyTooLargeError } from '@h-ai/crypto'
 * const response = await createTransportErrorResponse(new TransportBodyTooLargeError(1024, 1025))
 * const status = response.status // 413
 * ```
 */
export async function createTransportErrorResponse(
  error: TransportBodyTooLargeError | TransportTimeError,
  authenticated?: { manager: TransportEncryptionManager, context: TransportMessageContext },
): Promise<Response> {
  const status = error instanceof TransportTimeError ? 400 : error.direction === 'request' ? 413 : 500
  const body = JSON.stringify({ success: false, error: { code: error.code, message: error.message, httpStatus: status, details: error instanceof TransportTimeError
    ? undefined
    : {
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
