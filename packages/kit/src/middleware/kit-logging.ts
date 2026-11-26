/**
 * @h-ai/kit — 日志中间件
 *
 * HTTP 请求日志中间件，记录请求/响应摘要（方法、路径、状态码、耗时）。
 * @module kit-logging
 */

import type { Middleware } from '../kit-types.js'
import { core } from '@h-ai/core'

/**
 * 日志中间件配置
 * @example
 * ```ts
 * import type { LoggingMiddlewareConfig } from '@h-ai/kit'
 *
 * const value: LoggingMiddlewareConfig = { logBody: false }
 * void value
 * ```
 */
export interface LoggingMiddlewareConfig {
  /** 为 `true` 时仅记录请求是否带有正文。 */
  logBody?: boolean
  /** 为 `true` 时记录响应头 */
  logResponse?: boolean
  /** @deprecated 请求正文内容已停止采集。 */
  redactFields?: string[]
}

/**
 * 创建日志中间件
 *
 * 以 `core.logger.trace` 级别记录请求进出信息，包含：
 * - 请求：method / path / queryParameterCount / userAgent / ip
 * - 响应：status / duration
 *
 * 请求正文和查询值不进入请求摘要。
 *
 * @param config - 日志配置
 * @returns Middleware 实例
 * @example 模块内部上下文
 * ```ts
 * const middleware = loggingMiddleware({})
 * void middleware
 * ```
 */
export function loggingMiddleware(config: LoggingMiddlewareConfig = {}): Middleware {
  const { logBody = false, logResponse = false } = config

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
      // SvelteKit 预渲染禁止读取追踪 URL 的查询；日志只读原请求，不建立页面路由依赖。
      queryParameterCount: new URL(event.request.url).searchParams.size,
      userAgent: event.request.headers.get('user-agent'),
      ip: clientIp,
    }

    if (logBody)
      logData.hasBody = event.request.body !== null

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
