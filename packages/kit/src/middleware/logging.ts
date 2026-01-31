/**
 * =============================================================================
 * @hai/kit - 日志中间件
 * =============================================================================
 * 请求日志记录
 * =============================================================================
 */

import type { Middleware } from '../types.js'
import { core } from '@hai/core'

/**
 * 日志中间件配置
 */
export interface LoggingMiddlewareConfig {
  /** 是否记录请求体 */
  logBody?: boolean
  /** 是否记录响应 */
  logResponse?: boolean
  /** 要屏蔽的字段 */
  redactFields?: string[]
}

/**
 * 创建日志中间件
 */
export function loggingMiddleware(config: LoggingMiddlewareConfig = {}): Middleware {
  const { logBody = false, logResponse = false, redactFields = ['password', 'token', 'secret'] } = config

  return async (context, next) => {
    const { event, requestId } = context
    const startTime = Date.now()

    // 安全获取客户端 IP，处理开发环境下可能的错误
    let clientIp = 'unknown'
    try {
      clientIp = event.getClientAddress?.() ?? 'unknown'
    }
    catch {
      // 开发环境下 getClientAddress 可能抛出错误
    }

    const logData: Record<string, unknown> = {
      requestId,
      method: event.request.method,
      path: event.url.pathname,
      query: Object.fromEntries(event.url.searchParams),
      userAgent: event.request.headers.get('user-agent'),
      ip: clientIp,
    }

    if (logBody && event.request.method !== 'GET') {
      try {
        const clonedRequest = event.request.clone()
        const body = await clonedRequest.json()
        logData.body = redactObject(body, redactFields)
      }
      catch {
        // 忽略非 JSON 请求体
      }
    }

    core.logger.trace('Incoming request', { ...logData })

    const response = await next()

    const duration = Date.now() - startTime

    const responseLogData: Record<string, unknown> = {
      requestId,
      status: response.status,
      duration,
    }

    if (logResponse) {
      responseLogData.headers = Object.fromEntries(response.headers)
    }

    core.logger.trace('Request completed', { ...responseLogData })

    return response
  }
}

/**
 * 屏蔽对象中的敏感字段
 */
function redactObject(obj: unknown, fields: string[]): unknown {
  if (typeof obj !== 'object' || obj === null) {
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map(item => redactObject(item, fields))
  }

  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(obj)) {
    if (fields.includes(key.toLowerCase())) {
      result[key] = '[REDACTED]'
    }
    else if (typeof value === 'object' && value !== null) {
      result[key] = redactObject(value, fields)
    }
    else {
      result[key] = value
    }
  }

  return result
}
