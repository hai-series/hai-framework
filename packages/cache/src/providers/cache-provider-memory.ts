/**
 * @h-ai/cache — 内存 Provider
 *
 * 基于 Map 的内存缓存实现，适用于开发与测试环境。
 * @module cache-provider-memory
 */

import type { Result } from '@h-ai/core'
import type { CacheConfig, CacheErrorCodeType } from '../cache-config.js'
import type {
  CacheError,
  CacheProvider,
  CacheValue,
  HashOperations,
  KvOperations,
  ListOperations,
  ScanOptions,
  SetOperations,
  SetOptions,
  ZMember,
  ZSetOperations,
} from '../cache-types.js'
import { err, ok } from '@h-ai/core'
import { CacheErrorCode } from '../cache-config.js'
import { cacheM } from '../cache-i18n.js'

// ─── 内部类型 ───

/** KV 存储项（包含值和可选的过期时间戳） */
interface CacheEntry {
  /** 缓存值 */
  value: CacheValue
  /** 过期时间戳（毫秒）；省略表示永不过期 */
  expiresAt?: number
}

// ─── 辅助函数 ───

/**
 * 创建缓存错误对象
 *
 * @param code - 错误码
 * @param message - 错误消息
 */
function createError(code: CacheErrorCodeType, message: string): CacheError {
  return { code, message }
}

/**
 * 序列化值为 JSON 字符串
 *
 * 所有类型（包括 string）都经 JSON.stringify，以保证反序列化时类型一致
 */
function serializeValue(value: CacheValue): string {
  return JSON.stringify(value)
}

/**
 * 反序列化 JSON 字符串为值
 *
 * @param str - JSON.stringify 产生的字符串
 */
function deserializeValue(str: string): CacheValue {
  return JSON.parse(str)
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
    return entry.expiresAt != null && Date.now() > entry.expiresAt
  }

  /** 定期清理 store 中的所有过期 KV 项 */
  function cleanup(): void {
    const now = Date.now()
    for (const [key, entry] of store.entries()) {
      if (entry.expiresAt && entry.expiresAt < now) {
        store.delete(key)
      }
    }
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
    const entry = store.get(key)
    if (!entry)
      return null
    if (isExpired(entry)) {
      store.delete(key)
      return null
    }
    return entry
  }

  /**
   * 根据 SetOptions 计算过期时间戳
   *
   * 优先级：ex > px > exat > pxat，均未指定时返回 undefined（永不过期）
   *
   * @param options - 设置选项
   * @returns 过期时间戳（毫秒），或 undefined
   */
  function calculateExpiry(options?: SetOptions): number | undefined {
    if (!options)
      return undefined
    const now = Date.now()
    if (options.ex)
      return now + options.ex * 1000
    if (options.px)
      return now + options.px
    if (options.exat)
      return options.exat * 1000
    if (options.pxat)
      return options.pxat
    return undefined
  }

  // ─── KV 操作 ───

  const kv: KvOperations = {
    async get<T = CacheValue>(key: string): Promise<Result<T | null, CacheError>> {
      const entry = getValidEntry(key)
      return ok(entry ? (entry.value as T) : null)
    },

    async set(key: string, value: CacheValue, options?: SetOptions): Promise<Result<void, CacheError>> {
      const existing = store.has(key)
      if (options?.nx && existing)
        return ok(undefined)
      if (options?.xx && !existing)
        return ok(undefined)

      const currentEntry = store.get(key)
      const expiresAt = options?.keepTtl && currentEntry ? currentEntry.expiresAt : calculateExpiry(options)
      store.set(key, { value, expiresAt })
      return ok(undefined)
    },

    async del(...keys: string[]): Promise<Result<number, CacheError>> {
      let count = 0
      for (const key of keys) {
        if (store.delete(key))
          count++
        hashStore.delete(key)
        listStore.delete(key)
        setStore.delete(key)
        zsetStore.delete(key)
      }
      return ok(count)
    },

    async exists(...keys: string[]): Promise<Result<number, CacheError>> {
      let count = 0
      for (const key of keys) {
        if (getValidEntry(key))
          count++
      }
      return ok(count)
    },

    async expire(key: string, seconds: number): Promise<Result<boolean, CacheError>> {
      const entry = getValidEntry(key)
      if (!entry)
        return ok(false)
      entry.expiresAt = Date.now() + seconds * 1000
      return ok(true)
    },

    async expireAt(key: string, timestamp: number): Promise<Result<boolean, CacheError>> {
      const entry = getValidEntry(key)
      if (!entry)
        return ok(false)
      entry.expiresAt = timestamp * 1000
      return ok(true)
    },

    async ttl(key: string): Promise<Result<number, CacheError>> {
      const entry = store.get(key)
      if (!entry)
        return ok(-2)
      if (!entry.expiresAt)
        return ok(-1)
      if (isExpired(entry)) {
        store.delete(key)
        return ok(-2)
      }
      return ok(Math.ceil((entry.expiresAt - Date.now()) / 1000))
    },

    async persist(key: string): Promise<Result<boolean, CacheError>> {
      const entry = getValidEntry(key)
      if (!entry)
        return ok(false)
      delete entry.expiresAt
      return ok(true)
    },

    async incr(key: string): Promise<Result<number, CacheError>> {
      const entry = getValidEntry(key)
      const current = entry ? Number(entry.value) : 0
      if (Number.isNaN(current)) {
        return err(createError(CacheErrorCode.OPERATION_FAILED, cacheM('cache_valueNotNumber')))
      }
      const newValue = current + 1
      store.set(key, { value: newValue, expiresAt: entry?.expiresAt })
      return ok(newValue)
    },

    async incrBy(key: string, increment: number): Promise<Result<number, CacheError>> {
      const entry = getValidEntry(key)
      const current = entry ? Number(entry.value) : 0
      if (Number.isNaN(current)) {
        return err(createError(CacheErrorCode.OPERATION_FAILED, cacheM('cache_valueNotNumber')))
      }
      const newValue = current + increment
      store.set(key, { value: newValue, expiresAt: entry?.expiresAt })
      return ok(newValue)
    },

    async decr(key: string): Promise<Result<number, CacheError>> {
      return kv.incrBy(key, -1)
    },

    async decrBy(key: string, decrement: number): Promise<Result<number, CacheError>> {
      return kv.incrBy(key, -decrement)
    },

    async mget<T = CacheValue>(...keys: string[]): Promise<Result<(T | null)[], CacheError>> {
      const results: (T | null)[] = []
      for (const key of keys) {
        const entry = getValidEntry(key)
        results.push(entry ? (entry.value as T) : null)
      }
      return ok(results)
    },

    async mset(entries: Array<[string, CacheValue]>): Promise<Result<void, CacheError>> {
      for (const [key, value] of entries) {
        store.set(key, { value })
      }
      return ok(undefined)
    },

    async scan(cursor: number, options?: ScanOptions): Promise<Result<[number, string[]], CacheError>> {
      const allKeys = Array.from(store.keys()).filter((key) => {
        const entry = store.get(key)
        return entry && !isExpired(entry)
      })
      const pattern = options?.match?.replace(/\*/g, '.*').replace(/\?/g, '.')
      const filtered = pattern ? allKeys.filter(k => new RegExp(`^${pattern}$`).test(k)) : allKeys
      const count = options?.count || 10
      const start = cursor
      const end = Math.min(start + count, filtered.length)
      const keys = filtered.slice(start, end)
      const nextCursor = end >= filtered.length ? 0 : end
      return ok([nextCursor, keys])
    },

    async keys(pattern: string): Promise<Result<string[], CacheError>> {
      const regex = new RegExp(`^${pattern.replace(/\*/g, '.*').replace(/\?/g, '.')}$`)
      const result: string[] = []
      for (const [key] of store.entries()) {
        if (regex.test(key) && getValidEntry(key)) {
          result.push(key)
        }
      }
      return ok(result)
    },

    async type(key: string): Promise<Result<string, CacheError>> {
      if (getValidEntry(key))
        return ok('string')
      if (hashStore.has(key))
        return ok('hash')
      if (listStore.has(key))
        return ok('list')
      if (setStore.has(key))
        return ok('set')
      if (zsetStore.has(key))
        return ok('zset')
      return ok('none')
    },
  }

  // ─── Hash 操作 ───

  const hash: HashOperations = {
    async hget<T = CacheValue>(key: string, field: string): Promise<Result<T | null, CacheError>> {
      const map = hashStore.get(key)
      if (!map)
        return ok(null)
      const val = map.get(field)
      return ok(val !== undefined ? (deserializeValue(val) as T) : null)
    },

    hset: (async (key: string, fieldOrData: string | Record<string, CacheValue>, value?: CacheValue): Promise<Result<number, CacheError>> => {
      let map = hashStore.get(key)
      if (!map) {
        map = new Map()
        hashStore.set(key, map)
      }
      if (typeof fieldOrData === 'string') {
        const existed = map.has(fieldOrData)
        map.set(fieldOrData, serializeValue(value!))
        return ok(existed ? 0 : 1)
      }
      let count = 0
      for (const [f, v] of Object.entries(fieldOrData)) {
        if (!map.has(f))
          count++
        map.set(f, serializeValue(v))
      }
      return ok(count)
    }) as HashOperations['hset'],

    async hdel(key: string, ...fields: string[]): Promise<Result<number, CacheError>> {
      const map = hashStore.get(key)
      if (!map)
        return ok(0)
      let count = 0
      for (const field of fields) {
        if (map.delete(field))
          count++
      }
      return ok(count)
    },

    async hexists(key: string, field: string): Promise<Result<boolean, CacheError>> {
      const map = hashStore.get(key)
      return ok(map?.has(field) ?? false)
    },

    async hgetall<T = Record<string, CacheValue>>(key: string): Promise<Result<T, CacheError>> {
      const map = hashStore.get(key)
      if (!map)
        return ok({} as T)
      const result: Record<string, CacheValue> = {}
      for (const [f, v] of map.entries()) {
        result[f] = deserializeValue(v)
      }
      return ok(result as T)
    },

    async hkeys(key: string): Promise<Result<string[], CacheError>> {
      const map = hashStore.get(key)
      return ok(map ? Array.from(map.keys()) : [])
    },

    async hvals<T = CacheValue>(key: string): Promise<Result<T[], CacheError>> {
      const map = hashStore.get(key)
      if (!map)
        return ok([])
      return ok(Array.from(map.values()).map(v => deserializeValue(v) as T))
    },

    async hlen(key: string): Promise<Result<number, CacheError>> {
      const map = hashStore.get(key)
      return ok(map?.size ?? 0)
    },

    async hmget<T = CacheValue>(key: string, ...fields: string[]): Promise<Result<(T | null)[], CacheError>> {
      const map = hashStore.get(key)
      const results: (T | null)[] = fields.map((field) => {
        const val = map?.get(field)
        return val !== undefined ? (deserializeValue(val) as T) : null
      })
      return ok(results)
    },

    async hincrBy(key: string, field: string, increment: number): Promise<Result<number, CacheError>> {
      let map = hashStore.get(key)
      if (!map) {
        map = new Map()
        hashStore.set(key, map)
      }
      const current = map.has(field) ? Number(deserializeValue(map.get(field)!)) : 0
      const newValue = current + increment
      map.set(field, serializeValue(newValue))
      return ok(newValue)
    },
  }

  // ─── List 操作 ───

  const list: ListOperations = {
    async lpush(key: string, ...values: CacheValue[]): Promise<Result<number, CacheError>> {
      let arr = listStore.get(key)
      if (!arr) {
        arr = []
        listStore.set(key, arr)
      }
      arr.unshift(...values.map(serializeValue))
      return ok(arr.length)
    },

    async rpush(key: string, ...values: CacheValue[]): Promise<Result<number, CacheError>> {
      let arr = listStore.get(key)
      if (!arr) {
        arr = []
        listStore.set(key, arr)
      }
      arr.push(...values.map(serializeValue))
      return ok(arr.length)
    },

    async lpop<T = CacheValue>(key: string): Promise<Result<T | null, CacheError>> {
      const arr = listStore.get(key)
      if (!arr || arr.length === 0)
        return ok(null)
      const val = arr.shift()!
      return ok(deserializeValue(val) as T)
    },

    async rpop<T = CacheValue>(key: string): Promise<Result<T | null, CacheError>> {
      const arr = listStore.get(key)
      if (!arr || arr.length === 0)
        return ok(null)
      const val = arr.pop()!
      return ok(deserializeValue(val) as T)
    },

    async llen(key: string): Promise<Result<number, CacheError>> {
      const arr = listStore.get(key)
      return ok(arr?.length ?? 0)
    },

    async lrange<T = CacheValue>(key: string, start: number, stop: number): Promise<Result<T[], CacheError>> {
      const arr = listStore.get(key)
      if (!arr)
        return ok([])
      const len = arr.length
      const s = start < 0 ? Math.max(len + start, 0) : start
      const e = stop < 0 ? len + stop + 1 : stop + 1
      return ok(arr.slice(s, e).map(v => deserializeValue(v) as T))
    },

    async lindex<T = CacheValue>(key: string, index: number): Promise<Result<T | null, CacheError>> {
      const arr = listStore.get(key)
      if (!arr)
        return ok(null)
      const i = index < 0 ? arr.length + index : index
      const val = arr[i]
      return ok(val !== undefined ? (deserializeValue(val) as T) : null)
    },

    async lset(key: string, index: number, value: CacheValue): Promise<Result<void, CacheError>> {
      const arr = listStore.get(key)
      if (!arr) {
        return err(createError(CacheErrorCode.KEY_NOT_FOUND, cacheM('cache_keyNotFound')))
      }
      const i = index < 0 ? arr.length + index : index
      if (i < 0 || i >= arr.length) {
        return err(createError(CacheErrorCode.OPERATION_FAILED, cacheM('cache_indexOutOfRange')))
      }
      arr[i] = serializeValue(value)
      return ok(undefined)
    },

    async ltrim(key: string, start: number, stop: number): Promise<Result<void, CacheError>> {
      const arr = listStore.get(key)
      if (!arr)
        return ok(undefined)
      const len = arr.length
      const s = start < 0 ? Math.max(len + start, 0) : start
      const e = stop < 0 ? len + stop + 1 : stop + 1
      listStore.set(key, arr.slice(s, e))
      return ok(undefined)
    },

    /**
     * Memory 版本的 blpop 为“非阻塞模拟”：忽略 timeout，立即按 keys 顺序尝试弹出。
     */
    async blpop<T = CacheValue>(_timeout: number, ...keys: string[]): Promise<Result<[string, T] | null, CacheError>> {
      for (const key of keys) {
        const arr = listStore.get(key)
        if (arr && arr.length > 0) {
          const val = arr.shift()!
          return ok([key, deserializeValue(val) as T])
        }
      }
      return ok(null)
    },

    /**
     * Memory 版本的 brpop 为“非阻塞模拟”：忽略 timeout，立即按 keys 顺序尝试弹出。
     */
    async brpop<T = CacheValue>(_timeout: number, ...keys: string[]): Promise<Result<[string, T] | null, CacheError>> {
      for (const key of keys) {
        const arr = listStore.get(key)
        if (arr && arr.length > 0) {
          const val = arr.pop()!
          return ok([key, deserializeValue(val) as T])
        }
      }
      return ok(null)
    },
  }

  // ─── Set 操作 ───

  const set_: SetOperations = {
    async sadd(key: string, ...members: CacheValue[]): Promise<Result<number, CacheError>> {
      let s = setStore.get(key)
      if (!s) {
        s = new Set()
        setStore.set(key, s)
      }
      let count = 0
      for (const member of members) {
        const str = serializeValue(member)
        if (!s.has(str)) {
          s.add(str)
          count++
        }
      }
      return ok(count)
    },

    async srem(key: string, ...members: CacheValue[]): Promise<Result<number, CacheError>> {
      const s = setStore.get(key)
      if (!s)
        return ok(0)
      let count = 0
      for (const member of members) {
        if (s.delete(serializeValue(member)))
          count++
      }
      return ok(count)
    },

    async smembers<T = CacheValue>(key: string): Promise<Result<T[], CacheError>> {
      const s = setStore.get(key)
      if (!s)
        return ok([])
      return ok(Array.from(s).map(v => deserializeValue(v) as T))
    },

    async sismember(key: string, member: CacheValue): Promise<Result<boolean, CacheError>> {
      const s = setStore.get(key)
      return ok(s?.has(serializeValue(member)) ?? false)
    },

    async scard(key: string): Promise<Result<number, CacheError>> {
      const s = setStore.get(key)
      return ok(s?.size ?? 0)
    },

    async srandmember<T = CacheValue>(key: string, count?: number): Promise<Result<T | T[] | null, CacheError>> {
      const s = setStore.get(key)
      if (!s || s.size === 0)
        return ok(null)
      const arr = Array.from(s)
      if (count === undefined) {
        const idx = Math.floor(Math.random() * arr.length)
        return ok(deserializeValue(arr[idx]) as T)
      }
      const result: T[] = []
      for (let i = 0; i < Math.min(Math.abs(count), arr.length); i++) {
        const idx = Math.floor(Math.random() * arr.length)
        result.push(deserializeValue(arr[idx]) as T)
      }
      return ok(result)
    },

    async spop<T = CacheValue>(key: string, count?: number): Promise<Result<T | T[] | null, CacheError>> {
      const s = setStore.get(key)
      if (!s || s.size === 0)
        return ok(null)
      const arr = Array.from(s)
      if (count === undefined) {
        const idx = Math.floor(Math.random() * arr.length)
        const val = arr[idx]
        s.delete(val)
        return ok(deserializeValue(val) as T)
      }
      const result: T[] = []
      for (let i = 0; i < Math.min(count, arr.length); i++) {
        const idx = Math.floor(Math.random() * arr.length)
        const val = arr.splice(idx, 1)[0]
        s.delete(val)
        result.push(deserializeValue(val) as T)
      }
      return ok(result)
    },

    async sinter<T = CacheValue>(...keys: string[]): Promise<Result<T[], CacheError>> {
      if (keys.length === 0)
        return ok([])
      const sets = keys.map(k => setStore.get(k))
      if (sets.some(s => !s))
        return ok([])
      const [first, ...rest] = sets as Set<string>[]
      const result = Array.from(first).filter(v => rest.every(s => s.has(v)))
      return ok(result.map(v => deserializeValue(v) as T))
    },

    async sunion<T = CacheValue>(...keys: string[]): Promise<Result<T[], CacheError>> {
      const union = new Set<string>()
      for (const key of keys) {
        const s = setStore.get(key)
        if (s) {
          for (const v of s) union.add(v)
        }
      }
      return ok(Array.from(union).map(v => deserializeValue(v) as T))
    },

    async sdiff<T = CacheValue>(...keys: string[]): Promise<Result<T[], CacheError>> {
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
    async zadd(key: string, ...members: ZMember[]): Promise<Result<number, CacheError>> {
      let map = zsetStore.get(key)
      if (!map) {
        map = new Map()
        zsetStore.set(key, map)
      }
      let count = 0
      for (const { score, member } of members) {
        if (!map.has(member))
          count++
        map.set(member, score)
      }
      return ok(count)
    },

    async zrem(key: string, ...members: string[]): Promise<Result<number, CacheError>> {
      const map = zsetStore.get(key)
      if (!map)
        return ok(0)
      let count = 0
      for (const member of members) {
        if (map.delete(member))
          count++
      }
      return ok(count)
    },

    async zscore(key: string, member: string): Promise<Result<number | null, CacheError>> {
      const map = zsetStore.get(key)
      const score = map?.get(member)
      return ok(score !== undefined ? score : null)
    },

    async zrank(key: string, member: string): Promise<Result<number | null, CacheError>> {
      const map = zsetStore.get(key)
      if (!map || !map.has(member))
        return ok(null)
      const sorted = Array.from(map.entries()).sort((a, b) => a[1] - b[1])
      const idx = sorted.findIndex(([m]) => m === member)
      return ok(idx >= 0 ? idx : null)
    },

    async zrevrank(key: string, member: string): Promise<Result<number | null, CacheError>> {
      const map = zsetStore.get(key)
      if (!map || !map.has(member))
        return ok(null)
      const sorted = Array.from(map.entries()).sort((a, b) => b[1] - a[1])
      const idx = sorted.findIndex(([m]) => m === member)
      return ok(idx >= 0 ? idx : null)
    },

    async zrange(key: string, start: number, stop: number, withScores?: boolean): Promise<Result<string[] | ZMember[], CacheError>> {
      const map = zsetStore.get(key)
      if (!map)
        return ok([])
      const sorted = Array.from(map.entries()).sort((a, b) => a[1] - b[1])
      const len = sorted.length
      const s = start < 0 ? Math.max(len + start, 0) : start
      const e = stop < 0 ? len + stop + 1 : stop + 1
      const slice = sorted.slice(s, e)
      if (withScores) {
        return ok(slice.map(([member, score]) => ({ member, score })))
      }
      return ok(slice.map(([member]) => member))
    },

    async zrevrange(key: string, start: number, stop: number, withScores?: boolean): Promise<Result<string[] | ZMember[], CacheError>> {
      const map = zsetStore.get(key)
      if (!map)
        return ok([])
      const sorted = Array.from(map.entries()).sort((a, b) => b[1] - a[1])
      const len = sorted.length
      const s = start < 0 ? Math.max(len + start, 0) : start
      const e = stop < 0 ? len + stop + 1 : stop + 1
      const slice = sorted.slice(s, e)
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
    ): Promise<Result<string[] | ZMember[], CacheError>> {
      const map = zsetStore.get(key)
      if (!map)
        return ok([])
      const minVal = min === '-inf' ? Number.NEGATIVE_INFINITY : Number(min)
      const maxVal = max === '+inf' ? Number.POSITIVE_INFINITY : Number(max)
      let sorted = Array.from(map.entries())
        .filter(([, score]) => score >= minVal && score <= maxVal)
        .sort((a, b) => a[1] - b[1])
      if (options?.offset !== undefined || options?.count !== undefined) {
        const offset = options.offset ?? 0
        const count = options.count ?? sorted.length
        sorted = sorted.slice(offset, offset + count)
      }
      if (options?.withScores) {
        return ok(sorted.map(([member, score]) => ({ member, score })))
      }
      return ok(sorted.map(([member]) => member))
    },

    async zcard(key: string): Promise<Result<number, CacheError>> {
      const map = zsetStore.get(key)
      return ok(map?.size ?? 0)
    },

    async zcount(key: string, min: number | string, max: number | string): Promise<Result<number, CacheError>> {
      const map = zsetStore.get(key)
      if (!map)
        return ok(0)
      const minVal = min === '-inf' ? Number.NEGATIVE_INFINITY : Number(min)
      const maxVal = max === '+inf' ? Number.POSITIVE_INFINITY : Number(max)
      let count = 0
      for (const score of map.values()) {
        if (score >= minVal && score <= maxVal)
          count++
      }
      return ok(count)
    },

    async zincrBy(key: string, increment: number, member: string): Promise<Result<number, CacheError>> {
      let map = zsetStore.get(key)
      if (!map) {
        map = new Map()
        zsetStore.set(key, map)
      }
      const current = map.get(member) ?? 0
      const newScore = current + increment
      map.set(member, newScore)
      return ok(newScore)
    },

    async zremRangeByRank(key: string, start: number, stop: number): Promise<Result<number, CacheError>> {
      const map = zsetStore.get(key)
      if (!map)
        return ok(0)
      const sorted = Array.from(map.entries()).sort((a, b) => a[1] - b[1])
      const len = sorted.length
      const s = start < 0 ? Math.max(len + start, 0) : start
      const e = stop < 0 ? len + stop + 1 : stop + 1
      const toRemove = sorted.slice(s, e)
      for (const [member] of toRemove) {
        map.delete(member)
      }
      return ok(toRemove.length)
    },

    async zremRangeByScore(key: string, min: number | string, max: number | string): Promise<Result<number, CacheError>> {
      const map = zsetStore.get(key)
      if (!map)
        return ok(0)
      const minVal = min === '-inf' ? Number.NEGATIVE_INFINITY : Number(min)
      const maxVal = max === '+inf' ? Number.POSITIVE_INFINITY : Number(max)
      let count = 0
      for (const [member, score] of map.entries()) {
        if (score >= minVal && score <= maxVal) {
          map.delete(member)
          count++
        }
      }
      return ok(count)
    },
  }

  // ─── Provider 返回 ───

  return {
    name: 'memory',

    async connect(_config: CacheConfig): Promise<Result<void, CacheError>> {
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
      connected = false
    },

    isConnected: () => connected,

    kv,
    hash,
    list,
    set_,
    zset,

    async ping(): Promise<Result<string, CacheError>> {
      return ok('PONG')
    },
  }
}
