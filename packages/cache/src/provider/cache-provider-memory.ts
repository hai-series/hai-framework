/**
 * =============================================================================
 * @hai/cache - Memory Provider
 * =============================================================================
 *
 * 基于 Map 的内存缓存实现。
 *
 * Memory 特点：
 * - 无需外部依赖
 * - 仅适用于单进程场景
 * - 数据不持久化
 * - 适合开发和测试环境
 *
 * @module cache-provider-memory
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type { CacheConfig, CacheErrorCodeType } from '../cache-config.js'
import type {
  CacheError,
  CacheProvider,
  CacheValue,
  HashOperations,
  ListOperations,
  ScanOptions,
  SetOperations,
  SetOptions,
  ZMember,
  ZSetOperations,
} from '../cache-types.js'
import { err, ok } from '@hai/core'
import { CacheErrorCode } from '../cache-config.js'
import { cacheM } from '../cache-i18n.js'

// =============================================================================
// 内部类型
// =============================================================================

interface CacheEntry {
  value: CacheValue
  expiresAt?: number
}

// =============================================================================
// 辅助函数
// =============================================================================

/**
 * 创建缓存错误对象
 * @param code - 错误码
 * @param message - 错误文案
 * @returns CacheError
 * @example
 * ```ts
 * const error = createError(CacheErrorCode.OPERATION_FAILED, 'failed')
 * ```
 */
function createError(code: CacheErrorCodeType, message: string): CacheError {
  return { code, message }
}

/**
 * 序列化值为字符串
 * @param value - 缓存值
 * @returns 序列化后的字符串
 * @example
 * ```ts
 * const raw = serializeValue({ a: 1 })
 * ```
 */
function serializeValue(value: CacheValue): string {
  return JSON.stringify(value)
}

/**
 * 反序列化字符串为值
 * @param str - 序列化字符串
 * @returns 反序列化后的值
 * @example
 * ```ts
 * const value = deserializeValue('{"a":1}')
 * ```
 */
function deserializeValue(str: string): CacheValue {
  return JSON.parse(str)
}

// =============================================================================
// Memory Provider 实现
// =============================================================================

/**
 * 创建 Memory Provider 实例
 * @returns Memory Provider
 * @example
 * ```ts
 * const provider = createMemoryProvider()
 * ```
 */
export function createMemoryProvider(): CacheProvider {
  const store = new Map<string, CacheEntry>()
  const hashStore = new Map<string, Map<string, string>>()
  const listStore = new Map<string, string[]>()
  const setStore = new Map<string, Set<string>>()
  const zsetStore = new Map<string, Map<string, number>>()

  let initialized = false
  let cleanupTimer: ReturnType<typeof setInterval> | null = null

  /**
   * 判断缓存项是否过期
   * @param entry - 缓存项
   * @returns 是否过期
   * @example
   * ```ts
   * const expired = isExpired({ value: 1, expiresAt: Date.now() - 1 })
   * ```
   */
  function isExpired(entry: CacheEntry): boolean {
    return entry.expiresAt != null && Date.now() > entry.expiresAt
  }

  /**
   * 清理过期数据
   * @example
   * ```ts
   * cleanup()
   * ```
   */
  function cleanup(): void {
    const now = Date.now()
    for (const [key, entry] of store.entries()) {
      if (entry.expiresAt && entry.expiresAt < now) {
        store.delete(key)
      }
    }
  }

  /**
   * 获取有效缓存项（过期则清理）
   * @param key - 键名
   * @returns 缓存项或 null
   * @example
   * ```ts
   * const entry = getValidEntry('key')
   * ```
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
   * 计算过期时间戳
   * @param options - 设置选项
   * @returns 过期时间戳（毫秒）或 undefined
   * @example
   * ```ts
   * const expiresAt = calculateExpiry({ ex: 60 })
   * ```
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

  // =========================================================================
  // 基础操作
  // =========================================================================

  const get: CacheProvider['get'] = async <T = CacheValue>(key: string): Promise<Result<T | null, CacheError>> => {
    const entry = getValidEntry(key)
    return ok(entry ? (entry.value as T) : null)
  }

  const set: CacheProvider['set'] = async (key: string, value: CacheValue, options?: SetOptions): Promise<Result<void, CacheError>> => {
    const existing = store.has(key)
    if (options?.nx && existing)
      return ok(undefined)
    if (options?.xx && !existing)
      return ok(undefined)

    const currentEntry = store.get(key)
    const expiresAt = options?.keepTtl && currentEntry ? currentEntry.expiresAt : calculateExpiry(options)

    store.set(key, { value, expiresAt })
    return ok(undefined)
  }

  const del: CacheProvider['del'] = async (...keys: string[]): Promise<Result<number, CacheError>> => {
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
  }

  const exists: CacheProvider['exists'] = async (...keys: string[]): Promise<Result<number, CacheError>> => {
    let count = 0
    for (const key of keys) {
      if (getValidEntry(key))
        count++
    }
    return ok(count)
  }

  const expire: CacheProvider['expire'] = async (key: string, seconds: number): Promise<Result<boolean, CacheError>> => {
    const entry = getValidEntry(key)
    if (!entry)
      return ok(false)
    entry.expiresAt = Date.now() + seconds * 1000
    return ok(true)
  }

  const expireAt: CacheProvider['expireAt'] = async (key: string, timestamp: number): Promise<Result<boolean, CacheError>> => {
    const entry = getValidEntry(key)
    if (!entry)
      return ok(false)
    entry.expiresAt = timestamp * 1000
    return ok(true)
  }

  const ttl: CacheProvider['ttl'] = async (key: string): Promise<Result<number, CacheError>> => {
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
  }

  const persist: CacheProvider['persist'] = async (key: string): Promise<Result<boolean, CacheError>> => {
    const entry = getValidEntry(key)
    if (!entry)
      return ok(false)
    delete entry.expiresAt
    return ok(true)
  }

  const incr: CacheProvider['incr'] = async (key: string): Promise<Result<number, CacheError>> => {
    const entry = getValidEntry(key)
    const current = entry ? Number(entry.value) : 0
    if (Number.isNaN(current)) {
      return err(createError(CacheErrorCode.OPERATION_FAILED, cacheM('cache_valueNotNumber')))
    }
    const newValue = current + 1
    store.set(key, { value: newValue, expiresAt: entry?.expiresAt })
    return ok(newValue)
  }

  const incrBy: CacheProvider['incrBy'] = async (key: string, increment: number): Promise<Result<number, CacheError>> => {
    const entry = getValidEntry(key)
    const current = entry ? Number(entry.value) : 0
    if (Number.isNaN(current)) {
      return err(createError(CacheErrorCode.OPERATION_FAILED, cacheM('cache_valueNotNumber')))
    }
    const newValue = current + increment
    store.set(key, { value: newValue, expiresAt: entry?.expiresAt })
    return ok(newValue)
  }

  const decr: CacheProvider['decr'] = async (key: string): Promise<Result<number, CacheError>> => {
    return incrBy(key, -1)
  }

  const decrBy: CacheProvider['decrBy'] = async (key: string, decrement: number): Promise<Result<number, CacheError>> => {
    return incrBy(key, -decrement)
  }

  const mget: CacheProvider['mget'] = async <T = CacheValue>(...keys: string[]): Promise<Result<(T | null)[], CacheError>> => {
    const results: (T | null)[] = []
    for (const key of keys) {
      const entry = getValidEntry(key)
      results.push(entry ? (entry.value as T) : null)
    }
    return ok(results)
  }

  const mset: CacheProvider['mset'] = async (entries: Array<[string, CacheValue]>): Promise<Result<void, CacheError>> => {
    for (const [key, value] of entries) {
      store.set(key, { value })
    }
    return ok(undefined)
  }

  const scan: CacheProvider['scan'] = async (cursor: number, options?: ScanOptions): Promise<Result<[number, string[]], CacheError>> => {
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
  }

  const keys: CacheProvider['keys'] = async (pattern: string): Promise<Result<string[], CacheError>> => {
    const regex = new RegExp(`^${pattern.replace(/\*/g, '.*').replace(/\?/g, '.')}$`)
    const result: string[] = []
    for (const [key] of store.entries()) {
      if (regex.test(key) && getValidEntry(key)) {
        result.push(key)
      }
    }
    return ok(result)
  }

  const type: CacheProvider['type'] = async (key: string): Promise<Result<string, CacheError>> => {
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
  }

  // =========================================================================
  // Hash 操作
  // =========================================================================

  const hash: HashOperations = {
    hget: async <T = CacheValue>(key: string, field: string): Promise<Result<T | null, CacheError>> => {
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
      else {
        let count = 0
        for (const [f, v] of Object.entries(fieldOrData)) {
          if (!map.has(f))
            count++
          map.set(f, serializeValue(v))
        }
        return ok(count)
      }
    }) as HashOperations['hset'],

    hdel: async (key: string, ...fields: string[]): Promise<Result<number, CacheError>> => {
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

    hexists: async (key: string, field: string): Promise<Result<boolean, CacheError>> => {
      const map = hashStore.get(key)
      return ok(map?.has(field) ?? false)
    },

    hgetall: async <T = Record<string, CacheValue>>(key: string): Promise<Result<T, CacheError>> => {
      const map = hashStore.get(key)
      if (!map)
        return ok({} as T)
      const result: Record<string, CacheValue> = {}
      for (const [f, v] of map.entries()) {
        result[f] = deserializeValue(v)
      }
      return ok(result as T)
    },

    hkeys: async (key: string): Promise<Result<string[], CacheError>> => {
      const map = hashStore.get(key)
      return ok(map ? Array.from(map.keys()) : [])
    },

    hvals: async <T = CacheValue>(key: string): Promise<Result<T[], CacheError>> => {
      const map = hashStore.get(key)
      if (!map)
        return ok([])
      return ok(Array.from(map.values()).map(v => deserializeValue(v) as T))
    },

    hlen: async (key: string): Promise<Result<number, CacheError>> => {
      const map = hashStore.get(key)
      return ok(map?.size ?? 0)
    },

    hmget: async <T = CacheValue>(key: string, ...fields: string[]): Promise<Result<(T | null)[], CacheError>> => {
      const map = hashStore.get(key)
      const results: (T | null)[] = fields.map((field) => {
        const val = map?.get(field)
        return val !== undefined ? (deserializeValue(val) as T) : null
      })
      return ok(results)
    },

    hincrBy: async (key: string, field: string, increment: number): Promise<Result<number, CacheError>> => {
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

  // =========================================================================
  // List 操作
  // =========================================================================

  const list: ListOperations = {
    lpush: async (key: string, ...values: CacheValue[]): Promise<Result<number, CacheError>> => {
      let arr = listStore.get(key)
      if (!arr) {
        arr = []
        listStore.set(key, arr)
      }
      arr.unshift(...values.map(serializeValue))
      return ok(arr.length)
    },

    rpush: async (key: string, ...values: CacheValue[]): Promise<Result<number, CacheError>> => {
      let arr = listStore.get(key)
      if (!arr) {
        arr = []
        listStore.set(key, arr)
      }
      arr.push(...values.map(serializeValue))
      return ok(arr.length)
    },

    lpop: async <T = CacheValue>(key: string): Promise<Result<T | null, CacheError>> => {
      const arr = listStore.get(key)
      if (!arr || arr.length === 0)
        return ok(null)
      const val = arr.shift()!
      return ok(deserializeValue(val) as T)
    },

    rpop: async <T = CacheValue>(key: string): Promise<Result<T | null, CacheError>> => {
      const arr = listStore.get(key)
      if (!arr || arr.length === 0)
        return ok(null)
      const val = arr.pop()!
      return ok(deserializeValue(val) as T)
    },

    llen: async (key: string): Promise<Result<number, CacheError>> => {
      const arr = listStore.get(key)
      return ok(arr?.length ?? 0)
    },

    lrange: async <T = CacheValue>(key: string, start: number, stop: number): Promise<Result<T[], CacheError>> => {
      const arr = listStore.get(key)
      if (!arr)
        return ok([])
      const len = arr.length
      const s = start < 0 ? Math.max(len + start, 0) : start
      const e = stop < 0 ? len + stop + 1 : stop + 1
      return ok(arr.slice(s, e).map(v => deserializeValue(v) as T))
    },

    lindex: async <T = CacheValue>(key: string, index: number): Promise<Result<T | null, CacheError>> => {
      const arr = listStore.get(key)
      if (!arr)
        return ok(null)
      const i = index < 0 ? arr.length + index : index
      const val = arr[i]
      return ok(val !== undefined ? (deserializeValue(val) as T) : null)
    },

    lset: async (key: string, index: number, value: CacheValue): Promise<Result<void, CacheError>> => {
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

    ltrim: async (key: string, start: number, stop: number): Promise<Result<void, CacheError>> => {
      const arr = listStore.get(key)
      if (!arr)
        return ok(undefined)
      const len = arr.length
      const s = start < 0 ? Math.max(len + start, 0) : start
      const e = stop < 0 ? len + stop + 1 : stop + 1
      listStore.set(key, arr.slice(s, e))
      return ok(undefined)
    },

    blpop: async <T = CacheValue>(_timeout: number, ...keys: string[]): Promise<Result<[string, T] | null, CacheError>> => {
      for (const key of keys) {
        const arr = listStore.get(key)
        if (arr && arr.length > 0) {
          const val = arr.shift()!
          return ok([key, deserializeValue(val) as T])
        }
      }
      return ok(null)
    },

    brpop: async <T = CacheValue>(_timeout: number, ...keys: string[]): Promise<Result<[string, T] | null, CacheError>> => {
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

  // =========================================================================
  // Set 操作
  // =========================================================================

  const set_: SetOperations = {
    sadd: async (key: string, ...members: CacheValue[]): Promise<Result<number, CacheError>> => {
      let set = setStore.get(key)
      if (!set) {
        set = new Set()
        setStore.set(key, set)
      }
      let count = 0
      for (const member of members) {
        const str = serializeValue(member)
        if (!set.has(str)) {
          set.add(str)
          count++
        }
      }
      return ok(count)
    },

    srem: async (key: string, ...members: CacheValue[]): Promise<Result<number, CacheError>> => {
      const set = setStore.get(key)
      if (!set)
        return ok(0)
      let count = 0
      for (const member of members) {
        if (set.delete(serializeValue(member)))
          count++
      }
      return ok(count)
    },

    smembers: async <T = CacheValue>(key: string): Promise<Result<T[], CacheError>> => {
      const set = setStore.get(key)
      if (!set)
        return ok([])
      return ok(Array.from(set).map(v => deserializeValue(v) as T))
    },

    sismember: async (key: string, member: CacheValue): Promise<Result<boolean, CacheError>> => {
      const set = setStore.get(key)
      return ok(set?.has(serializeValue(member)) ?? false)
    },

    scard: async (key: string): Promise<Result<number, CacheError>> => {
      const set = setStore.get(key)
      return ok(set?.size ?? 0)
    },

    srandmember: async <T = CacheValue>(key: string, count?: number): Promise<Result<T | T[] | null, CacheError>> => {
      const set = setStore.get(key)
      if (!set || set.size === 0)
        return ok(null)
      const arr = Array.from(set)
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

    spop: async <T = CacheValue>(key: string, count?: number): Promise<Result<T | T[] | null, CacheError>> => {
      const set = setStore.get(key)
      if (!set || set.size === 0)
        return ok(null)
      const arr = Array.from(set)
      if (count === undefined) {
        const idx = Math.floor(Math.random() * arr.length)
        const val = arr[idx]
        set.delete(val)
        return ok(deserializeValue(val) as T)
      }
      const result: T[] = []
      for (let i = 0; i < Math.min(count, arr.length); i++) {
        const idx = Math.floor(Math.random() * arr.length)
        const val = arr.splice(idx, 1)[0]
        set.delete(val)
        result.push(deserializeValue(val) as T)
      }
      return ok(result)
    },

    sinter: async <T = CacheValue>(...keys: string[]): Promise<Result<T[], CacheError>> => {
      if (keys.length === 0)
        return ok([])
      const sets = keys.map(k => setStore.get(k))
      if (sets.some(s => !s))
        return ok([])
      const [first, ...rest] = sets as Set<string>[]
      const result = Array.from(first).filter(v => rest.every(s => s.has(v)))
      return ok(result.map(v => deserializeValue(v) as T))
    },

    sunion: async <T = CacheValue>(...keys: string[]): Promise<Result<T[], CacheError>> => {
      const union = new Set<string>()
      for (const key of keys) {
        const set = setStore.get(key)
        if (set) {
          for (const v of set)
            union.add(v)
        }
      }
      return ok(Array.from(union).map(v => deserializeValue(v) as T))
    },

    sdiff: async <T = CacheValue>(...keys: string[]): Promise<Result<T[], CacheError>> => {
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

  // =========================================================================
  // ZSet 操作
  // =========================================================================

  const zset: ZSetOperations = {
    zadd: async (key: string, ...members: ZMember[]): Promise<Result<number, CacheError>> => {
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

    zrem: async (key: string, ...members: string[]): Promise<Result<number, CacheError>> => {
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

    zscore: async (key: string, member: string): Promise<Result<number | null, CacheError>> => {
      const map = zsetStore.get(key)
      const score = map?.get(member)
      return ok(score !== undefined ? score : null)
    },

    zrank: async (key: string, member: string): Promise<Result<number | null, CacheError>> => {
      const map = zsetStore.get(key)
      if (!map || !map.has(member))
        return ok(null)
      const sorted = Array.from(map.entries()).sort((a, b) => a[1] - b[1])
      const idx = sorted.findIndex(([m]) => m === member)
      return ok(idx >= 0 ? idx : null)
    },

    zrevrank: async (key: string, member: string): Promise<Result<number | null, CacheError>> => {
      const map = zsetStore.get(key)
      if (!map || !map.has(member))
        return ok(null)
      const sorted = Array.from(map.entries()).sort((a, b) => b[1] - a[1])
      const idx = sorted.findIndex(([m]) => m === member)
      return ok(idx >= 0 ? idx : null)
    },

    zrange: async (key: string, start: number, stop: number, withScores?: boolean): Promise<Result<string[] | ZMember[], CacheError>> => {
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

    zrevrange: async (key: string, start: number, stop: number, withScores?: boolean): Promise<Result<string[] | ZMember[], CacheError>> => {
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

    zrangeByScore: async (
      key: string,
      min: number | string,
      max: number | string,
      options?: { withScores?: boolean, offset?: number, count?: number },
    ): Promise<Result<string[] | ZMember[], CacheError>> => {
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

    zcard: async (key: string): Promise<Result<number, CacheError>> => {
      const map = zsetStore.get(key)
      return ok(map?.size ?? 0)
    },

    zcount: async (key: string, min: number | string, max: number | string): Promise<Result<number, CacheError>> => {
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

    zincrBy: async (key: string, increment: number, member: string): Promise<Result<number, CacheError>> => {
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

    zremRangeByRank: async (key: string, start: number, stop: number): Promise<Result<number, CacheError>> => {
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

    zremRangeByScore: async (key: string, min: number | string, max: number | string): Promise<Result<number, CacheError>> => {
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

  // =========================================================================
  // Provider 生命周期
  // =========================================================================

  const init: CacheProvider['init'] = async (_config: CacheConfig): Promise<Result<void, CacheError>> => {
    if (initialized)
      return ok(undefined)
    cleanupTimer = setInterval(cleanup, 60000)
    initialized = true
    return ok(undefined)
  }

  const close: CacheProvider['close'] = async (): Promise<void> => {
    if (cleanupTimer) {
      clearInterval(cleanupTimer)
      cleanupTimer = null
    }
    store.clear()
    hashStore.clear()
    listStore.clear()
    setStore.clear()
    zsetStore.clear()
    initialized = false
  }

  const ping: CacheProvider['ping'] = async (): Promise<Result<string, CacheError>> => {
    return ok('PONG')
  }

  return {
    // 基础操作
    get,
    set,
    del,
    exists,
    expire,
    expireAt,
    ttl,
    persist,
    incr,
    incrBy,
    decr,
    decrBy,
    mget,
    mset,
    scan,
    keys,
    type,
    // 复合操作
    hash,
    list,
    set_,
    zset,
    // 生命周期
    init,
    close,
    ping,
  }
}
