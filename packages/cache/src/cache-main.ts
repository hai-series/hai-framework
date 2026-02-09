import type { Result } from '@hai/core'
import type { CacheConfig, CacheConfigInput } from './cache-config.js'
import type {
  CacheError,
  CacheFunctions,
  CacheProvider,
  HashOperations,
  KvOperations,
  ListOperations,
  SetOperations,
  ZSetOperations,
} from './cache-types.js'

import { core, err, ok } from '@hai/core'

import { CacheConfigSchema, CacheErrorCode } from './cache-config.js'
import { cacheM } from './cache-i18n.js'
import { createMemoryProvider } from './providers/cache-provider-memory.js'
import { createRedisProvider } from './providers/cache-provider-redis.js'

// ─── 内部状态 ───

/** 当前活跃的 Provider 实例；init 后赋值，close 后置 null */
let currentProvider: CacheProvider | null = null
/** 当前缓存配置（Zod parse 后）；init 后赋值，close 后置 null */
let currentConfig: CacheConfig | null = null

// ─── Provider 工厂 ───

/**
 * 根据配置创建对应的缓存 Provider
 *
 * @param config - 已经过 Zod Schema 校验的配置对象
 * @returns 未连接的 Provider 实例，需后续调用 connect()
 * @throws 配置中 type 不支持时抛出异常
 */
function createProvider(config: CacheConfig): CacheProvider {
  switch (config.type) {
    case 'memory':
      return createMemoryProvider()
    case 'redis':
      return createRedisProvider()
    default:
      throw new Error(cacheM('cache_unsupportedType', { params: { type: (config as { type: string }).type } }))
  }
}

// ─── 未初始化占位 ───

/**
 * 未初始化时的错误工具集
 *
 * 所有子接口（kv/hash/list/set_/zset）在未 init 前使用 proxy 占位，
 * 调用任意方法均返回 { success: false, error: { code: NOT_INITIALIZED } }
 */
const notInitialized = core.module.createNotInitializedKit<CacheError>(
  CacheErrorCode.NOT_INITIALIZED,
  () => cacheM('cache_notInitialized'),
)

const notInitializedKv = notInitialized.proxy<KvOperations>()
const notInitializedHash = notInitialized.proxy<HashOperations>()
const notInitializedList = notInitialized.proxy<ListOperations>()
const notInitializedSet = notInitialized.proxy<SetOperations>()
const notInitializedZSet = notInitialized.proxy<ZSetOperations>()

// ─── 缓存服务对象 ───

/**
 * 缓存服务对象
 *
 * @example
 * ```ts
 * import { cache } from '@hai/cache'
 *
 * await cache.init({ type: 'redis', host: 'localhost', port: 6379 })
 * await cache.kv.set('user:1', { name: '张三' }, { ex: 3600 })
 * const result = await cache.kv.get<{ name: string }>('user:1')
 * await cache.close()
 * ```
 */
export const cache: CacheFunctions = {
  /**
   * 初始化缓存连接
   *
   * 会先关闭已有连接，再用新配置重新初始化。
   * 配置经 Zod Schema parse 后传给 Provider。
   *
   * @param config - 缓存配置（支持 memory / redis）
   * @returns 成功时 ok(undefined)，失败时返回 CONNECTION_FAILED 错误
   *
   * @example
   * ```ts
   * const result = await cache.init({ type: 'redis', host: 'localhost' })
   * if (!result.success) console.error(result.error)
   * ```
   */
  async init(config: CacheConfigInput): Promise<Result<void, CacheError>> {
    await cache.close()
    try {
      const parsed = CacheConfigSchema.parse(config)
      const provider = createProvider(parsed)
      const connectResult = await provider.connect(parsed)
      if (!connectResult.success) {
        return connectResult
      }
      currentProvider = provider
      currentConfig = parsed
      return ok(undefined)
    }
    catch (error) {
      return err({
        code: CacheErrorCode.CONNECTION_FAILED,
        message: cacheM('cache_initFailed', {
          params: { error: error instanceof Error ? error.message : String(error) },
        }),
        cause: error,
      })
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
  /** 当前配置（parse 后）；未初始化时返回 null */
  get config(): CacheConfig | null { return currentConfig },
  /** 是否已初始化并连接；Provider 不存在或未连接时返回 false */
  get isInitialized(): boolean { return currentProvider !== null && currentProvider.isConnected() },

  /**
   * 测试缓存连接状态
   *
   * @returns 成功时返回 'PONG'；未初始化时返回 NOT_INITIALIZED 错误
   */
  ping(): Promise<Result<string, CacheError>> {
    return currentProvider?.ping() ?? Promise.resolve(notInitialized.result())
  },

  /** 关闭缓存连接并释放资源；未初始化时调用安全无副作用 */
  async close(): Promise<void> {
    if (currentProvider) {
      await currentProvider.close()
      currentProvider = null
      currentConfig = null
    }
  },
}
