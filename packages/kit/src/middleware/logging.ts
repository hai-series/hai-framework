/**
 * =============================================================================
 * @h-ai/kit - 日志中间件
 * =============================================================================
 * 请求日志记录
 * =============================================================================
 */

import type { Middleware } from '../kit-types.js'
import { core } from '@h-ai/core'

/**
 * 日志中间件配置
 */
export interface LoggingMiddlewareConfig {
  /** 为 `true` 时记录非 GET 请求体（自动脱敏） */
  logBody?: boolean
  /** 为 `true` 时记录响应头 */
  logResponse?: boolean
  /** 指定需要脱敏的字段名（默认 `['password', 'token', 'secret']`） */
  redactFields?: string[]
}

/**
 * 创建日志中间件
 *
 * 以 `core.logger.trace` 级别记录请求进出信息，包含：
 * - 请求：method / path / query / userAgent / ip
 * - 响应：status / duration
 *
 * 敏感字段会被自动替换为 `[REDACTED]`。
 *
 * @param config - 日志配置
 * @returns Middleware 实例
 *
 * @example
 * ```ts
 * middleware: [
 *   kit.middleware.logging({ logBody: true, redactFields: ['password', 'creditCard'] }),
 * ]
 * ```
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
 * 递归屏蔽对象中的敏感字段
 *
 * 匹配规则：字段名转小写后与 `fields` 列表比较。
 *
 * @param obj - 待处理对象
 * @param fields - 需要屏蔽的字段名列表（全小写）
 * @returns 屏蔽后的副本
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
