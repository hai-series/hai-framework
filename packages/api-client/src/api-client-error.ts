/**
 * @h-ai/api-client — 错误处理
 *
 * HTTP 状态码到 HaiResult 错误的统一转换。
 * @module api-client-error
 */

import type { HaiResult } from '@h-ai/core'
import { err } from '@h-ai/core'
import { apiClientM } from './api-client-i18n.js'
import { HaiApiClientError } from './api-client-types.js'

/**
 * 将 HTTP 响应转为 HaiResult<never>
 *
 * @param response - HTTP 响应
 * @returns HaiResult<never>
 */
export async function responseToError(response: Response): Promise<HaiResult<never>> {
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
    return err(
      HaiApiClientError.UNAUTHORIZED,
      apiClientM('apiClient_unauthorized'),
      details,
    )
  }

  if (status === 403) {
    return err(
      HaiApiClientError.FORBIDDEN,
      apiClientM('apiClient_forbidden'),
      details,
    )
  }

  if (status === 404) {
    return err(
      HaiApiClientError.NOT_FOUND,
      apiClientM('apiClient_notFound'),
      details,
    )
  }

  if (status === 400 || status === 422) {
    return err(
      HaiApiClientError.VALIDATION_FAILED,
      apiClientM('apiClient_validationFailed'),
      details,
    )
  }

  if (status >= 500) {
    return err(
      HaiApiClientError.SERVER_ERROR,
      apiClientM('apiClient_serverError', { params: { status: String(status) } }),
      details,
    )
  }

  return err(
    HaiApiClientError.UNKNOWN,
    apiClientM('apiClient_unknown'),
    details,
  )
}

/**
 * 将网络异常转为 HaiResult<never>
 *
 * @param cause - 原始异常
 * @returns HaiResult<never>
 */
export function networkErrorToResult(cause: unknown): HaiResult<never> {
  // AbortError = 超时
  if (cause instanceof DOMException && cause.name === 'AbortError') {
    return err(
      HaiApiClientError.TIMEOUT,
      apiClientM('apiClient_timeout'),
      cause,
    )
  }

  return err(
    HaiApiClientError.NETWORK_ERROR,
    apiClientM('apiClient_networkError'),
    cause,
  )
}
