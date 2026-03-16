/**
 * @h-ai/cache — 公共类型
 *
 * 定义缓存模块的对外接口类型。
 * @module cache-types
 */

import type { Result } from '@h-ai/core'
import type { CacheConfig, CacheConfigInput, CacheErrorCodeType } from './cache-config.js'

export type { CacheConfig, CacheConfigInput } from './cache-config.js'

// ─── 错误类型 ───

/** 缓存错误接口 */
export interface CacheError {
  /** 错误码（参见 CacheErrorCode） */
  code: CacheErrorCodeType
  /** 错误消息 */
  message: string
  /** 原始错误 */
  cause?: unknown
}

// ─── 缓存值类型 ───

/**
 * 可缓存的值类型
 *
 * 说明：`object` 包含普通对象与数组；函数、Symbol、BigInt 等不建议直接缓存。
 */
export type CacheValue = string | number | boolean | object | null

/** 缓存设置选项 */
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
  /** 保留原有的 TTL（与 ex/px/exat/pxat 互斥，冲突时以后端实现行为为准） */
  keepTtl?: boolean
}

/** 扫描选项 */
export interface ScanOptions {
  /** 匹配模式 */
  match?: string
  /** 每次扫描数量 */
  count?: number
}

/** 有序集合成员（score + member 对） */
export interface ZMember {
  /** 分数，用于排序 */
  score: number
  /** 成员标识 */
  member: string
}

// ─── KV 操作接口 ───

/**
 * 基础键值操作接口
 *
 * @example
 * ```ts
 * await cache.kv.set('key', { name: '张三' }, { ex: 3600 })
 * const result = await cache.kv.get<{ name: string }>('key')
 * ```
 */
export interface KvOperations {
  /** 获取值；键不存在时返回 null */
  get: <T = CacheValue>(key: string) => Promise<Result<T | null, CacheError>>
  /** 设置值；可通过 options 控制过期时间、NX/XX 条件等 */
  set: (key: string, value: CacheValue, options?: SetOptions) => Promise<Result<void, CacheError>>
  /** 删除一个或多个键；返回实际删除的数量 */
  del: (...keys: string[]) => Promise<Result<number, CacheError>>
  /** 检查一个或多个键是否存在；返回存在的数量 */
  exists: (...keys: string[]) => Promise<Result<number, CacheError>>
  /** 设置过期时间（秒） */
  expire: (key: string, seconds: number) => Promise<Result<boolean, CacheError>>
  /** 设置过期时间点（Unix 时间戳，秒） */
  expireAt: (key: string, timestamp: number) => Promise<Result<boolean, CacheError>>
  /** 获取剩余过期时间（秒）；-1 永不过期，-2 不存在 */
  ttl: (key: string) => Promise<Result<number, CacheError>>
  /** 移除过期时间 */
  persist: (key: string) => Promise<Result<boolean, CacheError>>
  /** 自增 1；键不存在时从 0 开始；值非数字时返回 OPERATION_FAILED */
  incr: (key: string) => Promise<Result<number, CacheError>>
  /** 自增指定值；键不存在时从 0 开始 */
  incrBy: (key: string, increment: number) => Promise<Result<number, CacheError>>
  /** 自减 1；键不存在时从 0 开始 */
  decr: (key: string) => Promise<Result<number, CacheError>>
  /** 自减指定值；键不存在时从 0 开始 */
  decrBy: (key: string, decrement: number) => Promise<Result<number, CacheError>>
  /** 批量获取；不存在的键对应位置返回 null */
  mget: <T = CacheValue>(...keys: string[]) => Promise<Result<(T | null)[], CacheError>>
  /** 批量设置键值对 */
  mset: (entries: Array<[string, CacheValue]>) => Promise<Result<void, CacheError>>
  /** 游标扫描键；返回 [下一游标, 匹配的键列表]，游标为 0 时表示遍历完成 */
  scan: (cursor: number, options?: ScanOptions) => Promise<Result<[number, string[]], CacheError>>
  /** 获取匹配模式的所有键（慎用，生产环境请用 scan 迭代） */
  keys: (pattern: string) => Promise<Result<string[], CacheError>>
  /** 获取键的数据类型；不存在时返回 "none" */
  type: (key: string) => Promise<Result<string, CacheError>>
}

// ─── Hash 操作接口 ───

/**
 * Hash 操作接口
 *
 * @example
 * ```ts
 * await cache.hash.hset('user:1', { name: '张三', age: 25 })
 * const name = await cache.hash.hget<string>('user:1', 'name')
 * ```
 */
export interface HashOperations {
  /** 获取字段值；字段不存在时返回 null */
  hget: <T = CacheValue>(key: string, field: string) => Promise<Result<T | null, CacheError>>
  /** 设置字段值（单字段或批量）；返回新增的字段数（已存在的字段不计入） */
  hset: ((key: string, field: string, value: CacheValue) => Promise<Result<number, CacheError>>) & ((key: string, data: Record<string, CacheValue>) => Promise<Result<number, CacheError>>)
  /** 删除字段 */
  hdel: (key: string, ...fields: string[]) => Promise<Result<number, CacheError>>
  /** 检查字段是否存在 */
  hexists: (key: string, field: string) => Promise<Result<boolean, CacheError>>
  /** 获取所有字段和值；键不存在时返回空对象 */
  hgetall: <T = Record<string, CacheValue>>(key: string) => Promise<Result<T, CacheError>>
  /** 获取所有字段名；键不存在时返回空数组 */
  hkeys: (key: string) => Promise<Result<string[], CacheError>>
  /** 获取所有字段值；键不存在时返回空数组 */
  hvals: <T = CacheValue>(key: string) => Promise<Result<T[], CacheError>>
  /** 获取字段数量；键不存在时返回 0 */
  hlen: (key: string) => Promise<Result<number, CacheError>>
  /** 批量获取字段值；不存在的字段对应位置返回 null */
  hmget: <T = CacheValue>(key: string, ...fields: string[]) => Promise<Result<(T | null)[], CacheError>>
  /** 字段自增；字段不存在时从 0 开始 */
  hincrBy: (key: string, field: string, increment: number) => Promise<Result<number, CacheError>>
}

// ─── List 操作接口 ───

/**
 * List 操作接口
 *
 * @example
 * ```ts
 * await cache.list.lpush('queue', 'task1', 'task2')
 * const item = await cache.list.rpop<string>('queue')
 * ```
 */
export interface ListOperations {
  /** 从左侧推入 */
  lpush: (key: string, ...values: CacheValue[]) => Promise<Result<number, CacheError>>
  /** 从右侧推入 */
  rpush: (key: string, ...values: CacheValue[]) => Promise<Result<number, CacheError>>
  /** 从左侧弹出 */
  lpop: <T = CacheValue>(key: string) => Promise<Result<T | null, CacheError>>
  /** 从右侧弹出 */
  rpop: <T = CacheValue>(key: string) => Promise<Result<T | null, CacheError>>
  /** 获取列表长度 */
  llen: (key: string) => Promise<Result<number, CacheError>>
  /** 获取指定范围的元素；支持负索引（-1 为最后一个）；键不存在时返回空数组 */
  lrange: <T = CacheValue>(key: string, start: number, stop: number) => Promise<Result<T[], CacheError>>
  /** 获取指定索引的元素；支持负索引；不存在时返回 null */
  lindex: <T = CacheValue>(key: string, index: number) => Promise<Result<T | null, CacheError>>
  /** 设置指定索引的元素；键不存在或索引越界时返回错误 */
  lset: (key: string, index: number, value: CacheValue) => Promise<Result<void, CacheError>>
  /** 保留指定范围的元素，范围外的元素被删除 */
  ltrim: (key: string, start: number, stop: number) => Promise<Result<void, CacheError>>
  /** 阻塞式从左侧弹出；返回 [key, value] 或超时返回 null。memory 实现为非阻塞立即返回。 */
  blpop: <T = CacheValue>(timeout: number, ...keys: string[]) => Promise<Result<[string, T] | null, CacheError>>
  /** 阻塞式从右侧弹出；返回 [key, value] 或超时返回 null。memory 实现为非阻塞立即返回。 */
  brpop: <T = CacheValue>(timeout: number, ...keys: string[]) => Promise<Result<[string, T] | null, CacheError>>
}

// ─── Set 操作接口 ───

/**
 * Set 操作接口
 *
 * @example
 * ```ts
 * await cache.set_.sadd('tags', 'redis', 'cache')
 * const members = await cache.set_.smembers<string>('tags')
 * ```
 */
export interface SetOperations {
  /** 添加成员；返回新增的成员数（已存在的不计入） */
  sadd: (key: string, ...members: CacheValue[]) => Promise<Result<number, CacheError>>
  /** 移除成员；返回实际移除的数量 */
  srem: (key: string, ...members: CacheValue[]) => Promise<Result<number, CacheError>>
  /** 获取所有成员；键不存在时返回空数组 */
  smembers: <T = CacheValue>(key: string) => Promise<Result<T[], CacheError>>
  /** 检查是否为集合成员 */
  sismember: (key: string, member: CacheValue) => Promise<Result<boolean, CacheError>>
  /** 获取成员数量；键不存在时返回 0 */
  scard: (key: string) => Promise<Result<number, CacheError>>
  /** 随机获取成员；不指定 count 返回单个值，指定 count 返回数组；空集合返回 null */
  srandmember: <T = CacheValue>(key: string, count?: number) => Promise<Result<T | T[] | null, CacheError>>
  /** 随机弹出成员（会从集合中移除）；不指定 count 返回单个值，指定 count 返回数组；空集合返回 null */
  spop: <T = CacheValue>(key: string, count?: number) => Promise<Result<T | T[] | null, CacheError>>
  /** 集合交集；任一 key 不存在时返回空数组 */
  sinter: <T = CacheValue>(...keys: string[]) => Promise<Result<T[], CacheError>>
  /** 集合并集 */
  sunion: <T = CacheValue>(...keys: string[]) => Promise<Result<T[], CacheError>>
  /** 集合差集（第一个集合减去其余集合） */
  sdiff: <T = CacheValue>(...keys: string[]) => Promise<Result<T[], CacheError>>
}

// ─── SortedSet 操作接口 ───

/**
 * 有序集合操作接口
 *
 * @example
 * ```ts
 * await cache.zset.zadd('rank', { score: 100, member: 'player1' })
 * const top = await cache.zset.zrevrange('rank', 0, 9, true)
 * ```
 */
export interface ZSetOperations {
  /** 添加成员；已存在的成员只更新分数不计入新增数；返回新增的成员数 */
  zadd: (key: string, ...members: ZMember[]) => Promise<Result<number, CacheError>>
  /** 移除成员；返回实际移除的数量 */
  zrem: (key: string, ...members: string[]) => Promise<Result<number, CacheError>>
  /** 获取成员分数；成员不存在时返回 null */
  zscore: (key: string, member: string) => Promise<Result<number | null, CacheError>>
  /** 获取成员升序排名（0-based）；成员不存在时返回 null */
  zrank: (key: string, member: string) => Promise<Result<number | null, CacheError>>
  /** 获取成员降序排名（0-based）；成员不存在时返回 null */
  zrevrank: (key: string, member: string) => Promise<Result<number | null, CacheError>>
  /** 获取指定排名范围的成员（升序）；withScores=true 时返回 ZMember[]；键不存在时返回空数组 */
  zrange: (key: string, start: number, stop: number, withScores?: boolean) => Promise<Result<string[] | ZMember[], CacheError>>
  /** 获取指定排名范围的成员（降序）；withScores=true 时返回 ZMember[] */
  zrevrange: (key: string, start: number, stop: number, withScores?: boolean) => Promise<Result<string[] | ZMember[], CacheError>>
  /** 获取指定分数范围的成员；min/max 支持 '-inf'/'+inf'；可通过 offset/count 分页 */
  zrangeByScore: (
    key: string,
    min: number | string,
    max: number | string,
    options?: { withScores?: boolean, offset?: number, count?: number },
  ) => Promise<Result<string[] | ZMember[], CacheError>>
  /** 获取成员数量；键不存在时返回 0 */
  zcard: (key: string) => Promise<Result<number, CacheError>>
  /** 获取指定分数范围内的成员数量；min/max 支持 '-inf'/'+inf' */
  zcount: (key: string, min: number | string, max: number | string) => Promise<Result<number, CacheError>>
  /** 增加成员分数；成员不存在时以 0 为初始值；返回更新后的分数 */
  zincrBy: (key: string, increment: number, member: string) => Promise<Result<number, CacheError>>
  /** 移除指定排名范围的成员；返回实际移除的数量 */
  zremRangeByRank: (key: string, start: number, stop: number) => Promise<Result<number, CacheError>>
  /** 移除指定分数范围的成员；返回实际移除的数量 */
  zremRangeByScore: (key: string, min: number | string, max: number | string) => Promise<Result<number, CacheError>>
}

// ─── 分布式锁操作接口 ───

/**
 * 分布式锁操作接口
 *
 * 基于 SET NX EX 模式实现分布式互斥锁，适用于多节点部署场景。
 *
 * @example
 * ```ts
 * const acquired = await cache.lock.acquire('my-lock', { ttl: 30 })
 * if (acquired.success && acquired.data) {
 *   try {
 *     // 执行受保护操作
 *   } finally {
 *     await cache.lock.release('my-lock')
 *   }
 * }
 * ```
 */
export interface LockOperations {
  /**
   * 尝试获取分布式锁
   *
   * 通过 SET NX EX 原子操作实现。获锁成功返回 true，锁已被持有返回 false。
   *
   * @param key - 锁键名
   * @param options - 锁选项
   * @returns true 表示获锁成功，false 表示锁已被其他持有者持有
   */
  acquire: (key: string, options?: LockOptions) => Promise<Result<boolean, CacheError>>

  /**
   * 释放分布式锁
   *
   * 仅当锁由当前持有者持有时才释放（通过 owner 比对），防止误释放他人的锁。
   *
   * @param key - 锁键名
   * @param owner - 锁持有者标识（须与 acquire 时一致）；未传则强制释放
   * @returns true 表示释放成功，false 表示锁不存在或非当前持有者
   */
  release: (key: string, owner?: string) => Promise<Result<boolean, CacheError>>

  /**
   * 检查锁是否被持有
   *
   * @param key - 锁键名
   * @returns true 表示锁存在且未过期
   */
  isLocked: (key: string) => Promise<Result<boolean, CacheError>>

  /**
   * 续期锁的过期时间
   *
   * 仅当锁由当前持有者持有时才续期。
   *
   * @param key - 锁键名
   * @param ttl - 新的过期时间（秒）
   * @param owner - 锁持有者标识；未传则直接续期
   * @returns true 表示续期成功，false 表示锁不存在或非当前持有者
   */
  extend: (key: string, ttl: number, owner?: string) => Promise<Result<boolean, CacheError>>
}

/** 分布式锁选项 */
export interface LockOptions {
  /** 锁过期时间（秒）；默认 30 */
  ttl?: number
  /** 锁持有者标识；默认 'default'（多节点部署时建议设置固定值以便审计） */
  owner?: string
}

// ─── 复合操作接口 ───

/**
 * 复合缓存操作接口，聚合所有数据结构的操作子接口
 *
 * 通过 `cache.kv` / `cache.hash` / `cache.list` / `cache.set_` / `cache.zset` / `cache.lock` 分别访问
 */
export interface CacheCompositeOperations {
  /** KV 操作 */
  readonly kv: KvOperations
  /** Hash 操作 */
  readonly hash: HashOperations
  /** List 操作 */
  readonly list: ListOperations
  /** Set 操作 */
  readonly set_: SetOperations
  /** SortedSet 操作 */
  readonly zset: ZSetOperations
  /** 分布式锁操作 */
  readonly lock: LockOperations
  /** 测试连接 */
  ping: () => Promise<Result<string, CacheError>>
}

// ─── 函数接口 ───

/**
 * 缓存函数接口
 *
 * @example
 * ```ts
 * import { cache } from '@h-ai/cache'
 *
 * await cache.init({ type: 'redis', host: 'localhost' })
 * await cache.kv.set('key', 'value', { ex: 3600 })
 * const result = await cache.kv.get('key')
 * await cache.close()
 * ```
 */
export interface CacheFunctions extends CacheCompositeOperations {
  /** 初始化缓存连接；会先关闭已有连接再以新配置重新初始化 */
  init: (config: CacheConfigInput) => Promise<Result<void, CacheError>>
  /** 当前配置（parse 后）；未初始化时为 null */
  readonly config: CacheConfig | null
  /** 是否已初始化并连接 */
  readonly isInitialized: boolean
  /** 关闭连接并清理资源；未初始化时调用安全无副作用 */
  close: () => Promise<void>
}

// ─── Provider 接口 ───

/**
 * 缓存 Provider 接口
 *
 * 由具体实现（memory / redis）提供；上层通过 cache-main 统一管理生命周期
 */
export interface CacheProvider extends CacheCompositeOperations {
  /** Provider 名称（如 'memory' / 'redis'） */
  readonly name: string
  /** 连接缓存服务；config 已经过 Zod Schema 校验 */
  connect: (config: CacheConfig) => Promise<Result<void, CacheError>>
  /** 关闭连接并释放资源 */
  close: () => Promise<void>
  /** 是否处于已连接状态 */
  isConnected: () => boolean
}
