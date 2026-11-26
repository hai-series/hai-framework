/**
 * @h-ai/core — Serv 与 Kit 共用的 HTTP 固定窗口限流和原子存储。
 * @module core-function-rate-limit.node
 */

import type { HaiError, HttpRateLimitOptions, MemoryRateLimitStore, RateLimitCache, RateLimitEntry, RateLimitStore } from '../core-types.js'
import { createHash } from 'node:crypto'
import { isIP } from 'node:net'
import process from 'node:process'
import { HttpRateLimitConfigSchema } from '../core-config.js'
import { HaiCommonError } from '../core-types.js'
import { i18n } from '../i18n/core-i18n-utils.js'
import { requiresSharedState } from '../utils/core-util-module.js'
import { error } from './core-function-error.js'
import { logger } from './core-function-logger.node.js'

/** 构建产物的端到端测试也可显式使用进程内存储。 */
function permitsMemory(): boolean {
  return !requiresSharedState(process.env)
}

/**
 * 创建共享缓存固定窗口计数器；Redis/Cluster的CAS与TTL构成原子边界。
 * 只有缓存键实际过期才新建窗口，节点时钟只影响响应头估算，不提前重置计数。
 * @param backend - 已初始化的cache模块；每次请求重新核对provider，防止切换后回退内存
 * @param options - 业务限流命名空间与显式开发内存选项
 * @param options.namespace - 同一策略的稳定业务范围
 * @param options.allowMemory - 仅开发或显式HAI_E2E测试允许内存cache
 * @returns 无内部定时器、不接管cache生命周期的计数器；基础设施错误显式抛错
 * @example
 * ```ts
 * import { core } from '@h-ai/core'
 *
 * import { cache } from '@h-ai/cache'
 *
 * // 应用在启动时先初始化 Redis cache，关闭时由应用统一回收。
 * const store = core.access.createCacheRateLimitStore(cache, { namespace: 'api' })
 * void store
 * ```
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
          throw new Error('Rate limit cache read failed', { cause: read.error })
        const old = read.data ?? undefined
        if (old && (!Number.isSafeInteger(old.count) || old.count <= 0 || old.count >= Number.MAX_SAFE_INTEGER || !Number.isSafeInteger(old.resetAt)))
          throw new Error('Invalid rate limit state')
        const next = old
          ? { count: old.count + 1, resetAt: old.resetAt }
          : { count: 1, resetAt: Date.now() + windowMs }
        const written = await backend.kv.compareAndSwap(cacheKey, old, next, old
          ? { keepTtl: true }
          : { px: windowMs })
        if (!written.success)
          throw new Error('Rate limit cache commit failed', { cause: written.error })
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
 * @example
 * ```ts
 * import { core } from '@h-ai/core'
 *
 * // 开发/测试进程；生产环境会明确拒绝内存计数。
 * const store = core.access.createMemoryRateLimitStore()
 * const entry = await store.increment('client_1', 60_000)
 * void entry.count
 * ```
 */
export function createMemoryRateLimitStore(): MemoryRateLimitStore {
  if (!permitsMemory())
    throw new Error('Memory rate limiting is restricted to development and tests')
  return new MemoryFixedWindowStore()
}

/** 将等价IPv6写法与IPv4映射地址归一化；代理头由可信adapter配置解析，此处不读取任意转发头。 */
function clientKey(address?: string): string {
  if (!address || address.includes('%'))
    return 'unknown'
  const family = isIP(address)
  if (family !== 6) {
    return family === 4
      ? address
      : 'unknown'
  }
  const normalized = new URL(`http://[${address}]`).hostname.slice(1, -1)
  const mapped = /^::ffff:([0-9a-f]+):([0-9a-f]+)$/.exec(normalized)
  if (!mapped)
    return normalized
  const value = Number.parseInt(mapped[1]!, 16) * 65536 + Number.parseInt(mapped[2]!, 16)
  return [
    value >>> 24,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255,
  ].join('.')
}

/**
 * 内存速率限制存储
 *
 * 基于 Map 实现，仅用于单进程开发/测试；每次请求最多扫描 64 项过期窗口，
 * 不持有定时器。最多 10000 项，容量耗尽时拒绝新 key，不驱逐有效计数以免绕过限流。
 * @example
 * ```ts
 * import { core } from '@h-ai/core'
 *
 * // 仅开发/测试；丢弃引用即可回收，无内部定时器。
 * const store = core.access.createMemoryRateLimitStore()
 * void store.increment('client_1', 60_000)
 * ```
 */
class MemoryFixedWindowStore implements MemoryRateLimitStore {
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
      throw new TypeError(i18n.coreM('core_rateLimitWindowInvalid'))
    this.prune(now)
    const current = this.store.get(key)
    if (!current && this.store.size >= 10000)
      throw new Error(i18n.coreM('core_rateLimitMemoryCapacity'))
    const entry = !current || current.resetAt <= now
      ? { count: 1, resetAt: now + windowMs }
      : { count: current.count + 1, resetAt: current.resetAt }
    this.store.set(key, entry)
    return { ...entry }
  }
}

/**
 * 组装固定窗口检查器。调用方应使用可信客户端地址，并在允许时将返回头写入其宿主响应。
 * @param config - 时长、额度、原子计数器和可选自定义主体或拒绝响应。
 * @returns 异步检查器。允许时返回响应头，超额或计数故障时返回 HTTP 响应。
 * @throws 配置无效、缺少原子计数器或在生产环境使用内存计数器。
 * @example
 * ```ts
 * import { core } from '@h-ai/core'
 *
 * // 单进程开发展示。同一可信地址在当前窗口内共享两次额度。
 * const check = core.access.createRateLimiter<Request>({
 *   store: core.access.createMemoryRateLimitStore(),
 *   windowMs: 10000,
 *   maxRequests: 2,
 * })
 * const request = new Request('https://example.test/api/ping')
 * const checked = await check({ requestId: 'request-1', clientAddress: '192.0.2.10', context: request })
 * if (checked instanceof Response) void checked.status
 * else void checked.get('X-RateLimit-Remaining')
 * ```
 */
export function createRateLimiter<T>(
  config: HttpRateLimitOptions<T>,
): (input: { requestId: string, clientAddress?: string, context: T }) => Promise<Headers | Response> {
  const policy = HttpRateLimitConfigSchema.parse({
    windowMs: config.windowMs,
    maxRequests: config.maxRequests,
  })
  if (!policy)
    throw new TypeError('Rate limit policy must be enabled')
  const { windowMs, maxRequests } = policy
  const { store, keyGenerator, onLimitReached } = config
  if (!store || typeof store.increment !== 'function' || (store.scope !== 'memory' && store.scope !== 'shared'))
    throw new TypeError('An atomic rate limit store is required')
  if (store.scope === 'memory' && !permitsMemory())
    throw new Error('Memory rate limiting is restricted to development and tests')

  return async ({ requestId, clientAddress, context }) => {
    const now = Date.now()
    let entry: RateLimitEntry
    try {
      entry = await store.increment(keyGenerator
        ? keyGenerator(context)
        : clientKey(clientAddress), windowMs)
      if (!Number.isSafeInteger(entry.count) || entry.count <= 0 || !Number.isSafeInteger(entry.resetAt))
        throw new TypeError('Invalid atomic rate limit result')
    }
    catch (cause) {
      return rateLimitResponse({
        ...HaiCommonError.SERVICE_UNAVAILABLE,
        message: i18n.coreM('core_errorInternal'),
        cause,
      }, requestId)
    }

    const headers = new Headers({
      'X-RateLimit-Limit': String(maxRequests),
      'X-RateLimit-Remaining': String(Math.max(0, maxRequests - entry.count)),
      'X-RateLimit-Reset': String(Math.ceil(entry.resetAt / 1000)),
    })
    if (entry.count <= maxRequests)
      return headers

    headers.set('Retry-After', String(Math.max(1, Math.ceil((entry.resetAt - now) / 1000))))
    const response = rateLimitResponse({
      ...HaiCommonError.RATE_LIMIT_EXCEEDED,
      message: i18n.coreM('core_rateLimitExceeded'),
    }, requestId, headers)
    if (!onLimitReached)
      return response

    try {
      const customized = onLimitReached(context, response.clone())
      const customizedHeaders = new Headers(customized.headers)
      for (const [name, value] of headers)
        customizedHeaders.set(name, value)
      return new Response(customized.body, { status: response.status, headers: customizedHeaders })
    }
    catch (cause) {
      logger.getLogger().error('Rate limit response customization failed', { requestId, error: cause })
      return response
    }
  }
}

function rateLimitResponse(failure: HaiError, requestId: string, headers = new Headers()): Response {
  const safe = error.toPublic(failure, requestId)
  const status = safe.httpStatus ?? 500
  const logContext = { traceId: safe.traceId, errorCode: safe.code, status }
  if (status >= 500)
    logger.getLogger().error('Rate limit check failed', { ...logContext, error: failure })
  else
    logger.getLogger().debug('Rate limit exceeded', logContext)
  headers.set('X-Trace-Id', safe.traceId!)
  return Response.json({
    success: false,
    error: {
      ...safe,
      code: String(safe.code),
      httpStatus: status,
    },
    requestId: safe.traceId,
  }, { status, headers })
}
