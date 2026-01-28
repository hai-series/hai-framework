/**
 * =============================================================================
 * @hai/kit - 日志中间件
 * =============================================================================
 * 请求日志记录
 * =============================================================================
 */

import { createLogger } from '@hai/core'
import type { Middleware } from '../types.js'

const logger = createLogger({ name: 'kit-logging' })

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
    
    const logData: Record<string, unknown> = {
      requestId,
      method: event.request.method,
      path: event.url.pathname,
      query: Object.fromEntries(event.url.searchParams),
      userAgent: event.request.headers.get('user-agent'),
      ip: event.getClientAddress?.() ?? 'unknown',
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
    
    logger.info(logData, 'Incoming request')
    
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
    
    logger.info(responseLogData, 'Request completed')
    
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
