/**
 * @h-ai/cache — Redis Provider
 *
 * 基于 ioredis 的 Redis/Cluster 缓存实现。
 * @module cache-provider-redis
 */

import type { HaiResult } from '@h-ai/core'
import type { Cluster, ClusterOptions, RedisOptions } from 'ioredis'
import type { CacheConfig } from '../cache-config.js'
import type { CacheProvider, CacheValue, HashOperations, KvOperations, ListOperations, LockOperations, LockOptions, ScanOptions, SetOperations, SetOptions, ZMember, ZSetOperations } from '../cache-types.js'

import { core, err, ok } from '@h-ai/core'
import Redis from 'ioredis'
import { cacheM } from '../cache-i18n.js'
import { HaiCacheError } from '../cache-types.js'
import { RedisScanError, scanRedisKeys } from './cache-redis-scan.js'

const logger = core.logger.child({ module: 'cache', scope: 'redis' })

/** 单键 CAS；比较、删除/替换和 TTL 在同一脚本内提交，不受租约过期影响。 */
const COMPARE_AND_SWAP_SCRIPT = `
  local current = redis.call('get', KEYS[1])
  if ARGV[1] == 'missing' then
    if current then return 0 end
  elseif current ~= ARGV[2] then return 0 end
  if ARGV[3] == 'delete' then
    redis.call('del', KEYS[1])
  elseif ARGV[5] == 'keep' then
    redis.call('set', KEYS[1], ARGV[4], 'KEEPTTL')
  elseif ARGV[5] == 'px' then
    redis.call('set', KEYS[1], ARGV[4], 'PX', ARGV[6])
  else
    redis.call('set', KEYS[1], ARGV[4])
  end
  return 1
`

// ─── Lua 脚本常量（分布式锁） ───

/** Lua 脚本：仅当 owner 匹配时才删除锁（原子操作，防止误释放） */
const RELEASE_LOCK_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  else
    return 0
  end
`

/** Lua 脚本：仅当 owner 匹配时才续期锁（原子操作） */
const EXTEND_LOCK_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("expire", KEYS[1], ARGV[2])
  else
    return 0
  end
`

// ─── Redis Provider ───

/**
 * 创建 Redis Provider 实例
 *
 * 基于 ioredis 实现，支持单机 / 集群 / 哨兵 / URL 四种连接模式。
 * 连接优先级：url > cluster > sentinel > host。
 * 值序列化规则：string 直接存储，其它类型经 JSON.stringify。
 *
 * @returns CacheProvider 实例
 */
export function createRedisProvider(): CacheProvider {
  /** ioredis 客户端实例；connect 后赋值，close 后置 null */
  let client: Redis | Cluster | null = null
  let ready = false
  let closing: Promise<void> | null = null

  /** 停止接收业务操作；QUIT 失败时强制断开，只有实际释放成功才丢弃引用。 */
  function closeClient(): Promise<void> {
    const graceful = ready && client?.status === 'ready'
    ready = false
    if (closing)
      return closing
    const owned = client
    if (!owned)
      return Promise.resolve()
    closing = (async () => {
      try {
        if (graceful)
          await owned.quit()
      }
      catch (error) {
        logger.warn('Redis graceful shutdown failed; disconnecting client', { error })
      }
      owned.disconnect()
      client = null
    })().finally(() => { closing = null })
    return closing
  }

  // ─── 辅助函数 ───

  /**
   * 序列化值
   *
   * 所有类型（包括 string）统一经 JSON.stringify，确保 deserialize 时能还原原始类型。
   * 例：string '123' → '"123"'（反序列化回 string），number 123 → '123'（反序列化回 number）。
   */
  function serialize(value: CacheValue): string {
    return JSON.stringify(value)
  }

  /**
   * 反序列化值
   *
   * 尝试 JSON.parse；失败则返回原始字符串（兼容纯字符串存储场景）
   *
   * @param value - Redis 返回的字符串值或 null
   * @returns 解析后的值，或 null
   */
  function deserialize<T>(value: string): T
  function deserialize(value: null): null
  function deserialize<T>(value: string | null): T | null
  function deserialize<T>(value: string | null): T | null {
    if (value === null)
      return null
    try {
      return JSON.parse(value) as T
    }
    catch {
      return value as T
    }
  }

  /**
   * 包装 Redis 操作为 HaiResult 结果
   *
   * 统一处理未初始化检查和异常捕获：
   * - client 为 null → NOT_INITIALIZED
   * - 操作抛异常 → OPERATION_FAILED
   *
   * @param operation - 实际的 Redis 命令执行函数
   * @returns HaiResult 包装的操作结果
   */
  async function wrapOperation<T>(operation: () => Promise<T>): Promise<HaiResult<T>> {
    if (!ready || !client) {
      return err(
        HaiCacheError.NOT_INITIALIZED,
        cacheM('cache_notInitialized'),
      )
    }
    try {
      const result = await operation()
      return ok(result)
    }
    catch (error) {
      if (error instanceof RedisScanError) {
        return error.reason === 'topology'
          ? err(HaiCacheError.SCAN_TOPOLOGY_CHANGED, cacheM('cache_scanTopologyChanged'), error)
          : err(HaiCacheError.INVALID_SCAN, cacheM('cache_invalidScan'), error)
      }
      if (error instanceof Error && error.message.startsWith('CROSSSLOT'))
        return err(HaiCacheError.CROSS_SLOT, cacheM('cache_crossSlot'), error)
      return err(
        HaiCacheError.OPERATION_FAILED,
        cacheM('cache_operationFailed', { params: { error: error instanceof Error ? error.message : String(error) } }),
        error,
      )
    }
  }

  function isRedisOne(result: unknown): boolean {
    return result === 1 || result === '1'
  }

  /** Cluster 独立 key 操作有界并发；返回顺序与输入一致，不承诺跨 slot 快照/原子性。 */
  async function mapIndependentKeys<T>(keys: string[], operation: (key: string) => Promise<T>): Promise<T[]> {
    const values: T[] = []
    for (let offset = 0; offset < keys.length; offset += 64)
      values.push(...await Promise.all(keys.slice(offset, offset + 64).map(operation)))
    return values
  }

  // ─── KV 操作 ───

  const kv: KvOperations = {
    async compareAndSwap(key, expected, value, options) {
      return wrapOperation(async () => {
        if ((options?.px !== undefined && (!Number.isSafeInteger(options.px) || options.px <= 0)) || (options?.px !== undefined && options.keepTtl))
          throw new TypeError('Invalid compare-and-swap expiry')
        return isRedisOne(await client!.eval(COMPARE_AND_SWAP_SCRIPT, 1, key, expected === undefined ? 'missing' : 'value', expected === undefined ? '' : serialize(expected), value === undefined ? 'delete' : 'value', value === undefined ? '' : serialize(value), options?.keepTtl ? 'keep' : options?.px !== undefined ? 'px' : 'none', options?.px ?? 0))
      })
    },
    async get<T = CacheValue>(key: string): Promise<HaiResult<T | null>> {
      return wrapOperation(async () => {
        const value = await client!.get(key)
        return deserialize<T>(value)
      })
    },

    async set(key: string, value: CacheValue, options?: SetOptions): Promise<HaiResult<void>> {
      return wrapOperation(async () => {
        const args: (string | number)[] = [key, serialize(value)]
        if (options?.ex)
          args.push('EX', options.ex)
        else if (options?.px)
          args.push('PX', options.px)
        else if (options?.exat)
          args.push('EXAT', options.exat)
        else if (options?.pxat)
          args.push('PXAT', options.pxat)
        if (options?.nx)
          args.push('NX')
        else if (options?.xx)
          args.push('XX')
        if (options?.keepTtl)
          args.push('KEEPTTL')
        // ioredis SET 的 TypeScript 重载签名不支持动态参数拼装（EX/PX/NX/XX/KEEPTTL），需绕过类型检查
        await (client as unknown as { set: (...args: Array<string | number>) => Promise<unknown> }).set(...args)
      })
    },

    async del(...keys: string[]): Promise<HaiResult<number>> {
      return wrapOperation(async () => {
        if (keys.length === 0)
          return 0
        if (client instanceof Redis.Cluster)
          return (await mapIndependentKeys(keys, key => client!.del(key))).reduce((sum, value) => sum + value, 0)
        return client!.del(...keys)
      })
    },

    async exists(...keys: string[]): Promise<HaiResult<number>> {
      return wrapOperation(async () => {
        if (keys.length === 0)
          return 0
        if (client instanceof Redis.Cluster)
          return (await mapIndependentKeys(keys, key => client!.exists(key))).reduce((sum, value) => sum + value, 0)
        return client!.exists(...keys)
      })
    },

    async expire(key: string, seconds: number): Promise<HaiResult<boolean>> {
      return wrapOperation(async () => {
        const result = await client!.expire(key, seconds)
        return result === 1
      })
    },

    async expireAt(key: string, timestamp: number): Promise<HaiResult<boolean>> {
      return wrapOperation(async () => {
        const result = await client!.expireat(key, timestamp)
        return result === 1
      })
    },

    async ttl(key: string): Promise<HaiResult<number>> {
      return wrapOperation(() => client!.ttl(key))
    },

    async persist(key: string): Promise<HaiResult<boolean>> {
      return wrapOperation(async () => {
        const result = await client!.persist(key)
        return result === 1
      })
    },

    async incr(key: string): Promise<HaiResult<number>> {
      return wrapOperation(() => client!.incr(key))
    },

    async incrBy(key: string, increment: number): Promise<HaiResult<number>> {
      return wrapOperation(() => client!.incrby(key, increment))
    },

    async decr(key: string): Promise<HaiResult<number>> {
      return wrapOperation(() => client!.decr(key))
    },

    async decrBy(key: string, decrement: number): Promise<HaiResult<number>> {
      return wrapOperation(() => client!.decrby(key, decrement))
    },

    async mget<T = CacheValue>(...keys: string[]): Promise<HaiResult<(T | null)[]>> {
      return wrapOperation(async () => {
        const values = keys.length === 0
          ? []
          : client instanceof Redis.Cluster
            ? await mapIndependentKeys(keys, key => client!.get(key))
            : await client!.mget(...keys)
        return values.map(v => deserialize<T>(v))
      })
    },

    async mset(entries: Array<[string, CacheValue]>): Promise<HaiResult<void>> {
      return wrapOperation(async () => {
        if (entries.length === 0)
          return
        const args: string[] = []
        for (const [key, value] of entries) {
          args.push(key, serialize(value))
        }
        await client!.mset(...args)
      })
    },

    async scan(cursor: string, options?: ScanOptions): Promise<HaiResult<[string, string[]]>> {
      return wrapOperation(() => scanRedisKeys(client!, cursor, options))
    },

    async keys(pattern: string): Promise<HaiResult<string[]>> {
      return wrapOperation(async () => {
        let cursor = '0'
        const keys = new Set<string>()
        do {
          const page = await scanRedisKeys(client!, cursor, { match: pattern, count: 100 })
          cursor = page[0]
          for (const key of page[1]) keys.add(key)
        } while (cursor !== '0')
        return [...keys]
      })
    },

    async type(key: string): Promise<HaiResult<string>> {
      return wrapOperation(() => client!.type(key))
    },
  }

  // ─── Hash 操作 ───

  const hash: HashOperations = {
    async hget<T = CacheValue>(key: string, field: string): Promise<HaiResult<T | null>> {
      return wrapOperation(async () => {
        const value = await client!.hget(key, field)
        return deserialize<T>(value)
      })
    },

    async hset(
      key: string,
      fieldOrData: string | Record<string, CacheValue>,
      value?: CacheValue,
    ): Promise<HaiResult<number>> {
      if (typeof fieldOrData === 'string' && value === undefined) {
        return err(HaiCacheError.OPERATION_FAILED, cacheM('cache_invalidHashSetInput'))
      }
      if (typeof fieldOrData !== 'string' && (fieldOrData === null || Array.isArray(fieldOrData))) {
        return err(HaiCacheError.OPERATION_FAILED, cacheM('cache_invalidHashSetInput'))
      }

      return wrapOperation(async () => {
        if (typeof fieldOrData === 'string' && value !== undefined) {
          return client!.hset(key, fieldOrData, serialize(value))
        }
        if (typeof fieldOrData === 'object') {
          const serialized = Object.fromEntries(Object.entries(fieldOrData).map(([key, value]) => [key, serialize(value)]))
          return client!.hset(key, serialized)
        }
        return 0
      })
    },

    async hdel(key: string, ...fields: string[]): Promise<HaiResult<number>> {
      return wrapOperation(() => client!.hdel(key, ...fields))
    },

    async hexists(key: string, field: string): Promise<HaiResult<boolean>> {
      return wrapOperation(async () => {
        const result = await client!.hexists(key, field)
        return result === 1
      })
    },

    async hgetall<T = Record<string, CacheValue>>(key: string): Promise<HaiResult<T>> {
      return wrapOperation(async () => {
        const data = await client!.hgetall(key)
        // 保留 __proto__ 等合法字段，不触发普通对象的原型 setter。
        return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, deserialize(value)])) as T
      })
    },

    async hkeys(key: string): Promise<HaiResult<string[]>> {
      return wrapOperation(() => client!.hkeys(key))
    },

    async hvals<T = CacheValue>(key: string): Promise<HaiResult<T[]>> {
      return wrapOperation(async () => {
        const values = await client!.hvals(key)
        return values.map(v => deserialize<T>(v))
      })
    },

    async hlen(key: string): Promise<HaiResult<number>> {
      return wrapOperation(() => client!.hlen(key))
    },

    async hmget<T = CacheValue>(key: string, ...fields: string[]): Promise<HaiResult<(T | null)[]>> {
      return wrapOperation(async () => {
        const values = await client!.hmget(key, ...fields)
        return values.map(v => deserialize<T>(v))
      })
    },

    async hincrBy(key: string, field: string, increment: number): Promise<HaiResult<number>> {
      return wrapOperation(() => client!.hincrby(key, field, increment))
    },
  }

  // ─── List 操作 ───

  const list: ListOperations = {
    async lpush(key: string, ...values: CacheValue[]): Promise<HaiResult<number>> {
      return wrapOperation(() => client!.lpush(key, ...values.map(serialize)))
    },

    async rpush(key: string, ...values: CacheValue[]): Promise<HaiResult<number>> {
      return wrapOperation(() => client!.rpush(key, ...values.map(serialize)))
    },

    async lpop<T = CacheValue>(key: string): Promise<HaiResult<T | null>> {
      return wrapOperation(async () => {
        const value = await client!.lpop(key)
        return deserialize<T>(value)
      })
    },

    async rpop<T = CacheValue>(key: string): Promise<HaiResult<T | null>> {
      return wrapOperation(async () => {
        const value = await client!.rpop(key)
        return deserialize<T>(value)
      })
    },

    async llen(key: string): Promise<HaiResult<number>> {
      return wrapOperation(() => client!.llen(key))
    },

    async lrange<T = CacheValue>(key: string, start: number, stop: number): Promise<HaiResult<T[]>> {
      return wrapOperation(async () => {
        const values = await client!.lrange(key, start, stop)
        return values.map(v => deserialize<T>(v))
      })
    },

    async lindex<T = CacheValue>(key: string, index: number): Promise<HaiResult<T | null>> {
      return wrapOperation(async () => {
        const value = await client!.lindex(key, index)
        return deserialize<T>(value)
      })
    },

    async lset(key: string, index: number, value: CacheValue): Promise<HaiResult<void>> {
      return wrapOperation(async () => {
        await client!.lset(key, index, serialize(value))
      })
    },

    async ltrim(key: string, start: number, stop: number): Promise<HaiResult<void>> {
      return wrapOperation(async () => {
        await client!.ltrim(key, start, stop)
      })
    },

    async blpop<T = CacheValue>(timeout: number, ...keys: string[]): Promise<HaiResult<[string, T] | null>> {
      return wrapOperation(async () => {
        const result = await client!.blpop(...keys, timeout)
        if (!result)
          return null
        return [result[0], deserialize<T>(result[1])]
      })
    },

    async brpop<T = CacheValue>(timeout: number, ...keys: string[]): Promise<HaiResult<[string, T] | null>> {
      return wrapOperation(async () => {
        const result = await client!.brpop(...keys, timeout)
        if (!result)
          return null
        return [result[0], deserialize<T>(result[1])]
      })
    },
  }

  // ─── Set 操作 ───

  const set_: SetOperations = {
    async sadd(key: string, ...members: CacheValue[]): Promise<HaiResult<number>> {
      return wrapOperation(() => client!.sadd(key, ...members.map(serialize)))
    },

    async srem(key: string, ...members: CacheValue[]): Promise<HaiResult<number>> {
      return wrapOperation(() => client!.srem(key, ...members.map(serialize)))
    },

    async smembers<T = CacheValue>(key: string): Promise<HaiResult<T[]>> {
      return wrapOperation(async () => {
        const members = await client!.smembers(key)
        return members.map(m => deserialize<T>(m))
      })
    },

    async sismember(key: string, member: CacheValue): Promise<HaiResult<boolean>> {
      return wrapOperation(async () => {
        const result = await client!.sismember(key, serialize(member))
        return result === 1
      })
    },

    async scard(key: string): Promise<HaiResult<number>> {
      return wrapOperation(() => client!.scard(key))
    },

    async srandmember<T = CacheValue>(key: string, count?: number): Promise<HaiResult<T | T[] | null>> {
      return wrapOperation(async () => {
        if (count !== undefined) {
          const members = await client!.srandmember(key, count)
          return (members as string[]).map(m => deserialize<T>(m))
        }
        const member = await client!.srandmember(key)
        return deserialize<T>(member)
      })
    },

    async spop<T = CacheValue>(key: string, count?: number): Promise<HaiResult<T | T[] | null>> {
      return wrapOperation(async () => {
        if (count !== undefined) {
          const members = await client!.spop(key, count)
          return (members as string[]).map(m => deserialize<T>(m))
        }
        const member = await client!.spop(key)
        return deserialize<T>(member)
      })
    },

    async sinter<T = CacheValue>(...keys: string[]): Promise<HaiResult<T[]>> {
      return wrapOperation(async () => {
        const members = await client!.sinter(...keys)
        return members.map(m => deserialize<T>(m))
      })
    },

    async sunion<T = CacheValue>(...keys: string[]): Promise<HaiResult<T[]>> {
      return wrapOperation(async () => {
        const members = await client!.sunion(...keys)
        return members.map(m => deserialize<T>(m))
      })
    },

    async sdiff<T = CacheValue>(...keys: string[]): Promise<HaiResult<T[]>> {
      return wrapOperation(async () => {
        const members = await client!.sdiff(...keys)
        return members.map(m => deserialize<T>(m))
      })
    },
  }

  // ─── ZSet 操作 ───

  const zset: ZSetOperations = {
    async zadd(key: string, ...members: ZMember[]): Promise<HaiResult<number>> {
      return wrapOperation(async () => {
        const args: (string | number)[] = []
        for (const { score, member } of members) {
          args.push(score, member)
        }
        return client!.zadd(key, ...args)
      })
    },

    async zrem(key: string, ...members: string[]): Promise<HaiResult<number>> {
      return wrapOperation(() => client!.zrem(key, ...members))
    },

    async zscore(key: string, member: string): Promise<HaiResult<number | null>> {
      return wrapOperation(async () => {
        const score = await client!.zscore(key, member)
        return score !== null ? Number.parseFloat(score) : null
      })
    },

    async zrank(key: string, member: string): Promise<HaiResult<number | null>> {
      return wrapOperation(() => client!.zrank(key, member))
    },

    async zrevrank(key: string, member: string): Promise<HaiResult<number | null>> {
      return wrapOperation(() => client!.zrevrank(key, member))
    },

    async zrange(key: string, start: number, stop: number, withScores?: boolean): Promise<HaiResult<string[] | ZMember[]>> {
      return wrapOperation(async () => {
        if (withScores) {
          const result = await client!.zrange(key, String(start), String(stop), 'WITHSCORES')
          const members: ZMember[] = []
          for (let i = 0; i < result.length; i += 2) {
            members.push({ member: result[i], score: Number.parseFloat(result[i + 1]) })
          }
          return members
        }
        return client!.zrange(key, String(start), String(stop))
      })
    },

    async zrevrange(key: string, start: number, stop: number, withScores?: boolean): Promise<HaiResult<string[] | ZMember[]>> {
      return wrapOperation(async () => {
        if (withScores) {
          const result = await client!.zrevrange(key, start, stop, 'WITHSCORES')
          const members: ZMember[] = []
          for (let i = 0; i < result.length; i += 2) {
            members.push({ member: result[i], score: Number.parseFloat(result[i + 1]) })
          }
          return members
        }
        return client!.zrevrange(key, start, stop)
      })
    },

    async zrangeByScore(
      key: string,
      min: number | string,
      max: number | string,
      options?: { withScores?: boolean, offset?: number, count?: number },
    ): Promise<HaiResult<string[] | ZMember[]>> {
      return wrapOperation(async () => {
        const args: (string | number)[] = [key, String(min), String(max)]
        if (options?.withScores)
          args.push('WITHSCORES')
        if (options?.offset !== undefined && options?.count !== undefined) {
          args.push('LIMIT', options.offset, options.count)
        }
        // ioredis zrangebyscore 的 TypeScript 重载签名不支持动态参数拼装（WITHSCORES/LIMIT），需绕过类型检查
        const result = await (client!.zrangebyscore as unknown as (...a: (string | number)[]) => Promise<string[]>).call(client, ...args)
        if (options?.withScores) {
          const members: ZMember[] = []
          for (let i = 0; i < result.length; i += 2) {
            members.push({ member: result[i], score: Number.parseFloat(result[i + 1]) })
          }
          return members
        }
        return result as string[]
      })
    },

    async zcard(key: string): Promise<HaiResult<number>> {
      return wrapOperation(() => client!.zcard(key))
    },

    async zcount(key: string, min: number | string, max: number | string): Promise<HaiResult<number>> {
      return wrapOperation(() => client!.zcount(key, min, max))
    },

    async zincrBy(key: string, increment: number, member: string): Promise<HaiResult<number>> {
      return wrapOperation(async () => {
        const result = await client!.zincrby(key, increment, member)
        return Number.parseFloat(result)
      })
    },

    async zremRangeByRank(key: string, start: number, stop: number): Promise<HaiResult<number>> {
      return wrapOperation(() => client!.zremrangebyrank(key, start, stop))
    },

    async zremRangeByScore(key: string, min: number | string, max: number | string): Promise<HaiResult<number>> {
      return wrapOperation(() => client!.zremrangebyscore(key, min, max))
    },
  }

  // ─── Lock 操作 ───

  /** 锁前缀，用于区分锁键与普通 KV 键 */
  const LOCK_PREFIX = '__lock:'

  const lock: LockOperations = {
    async acquire(key: string, options?: LockOptions): Promise<HaiResult<string | null>> {
      return wrapOperation(async () => {
        const lockKey = `${LOCK_PREFIX}${key}`
        const ttl = options?.ttl ?? 30
        const owner = core.id.uuid()
        // SET key value NX EX ttl — 原子获锁
        const result = await client!.set(lockKey, owner, 'EX', ttl, 'NX')
        return result === 'OK' ? owner : null
      })
    },

    async release(key: string, owner: string): Promise<HaiResult<boolean>> {
      return wrapOperation(async () => {
        const lockKey = `${LOCK_PREFIX}${key}`
        if (!owner)
          return false
        const result = await client!.eval(RELEASE_LOCK_SCRIPT, 1, lockKey, owner)
        return isRedisOne(result)
      })
    },

    async isLocked(key: string): Promise<HaiResult<boolean>> {
      return wrapOperation(async () => {
        const lockKey = `${LOCK_PREFIX}${key}`
        const exists = await client!.exists(lockKey)
        return exists === 1
      })
    },

    async extend(key: string, ttl: number, owner: string): Promise<HaiResult<boolean>> {
      return wrapOperation(async () => {
        const lockKey = `${LOCK_PREFIX}${key}`
        if (!owner)
          return false
        const result = await client!.eval(EXTEND_LOCK_SCRIPT, 1, lockKey, owner, ttl)
        return isRedisOne(result)
      })
    },
  }

  // ─── Provider 返回 ───

  return {
    name: 'redis',

    /**
     * 连接 Redis 服务
     *
     * 根据配置自动选择连接模式：
     * 1. url → 单机 URL 连接
     * 2. cluster → 集群模式
     * 3. sentinel → 哨兵模式
     * 4. host/port → 单机连接（默认）
     *
     * @param config - 已校验的 Redis 配置
     * @returns 成功 ok(undefined)，失败 CONNECTION_FAILED
     */
    async connect(config: CacheConfig): Promise<HaiResult<void>> {
      if (config.type !== 'redis') {
        return err(
          HaiCacheError.UNSUPPORTED_TYPE,
          cacheM('cache_unsupportedType', { params: { type: config.type } }),
        )
      }

      try {
        await closeClient()
        const redisOptions: RedisOptions = {
          ...(!config.url && config.password !== undefined ? { password: config.password } : {}),
          connectTimeout: config.connectTimeout,
          commandTimeout: config.commandTimeout,
          keyPrefix: config.keyPrefix,
          maxRetriesPerRequest: config.maxRetries,
          retryStrategy: (times) => {
            if (times > config.maxRetries)
              return null
            return config.retryDelay * times
          },
          lazyConnect: true,
        }

        if (config.tls)
          redisOptions.tls = {}
        if (config.readOnly)
          redisOptions.readOnly = true

        if (config.url) {
          client = new Redis(config.url, redisOptions)
        }
        else if (config.cluster && config.cluster.length > 0) {
          const clusterOptions: ClusterOptions = {
            // Cluster 自身也必须延迟连接，避免构造时与下方显式 connect 竞争。
            lazyConnect: true,
            redisOptions,
            clusterRetryStrategy: (times) => {
              if (times > config.maxRetries)
                return null
              return config.retryDelay * times
            },
          }
          client = new Redis.Cluster(config.cluster, clusterOptions)
        }
        else if (config.sentinel) {
          client = new Redis({
            ...redisOptions,
            sentinels: config.sentinel.sentinels,
            name: config.sentinel.name,
            db: config.db,
          })
        }
        else {
          client = new Redis({
            ...redisOptions,
            host: config.host,
            port: config.port,
            db: config.db,
          })
        }

        client.on('error', () => logger.warn('Redis client connection error'))
        await client.connect()
        await client.ping()

        ready = true
        const address = config.url ? core.sanitize.sanitizeUrl(config.url) : `${config.host}:${config.port}`
        logger.info('Redis connected', { address })

        return ok(undefined)
      }
      catch (error) {
        ready = false
        let cleanupError: unknown
        try {
          // 连接/健康检查失败时不能向离线队列发送 QUIT；直接停止重连并释放套接字。
          client?.disconnect()
          client = null
        }
        catch (failure) {
          cleanupError = failure
        }
        const result = err(
          HaiCacheError.CONNECTION_FAILED,
          cacheM('cache_redisConnectionFailed', { params: { error: error instanceof Error ? error.message : String(error) } }),
          error,
        )
        if (cleanupError !== undefined && !result.success)
          return err({ ...result.error, ext: { cleanupPending: true, cleanupError } })
        return result
      }
    },

    close: closeClient,

    isConnected: () => ready && client !== null && client.status === 'ready',

    kv,
    hash,
    list,
    set_,
    zset,
    lock,

    async ping(): Promise<HaiResult<string>> {
      return wrapOperation(() => client!.ping())
    },
  }
}
