/**
 * @h-ai/cache — 内存 Provider
 *
 * 基于 Map 的内存缓存实现，适用于开发与测试环境。
 * @module cache-provider-memory
 */

import type { HaiResult } from '@h-ai/core'
import type { CacheConfig, CacheValue, HashOperations, KvOperations, ListOperations, LockOperations, LockOptions, ScanOptions, SetOperations, SetOptions, ZMember, ZSetOperations } from '../cache-types.js'
import type { CacheProvider } from './cache-provider-types.js'
import { Buffer } from 'node:buffer'
import { core, err, ok } from '@h-ai/core'
import { cacheM } from '../cache-i18n.js'
import { HaiCacheError } from '../cache-types.js'
import { isValidLockOwner, isValidLockTtl, validateSetOptions } from './cache-set-options.js'
import { CacheSerializationError, serializeCacheValue } from './cache-value.js'

// ─── 内部类型 ───

/**
 * KV 存储项（包含值和可选的过期时间戳）
 * @example 模块内部上下文
 * ```ts
 * const entry: CacheEntry = { value: { id: 'order-1' }, expiresAt: Date.now() + 1000 }
 * const expired = entry.expiresAt !== undefined && entry.expiresAt <= Date.now()
 * ```
 */
interface CacheEntry {
  /** 缓存值 */
  value: CacheValue
  /** 过期时间戳（毫秒）；省略表示永不过期 */
  expiresAt?: number
}

// ─── 辅助函数 ───

/**
 * 反序列化 JSON 字符串为值
 *
 * @param str - JSON.stringify 产生的字符串
 */
function deserializeValue(str: string): CacheValue {
  return JSON.parse(str)
}

function operationFailure(reason: string, cause?: unknown): HaiResult<never> {
  return err(HaiCacheError.OPERATION_FAILED, cacheM('cache_operationFailed', {
    params: { error: reason },
  }), cause)
}

function serializationFailure(error: unknown): HaiResult<never> {
  return err(HaiCacheError.SERIALIZATION_FAILED, cacheM('cache_serializationFailed'), error)
}

/** Redis 的 stop 含端点；转换后始终给 slice 非负边界。 */
function sliceByRank<T>(values: T[], start: number, stop: number): T[] {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(stop))
    throw new RangeError('Range indices must be safe integers')
  const first = start < 0
    ? Math.max(values.length + start, 0)
    : start
  const end = stop < 0
    ? Math.max(values.length + stop + 1, 0)
    : stop + 1
  return values.slice(first, end)
}

function compareRanks(left: [string, number], right: [string, number]): number {
  if (left[1] !== right[1])
    return left[1] - right[1]
  return Buffer.compare(Buffer.from(left[0]), Buffer.from(right[0]))
}

function parseScoreBound(bound: number | string): { value: number, exclusive: boolean } {
  const exclusive = typeof bound === 'string' && bound.startsWith('(')
  const raw = exclusive
    ? bound.slice(1)
    : bound
  if (typeof raw === 'number' && !Number.isNaN(raw))
    return { value: raw, exclusive }
  if (typeof raw === 'string') {
    if (/^[+-]?inf(?:inity)?$/i.test(raw)) {
      return {
        value: raw.startsWith('-')
          ? Number.NEGATIVE_INFINITY
          : Number.POSITIVE_INFINITY,
        exclusive,
      }
    }
    if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw)) {
      const value = Number(raw)
      if (Number.isFinite(value))
        return { value, exclusive }
    }
  }
  throw new RangeError('Invalid sorted set score bound')
}

function scoreRange(min: number | string, max: number | string): (score: number) => boolean {
  const lower = parseScoreBound(min)
  const upper = parseScoreBound(max)
  return score => (lower.exclusive
    ? score > lower.value
    : score >= lower.value)
  && (upper.exclusive
    ? score < upper.value
    : score <= upper.value)
}

/** 从临时抽样池中移除随机项，不影响原始集合。 */
function drawMember(members: string[]): string {
  const index = Math.floor(Math.random() * members.length)
  const member = members[index]
  const last = members.pop()!
  if (index < members.length)
    members[index] = last
  return member
}

/**
 * 将 glob 通配符模式转为安全的正则表达式
 *
 * 先转义所有正则特殊字符，再将 `*` → `.*`、`?` → `.` 还原。
 * 避免用户输入中的正则元字符导致 ReDoS。
 *
 * @param pattern - glob 风格的通配符（仅支持 `*` 和 `?`）
 * @returns 匹配整个字符串的正则表达式
 */
function globToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regexStr = escaped.replace(/\\\*/g, '.*').replace(/\\\?/g, '.')
  return new RegExp(`^${regexStr}$`)
}

// ─── Memory Provider ───

/**
 * 创建 Memory Provider 实例
 *
 * 基于 Map/Set 的纯内存实现，支持 KV/Hash/List/Set/ZSet 全部操作。
 * 适用于开发和测试环境，不支持跨进程共享。
 * close() 后所有数据清空。
 *
 * @returns CacheProvider 实例
 * @example 模块内部上下文
 * ```ts
 * const provider = createMemoryProvider()
 * const connected = await provider.connect({ type: 'memory' })
 * if (connected.success) {
 *   try { const health = await provider.ping(); if (!health.success) health.error.code }
 *   finally { await provider.close() }
 * }
 * ```
 */
export function createMemoryProvider(): CacheProvider {
  /** KV 存储（带过期时间） */
  const store = new Map<string, CacheEntry>()
  /** Hash 存储：key → { field → serialized-value } */
  const hashStore = new Map<string, Map<string, string>>()
  /** List 存储：key → serialized-value[] */
  const listStore = new Map<string, string[]>()
  /** Set 存储：key → Set<serialized-value> */
  const setStore = new Map<string, Set<string>>()
  /** ZSet 存储：key → { member → score } */
  const zsetStore = new Map<string, Map<string, number>>()
  /** 非 KV 结构共用 key 期限；通用 key 操作与 Redis 使用同一命名空间。 */
  const structureExpiry = new Map<string, number>()

  function deleteKey(key: string): boolean {
    const existed = store.has(key) || Boolean(hashStore.get(key)?.size || listStore.get(key)?.length || setStore.get(key)?.size || zsetStore.get(key)?.size)
    store.delete(key)
    hashStore.delete(key)
    listStore.delete(key)
    setStore.delete(key)
    zsetStore.delete(key)
    structureExpiry.delete(key)
    return existed
  }
  function expireKey(key: string): void {
    const expiresAt = store.get(key)?.expiresAt ?? structureExpiry.get(key)
    if (expiresAt !== undefined && expiresAt <= Date.now())
      deleteKey(key)
  }
  function keyType(key: string): string {
    expireKey(key)
    if (store.has(key))
      return 'string'
    if (hashStore.get(key)?.size)
      return 'hash'
    if (listStore.get(key)?.length)
      return 'list'
    if (setStore.get(key)?.size)
      return 'set'
    if (zsetStore.get(key)?.size)
      return 'zset'
    return 'none'
  }
  function keyExpiry(key: string): number | undefined {
    return store.get(key)?.expiresAt ?? structureExpiry.get(key)
  }
  function setKeyExpiry(key: string, expiresAt: number): void {
    const entry = store.get(key)
    if (entry)
      entry.expiresAt = expiresAt
    else structureExpiry.set(key, expiresAt)
    expireKey(key)
  }
  function allKeys(): string[] {
    return [
      ...new Set([
        ...store.keys(),
        ...hashStore.keys(),
        ...listStore.keys(),
        ...setStore.keys(),
        ...zsetStore.keys(),
      ]),
    ].filter(key => keyType(key) !== 'none')
  }

  function hasWrongType(key: string, type: string): boolean {
    const actual = keyType(key)
    return actual !== 'none' && actual !== type
  }

  function wrongType(): HaiResult<never> {
    return operationFailure('Key contains another data type')
  }

  /** 各结构的所有操作先检查统一类型和期限；不复制几十个相同的守卫。 */
  function guardStructure<T extends object>(operations: T, type: string): T {
    return new Proxy(operations, {
      get(target, property, receiver) {
        const operation: unknown = Reflect.get(target, property, receiver)
        if (typeof operation !== 'function')
          return operation
        return async (...args: unknown[]) => {
          // 阻塞弹出的内存模拟需逐键检查，找到元素后不再访问其它键。
          const keys = property === 'blpop' || property === 'brpop'
            ? []
            : (property === 'sinter' || property === 'sunion' || property === 'sdiff'
                ? args
                : args.slice(0, 1)).filter((key): key is string => typeof key === 'string')
          try {
            if (keys.some(key => hasWrongType(key, type)))
              return wrongType()
            return await Reflect.apply(operation, target, args)
          }
          catch (error) {
            return error instanceof CacheSerializationError
              ? serializationFailure(error)
              : operationFailure(error instanceof Error
                  ? error.message
                  : String(error), error)
          }
        }
      },
    })
  }

  let connected = false
  /** 定期清理过期 KV 数据的定时器；间隔 60s */
  let cleanupTimer: ReturnType<typeof setInterval> | null = null

  /**
   * 判断缓存项是否过期
   *
   * @param entry - 缓存项
   * @returns 未设置 expiresAt 视为永不过期，返回 false
   */
  function isExpired(entry: CacheEntry): boolean {
    return entry.expiresAt != null && Date.now() >= entry.expiresAt
  }

  /** 定期清理 store 中的所有过期 KV 项 */
  function cleanup(): void {
    const now = Date.now()
    for (const [key, entry] of store.entries()) {
      if (entry.expiresAt != null && entry.expiresAt <= now) {
        deleteKey(key)
      }
    }
    for (const key of structureExpiry.keys())
      expireKey(key)
  }

  /**
   * 获取有效的缓存项
   *
   * 如果项已过期则立即从 store 中删除并返回 null（懒删除策略）
   *
   * @param key - 缓存键
   * @returns 有效的缓存项，或 null
   */
  function getValidEntry(key: string): CacheEntry | null {
    expireKey(key)
    const entry = store.get(key)
    if (!entry)
      return null
    if (isExpired(entry)) {
      store.delete(key)
      return null
    }
    return entry
  }

  // ─── KV 操作 ───

  const kv: KvOperations = {
    async compareAndSwap(key, expected, value, options) {
      try {
        if ((options?.px !== undefined && (!Number.isSafeInteger(options.px) || options.px <= 0)) || (options?.px !== undefined && options.keepTtl))
          throw new TypeError('Invalid compare-and-swap expiry')
        // 先生成两个快照，防止自定义 toJSON 在比较和写入之间重入。
        const expectedSnapshot = expected === undefined
          ? undefined
          : serializeCacheValue(expected)
        const valueSnapshot = value === undefined
          ? undefined
          : deserializeValue(serializeCacheValue(value))
        if (hasWrongType(key, 'string'))
          return wrongType()
        const entry = getValidEntry(key)
        const actual = entry
          ? serializeCacheValue(entry.value)
          : undefined
        if (actual !== expectedSnapshot)
          return ok(false)
        if (valueSnapshot === undefined) {
          store.delete(key)
        }
        else {
          const expiresAt = options?.px !== undefined
            ? Date.now() + options.px
            : options?.keepTtl ? entry?.expiresAt : undefined
          store.set(key, { value: valueSnapshot, expiresAt })
        }
        return ok(true)
      }
      catch (error) {
        return error instanceof CacheSerializationError
          ? serializationFailure(error)
          : operationFailure('Compare-and-swap failed', error)
      }
    },
    async get<T = CacheValue>(key: string): Promise<HaiResult<T | null>> {
      try {
        const type = keyType(key)
        if (type !== 'none' && type !== 'string') {
          return err(HaiCacheError.OPERATION_FAILED, cacheM('cache_operationFailed', {
            params: { error: 'Key contains another data type' },
          }))
        }
        const entry = getValidEntry(key)
        return ok(entry
          ? (deserializeValue(serializeCacheValue(entry.value)) as T)
          : null)
      }
      catch (error) {
        return err(HaiCacheError.SERIALIZATION_FAILED, cacheM('cache_operationFailed', {
          params: { error: 'JSON snapshot failed' },
        }), error)
      }
    },

    async set(key: string, value: CacheValue, options?: SetOptions): Promise<HaiResult<boolean>> {
      const validated = validateSetOptions(options)
      if (!validated.success)
        return validated
      const policy = validated.data
      try {
        // 先得到与 Redis 一致的 JSON 快照；序列化失败不能破坏原值或 TTL。
        const snapshot = deserializeValue(serializeCacheValue(value))
        const existing = keyType(key) !== 'none'
        if ((policy.nx && existing) || (policy.xx && !existing))
          return ok(false)
        const expiresAt = policy.keepTtl
          ? keyExpiry(key)
          : policy.expiresAt
        deleteKey(key)
        if (expiresAt !== undefined && expiresAt <= Date.now())
          store.delete(key)
        else
          store.set(key, { value: snapshot, expiresAt })
        return ok(true)
      }
      catch (error) {
        return serializationFailure(error)
      }
    },

    async del(...keys: string[]): Promise<HaiResult<number>> {
      let count = 0
      for (const key of keys) {
        expireKey(key)
        if (deleteKey(key))
          count++
      }
      return ok(count)
    },

    async exists(...keys: string[]): Promise<HaiResult<number>> {
      let count = 0
      for (const key of keys) {
        if (keyType(key) !== 'none')
          count++
      }
      return ok(count)
    },

    async expire(key: string, seconds: number): Promise<HaiResult<boolean>> {
      const expiry = Date.now() + seconds * 1000
      if (!Number.isSafeInteger(seconds) || !Number.isSafeInteger(expiry))
        return operationFailure('Invalid expiry')
      if (keyType(key) === 'none')
        return ok(false)
      setKeyExpiry(key, expiry)
      return ok(true)
    },

    async expireAt(key: string, timestamp: number): Promise<HaiResult<boolean>> {
      const expiry = timestamp * 1000
      if (!Number.isSafeInteger(timestamp) || !Number.isSafeInteger(expiry))
        return operationFailure('Invalid expiry')
      if (keyType(key) === 'none')
        return ok(false)
      setKeyExpiry(key, expiry)
      return ok(true)
    },

    async ttl(key: string): Promise<HaiResult<number>> {
      if (keyType(key) === 'none')
        return ok(-2)
      const expiresAt = keyExpiry(key)
      if (expiresAt === undefined)
        return ok(-1)
      return ok(Math.ceil((expiresAt - Date.now()) / 1000))
    },

    async persist(key: string): Promise<HaiResult<boolean>> {
      if (keyType(key) === 'none' || keyExpiry(key) === undefined)
        return ok(false)
      const entry = store.get(key)
      if (entry)
        delete entry.expiresAt
      structureExpiry.delete(key)
      return ok(true)
    },

    async incr(key: string): Promise<HaiResult<number>> {
      return kv.incrBy(key, 1)
    },

    async incrBy(key: string, increment: number): Promise<HaiResult<number>> {
      const type = keyType(key)
      if (type !== 'none' && type !== 'string')
        return err(HaiCacheError.OPERATION_FAILED, cacheM('cache_valueNotNumber'))
      const entry = getValidEntry(key)
      // 计数器只接受安全整数，避免 Number(null/boolean/array) 的隐式类型转换。
      const value = entry?.value ?? (entry ? Number.NaN : 0)
      const current = typeof value === 'number' || (typeof value === 'string' && /^-?\d+$/.test(value))
        ? Number(value)
        : Number.NaN
      const newValue = current + increment
      if (!Number.isSafeInteger(current) || !Number.isSafeInteger(increment) || !Number.isSafeInteger(newValue)) {
        return err(HaiCacheError.OPERATION_FAILED, cacheM('cache_valueNotNumber'))
      }
      store.set(key, { value: newValue, expiresAt: entry?.expiresAt })
      return ok(newValue)
    },

    async decr(key: string): Promise<HaiResult<number>> {
      return kv.incrBy(key, -1)
    },

    async decrBy(key: string, decrement: number): Promise<HaiResult<number>> {
      return kv.incrBy(key, -decrement)
    },

    async mget<T = CacheValue>(...keys: string[]): Promise<HaiResult<(T | null)[]>> {
      try {
        const results: (T | null)[] = []
        for (const key of keys) {
          const entry = getValidEntry(key)
          results.push(entry
            ? (deserializeValue(serializeCacheValue(entry.value)) as T)
            : null)
        }
        return ok(results)
      }
      catch (error) {
        return err(HaiCacheError.SERIALIZATION_FAILED, cacheM('cache_operationFailed', {
          params: { error: 'JSON snapshot failed' },
        }), error)
      }
    },

    async mset(entries: Array<[string, CacheValue]>): Promise<HaiResult<void>> {
      try {
        const snapshots = entries.map(([key, value]) => [
          key,
          deserializeValue(serializeCacheValue(value)),
        ] as const)
        for (const [key, value] of snapshots) {
          deleteKey(key)
          store.set(key, { value })
        }
        return ok(undefined)
      }
      catch (error) {
        return serializationFailure(error)
      }
    },

    async scan(cursor: string, options?: ScanOptions): Promise<HaiResult<[string, string[]]>> {
      if (typeof cursor !== 'string' || !/^\d{1,20}$/.test(cursor) || BigInt(cursor) > 18_446_744_073_709_551_615n || !Number.isSafeInteger(options?.count ?? 10) || (options?.count ?? 10) <= 0)
        return err(HaiCacheError.INVALID_SCAN, cacheM('cache_invalidScan'))
      const keysInStore = allKeys()
      const regex = options?.match
        ? globToRegex(options.match)
        : null
      const filtered = regex
        ? keysInStore.filter(k => regex.test(k))
        : keysInStore
      const count = options?.count || 10
      const start = Number(cursor)
      const end = Math.min(start + count, filtered.length)
      const keys = filtered.slice(start, end)
      const nextCursor = end >= filtered.length
        ? '0'
        : String(end)
      return ok([nextCursor, keys])
    },

    async keys(pattern: string): Promise<HaiResult<string[]>> {
      const regex = globToRegex(pattern)
      return ok(allKeys().filter(key => regex.test(key)))
    },

    async type(key: string): Promise<HaiResult<string>> {
      return ok(keyType(key))
    },
  }

  // ─── Hash 操作 ───

  const hash: HashOperations = {
    async hget<T = CacheValue>(key: string, field: string): Promise<HaiResult<T | null>> {
      const map = hashStore.get(key)
      if (!map)
        return ok(null)
      const val = map.get(field)
      return ok(val !== undefined
        ? (deserializeValue(val) as T)
        : null)
    },

    hset: (async (key: string, fieldOrData: string | Record<string, CacheValue>, value?: CacheValue): Promise<HaiResult<number>> => {
      if (typeof fieldOrData !== 'string' && (fieldOrData === null || Array.isArray(fieldOrData))) {
        return err(HaiCacheError.OPERATION_FAILED, cacheM('cache_invalidHashSetInput'))
      }

      if (typeof fieldOrData === 'string' && value === undefined)
        return err(HaiCacheError.OPERATION_FAILED, cacheM('cache_invalidHashSetInput'))
      const entries: [string, string][] = typeof fieldOrData === 'string'
        ? [
            [
              fieldOrData,
              serializeCacheValue(value!),
            ],
          ]
        : Object.entries(fieldOrData).map(([field, fieldValue]) => [
            field,
            serializeCacheValue(fieldValue),
          ])
      if (hasWrongType(key, 'hash'))
        return wrongType()
      const map = hashStore.get(key) ?? new Map<string, string>()
      let count = 0
      for (const [field, serialized] of entries) {
        if (!map.has(field))
          count++
        map.set(field, serialized)
      }
      if (map.size)
        hashStore.set(key, map)
      return ok(count)
    }) as HashOperations['hset'],

    async hdel(key: string, ...fields: string[]): Promise<HaiResult<number>> {
      const map = hashStore.get(key)
      if (!map)
        return ok(0)
      let count = 0
      for (const field of fields) {
        if (map.delete(field))
          count++
      }
      if (!map.size)
        deleteKey(key)
      return ok(count)
    },

    async hexists(key: string, field: string): Promise<HaiResult<boolean>> {
      const map = hashStore.get(key)
      return ok(map?.has(field) ?? false)
    },

    async hgetall<T = Record<string, CacheValue>>(key: string): Promise<HaiResult<T>> {
      const map = hashStore.get(key)
      if (!map)
        return ok({} as T)
      // fromEntries 保留 __proto__ 等合法字段，不触发原型 setter。
      return ok(Object.fromEntries(Array.from(map, ([field, value]) => [
        field,
        deserializeValue(value),
      ])) as T)
    },

    async hkeys(key: string): Promise<HaiResult<string[]>> {
      const map = hashStore.get(key)
      return ok(map
        ? Array.from(map.keys())
        : [])
    },

    async hvals<T = CacheValue>(key: string): Promise<HaiResult<T[]>> {
      const map = hashStore.get(key)
      if (!map)
        return ok([])
      return ok(Array.from(map.values()).map(v => deserializeValue(v) as T))
    },

    async hlen(key: string): Promise<HaiResult<number>> {
      const map = hashStore.get(key)
      return ok(map?.size ?? 0)
    },

    async hmget<T = CacheValue>(key: string, ...fields: string[]): Promise<HaiResult<(T | null)[]>> {
      const map = hashStore.get(key)
      const results: (T | null)[] = fields.map((field) => {
        const val = map?.get(field)
        return val !== undefined
          ? (deserializeValue(val) as T)
          : null
      })
      return ok(results)
    },

    async hincrBy(key: string, field: string, increment: number): Promise<HaiResult<number>> {
      const map = hashStore.get(key) ?? new Map<string, string>()
      const stored = map.get(field)
      const current = stored === undefined
        ? 0
        : deserializeValue(stored)
      if (typeof current !== 'number' || !Number.isSafeInteger(current) || !Number.isSafeInteger(increment))
        return err(HaiCacheError.OPERATION_FAILED, cacheM('cache_valueNotNumber'))
      const newValue = current + increment
      if (!Number.isSafeInteger(newValue))
        return err(HaiCacheError.OPERATION_FAILED, cacheM('cache_valueNotNumber'))
      map.set(field, serializeCacheValue(newValue))
      hashStore.set(key, map)
      return ok(newValue)
    },
  }

  // ─── List 操作 ───

  function popFirstList<T>(keys: string[], end: 'shift' | 'pop'): HaiResult<[string, T] | null> {
    for (const key of keys) {
      if (hasWrongType(key, 'list'))
        return wrongType()
      const items = listStore.get(key)
      if (!items?.length)
        continue
      const value = items[end]()!
      if (!items.length)
        deleteKey(key)
      return ok([
        key,
        deserializeValue(value) as T,
      ])
    }
    return ok(null)
  }

  const list: ListOperations = {
    async lpush(key: string, ...values: CacheValue[]): Promise<HaiResult<number>> {
      const serialized = values.map(serializeCacheValue).reverse()
      if (hasWrongType(key, 'list'))
        return wrongType()
      const arr = listStore.get(key) ?? []
      // Redis LPUSH 从左侧逐项推入，多值时结果为输入的逆序。
      const next = serialized.concat(arr)
      if (next.length)
        listStore.set(key, next)
      return ok(next.length)
    },

    async rpush(key: string, ...values: CacheValue[]): Promise<HaiResult<number>> {
      const serialized = values.map(serializeCacheValue)
      if (hasWrongType(key, 'list'))
        return wrongType()
      const arr = listStore.get(key) ?? []
      for (const value of serialized)
        arr.push(value)
      if (arr.length)
        listStore.set(key, arr)
      return ok(arr.length)
    },

    async lpop<T = CacheValue>(key: string): Promise<HaiResult<T | null>> {
      const arr = listStore.get(key)
      if (!arr || arr.length === 0)
        return ok(null)
      const val = arr.shift()!
      if (!arr.length)
        deleteKey(key)
      return ok(deserializeValue(val) as T)
    },

    async rpop<T = CacheValue>(key: string): Promise<HaiResult<T | null>> {
      const arr = listStore.get(key)
      if (!arr || arr.length === 0)
        return ok(null)
      const val = arr.pop()!
      if (!arr.length)
        deleteKey(key)
      return ok(deserializeValue(val) as T)
    },

    async llen(key: string): Promise<HaiResult<number>> {
      const arr = listStore.get(key)
      return ok(arr?.length ?? 0)
    },

    async lrange<T = CacheValue>(key: string, start: number, stop: number): Promise<HaiResult<T[]>> {
      return ok(sliceByRank(listStore.get(key) ?? [], start, stop).map(value => deserializeValue(value) as T))
    },

    async lindex<T = CacheValue>(key: string, index: number): Promise<HaiResult<T | null>> {
      if (!Number.isSafeInteger(index))
        return err(HaiCacheError.OPERATION_FAILED, cacheM('cache_indexOutOfRange'))
      const arr = listStore.get(key)
      if (!arr)
        return ok(null)
      const i = index < 0
        ? arr.length + index
        : index
      const val = arr[i]
      return ok(val !== undefined
        ? (deserializeValue(val) as T)
        : null)
    },

    async lset(key: string, index: number, value: CacheValue): Promise<HaiResult<void>> {
      const serialized = serializeCacheValue(value)
      if (hasWrongType(key, 'list'))
        return wrongType()
      const arr = listStore.get(key)
      if (!arr) {
        return err(HaiCacheError.KEY_NOT_FOUND, cacheM('cache_keyNotFound'))
      }
      const i = index < 0
        ? arr.length + index
        : index
      if (!Number.isSafeInteger(index) || i < 0 || i >= arr.length) {
        return err(HaiCacheError.OPERATION_FAILED, cacheM('cache_indexOutOfRange'))
      }
      arr[i] = serialized
      return ok(undefined)
    },

    async ltrim(key: string, start: number, stop: number): Promise<HaiResult<void>> {
      const remaining = sliceByRank(listStore.get(key) ?? [], start, stop)
      if (remaining.length)
        listStore.set(key, remaining)
      else deleteKey(key)
      return ok(undefined)
    },

    /**
     * Memory 版本的 blpop 为“非阻塞模拟”：忽略 timeout，立即按 keys 顺序尝试弹出。
     */
    async blpop<T = CacheValue>(_timeout: number, ...keys: string[]): Promise<HaiResult<[string, T] | null>> {
      return popFirstList<T>(keys, 'shift')
    },

    /**
     * Memory 版本的 brpop 为“非阻塞模拟”：忽略 timeout，立即按 keys 顺序尝试弹出。
     */
    async brpop<T = CacheValue>(_timeout: number, ...keys: string[]): Promise<HaiResult<[string, T] | null>> {
      return popFirstList<T>(keys, 'pop')
    },
  }

  // ─── Set 操作 ───

  const set_: SetOperations = {
    async sadd(key: string, ...members: CacheValue[]): Promise<HaiResult<number>> {
      const serialized = members.map(serializeCacheValue)
      if (hasWrongType(key, 'set'))
        return wrongType()
      const set = setStore.get(key) ?? new Set<string>()
      const sizeBefore = set.size
      for (const member of serialized)
        set.add(member)
      if (set.size)
        setStore.set(key, set)
      return ok(set.size - sizeBefore)
    },

    async srem(key: string, ...members: CacheValue[]): Promise<HaiResult<number>> {
      const serialized = members.map(serializeCacheValue)
      if (hasWrongType(key, 'set'))
        return wrongType()
      const s = setStore.get(key)
      if (!s)
        return ok(0)
      let count = 0
      for (const member of serialized) {
        if (s.delete(member))
          count++
      }
      if (!s.size)
        deleteKey(key)
      return ok(count)
    },

    async smembers<T = CacheValue>(key: string): Promise<HaiResult<T[]>> {
      const s = setStore.get(key)
      if (!s)
        return ok([])
      return ok(Array.from(s).map(v => deserializeValue(v) as T))
    },

    async sismember(key: string, member: CacheValue): Promise<HaiResult<boolean>> {
      const serialized = serializeCacheValue(member)
      if (hasWrongType(key, 'set'))
        return wrongType()
      const s = setStore.get(key)
      return ok(s?.has(serialized) ?? false)
    },

    async scard(key: string): Promise<HaiResult<number>> {
      const s = setStore.get(key)
      return ok(s?.size ?? 0)
    },

    async srandmember<T = CacheValue>(key: string, count?: number): Promise<HaiResult<T | T[] | null>> {
      if (count !== undefined && !Number.isSafeInteger(count))
        return operationFailure('Invalid random member count')
      const s = setStore.get(key)
      if (!s || s.size === 0) {
        return ok(count === undefined
          ? null
          : [])
      }
      const arr = Array.from(s)
      if (count === undefined)
        return ok(deserializeValue(drawMember(arr)) as T)
      if (count < 0) {
        // 负 count 按要求有放回抽样，返回数量可超过集合大小。
        return ok(Array.from({ length: -count }, () => {
          const index = Math.floor(Math.random() * arr.length)
          return deserializeValue(arr[index]) as T
        }))
      }
      return ok(Array.from({
        length: Math.min(count, arr.length),
      }, () => deserializeValue(drawMember(arr)) as T))
    },

    async spop<T = CacheValue>(key: string, count?: number): Promise<HaiResult<T | T[] | null>> {
      if (count !== undefined && (!Number.isSafeInteger(count) || count < 0))
        return operationFailure('Invalid pop count')
      const s = setStore.get(key)
      if (!s || s.size === 0) {
        return ok(count === undefined
          ? null
          : [])
      }
      const arr = Array.from(s)
      const result = Array.from({
        length: Math.min(count ?? 1, arr.length),
      }, () => {
        const member = drawMember(arr)
        s.delete(member)
        return deserializeValue(member) as T
      })
      if (!s.size)
        deleteKey(key)
      return ok(count === undefined
        ? result[0]
        : result)
    },

    async sinter<T = CacheValue>(...keys: string[]): Promise<HaiResult<T[]>> {
      if (keys.length === 0)
        return ok([])
      const sets = keys.map(k => setStore.get(k))
      if (sets.some(s => !s))
        return ok([])
      const [first, ...rest] = sets as Set<string>[]
      const result = Array.from(first).filter(v => rest.every(s => s.has(v)))
      return ok(result.map(v => deserializeValue(v) as T))
    },

    async sunion<T = CacheValue>(...keys: string[]): Promise<HaiResult<T[]>> {
      const union = new Set<string>()
      for (const key of keys) {
        const s = setStore.get(key)
        if (s) {
          for (const v of s) union.add(v)
        }
      }
      return ok(Array.from(union).map(v => deserializeValue(v) as T))
    },

    async sdiff<T = CacheValue>(...keys: string[]): Promise<HaiResult<T[]>> {
      if (keys.length === 0)
        return ok([])
      const first = setStore.get(keys[0])
      if (!first)
        return ok([])
      const rest = keys.slice(1).map(k => setStore.get(k)).filter(Boolean) as Set<string>[]
      const result = Array.from(first).filter(v => !rest.some(s => s.has(v)))
      return ok(result.map(v => deserializeValue(v) as T))
    },
  }

  // ─── ZSet 操作 ───

  const zset: ZSetOperations = {
    async zadd(key: string, ...members: ZMember[]): Promise<HaiResult<number>> {
      const entries = members.map(({ member, score }) => ({ member, score }))
      if (entries.some(({ score }) => typeof score !== 'number' || Number.isNaN(score)))
        return operationFailure('Invalid sorted set score')
      if (hasWrongType(key, 'zset'))
        return wrongType()
      const map = zsetStore.get(key) ?? new Map<string, number>()
      let count = 0
      for (const { score, member } of entries) {
        if (!map.has(member))
          count++
        map.set(member, score)
      }
      if (map.size)
        zsetStore.set(key, map)
      return ok(count)
    },

    async zrem(key: string, ...members: string[]): Promise<HaiResult<number>> {
      const map = zsetStore.get(key)
      if (!map)
        return ok(0)
      let count = 0
      for (const member of members) {
        if (map.delete(member))
          count++
      }
      if (!map.size)
        deleteKey(key)
      return ok(count)
    },

    async zscore(key: string, member: string): Promise<HaiResult<number | null>> {
      const map = zsetStore.get(key)
      const score = map?.get(member)
      return ok(score !== undefined
        ? score
        : null)
    },

    async zrank(key: string, member: string): Promise<HaiResult<number | null>> {
      const map = zsetStore.get(key)
      if (!map || !map.has(member))
        return ok(null)
      const sorted = Array.from(map.entries()).sort(compareRanks)
      const idx = sorted.findIndex(([m]) => m === member)
      return ok(idx >= 0
        ? idx
        : null)
    },

    async zrevrank(key: string, member: string): Promise<HaiResult<number | null>> {
      const map = zsetStore.get(key)
      if (!map || !map.has(member))
        return ok(null)
      const sorted = Array.from(map.entries()).sort((left, right) => compareRanks(right, left))
      const idx = sorted.findIndex(([m]) => m === member)
      return ok(idx >= 0
        ? idx
        : null)
    },

    async zrange(key: string, start: number, stop: number, withScores?: boolean): Promise<HaiResult<string[] | ZMember[]>> {
      const sorted = Array.from(zsetStore.get(key) ?? []).sort(compareRanks)
      const slice = sliceByRank(sorted, start, stop)
      if (withScores) {
        return ok(slice.map(([member, score]) => ({ member, score })))
      }
      return ok(slice.map(([member]) => member))
    },

    async zrevrange(key: string, start: number, stop: number, withScores?: boolean): Promise<HaiResult<string[] | ZMember[]>> {
      const sorted = Array.from(zsetStore.get(key) ?? []).sort((left, right) => compareRanks(right, left))
      const slice = sliceByRank(sorted, start, stop)
      if (withScores) {
        return ok(slice.map(([member, score]) => ({ member, score })))
      }
      return ok(slice.map(([member]) => member))
    },

    async zrangeByScore(
      key: string,
      min: number | string,
      max: number | string,
      options?: { withScores?: boolean, offset?: number, count?: number },
    ): Promise<HaiResult<string[] | ZMember[]>> {
      const inRange = scoreRange(min, max)
      const offset = options?.offset ?? 0
      const count = options?.count ?? -1
      if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(count))
        return operationFailure('Invalid sorted set pagination')
      if (offset < 0 || count === 0)
        return ok([])
      const sorted = Array.from(zsetStore.get(key) ?? [])
        .filter(([, score]) => inRange(score))
        .sort(compareRanks)
        .slice(offset, count < 0
          ? undefined
          : offset + count)
      if (options?.withScores) {
        return ok(sorted.map(([member, score]) => ({ member, score })))
      }
      return ok(sorted.map(([member]) => member))
    },

    async zcard(key: string): Promise<HaiResult<number>> {
      const map = zsetStore.get(key)
      return ok(map?.size ?? 0)
    },

    async zcount(key: string, min: number | string, max: number | string): Promise<HaiResult<number>> {
      const inRange = scoreRange(min, max)
      const map = zsetStore.get(key)
      if (!map)
        return ok(0)
      let count = 0
      for (const score of map.values()) {
        if (inRange(score))
          count++
      }
      return ok(count)
    },

    async zincrBy(key: string, increment: number, member: string): Promise<HaiResult<number>> {
      if (typeof increment !== 'number')
        return operationFailure('Invalid sorted set increment')
      const map = zsetStore.get(key) ?? new Map<string, number>()
      const current = map.get(member) ?? 0
      const newScore = current + increment
      if (Number.isNaN(newScore))
        return operationFailure('Invalid sorted set score')
      map.set(member, newScore)
      zsetStore.set(key, map)
      return ok(newScore)
    },

    async zremRangeByRank(key: string, start: number, stop: number): Promise<HaiResult<number>> {
      const map = zsetStore.get(key) ?? new Map<string, number>()
      const toRemove = sliceByRank(Array.from(map.entries()).sort(compareRanks), start, stop)
      for (const [member] of toRemove) {
        map.delete(member)
      }
      if (!map.size)
        deleteKey(key)
      return ok(toRemove.length)
    },

    async zremRangeByScore(key: string, min: number | string, max: number | string): Promise<HaiResult<number>> {
      const inRange = scoreRange(min, max)
      const map = zsetStore.get(key)
      if (!map)
        return ok(0)
      let count = 0
      for (const [member, score] of map.entries()) {
        if (inRange(score)) {
          map.delete(member)
          count++
        }
      }
      if (!map.size)
        deleteKey(key)
      return ok(count)
    },
  }

  // ─── Lock 操作 ───

  /** 锁前缀，用于区分锁键与普通 KV 键 */
  const LOCK_PREFIX = '__lock:'

  /** 单层锁保存原凭据，多层锁追加持有次数。读取时只识别调用方拥有的有效记录。 */
  function getOwnedLock(key: string, owner: string): { entry: CacheEntry, depth: number } | undefined {
    if (!isValidLockOwner(owner))
      return undefined
    const entry = getValidEntry(key)
    if (!entry || typeof entry.value !== 'string')
      return undefined
    if (entry.value === owner)
      return { entry, depth: 1 }
    const prefix = `${owner}|`
    if (!entry.value.startsWith(prefix))
      return undefined
    const count = entry.value.slice(prefix.length)
    const depth = Number(count)
    if (/^[1-9]\d*$/.test(count) && Number.isSafeInteger(depth) && depth > 1)
      return { entry, depth }
    return undefined
  }

  const lock: LockOperations = {
    async acquire(key: string, options?: LockOptions): Promise<HaiResult<string | null>> {
      const lockKey = `${LOCK_PREFIX}${key}`
      const { owner, ttl: configuredTtl } = options ?? {}
      if (owner !== undefined) {
        if (configuredTtl !== undefined)
          return err(HaiCacheError.OPERATION_FAILED, cacheM('cache_invalidLockOwnerOptions'))
        const held = getOwnedLock(lockKey, owner)
        if (!held || held.depth === Number.MAX_SAFE_INTEGER)
          return ok(null)
        held.entry.value = `${owner}|${held.depth + 1}`
        return ok(owner)
      }
      const ttl = configuredTtl === undefined
        ? 30
        : configuredTtl
      if (!isValidLockTtl(ttl))
        return err(HaiCacheError.OPERATION_FAILED, cacheM('cache_invalidLockTtl'))
      if (keyType(lockKey) !== 'none')
        return ok(null)
      const token = core.id.uuid()
      store.set(lockKey, {
        value: token,
        expiresAt: Date.now() + ttl * 1000,
      })
      return ok(token)
    },

    async release(key: string, owner: string): Promise<HaiResult<boolean>> {
      const lockKey = `${LOCK_PREFIX}${key}`
      const held = getOwnedLock(lockKey, owner)
      if (!held)
        return ok(false)
      if (held.depth === 1)
        store.delete(lockKey)
      else if (held.depth === 2)
        held.entry.value = owner
      else
        held.entry.value = `${owner}|${held.depth - 1}`
      return ok(true)
    },

    async isLocked(key: string): Promise<HaiResult<boolean>> {
      const lockKey = `${LOCK_PREFIX}${key}`
      return ok(keyType(lockKey) !== 'none')
    },

    async extend(key: string, ttl: number, owner: string): Promise<HaiResult<boolean>> {
      if (!isValidLockTtl(ttl))
        return err(HaiCacheError.OPERATION_FAILED, cacheM('cache_invalidLockTtl'))
      const lockKey = `${LOCK_PREFIX}${key}`
      const held = getOwnedLock(lockKey, owner)
      if (!held)
        return ok(false)
      held.entry.expiresAt = Date.now() + ttl * 1000
      return ok(true)
    },
  }

  // ─── Provider 返回 ───

  return {
    name: 'memory',

    async connect(_config: CacheConfig): Promise<HaiResult<void>> {
      if (connected)
        return ok(undefined)
      cleanupTimer = setInterval(cleanup, 60000)
      connected = true
      return ok(undefined)
    },

    async close(): Promise<void> {
      if (cleanupTimer) {
        clearInterval(cleanupTimer)
        cleanupTimer = null
      }
      store.clear()
      hashStore.clear()
      listStore.clear()
      setStore.clear()
      zsetStore.clear()
      structureExpiry.clear()
      connected = false
    },

    isConnected: () => connected,

    kv,
    hash: guardStructure(hash, 'hash'),
    list: guardStructure(list, 'list'),
    set_: guardStructure(set_, 'set'),
    zset: guardStructure(zset, 'zset'),
    lock,

    async ping(): Promise<HaiResult<string>> {
      return ok('PONG')
    },
  }
}
