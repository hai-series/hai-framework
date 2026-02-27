/**
 * =============================================================================
 * @h-ai/kit - 速率限制中间件
 * =============================================================================
 * 请求速率限制
 * =============================================================================
 */

import type { Middleware, RateLimitConfig } from '../kit-types.js'
import { core } from '@h-ai/core'

/**
 * 速率限制存储条目
 */
interface RateLimitEntry {
  /** 当前窗口内的请求次数 */
  count: number
  /** 窗口重置时间戳（ms） */
  resetAt: number
}

/** 内存速率限制存储（以客户端 key 为索引） */
const store = new Map<string, RateLimitEntry>()

/**
 * 创建速率限制中间件
 *
 * 基于内存存储的滑动窗口限流：
 * - 超限时返回 429，并在响应头中告知重置时间
 * - 正常响应附带 `X-RateLimit-*` 头
 * - 定期清理过期条目（每个 `windowMs` 周期）
 *
 * @param config - 限流配置
 * @returns Middleware 实例
 *
 * @example
 * ```ts
 * middleware: [
 *   kit.middleware.rateLimit({ windowMs: 60_000, maxRequests: 100 }),
 * ]
 * ```
 */
export function rateLimitMiddleware(config: RateLimitConfig): Middleware {
  const {
    windowMs,
    maxRequests,
    keyGenerator = (event) => {
      try {
        return event.getClientAddress?.() ?? 'unknown'
      }
      catch {
        // 开发环境下 getClientAddress 可能抛出错误
        return 'unknown'
      }
    },
    onLimitReached,
  } = config

  // 定期清理过期条目
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of store) {
      if (entry.resetAt < now) {
        store.delete(key)
      }
    }
  }, windowMs)

  return async (context, next) => {
    const { event, requestId } = context
    const key = keyGenerator(event)
    const now = Date.now()

    let entry = store.get(key)

    if (!entry || entry.resetAt < now) {
      entry = {
        count: 0,
        resetAt: now + windowMs,
      }
      store.set(key, entry)
    }

    entry.count++

    // 设置速率限制头
    const remaining = Math.max(0, maxRequests - entry.count)
    const resetTime = Math.ceil(entry.resetAt / 1000)

    if (entry.count > maxRequests) {
      core.logger.warn('Rate limit exceeded', { key, requestId })

      if (onLimitReached) {
        return onLimitReached(event)
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests, please try again later',
          },
          requestId,
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'X-RateLimit-Limit': String(maxRequests),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(resetTime),
            'Retry-After': String(Math.ceil((entry.resetAt - now) / 1000)),
          },
        },
      )
    }

    const response = await next()

    // 添加速率限制头到响应
    response.headers.set('X-RateLimit-Limit', String(maxRequests))
    response.headers.set('X-RateLimit-Remaining', String(remaining))
    response.headers.set('X-RateLimit-Reset', String(resetTime))

    return response
  }
}
