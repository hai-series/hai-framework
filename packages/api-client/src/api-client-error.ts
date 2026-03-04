/**
 * @h-ai/api-client — 错误处理
 *
 * HTTP 状态码到 Result 错误的统一转换。
 * @module api-client-error
 */

import type { Result } from '@h-ai/core'
import type { ApiClientError } from './api-client-types.js'
import { err } from '@h-ai/core'
import { apiClientM } from './api-client-i18n.js'
import { ApiClientErrorCode } from './api-client-types.js'

/**
 * 将 HTTP 响应转为 ApiClientError Result
 *
 * @param response - HTTP 响应
 * @returns ApiClientError Result
 */
export async function responseToError(response: Response): Promise<Result<never, ApiClientError>> {
  let details: unknown

  try {
    const body = await response.json()
    details = body
  }
  catch {
    // 响应体不是 JSON，忽略
  }

  const status = response.status

  if (status === 401) {
    return err({
      code: ApiClientErrorCode.UNAUTHORIZED,
      message: apiClientM('apiClient_unauthorized'),
      status,
      details,
    })
  }

  if (status === 403) {
    return err({
      code: ApiClientErrorCode.FORBIDDEN,
      message: apiClientM('apiClient_forbidden'),
      status,
      details,
    })
  }

  if (status === 404) {
    return err({
      code: ApiClientErrorCode.NOT_FOUND,
      message: apiClientM('apiClient_notFound'),
      status,
      details,
    })
  }

  if (status === 400 || status === 422) {
    return err({
      code: ApiClientErrorCode.VALIDATION_FAILED,
      message: apiClientM('apiClient_validationFailed'),
      status,
      details,
    })
  }

  if (status >= 500) {
    return err({
      code: ApiClientErrorCode.SERVER_ERROR,
      message: apiClientM('apiClient_serverError', { params: { status: String(status) } }),
      status,
      details,
    })
  }

  return err({
    code: ApiClientErrorCode.UNKNOWN,
    message: apiClientM('apiClient_unknown'),
    status,
    details,
  })
}

/**
 * 将网络异常转为 ApiClientError Result
 *
 * @param cause - 原始异常
 * @returns ApiClientError Result
 */
export function networkErrorToResult(cause: unknown): Result<never, ApiClientError> {
  // AbortError = 超时
  if (cause instanceof DOMException && cause.name === 'AbortError') {
    return err({
      code: ApiClientErrorCode.TIMEOUT,
      message: apiClientM('apiClient_timeout'),
      cause,
    })
  }

  return err({
    code: ApiClientErrorCode.NETWORK_ERROR,
    message: apiClientM('apiClient_networkError'),
    cause,
  })
}
