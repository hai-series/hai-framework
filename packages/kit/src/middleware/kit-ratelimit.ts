/**
 * =============================================================================
 * @h-ai/kit - 速率限制中间件
 * =============================================================================
 * 基于滑动窗口的请求速率限制中间件，内置内存存储（MemoryRateLimitStore），
 * 支持通过 RateLimitStore 接口接入 Redis 等外部存储后端。
 * =============================================================================
 */

import type { Middleware, RateLimitConfig } from '../kit-types.js'
import { core } from '@h-ai/core'
import { getKitMessage } from '../kit-i18n.js'

/**
 * 速率限制存储条目
 */
export interface RateLimitEntry {
  /** 当前窗口内的请求次数 */
  count: number
  /** 窗口重置时间戳（ms） */
  resetAt: number
}

/**
 * 速率限制存储接口
 *
 * 内置 `MemoryRateLimitStore` 适合单进程开发；
 * 多实例部署需传入基于 Redis / @h-ai/cache 的分布式实现。
 *
 * @example
 * ```ts
 * // 自定义 Redis 存储
 * const redisStore: RateLimitStore = {
 *   async get(key) { ... },
 *   async set(key, entry) { ... },
 *   async delete(key) { ... },
 * }
 * kit.middleware.rateLimit({ windowMs: 60_000, maxRequests: 100, store: redisStore })
 * ```
 */
export interface RateLimitStore {
  /** 获取指定 key 的限流条目 */
  get: (key: string) => Promise<RateLimitEntry | undefined> | RateLimitEntry | undefined
  /** 设置限流条目 */
  set: (key: string, entry: RateLimitEntry) => Promise<void> | void
  /** 删除指定 key 的限流条目 */
  delete: (key: string) => Promise<void> | void
  /**
   * 原子自增并返回当前计数和重置时间
   *
   * 实现时必须保证 get→increment→set 操作的原子性，
   * 防止并发请求在窗口切换时产生竞态绕过限流。
   * 若未实现，则退回非原子 get+set 流程。
   *
   * @param key - 限流键
   * @param windowMs - 窗口时长（ms）
   * @returns 自增后的计数和窗口重置时间
   */
  increment?: (key: string, windowMs: number) => Promise<RateLimitEntry> | RateLimitEntry
}

/**
 * 内存速率限制存储
 *
 * 基于 Map 实现，适合单进程/开发环境。
 * 多实例部署时限流上限会乘以实例数，建议使用分布式 Store。
 */
export class MemoryRateLimitStore implements RateLimitStore {
  private store = new Map<string, RateLimitEntry>()
  private cleanupTimer: ReturnType<typeof setInterval> | null = null

  /**
   * 启动定期清理过期条目
   *
   * @param intervalMs - 清理间隔（毫秒）
   */
  startCleanup(intervalMs: number): void {
    if (this.cleanupTimer)
      return
    this.cleanupTimer = setInterval(() => {
      const now = Date.now()
      for (const [key, entry] of this.store) {
        if (entry.resetAt < now) {
          this.store.delete(key)
        }
      }
    }, intervalMs)
    // 允许进程正常退出
    if (this.cleanupTimer && typeof this.cleanupTimer === 'object' && 'unref' in this.cleanupTimer) {
      this.cleanupTimer.unref()
    }
  }

  get(key: string): RateLimitEntry | undefined {
    return this.store.get(key)
  }

  set(key: string, entry: RateLimitEntry): void {
    this.store.set(key, entry)
  }

  delete(key: string): void {
    this.store.delete(key)
  }

  /**
   * 原子自增（内存实现为同步操作，天然原子）
   *
   * @param key - 限流键
   * @param windowMs - 窗口时长
   * @returns 自增后的条目
   */
  increment(key: string, windowMs: number): RateLimitEntry {
    const now = Date.now()
    let entry = this.store.get(key)
    if (!entry || entry.resetAt < now) {
      entry = { count: 1, resetAt: now + windowMs }
    }
    else {
      entry.count++
    }
    this.store.set(key, entry)
    return entry
  }
}

/**
 * 创建速率限制中间件
 *
 * 基于可插拔存储的滑动窗口限流：
 * - 超限时返回 429，并在响应头中告知重置时间
 * - 正常响应附带 `X-RateLimit-*` 头
 * - 默认使用内存存储（单进程），可传入 `store` 实现分布式限流
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

  // 构建存储：支持外部注入，默认内存
  const store: RateLimitStore = config.store ?? (() => {
    const memStore = new MemoryRateLimitStore()
    memStore.startCleanup(windowMs)
    return memStore
  })()

  return async (context, next) => {
    const { event, requestId } = context
    const key = keyGenerator(event)
    const now = Date.now()

    // 优先使用原子 increment，防止并发竞态
    let entry: RateLimitEntry
    if (store.increment) {
      entry = await store.increment(key, windowMs)
    }
    else {
      // 退回非原子流程（仅用于未实现 increment 的存储后端）
      const existing = await store.get(key)
      if (!existing || existing.resetAt < now) {
        entry = { count: 1, resetAt: now + windowMs }
      }
      else {
        entry = { ...existing, count: existing.count + 1 }
      }
      await store.set(key, entry)
    }

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
            message: getKitMessage('kit_rateLimitExceeded'),
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
