/**
 * @h-ai/kit — 速率限制中间件
 *
 * 以首个成功请求为起点的固定窗口限流；后续计数不延长窗口。
 * 内置内存存储（`MemoryRateLimitStore`），并支持通过 `RateLimitStore` 接入
 * Redis 等外部存储后端。
 * @module kit-ratelimit
 */

import type { HaiResult } from '@h-ai/core'
import type { Middleware, RateLimitConfig } from '../kit-types.js'
import { createHash } from 'node:crypto'
import { isIP } from 'node:net'
import process from 'node:process'
import { core } from '@h-ai/core'
import { kitM } from '../kit-i18n.js'

/**
 * 速率限制存储条目
 */
export interface RateLimitEntry {
  /** 当前窗口内的请求次数 */
  count: number
  /** 窗口重置时间戳（ms） */
  resetAt: number
}

/** 构建产物的端到端测试也可显式使用内存；正式部署不得设置测试开关。 */
function permitsMemory(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.HAI_E2E === '1' || process.env.HAI_E2E_MOCK === '1'
}

/**
 * 原子固定窗口计数器；故障抛错由中间件转为503，禁止读改写回退。
 * @example const store = kit.middleware.createCacheRateLimitStore(cache, { namespace: 'api' })
 */
export interface RateLimitStore {
  /** shared要求共享后端；memory仅限显式开发/测试。 */
  readonly scope: 'shared' | 'memory'
  /** 原子计数并保留首次请求的窗口，返回提交后的计数/重置点。 */
  increment: (key: string, windowMs: number) => Promise<RateLimitEntry> | RateLimitEntry
}

/**
 * 共享缓存的最小结构契约；使用其单键CAS与服务端TTL，不使用锁或客户端到期清零。
 * @example const backend: RateLimitCache = cache
 */
export interface RateLimitCache {
  readonly config: { type: string } | null
  readonly kv: {
    get: <T>(key: string) => Promise<HaiResult<T | null>>
    compareAndSwap: (key: string, expected: RateLimitEntry | undefined, value: RateLimitEntry, options: { px?: number, keepTtl?: boolean }) => Promise<HaiResult<boolean>>
  }
}

/**
 * 创建共享缓存固定窗口计数器；Redis/Cluster的CAS与TTL构成原子边界。
 * 只有缓存键实际过期才新建窗口，节点时钟只影响响应头估算，不提前重置计数。
 * @param backend - 已初始化的cache模块；每次请求重新核对provider，防止切换后回退内存
 * @param options - 业务限流命名空间与显式开发内存选项
 * @param options.namespace - 同一策略的稳定业务范围
 * @param options.allowMemory - 仅开发或显式HAI_E2E测试允许内存cache
 * @returns 无内部定时器、不接管cache生命周期的计数器；基础设施错误显式抛错
 * @example kit.createHandle({ rateLimit: { store: kit.middleware.createCacheRateLimitStore(cache, { namespace: 'api' }) } })
 */
export function createCacheRateLimitStore(backend: RateLimitCache, options: { namespace: string, allowMemory?: boolean }): RateLimitStore {
  if (!options.namespace || options.namespace.length > 128)
    throw new TypeError('A rate limit namespace of 1-128 characters is required')
  return {
    scope: 'shared',
    async increment(key, windowMs) {
      if (!backend.config || (backend.config.type !== 'redis' && !(backend.config.type === 'memory' && options.allowMemory && permitsMemory())))
        throw new Error('Rate limiting requires a shared Redis cache')
      const digest = createHash('sha256').update(JSON.stringify([options.namespace, windowMs, key])).digest('hex')
      const cacheKey = `hai:kit:ratelimit:{${digest}}`
      for (let attempt = 0; attempt < 64; attempt++) {
        const read = await backend.kv.get<RateLimitEntry>(cacheKey)
        if (!read.success)
          throw new Error('Rate limit cache read failed')
        const old = read.data ?? undefined
        if (old && (!Number.isSafeInteger(old.count) || old.count <= 0 || old.count >= Number.MAX_SAFE_INTEGER || !Number.isSafeInteger(old.resetAt)))
          throw new Error('Invalid rate limit state')
        const next = old ? { count: old.count + 1, resetAt: old.resetAt } : { count: 1, resetAt: Date.now() + windowMs }
        const written = await backend.kv.compareAndSwap(cacheKey, old, next, old ? { keepTtl: true } : { px: windowMs })
        if (!written.success)
          throw new Error('Rate limit cache commit failed')
        if (written.data)
          return next
      }
      throw new Error('Rate limit contention limit exceeded')
    },
  }
}

/**
 * 创建显式开发/测试计数器；生产环境拒绝内存模式。
 * @example const store = kit.middleware.createMemoryRateLimitStore()
 */
export function createMemoryRateLimitStore(): MemoryRateLimitStore {
  if (!permitsMemory())
    throw new Error('Memory rate limiting is restricted to development and tests')
  const store = new MemoryRateLimitStore()
  store.startCleanup(60000)
  return store
}

/** 将等价IPv6写法与IPv4映射地址归一化；代理头由可信adapter配置解析，此处不读取任意转发头。 */
function clientKey(address: string): string {
  if (isIP(address) !== 6)
    return address
  const normalized = new URL(`http://[${address}]`).hostname.slice(1, -1)
  const mapped = /^::ffff:([0-9a-f]+):([0-9a-f]+)$/.exec(normalized)
  if (!mapped)
    return normalized
  const value = Number.parseInt(mapped[1]!, 16) * 65536 + Number.parseInt(mapped[2]!, 16)
  return [value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join('.')
}

/**
 * 内存速率限制存储
 *
 * 基于 Map 实现，适合单进程/开发环境。
 * 多实例部署时限流上限会乘以实例数，建议使用分布式 Store。
 */
export class MemoryRateLimitStore implements RateLimitStore {
  readonly scope = 'memory' as const
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
        if (entry.resetAt <= now) {
          this.store.delete(key)
        }
      }
    }, intervalMs)
    // 允许进程正常退出
    if (this.cleanupTimer && typeof this.cleanupTimer === 'object' && 'unref' in this.cleanupTimer) {
      this.cleanupTimer.unref()
    }
  }

  /**
   * 停止定期清理并释放定时器资源
   *
   * 调用后可再次 startCleanup 重启。进程退出 / 热重载 / 测试拆装场景必须调用以
   * 避免资源泄漏。
   */
  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
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
    if (!entry || entry.resetAt <= now) {
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
 * 基于必选原子存储的固定窗口限流：
 * - 超限时返回 429，并在响应头中告知重置时间
 * - 正常响应附带 `X-RateLimit-*` 头
 * - 必须显式传入 store；生产使用共享计数器，故障返回503
 *
 * @param config - 限流配置
 * @returns Middleware 实例
 *
 * @example
 * ```ts
 * middleware: [
 *   kit.middleware.rateLimit({ windowMs: 60_000, maxRequests: 100, store }),
 * ]
 * ```
 */
export function rateLimitMiddleware(config: RateLimitConfig): Middleware {
  const {
    windowMs,
    maxRequests,
    keyGenerator = (event) => {
      try {
        return clientKey(event.getClientAddress?.() ?? 'unknown')
      }
      catch {
        // 开发环境下 getClientAddress 可能抛出错误
        return 'unknown'
      }
    },
    onLimitReached,
  } = config

  if (!Number.isSafeInteger(windowMs) || windowMs <= 0 || windowMs > 2147483647 || !Number.isSafeInteger(maxRequests) || maxRequests <= 0)
    throw new TypeError('Rate limit window/count must be positive integers (window <= 2147483647ms)')
  const store = config.store
  if (!store || typeof store.increment !== 'function')
    throw new TypeError('An atomic rate limit store is required')
  if (store.scope === 'memory' && !permitsMemory())
    throw new Error('Memory rate limiting is restricted to development and tests')

  return async (context, next) => {
    const { event, requestId } = context
    const now = Date.now()
    let entry: RateLimitEntry
    try {
      entry = await store.increment(keyGenerator(event), windowMs)
      if (!Number.isSafeInteger(entry.count) || entry.count <= 0 || !Number.isSafeInteger(entry.resetAt))
        throw new TypeError('Invalid atomic rate limit result')
    }
    catch {
      core.logger.error('Rate limit store unavailable', { requestId })
      return new Response(JSON.stringify({ success: false, error: { code: 'RATE_LIMIT_UNAVAILABLE', message: kitM('kit_internalError') }, requestId }), { status: 503, headers: { 'Content-Type': 'application/json' } })
    }

    // 设置速率限制头
    const remaining = Math.max(0, maxRequests - entry.count)
    const resetTime = Math.ceil(entry.resetAt / 1000)

    if (entry.count > maxRequests) {
      core.logger.warn('Rate limit exceeded', { requestId })

      if (onLimitReached) {
        return onLimitReached(event)
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: kitM('kit_rateLimitExceeded'),
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
            'Retry-After': String(Math.max(1, Math.ceil((entry.resetAt - now) / 1000))),
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
