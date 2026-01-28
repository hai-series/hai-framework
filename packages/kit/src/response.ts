/**
 * =============================================================================
 * @hai/kit - API 响应工具
 * =============================================================================
 * 标准化 API 响应
 * =============================================================================
 */

import type { ApiResponse } from './types.js'

/**
 * 创建成功响应
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
 * 创建创建成功响应
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
 * 创建无内容响应
 */
export function noContent(): Response {
  return new Response(null, { status: 204 })
}

/**
 * 创建错误响应
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
 */
export function badRequest(message: string, requestId?: string, details?: unknown): Response {
  return error('BAD_REQUEST', message, 400, requestId, details)
}

/**
 * 创建 401 Unauthorized 响应
 */
export function unauthorized(message = 'Authentication required', requestId?: string): Response {
  return error('UNAUTHORIZED', message, 401, requestId)
}

/**
 * 创建 403 Forbidden 响应
 */
export function forbidden(message = 'Access denied', requestId?: string): Response {
  return error('FORBIDDEN', message, 403, requestId)
}

/**
 * 创建 404 Not Found 响应
 */
export function notFound(message = 'Resource not found', requestId?: string): Response {
  return error('NOT_FOUND', message, 404, requestId)
}

/**
 * 创建 409 Conflict 响应
 */
export function conflict(message: string, requestId?: string): Response {
  return error('CONFLICT', message, 409, requestId)
}

/**
 * 创建 422 Unprocessable Entity 响应（验证错误）
 */
export function validationError(
  errors: Array<{ field: string; message: string }>,
  requestId?: string,
): Response {
  return error('VALIDATION_ERROR', 'Validation failed', 422, requestId, { errors })
}

/**
 * 创建 500 Internal Server Error 响应
 */
export function internalError(message = 'Internal server error', requestId?: string): Response {
  return error('INTERNAL_ERROR', message, 500, requestId)
}

/**
 * 创建重定向响应
 */
export function redirect(url: string, status: 301 | 302 | 303 | 307 | 308 = 302): Response {
  return new Response(null, {
    status,
    headers: { Location: url },
  })
}
