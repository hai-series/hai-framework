/**
 * @h-ai/cache — 公共类型
 *
 * 定义缓存模块的对外接口类型。
 * @module cache-types
 */

import type { ErrorInfo, HaiResult } from '@h-ai/core'
import type { CacheConfig, CacheConfigInput } from './cache-config.js'
import { core } from '@h-ai/core'

export type { CacheConfig, CacheConfigInput } from './cache-config.js'

// ─── 错误定义（照 @h-ai/core 范式） ───

const CacheErrorInfo = {
  CONNECTION_FAILED: '001:500',
  OPERATION_FAILED: '002:500',
  SERIALIZATION_FAILED: '003:500',
  DESERIALIZATION_FAILED: '004:500',
  KEY_NOT_FOUND: '005:404',
  TIMEOUT: '006:504',
  NOT_INITIALIZED: '010:500',
  UNSUPPORTED_TYPE: '011:400',
  CONFIG_ERROR: '012:500',
  INVALID_SCAN: '013:400',
  SCAN_TOPOLOGY_CHANGED: '014:409',
  CROSS_SLOT: '015:400',
  INVALID_SET_OPTIONS: '016:400',
} as const satisfies ErrorInfo

/**
 * 缓存连接、序列化、输入与分布式操作的稳定错误定义。
 * @example
 * ```ts
 * import { HaiCacheError } from '@h-ai/cache'
 * import { err } from '@h-ai/core'
 * const failure = err(HaiCacheError.INVALID_SET_OPTIONS, 'Conflicting expiry options')
 * if (!failure.success) failure.error.code
 * ```
 */
export const HaiCacheError = core.error.buildHaiErrorsDef('cache', CacheErrorInfo)

// ─── 缓存值类型 ───

/**
 * 可缓存的值类型
 *
 * 说明：`object` 包含普通对象与数组；函数、Symbol、BigInt 等不建议直接缓存。
 * @example
 * ```ts
 * import type { CacheValue } from '@h-ai/cache'
 * const options: CacheValue = { id: 'order-1', paid: false }
 * ```
 */
export type CacheValue = string | number | boolean | object | null

/**
 * SET 选项；四种期限彼此互斥且与 keepTtl 互斥，nx/xx 互斥。
 * @example
 * ```ts
 * import type { SetOptions } from '@h-ai/cache'
 * const options: SetOptions = { px: 60_000, nx: true }
 * ```
 */
export interface SetOptions {
  /** 过期时间（正安全整数秒），零/负数无效。 */
  ex?: number
  /** 过期时间（正安全整数毫秒），零/负数无效。 */
  px?: number
  /** Unix 正安全整数秒；过去时间会立即过期，乘1000后须仍为安全整数。 */
  exat?: number
  /** Unix 正安全整数毫秒；过去时间会立即过期。 */
  pxat?: number
  /** 仅在键不存在时设置 */
  nx?: boolean
  /** 仅在键存在时设置 */
  xx?: boolean
  /** 保留原 TTL；新键无 TTL，与所有显式期限互斥。 */
  keepTtl?: boolean
}

/**
 * 扫描选项
 * @example
 * ```ts
 * import type { ScanOptions } from '@h-ai/cache'
 * const options: ScanOptions = { match: 'orders:*', count: 100 }
 * ```
 */
export interface ScanOptions {
  /** 匹配模式 */
  match?: string
  /** 每次扫描数量 */
  count?: number
}

/**
 * 条件替换的过期策略；px 与 keepTtl 互斥，省略时新值永久保存。
 * @example
 * ```ts
 * import type { CompareAndSwapOptions } from '@h-ai/cache'
 * const options: CompareAndSwapOptions = { px: 60_000 }
 * ```
 */
export interface CompareAndSwapOptions {
  /** 新值存续的正整数毫秒数。 */
  px?: number
  /** 成功替换时保留已有 TTL；原键不存在时新值无 TTL。 */
  keepTtl?: boolean
}

/**
 * 有序集合成员（score + member 对）
 * @example
 * ```ts
 * import type { ZMember } from '@h-ai/cache'
 * const options: ZMember = { score: 100, member: 'player-1' }
 * ```
 */
export interface ZMember {
  /** 分数，用于排序 */
  score: number
  /** 成员标识 */
  member: string
}

// ─── KV 操作接口 ───

/**
 * 基础键值操作接口
 * @example
 * ```ts
 * import type { KvOperations } from '@h-ai/cache'
 * // 传入已初始化 cache 的对应操作；连接生命周期由创建者管理。
 * async function example(operations: KvOperations) {
 *   const claimed = await operations.set('orders:claim', 'worker-1', { nx: true, px: 60_000 })
 *   if (!claimed.success) return claimed
 *   if (!claimed.data) return 'already claimed'
 *   const read = await operations.get<string>('orders:claim')
 *   return read.success ? read.data : read.error.message
 * }
 * ```
 */
export interface KvOperations {
  /** 获取值；键不存在时返回 null */
  get: <T = CacheValue>(key: string) => Promise<HaiResult<T | null>>
  /**
   * 设置 JSON 快照，返回实际是否写入；NX/XX 未命中为 success:true/data:false，原值与TTL不变。
   * 参数非法返回 INVALID_SET_OPTIONS；省略期限永久保存，keepTtl 显式保留原期限。
   * @example
   * ```ts
   * import type { KvOperations } from '@h-ai/cache'
   * async function reserve(kv: KvOperations) {
   *   const applied = await kv.set('orders:claim', 'worker-1', { nx: true, px: 1000 })
   *   return applied.success ? applied.data : applied.error.message
   * }
   * ```
   */
  set: (key: string, value: CacheValue, options?: SetOptions) => Promise<HaiResult<boolean>>
  /**
   * 对单个 key 原子比较 JSON 序列化值并替换；比较失败返回 false，不修改值/TTL。
   * expected=undefined 表示键不存在；value=undefined 表示删除，null 是实际 JSON 值。
   * 适合跨节点状态版本更新，Cluster 只涉及一个 slot；调用方必须检查 success 和 data。
   * @example
   * ```ts
   * import type { KvOperations } from '@h-ai/cache'
   * async function advance(kv: KvOperations) {
   *   const read = await kv.get<number>('orders:version')
   *   if (!read.success) return read
   *   const expected = read.data ?? undefined
   *   const changed = await kv.compareAndSwap('orders:version', expected, (expected ?? 0) + 1, { px: 60_000 })
   *   // data=false 时需要重新读取后再决定是否重试，不能按成功提交处理。
   *   return changed.success ? changed.data : changed.error.message
   * }
   * ```
   */
  compareAndSwap: (key: string, expected: CacheValue | undefined, value: CacheValue | undefined, options?: CompareAndSwapOptions) => Promise<HaiResult<boolean>>
  /** 删除一个或多个键；返回实际删除的数量。Cluster 跨 slot 按独立键有界执行，失败可能已有部分删除，重试幂等。 */
  del: (...keys: string[]) => Promise<HaiResult<number>>
  /** 检查一个或多个键是否存在；返回存在的数量。Cluster 跨 slot 独立读取，不保证同一时刻快照。 */
  exists: (...keys: string[]) => Promise<HaiResult<number>>
  /** 设置过期时间（秒） */
  expire: (key: string, seconds: number) => Promise<HaiResult<boolean>>
  /** 设置过期时间点（Unix 时间戳，秒） */
  expireAt: (key: string, timestamp: number) => Promise<HaiResult<boolean>>
  /** 获取剩余过期时间（秒）；-1 永不过期，-2 不存在 */
  ttl: (key: string) => Promise<HaiResult<number>>
  /** 移除过期时间 */
  persist: (key: string) => Promise<HaiResult<boolean>>
  /** 自增 1；键不存在时从 0 开始；值非数字时返回 OPERATION_FAILED */
  incr: (key: string) => Promise<HaiResult<number>>
  /** 自增指定值；键不存在时从 0 开始 */
  incrBy: (key: string, increment: number) => Promise<HaiResult<number>>
  /** 自减 1；键不存在时从 0 开始 */
  decr: (key: string) => Promise<HaiResult<number>>
  /** 自减指定值；键不存在时从 0 开始 */
  decrBy: (key: string, decrement: number) => Promise<HaiResult<number>>
  /** 批量获取；不存在的键对应位置返回 null。Cluster 跨 slot 保留输入顺序，不保证同一时刻快照。 */
  mget: <T = CacheValue>(...keys: string[]) => Promise<HaiResult<(T | null)[]>>
  /** 原子批量设置；Cluster 中所有 key 必须同 slot，可使用共同的 {hash-tag}。 */
  mset: (entries: Array<[string, CacheValue]>) => Promise<HaiResult<void>>
  /**
   * 游标扫描逻辑 key，首次传 '0'，后续原样传回不透明字符串；'0' 表示完成。
   * Cluster 遍历全部主节点，拓扑/match/keyPrefix 变化返回 SCAN_TOPOLOGY_CHANGED，须重启遍历。
   * 与 Redis SCAN 一致，不提供快照，可能返回重复项；调用方按需去重。
   * @example
   * ```ts
   * import type { KvOperations } from '@h-ai/cache'
   * async function readPage(kv: KvOperations, cursor = '0') {
   *   const page = await kv.scan(cursor, { match: 'orders:*', count: 100 })
   *   if (!page.success) return page
   *   return { next: page.data[0], keys: page.data[1] }
   * }
   * ```
   */
  scan: (cursor: string, options?: ScanOptions) => Promise<HaiResult<[string, string[]]>>
  /** 获取匹配模式的所有键（慎用，生产环境请用 scan 迭代） */
  keys: (pattern: string) => Promise<HaiResult<string[]>>
  /** 获取键的数据类型；不存在时返回 "none" */
  type: (key: string) => Promise<HaiResult<string>>
}

// ─── Hash 操作接口 ───

/**
 * Hash 操作接口
 * @example
 * ```ts
 * import type { HashOperations } from '@h-ai/cache'
 * // 传入已初始化 cache 的对应操作；连接生命周期由创建者管理。
 * async function example(operations: HashOperations) {
 *   const written = await operations.hset('orders:1', { status: 'pending', version: 1 })
 *   if (!written.success) return written
 *   const status = await operations.hget<string>('orders:1', 'status')
 *   return status.success ? status.data : status.error.message
 * }
 * ```
 */
export interface HashOperations {
  /** 获取字段值；字段不存在时返回 null */
  hget: <T = CacheValue>(key: string, field: string) => Promise<HaiResult<T | null>>
  /** 设置字段值（单字段或批量）；返回新增的字段数（已存在的字段不计入） */
  hset: ((key: string, field: string, value: CacheValue) => Promise<HaiResult<number>>) & ((key: string, data: Record<string, CacheValue>) => Promise<HaiResult<number>>)
  /** 删除字段 */
  hdel: (key: string, ...fields: string[]) => Promise<HaiResult<number>>
  /** 检查字段是否存在 */
  hexists: (key: string, field: string) => Promise<HaiResult<boolean>>
  /** 获取所有字段和值；键不存在时返回空对象 */
  hgetall: <T = Record<string, CacheValue>>(key: string) => Promise<HaiResult<T>>
  /** 获取所有字段名；键不存在时返回空数组 */
  hkeys: (key: string) => Promise<HaiResult<string[]>>
  /** 获取所有字段值；键不存在时返回空数组 */
  hvals: <T = CacheValue>(key: string) => Promise<HaiResult<T[]>>
  /** 获取字段数量；键不存在时返回 0 */
  hlen: (key: string) => Promise<HaiResult<number>>
  /** 批量获取字段值；不存在的字段对应位置返回 null */
  hmget: <T = CacheValue>(key: string, ...fields: string[]) => Promise<HaiResult<(T | null)[]>>
  /** 字段自增；字段不存在时从 0 开始 */
  hincrBy: (key: string, field: string, increment: number) => Promise<HaiResult<number>>
}

// ─── List 操作接口 ───

/**
 * List 操作接口
 * @example
 * ```ts
 * import type { ListOperations } from '@h-ai/cache'
 * // 传入已初始化 cache 的对应操作；连接生命周期由创建者管理。
 * async function example(operations: ListOperations) {
 *   const queued = await operations.rpush('orders:queue', 'order-1')
 *   if (!queued.success) return queued
 *   const next = await operations.lpop<string>('orders:queue')
 *   return next.success ? next.data : next.error.message
 * }
 * ```
 */
export interface ListOperations {
  /** 从左侧推入 */
  lpush: (key: string, ...values: CacheValue[]) => Promise<HaiResult<number>>
  /** 从右侧推入 */
  rpush: (key: string, ...values: CacheValue[]) => Promise<HaiResult<number>>
  /** 从左侧弹出 */
  lpop: <T = CacheValue>(key: string) => Promise<HaiResult<T | null>>
  /** 从右侧弹出 */
  rpop: <T = CacheValue>(key: string) => Promise<HaiResult<T | null>>
  /** 获取列表长度 */
  llen: (key: string) => Promise<HaiResult<number>>
  /** 获取指定范围的元素；支持负索引（-1 为最后一个）；键不存在时返回空数组 */
  lrange: <T = CacheValue>(key: string, start: number, stop: number) => Promise<HaiResult<T[]>>
  /** 获取指定索引的元素；支持负索引；不存在时返回 null */
  lindex: <T = CacheValue>(key: string, index: number) => Promise<HaiResult<T | null>>
  /** 设置指定索引的元素；键不存在或索引越界时返回错误 */
  lset: (key: string, index: number, value: CacheValue) => Promise<HaiResult<void>>
  /** 保留指定范围的元素，范围外的元素被删除 */
  ltrim: (key: string, start: number, stop: number) => Promise<HaiResult<void>>
  /** 阻塞式从左侧弹出；返回 [key, value] 或超时返回 null。Cluster 多键须同 slot；memory 非阻塞立即返回。 */
  blpop: <T = CacheValue>(timeout: number, ...keys: string[]) => Promise<HaiResult<[string, T] | null>>
  /** 阻塞式从右侧弹出；返回 [key, value] 或超时返回 null。Cluster 多键须同 slot；memory 非阻塞立即返回。 */
  brpop: <T = CacheValue>(timeout: number, ...keys: string[]) => Promise<HaiResult<[string, T] | null>>
}

// ─── Set 操作接口 ───

/**
 * Set 操作接口
 * @example
 * ```ts
 * import type { SetOperations } from '@h-ai/cache'
 * // 传入已初始化 cache 的对应操作；连接生命周期由创建者管理。
 * async function example(operations: SetOperations) {
 *   const added = await operations.sadd('orders:tags', 'paid', 'priority')
 *   if (!added.success) return added
 *   const members = await operations.smembers<string>('orders:tags')
 *   return members.success ? members.data : members.error.message
 * }
 * ```
 */
export interface SetOperations {
  /** 添加成员；返回新增的成员数（已存在的不计入） */
  sadd: (key: string, ...members: CacheValue[]) => Promise<HaiResult<number>>
  /** 移除成员；返回实际移除的数量 */
  srem: (key: string, ...members: CacheValue[]) => Promise<HaiResult<number>>
  /** 获取所有成员；键不存在时返回空数组 */
  smembers: <T = CacheValue>(key: string) => Promise<HaiResult<T[]>>
  /** 检查是否为集合成员 */
  sismember: (key: string, member: CacheValue) => Promise<HaiResult<boolean>>
  /** 获取成员数量；键不存在时返回 0 */
  scard: (key: string) => Promise<HaiResult<number>>
  /** 随机获取成员；不指定 count 返回单个值，指定 count 返回数组；空集合返回 null */
  srandmember: <T = CacheValue>(key: string, count?: number) => Promise<HaiResult<T | T[] | null>>
  /** 随机弹出成员（会从集合中移除）；不指定 count 返回单个值，指定 count 返回数组；空集合返回 null */
  spop: <T = CacheValue>(key: string, count?: number) => Promise<HaiResult<T | T[] | null>>
  /** 集合交集；任一 key 不存在时返回空数组。Cluster 多键须同 slot，否则返回 CROSS_SLOT。 */
  sinter: <T = CacheValue>(...keys: string[]) => Promise<HaiResult<T[]>>
  /** 集合并集；Cluster 多键须同 slot，否则返回 CROSS_SLOT。 */
  sunion: <T = CacheValue>(...keys: string[]) => Promise<HaiResult<T[]>>
  /** 集合差集（第一个集合减去其余集合）；Cluster 多键须同 slot，否则返回 CROSS_SLOT。 */
  sdiff: <T = CacheValue>(...keys: string[]) => Promise<HaiResult<T[]>>
}

// ─── SortedSet 操作接口 ───

/**
 * 有序集合操作接口
 * @example
 * ```ts
 * import type { ZSetOperations } from '@h-ai/cache'
 * // 传入已初始化 cache 的对应操作；连接生命周期由创建者管理。
 * async function example(operations: ZSetOperations) {
 *   const added = await operations.zadd('orders:rank', { member: 'order-1', score: 100 })
 *   if (!added.success) return added
 *   const top = await operations.zrevrange('orders:rank', 0, 9, true)
 *   return top.success ? top.data : top.error.message
 * }
 * ```
 */
export interface ZSetOperations {
  /** 添加成员；已存在的成员只更新分数不计入新增数；返回新增的成员数 */
  zadd: (key: string, ...members: ZMember[]) => Promise<HaiResult<number>>
  /** 移除成员；返回实际移除的数量 */
  zrem: (key: string, ...members: string[]) => Promise<HaiResult<number>>
  /** 获取成员分数；成员不存在时返回 null */
  zscore: (key: string, member: string) => Promise<HaiResult<number | null>>
  /** 获取成员升序排名（0-based）；成员不存在时返回 null */
  zrank: (key: string, member: string) => Promise<HaiResult<number | null>>
  /** 获取成员降序排名（0-based）；成员不存在时返回 null */
  zrevrank: (key: string, member: string) => Promise<HaiResult<number | null>>
  /** 获取指定排名范围的成员（升序）；withScores=true 时返回 ZMember[]；键不存在时返回空数组 */
  zrange: (key: string, start: number, stop: number, withScores?: boolean) => Promise<HaiResult<string[] | ZMember[]>>
  /** 获取指定排名范围的成员（降序）；withScores=true 时返回 ZMember[] */
  zrevrange: (key: string, start: number, stop: number, withScores?: boolean) => Promise<HaiResult<string[] | ZMember[]>>
  /** 获取指定分数范围的成员；min/max 支持 '-inf'/'+inf'；可通过 offset/count 分页 */
  zrangeByScore: (
    key: string,
    min: number | string,
    max: number | string,
    options?: { withScores?: boolean, offset?: number, count?: number },
  ) => Promise<HaiResult<string[] | ZMember[]>>
  /** 获取成员数量；键不存在时返回 0 */
  zcard: (key: string) => Promise<HaiResult<number>>
  /** 获取指定分数范围内的成员数量；min/max 支持 '-inf'/'+inf' */
  zcount: (key: string, min: number | string, max: number | string) => Promise<HaiResult<number>>
  /** 增加成员分数；成员不存在时以 0 为初始值；返回更新后的分数 */
  zincrBy: (key: string, increment: number, member: string) => Promise<HaiResult<number>>
  /** 移除指定排名范围的成员；返回实际移除的数量 */
  zremRangeByRank: (key: string, start: number, stop: number) => Promise<HaiResult<number>>
  /** 移除指定分数范围的成员；返回实际移除的数量 */
  zremRangeByScore: (key: string, min: number | string, max: number | string) => Promise<HaiResult<number>>
}

// ─── 分布式锁操作接口 ───

/**
 * 分布式锁操作接口
 *
 * 基于 SET NX EX 模式实现分布式互斥锁，适用于多节点部署场景。
 * @example
 * ```ts
 * import type { LockOperations } from '@h-ai/cache'
 * // 传入已初始化 cache 的对应操作；连接生命周期由创建者管理。
 * async function example(operations: LockOperations) {
 *   const acquired = await operations.acquire('orders:lock', { ttl: 30 })
 *   if (!acquired.success || !acquired.data) return acquired
 *   const released = await operations.release('orders:lock', acquired.data)
 *   // owner 不是 fencing token；业务最终写入仍需自己的数据库/CAS条件。
 *   return released.success ? released.data : released.error.message
 * }
 * ```
 */
export interface LockOperations {
  /**
   * 尝试获取分布式锁
   *
   * 通过 SET NX EX 原子操作实现。每次生成不可复用的所有权凭据；占用时返回 null。
   * owner 仅用于租约续期/释放，不是资源的 fencing token；暂停/超时后旧操作仍可能继续。
   * 最终资源写入必须自行使用 CAS/代际条件或数据库事务约束，不能只检查续期或返回失败。
   *
   * @param key - 锁键名
   * @param options - 锁选项
   * @returns 获锁成功返回唯一凭据，锁占用时返回 null
   */
  acquire: (key: string, options?: LockOptions) => Promise<HaiResult<string | null>>

  /**
   * 释放分布式锁
   *
   * 仅当锁由当前持有者持有时才释放（通过 owner 比对），防止误释放他人的锁。
   *
   * @param key - 锁键名
   * @param owner - 本次 acquire 返回的唯一凭据，不能使用节点 ID
   * @returns true 表示释放成功，false 表示锁不存在或非当前持有者
   */
  release: (key: string, owner: string) => Promise<HaiResult<boolean>>

  /**
   * 检查锁是否被持有
   *
   * @param key - 锁键名
   * @returns true 表示锁存在且未过期
   */
  isLocked: (key: string) => Promise<HaiResult<boolean>>

  /**
   * 续期锁的过期时间
   *
   * 仅当锁由当前持有者持有时才续期。
   *
   * @param key - 锁键名
   * @param ttl - 新的过期时间（秒）
   * @param owner - 本次 acquire 返回的唯一凭据
   * @returns true 表示续期成功，false 表示锁不存在或非当前持有者
   */
  extend: (key: string, ttl: number, owner: string) => Promise<HaiResult<boolean>>
}

/**
 * 分布式锁选项
 * @example
 * ```ts
 * import type { LockOptions } from '@h-ai/cache'
 * const options: LockOptions = { ttl: 30 }
 * ```
 */
export interface LockOptions {
  /** 锁过期时间（秒）；默认 30 */
  ttl?: number
}

// ─── 复合操作接口 ───

/**
 * 复合缓存操作接口，聚合所有数据结构的操作子接口
 *
 * 通过 `cache.kv` / `cache.hash` / `cache.list` / `cache.set_` / `cache.zset` / `cache.lock` 分别访问
 * @example
 * ```ts
 * import type { CacheCompositeOperations } from '@h-ai/cache'
 * // 传入已初始化 cache 的对应操作；连接生命周期由创建者管理。
 * async function example(operations: CacheCompositeOperations) {
 *   const health = await operations.ping()
 *   if (!health.success) return health
 *   const result = await operations.kv.get<string>('orders:1')
 *   return result.success ? result.data : result.error.message
 * }
 * ```
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
  ping: () => Promise<HaiResult<string>>
}

// ─── 函数接口 ───

/**
 * 缓存函数接口
 * @example
 * ```ts
 * import type { CacheFunctions } from '@h-ai/cache'
 * // 传入已初始化 cache 的对应操作；连接生命周期由创建者管理。
 * async function example(operations: CacheFunctions) {
 *   const initialized = await operations.init({ type: 'redis', host: 'localhost' })
 *   if (!initialized.success) return initialized
 *   try { return await operations.kv.get<string>('orders:1') }
 *   finally { const closed = await operations.close(); if (!closed.success) return closed }
 * }
 * ```
 */
export interface CacheFunctions extends CacheCompositeOperations {
  /** 初始化缓存连接；会先关闭已有连接再以新配置重新初始化 */
  init: (config: CacheConfigInput) => Promise<HaiResult<void>>
  /** 当前脱敏后的配置快照；未初始化时为 null */
  readonly config: CacheConfig | null
  /** 是否已初始化并连接 */
  readonly isInitialized: boolean
  /**
   * 关闭连接并清理资源；失败时停止提供业务操作并保留资源，可再次 close/init 重试。
   * @returns 资源全部释放时成功；释放失败时返回 CONNECTION_FAILED。
   * @example
   * const result = await cache.close()
   * if (!result.success) await cache.close()
   */
  close: () => Promise<HaiResult<void>>
}
