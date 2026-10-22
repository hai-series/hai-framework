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
  return !core.module.requiresSharedState(process.env)
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
 * 创建显式开发/测试计数器；无定时器，最多保存 10000 个窗口，生产拒绝内存模式。
 * @returns 由调用者持有的计数器；丢弃引用即可回收，无需关闭，也不接管外部 store。
 * @example const store = kit.middleware.createMemoryRateLimitStore()
 */
export function createMemoryRateLimitStore(): MemoryRateLimitStore {
  if (!permitsMemory())
    throw new Error('Memory rate limiting is restricted to development and tests')
  return new MemoryRateLimitStore()
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
 * 基于 Map 实现，仅用于单进程开发/测试；每次请求最多扫描 64 项过期窗口，
 * 不持有定时器。最多 10000 项，容量耗尽时拒绝新 key，不驱逐有效计数以免绕过限流。
 * @example const store = kit.middleware.createMemoryRateLimitStore(); store.increment('client', 1000)
 */
export class MemoryRateLimitStore implements RateLimitStore {
  readonly scope = 'memory' as const
  private store = new Map<string, RateLimitEntry>()
  private cleanupCursor: MapIterator<[string, RateLimitEntry]> | undefined

  /**
   * 有界惰性回收；保留迭代位置，避免每次从头扫描使尾部过期项永久滞留。
   * @param now - 当前请求时间，等于 resetAt 时窗口已经失效。
   */
  private prune(now: number): void {
    this.cleanupCursor ??= this.store.entries()
    for (let index = 0; index < 64; index++) {
      const next = this.cleanupCursor.next()
      if (next.done) {
        this.cleanupCursor = undefined
        break
      }
      const [key, entry] = next.value
      if (entry.resetAt <= now)
        this.store.delete(key)
    }
  }

  /**
   * 原子自增（内存实现为同步操作，天然原子）
   *
   * @param key - 限流键
   * @param windowMs - 窗口时长
   * @returns 自增后的快照，修改返回对象不会改变已保存的计数。
   * @throws 新 key 超出容量或期限非法；中间件将其转换为 503。
   * @example store.increment('client', 60_000)
   */
  increment(key: string, windowMs: number): RateLimitEntry {
    const now = Date.now()
    if (!Number.isSafeInteger(windowMs) || windowMs <= 0 || windowMs > 2147483647)
      throw new TypeError(kitM('kit_rateLimitWindowInvalid'))
    this.prune(now)
    const current = this.store.get(key)
    if (!current && this.store.size >= 10000)
      throw new Error(kitM('kit_rateLimitMemoryCapacity'))
    const entry = !current || current.resetAt <= now
      ? { count: 1, resetAt: now + windowMs }
      : { count: current.count + 1, resetAt: current.resetAt }
    this.store.set(key, entry)
    return { ...entry }
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
