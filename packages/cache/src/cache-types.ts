/**
 * =============================================================================
 * @hai/cache - 类型定义
 * =============================================================================
 *
 * 本文件定义缓存模块的核心接口和类型（非配置相关）。
 * 配置相关类型请从 cache-config.ts 导入。
 *
 * 包含：
 * - 错误类型（CacheError）
 * - 缓存操作接口（CacheOperations）
 * - Hash 操作接口（HashOperations）
 * - List 操作接口（ListOperations）
 * - Set 操作接口（SetOperations）
 * - SortedSet 操作接口（ZSetOperations）
 * - 缓存服务接口（CacheService）
 * - Provider 接口（CacheProvider）
 *
 * @example
 * ```ts
 * import type { CacheService, CacheOperations } from '@hai/cache'
 *
 * // 使用缓存服务
 * const value = await cache.get<User>('user:1')
 * ```
 *
 * @module cache-types
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type { CacheConfig, CacheErrorCodeType } from './cache-config.js'

// =============================================================================
// 重新导出配置类型（方便使用）
// =============================================================================

export type { CacheConfig, CacheErrorCodeType, CacheType, RedisClusterNode, RedisSentinelConfig } from './cache-config.js'
export { CacheConfigSchema, CacheErrorCode, CacheTypeSchema } from './cache-config.js'

// =============================================================================
// 错误类型
// =============================================================================

/**
 * 缓存错误接口
 *
 * 所有缓存操作返回的错误都遵循此接口。
 *
 * @example
 * ```ts
 * const result = await cache.get('key')
 * if (!result.success) {
 *     const error: CacheError = result.error
 *     // 处理错误：根据 error.code / error.message 做兜底
 * }
 * ```
 */
export interface CacheError {
  /** 错误码（数值，参见 CacheErrorCode） */
  code: CacheErrorCodeType
  /** 错误消息 */
  message: string
  /** 原始错误（可选） */
  cause?: unknown
}

// =============================================================================
// 缓存值类型
// =============================================================================

/**
 * 可缓存的值类型
 *
 * 支持：string, number, boolean, object, array, null
 */
export type CacheValue = string | number | boolean | object | null

/**
 * 缓存设置选项
 */
export interface SetOptions {
  /** 过期时间（秒） */
  ex?: number
  /** 过期时间（毫秒） */
  px?: number
  /** 过期时间点（Unix 时间戳，秒） */
  exat?: number
  /** 过期时间点（Unix 时间戳，毫秒） */
  pxat?: number
  /** 仅在键不存在时设置 */
  nx?: boolean
  /** 仅在键存在时设置 */
  xx?: boolean
  /** 保留原有的 TTL */
  keepTtl?: boolean
}

/**
 * 扫描选项
 */
export interface ScanOptions {
  /** 匹配模式 */
  match?: string
  /** 每次扫描的数量 */
  count?: number
}

// =============================================================================
// 基础缓存操作接口
// =============================================================================

/**
 * 基础缓存操作接口
 *
 * 提供键值对的基本操作：get, set, del, exists, expire 等。
 *
 * @example
 * ```ts
 * // 设置值（带过期时间）
 * await cache.set('key', { name: '张三' }, { ex: 3600 })
 *
 * // 获取值
 * const result = await cache.get<{ name: string }>('key')
 * if (result.success && result.data) {
 *     // 使用 result.data
 * }
 *
 * // 删除键
 * await cache.del('key')
 * ```
 */
export interface CacheOperations {
  /**
   * 获取值
   * @param key - 键名
   * @returns 值或 null
   */
  get: <T = CacheValue>(key: string) => Promise<Result<T | null, CacheError>>

  /**
   * 设置值
   * @param key - 键名
   * @param value - 值
   * @param options - 选项（过期时间等）
   */
  set: (key: string, value: CacheValue, options?: SetOptions) => Promise<Result<void, CacheError>>

  /**
   * 删除键
   * @param keys - 一个或多个键名
   * @returns 删除的键数量
   */
  del: (...keys: string[]) => Promise<Result<number, CacheError>>

  /**
   * 检查键是否存在
   * @param keys - 一个或多个键名
   * @returns 存在的键数量
   */
  exists: (...keys: string[]) => Promise<Result<number, CacheError>>

  /**
   * 设置过期时间（秒）
   * @param key - 键名
   * @param seconds - 过期秒数
   */
  expire: (key: string, seconds: number) => Promise<Result<boolean, CacheError>>

  /**
   * 设置过期时间点
   * @param key - 键名
   * @param timestamp - Unix 时间戳（秒）
   */
  expireAt: (key: string, timestamp: number) => Promise<Result<boolean, CacheError>>

  /**
   * 获取剩余过期时间（秒）
   * @param key - 键名
   * @returns 剩余秒数，-1 表示永不过期，-2 表示键不存在
   */
  ttl: (key: string) => Promise<Result<number, CacheError>>

  /**
   * 移除过期时间
   * @param key - 键名
   */
  persist: (key: string) => Promise<Result<boolean, CacheError>>

  /**
   * 自增
   * @param key - 键名
   * @returns 自增后的值
   */
  incr: (key: string) => Promise<Result<number, CacheError>>

  /**
   * 自增指定值
   * @param key - 键名
   * @param increment - 增量
   * @returns 自增后的值
   */
  incrBy: (key: string, increment: number) => Promise<Result<number, CacheError>>

  /**
   * 自减
   * @param key - 键名
   * @returns 自减后的值
   */
  decr: (key: string) => Promise<Result<number, CacheError>>

  /**
   * 自减指定值
   * @param key - 键名
   * @param decrement - 减量
   * @returns 自减后的值
   */
  decrBy: (key: string, decrement: number) => Promise<Result<number, CacheError>>

  /**
   * 批量获取
   * @param keys - 键名数组
   * @returns 值数组（不存在的键返回 null）
   */
  mget: <T = CacheValue>(...keys: string[]) => Promise<Result<(T | null)[], CacheError>>

  /**
   * 批量设置
   * @param entries - 键值对数组
   */
  mset: (entries: Array<[string, CacheValue]>) => Promise<Result<void, CacheError>>

  /**
   * 扫描键
   * @param cursor - 游标
   * @param options - 扫描选项
   * @returns [下一个游标, 键数组]
   */
  scan: (cursor: number, options?: ScanOptions) => Promise<Result<[number, string[]], CacheError>>

  /**
   * 获取匹配的所有键（慎用，生产环境建议使用 scan）
   * @param pattern - 匹配模式
   */
  keys: (pattern: string) => Promise<Result<string[], CacheError>>

  /**
   * 获取值类型
   * @param key - 键名
   * @returns 类型名称
   */
  type: (key: string) => Promise<Result<string, CacheError>>
}

// =============================================================================
// Hash 操作接口
// =============================================================================

/**
 * Hash 操作接口
 *
 * 提供哈希表操作：hget, hset, hdel, hgetall 等。
 *
 * @example
 * ```ts
 * // 设置字段
 * await cache.hash.hset('user:1', 'name', '张三')
 * await cache.hash.hset('user:1', { name: '张三', age: 25 })
 *
 * // 获取字段
 * const name = await cache.hash.hget('user:1', 'name')
 *
 * // 获取所有字段
 * const user = await cache.hash.hgetall('user:1')
 * ```
 */
export interface HashOperations {
  /**
   * 获取哈希字段值
   */
  hget: <T = CacheValue>(key: string, field: string) => Promise<Result<T | null, CacheError>>

  /**
   * 设置哈希字段值
   */
  hset: ((key: string, field: string, value: CacheValue) => Promise<Result<number, CacheError>>) & ((key: string, data: Record<string, CacheValue>) => Promise<Result<number, CacheError>>)

  /**
   * 删除哈希字段
   */
  hdel: (key: string, ...fields: string[]) => Promise<Result<number, CacheError>>

  /**
   * 检查哈希字段是否存在
   */
  hexists: (key: string, field: string) => Promise<Result<boolean, CacheError>>

  /**
   * 获取所有哈希字段和值
   */
  hgetall: <T = Record<string, CacheValue>>(key: string) => Promise<Result<T, CacheError>>

  /**
   * 获取所有哈希字段名
   */
  hkeys: (key: string) => Promise<Result<string[], CacheError>>

  /**
   * 获取所有哈希字段值
   */
  hvals: <T = CacheValue>(key: string) => Promise<Result<T[], CacheError>>

  /**
   * 获取哈希字段数量
   */
  hlen: (key: string) => Promise<Result<number, CacheError>>

  /**
   * 批量获取哈希字段值
   */
  hmget: <T = CacheValue>(key: string, ...fields: string[]) => Promise<Result<(T | null)[], CacheError>>

  /**
   * 哈希字段自增
   */
  hincrBy: (key: string, field: string, increment: number) => Promise<Result<number, CacheError>>
}

// =============================================================================
// List 操作接口
// =============================================================================

/**
 * List 操作接口
 *
 * 提供列表操作：lpush, rpush, lpop, rpop, lrange 等。
 *
 * @example
 * ```ts
 * // 从左侧推入
 * await cache.list.lpush('queue', 'item1', 'item2')
 *
 * // 从右侧弹出
 * const item = await cache.list.rpop('queue')
 *
 * // 获取范围
 * const items = await cache.list.lrange('queue', 0, -1)
 * ```
 */
export interface ListOperations {
  /**
   * 从左侧推入元素
   */
  lpush: (key: string, ...values: CacheValue[]) => Promise<Result<number, CacheError>>

  /**
   * 从右侧推入元素
   */
  rpush: (key: string, ...values: CacheValue[]) => Promise<Result<number, CacheError>>

  /**
   * 从左侧弹出元素
   */
  lpop: <T = CacheValue>(key: string) => Promise<Result<T | null, CacheError>>

  /**
   * 从右侧弹出元素
   */
  rpop: <T = CacheValue>(key: string) => Promise<Result<T | null, CacheError>>

  /**
   * 获取列表长度
   */
  llen: (key: string) => Promise<Result<number, CacheError>>

  /**
   * 获取指定范围的元素
   */
  lrange: <T = CacheValue>(key: string, start: number, stop: number) => Promise<Result<T[], CacheError>>

  /**
   * 获取指定索引的元素
   */
  lindex: <T = CacheValue>(key: string, index: number) => Promise<Result<T | null, CacheError>>

  /**
   * 设置指定索引的元素
   */
  lset: (key: string, index: number, value: CacheValue) => Promise<Result<void, CacheError>>

  /**
   * 保留指定范围的元素
   */
  ltrim: (key: string, start: number, stop: number) => Promise<Result<void, CacheError>>

  /**
   * 阻塞式从左侧弹出
   */
  blpop: <T = CacheValue>(timeout: number, ...keys: string[]) => Promise<Result<[string, T] | null, CacheError>>

  /**
   * 阻塞式从右侧弹出
   */
  brpop: <T = CacheValue>(timeout: number, ...keys: string[]) => Promise<Result<[string, T] | null, CacheError>>
}

// =============================================================================
// Set 操作接口
// =============================================================================

/**
 * Set 操作接口
 *
 * 提供集合操作：sadd, srem, smembers, sismember 等。
 *
 * @example
 * ```ts
 * // 添加成员
 * await cache.set_.sadd('tags', 'redis', 'cache', 'database')
 *
 * // 检查成员
 * const isMember = await cache.set_.sismember('tags', 'redis')
 *
 * // 获取所有成员
 * const members = await cache.set_.smembers('tags')
 * ```
 */
export interface SetOperations {
  /**
   * 添加成员
   */
  sadd: (key: string, ...members: CacheValue[]) => Promise<Result<number, CacheError>>

  /**
   * 移除成员
   */
  srem: (key: string, ...members: CacheValue[]) => Promise<Result<number, CacheError>>

  /**
   * 获取所有成员
   */
  smembers: <T = CacheValue>(key: string) => Promise<Result<T[], CacheError>>

  /**
   * 检查是否为成员
   */
  sismember: (key: string, member: CacheValue) => Promise<Result<boolean, CacheError>>

  /**
   * 获取成员数量
   */
  scard: (key: string) => Promise<Result<number, CacheError>>

  /**
   * 随机获取成员
   */
  srandmember: <T = CacheValue>(key: string, count?: number) => Promise<Result<T | T[] | null, CacheError>>

  /**
   * 随机弹出成员
   */
  spop: <T = CacheValue>(key: string, count?: number) => Promise<Result<T | T[] | null, CacheError>>

  /**
   * 集合交集
   */
  sinter: <T = CacheValue>(...keys: string[]) => Promise<Result<T[], CacheError>>

  /**
   * 集合并集
   */
  sunion: <T = CacheValue>(...keys: string[]) => Promise<Result<T[], CacheError>>

  /**
   * 集合差集
   */
  sdiff: <T = CacheValue>(...keys: string[]) => Promise<Result<T[], CacheError>>
}

// =============================================================================
// SortedSet 操作接口
// =============================================================================

/**
 * 有序集合成员
 */
export interface ZMember {
  /** 分数 */
  score: number
  /** 成员值 */
  member: string
}

/**
 * SortedSet 操作接口
 *
 * 提供有序集合操作：zadd, zrem, zrange, zscore 等。
 *
 * @example
 * ```ts
 * // 添加成员
 * await cache.zset.zadd('leaderboard', { score: 100, member: 'player1' })
 *
 * // 获取排名
 * const rank = await cache.zset.zrank('leaderboard', 'player1')
 *
 * // 获取排行榜
 * const top10 = await cache.zset.zrange('leaderboard', 0, 9, true)
 * ```
 */
export interface ZSetOperations {
  /**
   * 添加成员
   */
  zadd: (key: string, ...members: ZMember[]) => Promise<Result<number, CacheError>>

  /**
   * 移除成员
   */
  zrem: (key: string, ...members: string[]) => Promise<Result<number, CacheError>>

  /**
   * 获取成员分数
   */
  zscore: (key: string, member: string) => Promise<Result<number | null, CacheError>>

  /**
   * 获取成员排名（从小到大）
   */
  zrank: (key: string, member: string) => Promise<Result<number | null, CacheError>>

  /**
   * 获取成员排名（从大到小）
   */
  zrevrank: (key: string, member: string) => Promise<Result<number | null, CacheError>>

  /**
   * 获取指定范围的成员（从小到大）
   */
  zrange: (key: string, start: number, stop: number, withScores?: boolean) => Promise<Result<string[] | ZMember[], CacheError>>

  /**
   * 获取指定范围的成员（从大到小）
   */
  zrevrange: (key: string, start: number, stop: number, withScores?: boolean) => Promise<Result<string[] | ZMember[], CacheError>>

  /**
   * 获取指定分数范围的成员
   */
  zrangeByScore: (
    key: string,
    min: number | string,
    max: number | string,
    options?: { withScores?: boolean, offset?: number, count?: number },
  ) => Promise<Result<string[] | ZMember[], CacheError>>

  /**
   * 获取成员数量
   */
  zcard: (key: string) => Promise<Result<number, CacheError>>

  /**
   * 获取指定分数范围的成员数量
   */
  zcount: (key: string, min: number | string, max: number | string) => Promise<Result<number, CacheError>>

  /**
   * 增加成员分数
   */
  zincrBy: (key: string, increment: number, member: string) => Promise<Result<number, CacheError>>

  /**
   * 移除指定排名范围的成员
   */
  zremRangeByRank: (key: string, start: number, stop: number) => Promise<Result<number, CacheError>>

  /**
   * 移除指定分数范围的成员
   */
  zremRangeByScore: (key: string, min: number | string, max: number | string) => Promise<Result<number, CacheError>>
}

// =============================================================================
// 缓存服务接口
// =============================================================================

/**
 * 缓存服务接口
 *
 * 统一的缓存访问入口。
 *
 * @example
 * ```ts
 * import { cache } from '@hai/cache'
 *
 * // 初始化
 * await cache.init({ type: 'redis', host: 'localhost' })
 *
 * // 基础操作
 * await cache.set('key', 'value', { ex: 3600 })
 * const value = await cache.get('key')
 *
 * // Hash 操作
 * await cache.hash.hset('user:1', { name: '张三', age: 25 })
 *
 * // List 操作
 * await cache.list.lpush('queue', 'task1', 'task2')
 *
 * // Set 操作
 * await cache.set_.sadd('tags', 'tag1', 'tag2')
 *
 * // SortedSet 操作
 * await cache.zset.zadd('rank', { score: 100, member: 'user1' })
 * ```
 */
export interface CacheService extends CacheOperations {
  /** 初始化缓存连接 */
  init: (config: CacheConfig) => Promise<Result<void, CacheError>>
  /** Hash 操作 */
  hash: HashOperations
  /** List 操作 */
  list: ListOperations
  /** Set 操作（使用 set_ 避免与 CacheOperations.set 冲突） */
  set_: SetOperations
  /** SortedSet 操作 */
  zset: ZSetOperations
  /** 当前配置 */
  config: CacheConfig | null
  /** 是否已初始化 */
  isInitialized: boolean
  /** 关闭连接 */
  close: () => Promise<void>
  /** 执行 ping 测试连接 */
  ping: () => Promise<Result<string, CacheError>>
}

// =============================================================================
// Provider 接口
// =============================================================================

/**
 * 缓存 Provider 接口
 *
 * 定义缓存提供者必须实现的方法。
 */
export interface CacheProvider extends CacheOperations {
  /** Hash 操作 */
  hash: HashOperations
  /** List 操作 */
  list: ListOperations
  /** Set 操作 */
  set_: SetOperations
  /** SortedSet 操作 */
  zset: ZSetOperations
  /** 初始化连接 */
  init: (config: CacheConfig) => Promise<Result<void, CacheError>>
  /** 关闭连接 */
  close: () => Promise<void>
  /** 执行 ping 测试连接 */
  ping: () => Promise<Result<string, CacheError>>
}
