/**
 * @h-ai/cache — 缓存服务主入口
 *
 * 提供统一的 `cache` 对象，聚合所有缓存操作功能。
 * @module cache-main
 */

import type { HaiResult } from '@h-ai/core'
import type { CacheConfig, CacheConfigInput } from './cache-config.js'
import type { CacheFunctions, HashOperations, KvOperations, ListOperations, LockOperations, SetOperations, ZSetOperations } from './cache-types.js'
import type { CacheProvider } from './providers/cache-provider-types.js'
import process from 'node:process'
import { core, err, ok } from '@h-ai/core'

import { CacheConfigSchema } from './cache-config.js'

import { cacheM } from './cache-i18n.js'
import {

  HaiCacheError,

} from './cache-types.js'
import { createMemoryProvider } from './providers/cache-provider-memory.js'
import { createRedisProvider } from './providers/cache-provider-redis.js'

const logger = core.logger.child({ module: 'cache', scope: 'main' })

// ─── 内部状态 ───

/** 当前活跃的 Provider 实例；init 后赋值，close 后置 null */
let currentProvider: CacheProvider | null = null
/** 当前缓存配置（Zod parse 后）；init 后赋值，close 后置 null */
let currentConfig: CacheConfig | null = null
/** 并发初始化防护标志；防止多次 init() 同时执行导致资源泄漏 */
let initInProgress = false

/** 尚未释放的候选/旧 Provider；绝不用于业务操作，清理成功后才能替换。 */
let pendingProvider: CacheProvider | null = null
/** 初始化完成屏障，供 close 等待候选资源归属确定。 */
let initCompletion: Promise<void> | null = null
/** 合并并发关闭，避免同一连接重复释放。 */
let closingPromise: Promise<HaiResult<void>> | null = null

/** 停止发布资源并重试清理；失败时保留唯一所有权供下一次 close/init 重试。 */
async function closeOwnedProvider(): Promise<HaiResult<void>> {
  if (currentProvider) {
    pendingProvider = currentProvider
    currentProvider = null
  }
  currentConfig = null
  if (!pendingProvider)
    return ok(undefined)
  try {
    await pendingProvider.close()
    pendingProvider = null
    return ok(undefined)
  }
  catch (error) {
    logger.error('Provider cleanup failed; retaining resource for retry', { error })
    return err({ ...HaiCacheError.CONNECTION_FAILED, message: cacheM('cache_operationFailed', {
      params: { error: error instanceof Error ? error.message : String(error) },
    }), cause: error, ext: { cleanupPending: true } })
  }
}

/** 初始化失败后释放候选；保留原始错误，并明确指出清理尚未完成。 */
async function failInitialization(result: HaiResult<void>): Promise<HaiResult<void>> {
  const cleanup = await closeOwnedProvider()
  if (result.success)
    return result
  if (cleanup.success) {
    const ext = { ...result.error.ext }
    delete ext.cleanupPending
    delete ext.cleanupError
    return err({ ...result.error, ext: Object.keys(ext).length > 0 ? ext : undefined })
  }
  return err({ ...result.error, ext: { ...result.error.ext, cleanupPending: true, cleanupError: cleanup.error } })
}

// ─── Provider 工厂 ───

/**
 * 根据配置创建对应的缓存 Provider
 *
 * @param config - 已经过 Zod Schema 校验的配置对象
 * @returns 未连接的 Provider 实例，需后续调用 connect()
 */
function createProvider(config: CacheConfig): HaiResult<CacheProvider> {
  switch (config.type) {
    case 'memory':
      return ok(createMemoryProvider())
    case 'redis':
      return ok(createRedisProvider())
    default:
      return err(
        HaiCacheError.UNSUPPORTED_TYPE,
        cacheM('cache_unsupportedType', { params: { type: (config as { type: string }).type } }),
      )
  }
}

// ─── 未初始化占位 ───

/**
 * 未初始化时的错误工具集
 *
 * 所有子接口（kv/hash/list/set_/zset）在未 init 前使用 proxy 占位，
 * 调用任意方法均返回 { success: false, error: { code: NOT_INITIALIZED } }
 */
const notInitialized = core.module.createNotInitializedKit(
  HaiCacheError.NOT_INITIALIZED,
  () => cacheM('cache_notInitialized'),
)

const notInitializedKv = notInitialized.proxy<KvOperations>()
const notInitializedHash = notInitialized.proxy<HashOperations>()
const notInitializedList = notInitialized.proxy<ListOperations>()
const notInitializedSet = notInitialized.proxy<SetOperations>()
const notInitializedZSet = notInitialized.proxy<ZSetOperations>()
const notInitializedLock = notInitialized.proxy<LockOperations>()

// ─── 缓存服务对象 ───

/**
 * 缓存服务对象
 *
 * @example
 * ```ts
 * import { cache } from '@h-ai/cache'
 *
 * await cache.init({ type: 'redis', host: 'localhost', port: 6379 })
 * await cache.kv.set('user:1', { name: '张三' }, { ex: 3600 })
 * const result = await cache.kv.get<{ name: string }>('user:1')
 * await cache.close()
 * ```
 */
export const cache: CacheFunctions = {
  /**
   * 初始化缓存连接。
   *
   * 会先关闭已有连接，再用新配置重新初始化。
   * 配置经 Zod Schema parse 后传给 Provider。
   *
   * @param config 缓存配置（支持 memory / redis）。
   * @returns 成功时返回 ok(undefined)；失败时返回 Provider 错误（如 CONNECTION_FAILED）。
   *
   * @example
   * ```ts
   * const result = await cache.init({ type: 'redis', host: 'localhost' })
   * if (!result.success) {
   *   // 生产代码中请使用项目 logger 输出错误
   * }
   * ```
   */
  async init(config: CacheConfigInput): Promise<HaiResult<void>> {
    // 并发初始化防护：避免多次 init 同时执行导致 Provider 泄漏
    if (initInProgress || closingPromise) {
      logger.warn('Cache init already in progress, skipping concurrent call')
      return err(
        HaiCacheError.OPERATION_FAILED,
        cacheM('cache_operationFailed', { params: { error: 'Concurrent initialization detected' } }),
      )
    }
    initInProgress = true
    let resolveInit!: () => void
    initCompletion = new Promise<void>((resolve) => {
      resolveInit = resolve
    })

    try {
      const cleanup = await closeOwnedProvider()
      if (!cleanup.success)
        return cleanup

      logger.info('Initializing cache module')

      const parseResult = CacheConfigSchema.safeParse(config)
      if (!parseResult.success) {
        logger.error('Cache config validation failed', { error: parseResult.error.message })
        return err(
          HaiCacheError.CONFIG_ERROR,
          cacheM('cache_configError', { params: { error: parseResult.error.message } }),
          parseResult.error,
        )
      }
      const parsed = parseResult.data
      if (core.module.requiresSharedState(process.env) && (parsed.type === 'memory'))
        return err(HaiCacheError.CONFIG_ERROR, cacheM('cache_sharedBackendRequired'))

      try {
        const providerResult = createProvider(parsed)
        if (!providerResult.success)
          return err(providerResult.error)

        const provider = providerResult.data
        pendingProvider = provider
        const connectResult = await provider.connect(parsed)
        if (!connectResult.success) {
          logger.error('Cache module initialization failed', {
            code: connectResult.error.code,
            message: connectResult.error.message,
          })
          return await failInitialization(connectResult)
        }
        pendingProvider = null
        currentProvider = provider
        currentConfig = parsed
        logger.info('Cache module initialized', { type: parsed.type })
        return ok(undefined)
      }
      catch (error) {
        logger.error('Cache module initialization failed', { error })
        return await failInitialization(err(
          HaiCacheError.CONNECTION_FAILED,
          cacheM('cache_initFailed', {
            params: { error: error instanceof Error ? error.message : String(error) },
          }),
          error,
        ))
      }
    }
    finally {
      initInProgress = false
      initCompletion = null
      resolveInit()
    }
  },

  /** KV 操作子接口；未 init 时所有方法返回 NOT_INITIALIZED */
  get kv(): KvOperations { return currentProvider?.kv ?? notInitializedKv },
  /** Hash 操作子接口 */
  get hash(): HashOperations { return currentProvider?.hash ?? notInitializedHash },
  /** List 操作子接口 */
  get list(): ListOperations { return currentProvider?.list ?? notInitializedList },
  /** Set 操作子接口（名称加 _ 以避免与 JS 关键字冲突） */
  get set_(): SetOperations { return currentProvider?.set_ ?? notInitializedSet },
  /** ZSet（有序集合）操作子接口 */
  get zset(): ZSetOperations { return currentProvider?.zset ?? notInitializedZSet },
  /** 分布式锁操作子接口 */
  get lock(): LockOperations { return currentProvider?.lock ?? notInitializedLock },
  /** 当前脱敏后的配置快照；未初始化时返回 null */
  get config(): CacheConfig | null { return currentConfig ? core.sanitize.sanitizeSensitiveFields(currentConfig) : null },
  /** 是否已初始化并连接；Provider 不存在或未连接时返回 false */
  get isInitialized(): boolean { return currentProvider !== null && currentProvider.isConnected() },

  /**
   * 测试缓存连接状态
   *
   * @returns 成功时返回 'PONG'；未初始化时返回 NOT_INITIALIZED 错误
   */
  ping(): Promise<HaiResult<string>> {
    return currentProvider?.ping() ?? Promise.resolve(notInitialized.result())
  },

  /**
   * 停止提供缓存操作并释放资源；等待正在进行的初始化，并合并并发关闭。
   * @returns 清理失败返回错误并保留资源，后续 close/init 先重试同一资源。
   * @example
   * const closed = await cache.close()
   * if (!closed.success) await cache.close()
   */
  async close(): Promise<HaiResult<void>> {
    if (!closingPromise) {
      closingPromise = (async () => {
        if (initCompletion)
          await initCompletion
        return await closeOwnedProvider()
      })().finally(() => { closingPromise = null })
    }
    return await closingPromise
  },
}
