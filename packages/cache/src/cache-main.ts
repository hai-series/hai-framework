/**
 * =============================================================================
 * @hai/cache - 缓存服务主入口
 * =============================================================================
 *
 * 本文件提供统一的 `cache` 对象，聚合所有缓存操作功能。
 *
 * 使用方式：
 * 1. 调用 `cache.init()` 初始化缓存连接
 * 2. 通过 `cache.get/set/del` 进行基础键值操作
 * 3. 通过 `cache.hash` 进行哈希表操作
 * 4. 通过 `cache.list` 进行列表操作
 * 5. 通过 `cache.set_` 进行集合操作
 * 6. 通过 `cache.zset` 进行有序集合操作
 * 7. 调用 `cache.close()` 关闭连接
 *
 * @example
 * ```ts
 * import { cache } from '@hai/cache'
 *
 * // 1. 初始化缓存
 * await cache.init({
 *     type: 'redis',
 *     host: 'localhost',
 *     port: 6379
 * })
 *
 * // 2. 基础操作
 * await cache.set('user:1', { name: '张三', age: 25 }, { ex: 3600 })
 * const user = await cache.get<{ name: string; age: number }>('user:1')
 *
 * // 3. Hash 操作
 * await cache.hash.hset('session:abc', { userId: 1, loginTime: Date.now() })
 *
 * // 4. List 操作（消息队列）
 * await cache.list.lpush('tasks', { type: 'email', to: 'test@example.com' })
 * const task = await cache.list.rpop('tasks')
 *
 * // 5. Set 操作
 * await cache.set_.sadd('online:users', 'user1', 'user2')
 *
 * // 6. SortedSet 操作（排行榜）
 * await cache.zset.zadd('leaderboard', { score: 1000, member: 'player1' })
 *
 * // 7. 关闭连接
 * await cache.close()
 * ```
 *
 * @module cache-main
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type {
  CacheConfig,
  CacheConfigInput,
  CacheError,
  CacheProvider,
  CacheService,
  CacheValue,
  HashOperations,
  ListOperations,
  ScanOptions,
  SetOperations,
  SetOptions,
  ZSetOperations,
} from './cache-types.js'

import { err } from '@hai/core'

import { CacheConfigSchema, CacheErrorCode } from './cache-config.js'
import { getCacheMessage } from './index.js'

import { createMemoryProvider } from './provider/cache-provider-memory.js'
import { createRedisProvider } from './provider/cache-provider-redis.js'

// =============================================================================
// 内部状态
// =============================================================================

/** 当前活跃的缓存 Provider */
let currentProvider: CacheProvider | null = null

/** 当前缓存配置 */
let currentConfig: CacheConfig | null = null

// =============================================================================
// Provider 工厂
// =============================================================================

/**
 * 根据配置创建对应的缓存 Provider
 *
 * @param config - 缓存配置
 * @returns 对应类型的 Provider 实例
 * @throws 不支持的缓存类型时抛出错误
 */
function createProvider(config: CacheConfig): CacheProvider {
  switch (config.type) {
    case 'memory':
      return createMemoryProvider()
    case 'redis':
      return createRedisProvider()
    default:
      throw new Error(`不支持的缓存类型: ${config.type}`)
  }
}

// =============================================================================
// 未初始化时的错误处理
// =============================================================================

/**
 * 创建未初始化错误
 */
function notInitializedError(): CacheError {
  return {
    code: CacheErrorCode.NOT_INITIALIZED,
    message: getCacheMessage('cache_notInitializedMain'),
  }
}

/** 未初始化时的 Hash 操作占位 */
const notInitializedHash: HashOperations = {
  hget: async () => err(notInitializedError()),
  hset: async () => err(notInitializedError()),
  hdel: async () => err(notInitializedError()),
  hexists: async () => err(notInitializedError()),
  hgetall: async () => err(notInitializedError()),
  hkeys: async () => err(notInitializedError()),
  hvals: async () => err(notInitializedError()),
  hlen: async () => err(notInitializedError()),
  hmget: async () => err(notInitializedError()),
  hincrBy: async () => err(notInitializedError()),
}

/** 未初始化时的 List 操作占位 */
const notInitializedList: ListOperations = {
  lpush: async () => err(notInitializedError()),
  rpush: async () => err(notInitializedError()),
  lpop: async () => err(notInitializedError()),
  rpop: async () => err(notInitializedError()),
  llen: async () => err(notInitializedError()),
  lrange: async () => err(notInitializedError()),
  lindex: async () => err(notInitializedError()),
  lset: async () => err(notInitializedError()),
  ltrim: async () => err(notInitializedError()),
  blpop: async () => err(notInitializedError()),
  brpop: async () => err(notInitializedError()),
}

/** 未初始化时的 Set 操作占位 */
const notInitializedSet: SetOperations = {
  sadd: async () => err(notInitializedError()),
  srem: async () => err(notInitializedError()),
  smembers: async () => err(notInitializedError()),
  sismember: async () => err(notInitializedError()),
  scard: async () => err(notInitializedError()),
  srandmember: async () => err(notInitializedError()),
  spop: async () => err(notInitializedError()),
  sinter: async () => err(notInitializedError()),
  sunion: async () => err(notInitializedError()),
  sdiff: async () => err(notInitializedError()),
}

/** 未初始化时的 ZSet 操作占位 */
const notInitializedZSet: ZSetOperations = {
  zadd: async () => err(notInitializedError()),
  zrem: async () => err(notInitializedError()),
  zscore: async () => err(notInitializedError()),
  zrank: async () => err(notInitializedError()),
  zrevrank: async () => err(notInitializedError()),
  zrange: async () => err(notInitializedError()),
  zrevrange: async () => err(notInitializedError()),
  zrangeByScore: async () => err(notInitializedError()),
  zcard: async () => err(notInitializedError()),
  zcount: async () => err(notInitializedError()),
  zincrBy: async () => err(notInitializedError()),
  zremRangeByRank: async () => err(notInitializedError()),
  zremRangeByScore: async () => err(notInitializedError()),
}

// =============================================================================
// 统一缓存服务对象
// =============================================================================

/**
 * 缓存服务对象
 *
 * 统一的缓存访问入口，提供以下功能：
 * - `cache.init()` - 初始化缓存连接
 * - `cache.close()` - 关闭连接
 * - 基础操作：get, set, del, exists, expire 等
 * - `cache.hash` - Hash 操作
 * - `cache.list` - List 操作
 * - `cache.set_` - Set 操作
 * - `cache.zset` - SortedSet 操作
 * - `cache.config` - 当前配置
 * - `cache.isInitialized` - 初始化状态
 * - `cache.ping()` - 测试连接
 */
export const cache: CacheService = {
  // -------------------------------------------------------------------------
  // 初始化
  // -------------------------------------------------------------------------
  async init(config: CacheConfigInput): Promise<Result<void, CacheError>> {
    // 如果已经初始化，先关闭
    if (currentProvider) {
      await currentProvider.close()
    }

    try {
      // 运行时补齐默认值并校验配置（测试场景常用“最小配置”）
      const normalizedConfig = CacheConfigSchema.parse(config)

      // 创建 Provider
      const provider = createProvider(normalizedConfig)

      // 初始化连接
      const result = await provider.init(normalizedConfig)

      if (!result.success) {
        return result
      }

      // 保存状态
      currentProvider = provider
      currentConfig = normalizedConfig

      return result
    }
    catch (error) {
      return err({
        code: CacheErrorCode.CONNECTION_FAILED,
        message: `缓存初始化失败: ${error instanceof Error ? error.message : String(error)}`,
        cause: error,
      })
    }
  },

  // -------------------------------------------------------------------------
  // 基础操作代理
  // -------------------------------------------------------------------------
  get<T = CacheValue>(key: string): Promise<Result<T | null, CacheError>> {
    return currentProvider?.get<T>(key) ?? Promise.resolve(err(notInitializedError()))
  },

  set(key: string, value: CacheValue, options?: SetOptions): Promise<Result<void, CacheError>> {
    return currentProvider?.set(key, value, options) ?? Promise.resolve(err(notInitializedError()))
  },

  del(...keys: string[]): Promise<Result<number, CacheError>> {
    return currentProvider?.del(...keys) ?? Promise.resolve(err(notInitializedError()))
  },

  exists(...keys: string[]): Promise<Result<number, CacheError>> {
    return currentProvider?.exists(...keys) ?? Promise.resolve(err(notInitializedError()))
  },

  expire(key: string, seconds: number): Promise<Result<boolean, CacheError>> {
    return currentProvider?.expire(key, seconds) ?? Promise.resolve(err(notInitializedError()))
  },

  expireAt(key: string, timestamp: number): Promise<Result<boolean, CacheError>> {
    return currentProvider?.expireAt(key, timestamp) ?? Promise.resolve(err(notInitializedError()))
  },

  ttl(key: string): Promise<Result<number, CacheError>> {
    return currentProvider?.ttl(key) ?? Promise.resolve(err(notInitializedError()))
  },

  persist(key: string): Promise<Result<boolean, CacheError>> {
    return currentProvider?.persist(key) ?? Promise.resolve(err(notInitializedError()))
  },

  incr(key: string): Promise<Result<number, CacheError>> {
    return currentProvider?.incr(key) ?? Promise.resolve(err(notInitializedError()))
  },

  incrBy(key: string, increment: number): Promise<Result<number, CacheError>> {
    return currentProvider?.incrBy(key, increment) ?? Promise.resolve(err(notInitializedError()))
  },

  decr(key: string): Promise<Result<number, CacheError>> {
    return currentProvider?.decr(key) ?? Promise.resolve(err(notInitializedError()))
  },

  decrBy(key: string, decrement: number): Promise<Result<number, CacheError>> {
    return currentProvider?.decrBy(key, decrement) ?? Promise.resolve(err(notInitializedError()))
  },

  mget<T = CacheValue>(...keys: string[]): Promise<Result<(T | null)[], CacheError>> {
    return currentProvider?.mget<T>(...keys) ?? Promise.resolve(err(notInitializedError()))
  },

  mset(entries: Array<[string, CacheValue]>): Promise<Result<void, CacheError>> {
    return currentProvider?.mset(entries) ?? Promise.resolve(err(notInitializedError()))
  },

  scan(cursor: number, options?: ScanOptions): Promise<Result<[number, string[]], CacheError>> {
    return currentProvider?.scan(cursor, options) ?? Promise.resolve(err(notInitializedError()))
  },

  keys(pattern: string): Promise<Result<string[], CacheError>> {
    return currentProvider?.keys(pattern) ?? Promise.resolve(err(notInitializedError()))
  },

  type(key: string): Promise<Result<string, CacheError>> {
    return currentProvider?.type(key) ?? Promise.resolve(err(notInitializedError()))
  },

  // -------------------------------------------------------------------------
  // 子操作接口
  // -------------------------------------------------------------------------
  get hash(): HashOperations {
    return currentProvider?.hash ?? notInitializedHash
  },

  get list(): ListOperations {
    return currentProvider?.list ?? notInitializedList
  },

  get set_(): SetOperations {
    return currentProvider?.set_ ?? notInitializedSet
  },

  get zset(): ZSetOperations {
    return currentProvider?.zset ?? notInitializedZSet
  },

  // -------------------------------------------------------------------------
  // 状态和控制
  // -------------------------------------------------------------------------
  get config(): CacheConfig | null {
    return currentConfig
  },

  get isInitialized(): boolean {
    return currentProvider !== null
  },

  async close(): Promise<void> {
    if (currentProvider) {
      await currentProvider.close()
      currentProvider = null
      currentConfig = null
    }
  },

  ping(): Promise<Result<string, CacheError>> {
    return currentProvider?.ping() ?? Promise.resolve(err(notInitializedError()))
  },
}
