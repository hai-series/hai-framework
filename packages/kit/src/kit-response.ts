/**
 * @h-ai/kit — API 响应工具
 *
 * 标准化 API 响应工具集，统一 `{ success, data?, error?, requestId? }` 结构。
 * 提供成功响应（ok / created / noContent）、错误响应
 * （badRequest / unauthorized / forbidden / notFound / conflict / validationError / internalError）
 * 以及重定向响应。
 * @module kit-response
 */

import type { ApiResponse } from './kit-types.js'
import { kitM } from './kit-i18n.js'

/**
 * 创建 200 成功响应
 *
 * @param data - 响应数据，序列化为 JSON
 * @param requestId - 可选请求 ID，用于链路追踪
 * @returns `{ success: true, data, requestId }` 格式的 JSON Response
 *
 * @example
 * ```ts
 * return kit.response.ok({ id: '1', name: 'Alice' })
 * ```
 */
export function ok<T>(data: T, requestId?: string): Response {
  const response: ApiResponse<T> = {
    success: true,
    data,
    requestId,
  }

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * 创建 201 资源创建成功响应
 *
 * @param data - 新创建的资源数据
 * @param requestId - 可选请求 ID
 * @returns `{ success: true, data }` 格式的 JSON Response（status 201）
 *
 * @example
 * ```ts
 * return kit.response.created({ id: 'new_1' })
 * ```
 */
export function created<T>(data: T, requestId?: string): Response {
  const response: ApiResponse<T> = {
    success: true,
    data,
    requestId,
  }

  return new Response(JSON.stringify(response), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * 创建 204 无内容响应
 *
 * 通常用于 DELETE 成功或无返回值的更新操作。
 *
 * @returns 空 body、status 204 的 Response
 */
export function noContent(): Response {
  return new Response(null, { status: 204 })
}

/**
 * 创建自定义错误响应
 *
 * @param code - 错误码（如 `'CUSTOM_ERROR'`）
 * @param message - 人可读错误消息
 * @param status - HTTP 状态码，默认 400
 * @param requestId - 可选请求 ID
 * @param details - 可选额外详情
 * @returns `{ success: false, error: { code, message, details } }` 格式的 JSON Response
 *
 * @example
 * ```ts
 * return kit.response.error('QUOTA_EXCEEDED', '配额已用尽', 429)
 * ```
 */
export function error(
  code: string,
  message: string,
  status = 400,
  requestId?: string,
  details?: unknown,
): Response {
  const response: ApiResponse = {
    success: false,
    error: {
      code,
      message,
      details,
    },
    requestId,
  }

  return new Response(JSON.stringify(response), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * 创建 400 Bad Request 响应
 *
 * @param message - 错误消息
 * @param requestId - 可选请求 ID
 * @param details - 可选额外详情
 * @returns error code 为 `'BAD_REQUEST'` 的 JSON Response
 */
export function badRequest(message: string, requestId?: string, details?: unknown): Response {
  return error('BAD_REQUEST', message, 400, requestId, details)
}

/**
 * 创建 401 Unauthorized 响应
 *
 * @param message - 错误消息，默认 `'Authentication required'`
 * @param requestId - 可选请求 ID
 * @returns error code 为 `'UNAUTHORIZED'` 的 JSON Response
 */
export function unauthorized(message?: string, requestId?: string): Response {
  return error('UNAUTHORIZED', message ?? kitM('kit_authRequired'), 401, requestId)
}

/**
 * 创建 403 Forbidden 响应
 *
 * @param message - 错误消息，默认 `'Access denied'`
 * @param requestId - 可选请求 ID
 * @returns error code 为 `'FORBIDDEN'` 的 JSON Response
 */
export function forbidden(message?: string, requestId?: string): Response {
  return error('FORBIDDEN', message ?? kitM('kit_accessDenied'), 403, requestId)
}

/**
 * 创建 404 Not Found 响应
 *
 * @param message - 错误消息，默认 `'Resource not found'`
 * @param requestId - 可选请求 ID
 * @returns error code 为 `'NOT_FOUND'` 的 JSON Response
 */
export function notFound(message?: string, requestId?: string): Response {
  return error('NOT_FOUND', message ?? kitM('kit_resourceNotFound'), 404, requestId)
}

/**
 * 创建 409 Conflict 响应
 *
 * @param message - 冲突描述（如重复创建等）
 * @param requestId - 可选请求 ID
 * @returns error code 为 `'CONFLICT'` 的 JSON Response
 */
export function conflict(message: string, requestId?: string): Response {
  return error('CONFLICT', message, 409, requestId)
}

/**
 * 创建 422 Unprocessable Entity 响应（验证错误）
 *
 * @param errors - 字段级别的验证错误列表
 * @param requestId - 可选请求 ID
 * @returns error code 为 `'VALIDATION_ERROR'`，details 包含 `errors` 数组
 *
 * @example
 * ```ts
 * return kit.response.validationError([
 *   { field: 'email', message: '格式无效' },
 * ])
 * ```
 */
export function validationError(
  errors: Array<{ field: string, message: string }>,
  requestId?: string,
): Response {
  return error('VALIDATION_ERROR', kitM('kit_validationFailed'), 422, requestId, { errors })
}

/**
 * 创建 500 Internal Server Error 响应
 *
 * @param message - 错误消息，默认 `'Internal server error'`
 * @param requestId - 可选请求 ID
 * @returns error code 为 `'INTERNAL_ERROR'` 的 JSON Response
 */
export function internalError(message?: string, requestId?: string): Response {
  return error('INTERNAL_ERROR', message ?? kitM('kit_internalError'), 500, requestId)
}

/**
 * 创建重定向响应
 *
 * @param url - 目标 URL
 * @param status - HTTP 状态码，默认 302；常用 303（POST 后重定向）
 * @returns 带 `Location` 头的空 body Response
 *
 * @example
 * ```ts
 * return kit.response.redirect('/dashboard', 303)
 * ```
 */
export function redirect(url: string, status: 301 | 302 | 303 | 307 | 308 = 302): Response {
  return new Response(null, {
    status,
    headers: { Location: url },
  })
}
