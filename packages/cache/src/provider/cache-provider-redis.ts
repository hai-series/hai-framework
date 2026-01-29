/**
 * =============================================================================
 * @hai/cache - Redis Provider
 * =============================================================================
 *
 * 基于 ioredis 的 Redis 缓存实现。
 *
 * Redis 特点：
 * - 高性能内存数据库
 * - 支持多种数据结构（String, Hash, List, Set, SortedSet）
 * - 支持持久化（RDB, AOF）
 * - 支持集群和哨兵模式
 * - 支持发布订阅
 *
 * 适用场景：
 * - 分布式缓存
 * - 会话存储
 * - 消息队列
 * - 排行榜
 * - 计数器
 *
 * @module cache-provider-redis
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type { Cluster, ClusterOptions, RedisOptions } from 'ioredis'
import type {
  CacheConfig,
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
import { core, err, ok } from '@hai/core'

import Redis from 'ioredis'

import { CacheErrorCode } from '../cache-config.js'

// =============================================================================
// Redis Provider 实现
// =============================================================================

/**
 * 创建 Redis Provider 实例
 *
 * @returns Redis Provider
 */
export function createRedisProvider(): CacheProvider {
  /** Redis 客户端实例 */
  let client: Redis | Cluster | null = null

  // =========================================================================
  // 辅助函数
  // =========================================================================

  /**
   * 序列化值为字符串
   */
  function serialize(value: CacheValue): string {
    if (typeof value === 'string') {
      return value
    }
    return JSON.stringify(value)
  }

  /**
   * 反序列化字符串为值
   */
  function deserialize<T>(value: string | null): T | null {
    if (value === null) {
      return null
    }
    try {
      return JSON.parse(value) as T
    }
    catch {
      // 如果解析失败，返回原始字符串
      return value as T
    }
  }

  /**
   * 包装操作结果
   */
  async function wrapOperation<T>(operation: () => Promise<T>): Promise<Result<T, CacheError>> {
    if (!client) {
      return err({
        code: CacheErrorCode.NOT_INITIALIZED,
        message: '缓存未初始化，请先调用 initCache()',
      })
    }

    try {
      const result = await operation()
      return ok(result)
    }
    catch (error) {
      return err({
        code: CacheErrorCode.OPERATION_FAILED,
        message: `缓存操作失败: ${error instanceof Error ? error.message : String(error)}`,
        cause: error,
      })
    }
  }

  // =========================================================================
  // Hash 操作实现
  // =========================================================================

  const hashOps: HashOperations = {
    async hget<T = CacheValue>(key: string, field: string): Promise<Result<T | null, CacheError>> {
      return wrapOperation(async () => {
        const value = await client!.hget(key, field)
        return deserialize<T>(value)
      })
    },

    async hset(
      key: string,
      fieldOrData: string | Record<string, CacheValue>,
      value?: CacheValue,
    ): Promise<Result<number, CacheError>> {
      return wrapOperation(async () => {
        if (typeof fieldOrData === 'string' && value !== undefined) {
          return client!.hset(key, fieldOrData, serialize(value))
        }
        else if (typeof fieldOrData === 'object') {
          const serialized: Record<string, string> = {}
          for (const [k, v] of Object.entries(fieldOrData)) {
            serialized[k] = serialize(v)
          }
          return client!.hset(key, serialized)
        }
        return 0
      })
    },

    async hdel(key: string, ...fields: string[]): Promise<Result<number, CacheError>> {
      return wrapOperation(() => client!.hdel(key, ...fields))
    },

    async hexists(key: string, field: string): Promise<Result<boolean, CacheError>> {
      return wrapOperation(async () => {
        const result = await client!.hexists(key, field)
        return result === 1
      })
    },

    async hgetall<T = Record<string, CacheValue>>(key: string): Promise<Result<T, CacheError>> {
      return wrapOperation(async () => {
        const data = await client!.hgetall(key)
        const result: Record<string, CacheValue> = {}
        for (const [k, v] of Object.entries(data)) {
          result[k] = deserialize(v)
        }
        return result as T
      })
    },

    async hkeys(key: string): Promise<Result<string[], CacheError>> {
      return wrapOperation(() => client!.hkeys(key))
    },

    async hvals<T = CacheValue>(key: string): Promise<Result<T[], CacheError>> {
      return wrapOperation(async () => {
        const values = await client!.hvals(key)
        return values.map(v => deserialize<T>(v)!)
      })
    },

    async hlen(key: string): Promise<Result<number, CacheError>> {
      return wrapOperation(() => client!.hlen(key))
    },

    async hmget<T = CacheValue>(key: string, ...fields: string[]): Promise<Result<(T | null)[], CacheError>> {
      return wrapOperation(async () => {
        const values = await client!.hmget(key, ...fields)
        return values.map(v => deserialize<T>(v))
      })
    },

    async hincrBy(key: string, field: string, increment: number): Promise<Result<number, CacheError>> {
      return wrapOperation(() => client!.hincrby(key, field, increment))
    },
  }

  // =========================================================================
  // List 操作实现
  // =========================================================================

  const listOps: ListOperations = {
    async lpush(key: string, ...values: CacheValue[]): Promise<Result<number, CacheError>> {
      return wrapOperation(() => client!.lpush(key, ...values.map(serialize)))
    },

    async rpush(key: string, ...values: CacheValue[]): Promise<Result<number, CacheError>> {
      return wrapOperation(() => client!.rpush(key, ...values.map(serialize)))
    },

    async lpop<T = CacheValue>(key: string): Promise<Result<T | null, CacheError>> {
      return wrapOperation(async () => {
        const value = await client!.lpop(key)
        return deserialize<T>(value)
      })
    },

    async rpop<T = CacheValue>(key: string): Promise<Result<T | null, CacheError>> {
      return wrapOperation(async () => {
        const value = await client!.rpop(key)
        return deserialize<T>(value)
      })
    },

    async llen(key: string): Promise<Result<number, CacheError>> {
      return wrapOperation(() => client!.llen(key))
    },

    async lrange<T = CacheValue>(key: string, start: number, stop: number): Promise<Result<T[], CacheError>> {
      return wrapOperation(async () => {
        const values = await client!.lrange(key, start, stop)
        return values.map(v => deserialize<T>(v)!)
      })
    },

    async lindex<T = CacheValue>(key: string, index: number): Promise<Result<T | null, CacheError>> {
      return wrapOperation(async () => {
        const value = await client!.lindex(key, index)
        return deserialize<T>(value)
      })
    },

    async lset(key: string, index: number, value: CacheValue): Promise<Result<void, CacheError>> {
      return wrapOperation(async () => {
        await client!.lset(key, index, serialize(value))
      })
    },

    async ltrim(key: string, start: number, stop: number): Promise<Result<void, CacheError>> {
      return wrapOperation(async () => {
        await client!.ltrim(key, start, stop)
      })
    },

    async blpop<T = CacheValue>(
      timeout: number,
      ...keys: string[]
    ): Promise<Result<[string, T] | null, CacheError>> {
      return wrapOperation(async () => {
        const result = await client!.blpop(...keys, timeout)
        if (!result)
          return null
        return [result[0], deserialize<T>(result[1])!]
      })
    },

    async brpop<T = CacheValue>(
      timeout: number,
      ...keys: string[]
    ): Promise<Result<[string, T] | null, CacheError>> {
      return wrapOperation(async () => {
        const result = await client!.brpop(...keys, timeout)
        if (!result)
          return null
        return [result[0], deserialize<T>(result[1])!]
      })
    },
  }

  // =========================================================================
  // Set 操作实现
  // =========================================================================

  const setOps: SetOperations = {
    async sadd(key: string, ...members: CacheValue[]): Promise<Result<number, CacheError>> {
      return wrapOperation(() => client!.sadd(key, ...members.map(serialize)))
    },

    async srem(key: string, ...members: CacheValue[]): Promise<Result<number, CacheError>> {
      return wrapOperation(() => client!.srem(key, ...members.map(serialize)))
    },

    async smembers<T = CacheValue>(key: string): Promise<Result<T[], CacheError>> {
      return wrapOperation(async () => {
        const members = await client!.smembers(key)
        return members.map(m => deserialize<T>(m)!)
      })
    },

    async sismember(key: string, member: CacheValue): Promise<Result<boolean, CacheError>> {
      return wrapOperation(async () => {
        const result = await client!.sismember(key, serialize(member))
        return result === 1
      })
    },

    async scard(key: string): Promise<Result<number, CacheError>> {
      return wrapOperation(() => client!.scard(key))
    },

    async srandmember<T = CacheValue>(
      key: string,
      count?: number,
    ): Promise<Result<T | T[] | null, CacheError>> {
      return wrapOperation(async () => {
        if (count !== undefined) {
          const members = await client!.srandmember(key, count)
          return (members as string[]).map(m => deserialize<T>(m)!)
        }
        const member = await client!.srandmember(key)
        return deserialize<T>(member)
      })
    },

    async spop<T = CacheValue>(key: string, count?: number): Promise<Result<T | T[] | null, CacheError>> {
      return wrapOperation(async () => {
        if (count !== undefined) {
          const members = await client!.spop(key, count)
          return (members as string[]).map(m => deserialize<T>(m)!)
        }
        const member = await client!.spop(key)
        return deserialize<T>(member)
      })
    },

    async sinter<T = CacheValue>(...keys: string[]): Promise<Result<T[], CacheError>> {
      return wrapOperation(async () => {
        const members = await client!.sinter(...keys)
        return members.map(m => deserialize<T>(m)!)
      })
    },

    async sunion<T = CacheValue>(...keys: string[]): Promise<Result<T[], CacheError>> {
      return wrapOperation(async () => {
        const members = await client!.sunion(...keys)
        return members.map(m => deserialize<T>(m)!)
      })
    },

    async sdiff<T = CacheValue>(...keys: string[]): Promise<Result<T[], CacheError>> {
      return wrapOperation(async () => {
        const members = await client!.sdiff(...keys)
        return members.map(m => deserialize<T>(m)!)
      })
    },
  }

  // =========================================================================
  // SortedSet 操作实现
  // =========================================================================

  const zsetOps: ZSetOperations = {
    async zadd(key: string, ...members: ZMember[]): Promise<Result<number, CacheError>> {
      return wrapOperation(async () => {
        const args: (string | number)[] = []
        for (const { score, member } of members) {
          args.push(score, member)
        }
        return client!.zadd(key, ...args)
      })
    },

    async zrem(key: string, ...members: string[]): Promise<Result<number, CacheError>> {
      return wrapOperation(() => client!.zrem(key, ...members))
    },

    async zscore(key: string, member: string): Promise<Result<number | null, CacheError>> {
      return wrapOperation(async () => {
        const score = await client!.zscore(key, member)
        return score !== null ? Number.parseFloat(score) : null
      })
    },

    async zrank(key: string, member: string): Promise<Result<number | null, CacheError>> {
      return wrapOperation(() => client!.zrank(key, member))
    },

    async zrevrank(key: string, member: string): Promise<Result<number | null, CacheError>> {
      return wrapOperation(() => client!.zrevrank(key, member))
    },

    async zrange(
      key: string,
      start: number,
      stop: number,
      withScores?: boolean,
    ): Promise<Result<string[] | ZMember[], CacheError>> {
      return wrapOperation(async () => {
        if (withScores) {
          const result = await client!.zrange(key, start, stop, 'WITHSCORES')
          const members: ZMember[] = []
          for (let i = 0; i < result.length; i += 2) {
            members.push({
              member: result[i],
              score: Number.parseFloat(result[i + 1]),
            })
          }
          return members
        }
        return client!.zrange(key, start, stop)
      })
    },

    async zrevrange(
      key: string,
      start: number,
      stop: number,
      withScores?: boolean,
    ): Promise<Result<string[] | ZMember[], CacheError>> {
      return wrapOperation(async () => {
        if (withScores) {
          const result = await client!.zrevrange(key, start, stop, 'WITHSCORES')
          const members: ZMember[] = []
          for (let i = 0; i < result.length; i += 2) {
            members.push({
              member: result[i],
              score: Number.parseFloat(result[i + 1]),
            })
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
    ): Promise<Result<string[] | ZMember[], CacheError>> {
      return wrapOperation(async () => {
        const args: (string | number)[] = [key, String(min), String(max)]

        if (options?.withScores) {
          args.push('WITHSCORES')
        }

        if (options?.offset !== undefined && options?.count !== undefined) {
          args.push('LIMIT', options.offset, options.count)
        }

        const zrangebyscore = client!.zrangebyscore as unknown as (...args: Array<string | number>) => Promise<string[]>
        const result = await zrangebyscore(...args)

        if (options?.withScores) {
          const members: ZMember[] = []
          for (let i = 0; i < result.length; i += 2) {
            members.push({
              member: result[i],
              score: Number.parseFloat(result[i + 1]),
            })
          }
          return members
        }

        return result as string[]
      })
    },

    async zcard(key: string): Promise<Result<number, CacheError>> {
      return wrapOperation(() => client!.zcard(key))
    },

    async zcount(key: string, min: number | string, max: number | string): Promise<Result<number, CacheError>> {
      return wrapOperation(() => client!.zcount(key, min, max))
    },

    async zincrBy(key: string, increment: number, member: string): Promise<Result<number, CacheError>> {
      return wrapOperation(async () => {
        const result = await client!.zincrby(key, increment, member)
        return Number.parseFloat(result)
      })
    },

    async zremRangeByRank(key: string, start: number, stop: number): Promise<Result<number, CacheError>> {
      return wrapOperation(() => client!.zremrangebyrank(key, start, stop))
    },

    async zremRangeByScore(
      key: string,
      min: number | string,
      max: number | string,
    ): Promise<Result<number, CacheError>> {
      return wrapOperation(() => client!.zremrangebyscore(key, min, max))
    },
  }

  // =========================================================================
  // Provider 返回对象
  // =========================================================================

  return {
    // ---------------------------------------------------------------------
    // 子操作接口
    // ---------------------------------------------------------------------
    hash: hashOps,
    list: listOps,
    set_: setOps,
    zset: zsetOps,

    // ---------------------------------------------------------------------
    // 初始化和关闭
    // ---------------------------------------------------------------------
    async init(config: CacheConfig): Promise<Result<void, CacheError>> {
      try {
        // 构建 Redis 配置
        const redisOptions: RedisOptions = {
          connectTimeout: config.connectTimeout,
          commandTimeout: config.commandTimeout,
          keyPrefix: config.keyPrefix,
          maxRetriesPerRequest: config.maxRetries,
          retryStrategy: (times) => {
            if (times > config.maxRetries) {
              return null
            }
            return config.retryDelay * times
          },
          lazyConnect: true,
        }

        if (config.tls) {
          redisOptions.tls = {}
        }

        if (config.readOnly) {
          redisOptions.readOnly = true
        }

        // 根据配置模式创建客户端
        if (config.url) {
          // URL 模式
          client = new Redis(config.url, redisOptions)
        }
        else if (config.cluster && config.cluster.length > 0) {
          // 集群模式
          const clusterOptions: ClusterOptions = {
            redisOptions,
            clusterRetryStrategy: (times) => {
              if (times > config.maxRetries) {
                return null
              }
              return config.retryDelay * times
            },
          }
          client = new Redis.Cluster(config.cluster, clusterOptions)
        }
        else if (config.sentinel) {
          // 哨兵模式
          client = new Redis({
            ...redisOptions,
            sentinels: config.sentinel.sentinels,
            name: config.sentinel.name,
            password: config.password,
            db: config.db,
          })
        }
        else {
          // 单机模式
          client = new Redis({
            ...redisOptions,
            host: config.host,
            port: config.port,
            password: config.password,
            db: config.db,
          })
        }

        // 连接
        await client.connect()

        // 测试连接
        await client.ping()

        if (!config.silent) {
          const address = config.url || `${config.host}:${config.port}`
          core.logger.info('Redis connected', { module: 'cache', address })
        }

        return ok(undefined)
      }
      catch (error) {
        return err({
          code: CacheErrorCode.CONNECTION_FAILED,
          message: `Redis 连接失败: ${error instanceof Error ? error.message : String(error)}`,
          cause: error,
        })
      }
    },

    async close(): Promise<void> {
      if (client) {
        await client.quit()
        client = null
      }
    },

    async ping(): Promise<Result<string, CacheError>> {
      return wrapOperation(() => client!.ping())
    },

    // ---------------------------------------------------------------------
    // 基础操作
    // ---------------------------------------------------------------------
    async get<T = CacheValue>(key: string): Promise<Result<T | null, CacheError>> {
      return wrapOperation(async () => {
        const value = await client!.get(key)
        return deserialize<T>(value)
      })
    },

    async set(key: string, value: CacheValue, options?: SetOptions): Promise<Result<void, CacheError>> {
      return wrapOperation(async () => {
        const args: (string | number)[] = [key, serialize(value)]

        if (options?.ex) {
          args.push('EX', options.ex)
        }
        else if (options?.px) {
          args.push('PX', options.px)
        }
        else if (options?.exat) {
          args.push('EXAT', options.exat)
        }
        else if (options?.pxat) {
          args.push('PXAT', options.pxat)
        }

        if (options?.nx) {
          args.push('NX')
        }
        else if (options?.xx) {
          args.push('XX')
        }

        if (options?.keepTtl) {
          args.push('KEEPTTL')
        }

        // 注意：不要把方法解构出来调用，否则会丢失 ioredis 的 this 绑定
        await (client as unknown as { set: (...args: Array<string | number>) => Promise<unknown> }).set(...args)
      })
    },

    async del(...keys: string[]): Promise<Result<number, CacheError>> {
      return wrapOperation(() => client!.del(...keys))
    },

    async exists(...keys: string[]): Promise<Result<number, CacheError>> {
      return wrapOperation(() => client!.exists(...keys))
    },

    async expire(key: string, seconds: number): Promise<Result<boolean, CacheError>> {
      return wrapOperation(async () => {
        const result = await client!.expire(key, seconds)
        return result === 1
      })
    },

    async expireAt(key: string, timestamp: number): Promise<Result<boolean, CacheError>> {
      return wrapOperation(async () => {
        const result = await client!.expireat(key, timestamp)
        return result === 1
      })
    },

    async ttl(key: string): Promise<Result<number, CacheError>> {
      return wrapOperation(() => client!.ttl(key))
    },

    async persist(key: string): Promise<Result<boolean, CacheError>> {
      return wrapOperation(async () => {
        const result = await client!.persist(key)
        return result === 1
      })
    },

    async incr(key: string): Promise<Result<number, CacheError>> {
      return wrapOperation(() => client!.incr(key))
    },

    async incrBy(key: string, increment: number): Promise<Result<number, CacheError>> {
      return wrapOperation(() => client!.incrby(key, increment))
    },

    async decr(key: string): Promise<Result<number, CacheError>> {
      return wrapOperation(() => client!.decr(key))
    },

    async decrBy(key: string, decrement: number): Promise<Result<number, CacheError>> {
      return wrapOperation(() => client!.decrby(key, decrement))
    },

    async mget<T = CacheValue>(...keys: string[]): Promise<Result<(T | null)[], CacheError>> {
      return wrapOperation(async () => {
        const values = await client!.mget(...keys)
        return values.map(v => deserialize<T>(v))
      })
    },

    async mset(entries: Array<[string, CacheValue]>): Promise<Result<void, CacheError>> {
      return wrapOperation(async () => {
        const args: string[] = []
        for (const [key, value] of entries) {
          args.push(key, serialize(value))
        }
        await client!.mset(...args)
      })
    },

    async scan(cursor: number, options?: ScanOptions): Promise<Result<[number, string[]], CacheError>> {
      return wrapOperation(async () => {
        let result: [string, string[]]

        if (options?.match && options?.count) {
          result = await client!.scan(cursor, 'MATCH', options.match, 'COUNT', options.count)
        }
        else if (options?.match) {
          result = await client!.scan(cursor, 'MATCH', options.match)
        }
        else if (options?.count) {
          result = await client!.scan(cursor, 'COUNT', options.count)
        }
        else {
          result = await client!.scan(cursor)
        }

        const [nextCursor, keys] = result
        return [Number.parseInt(nextCursor, 10), keys]
      })
    },

    async keys(pattern: string): Promise<Result<string[], CacheError>> {
      return wrapOperation(() => client!.keys(pattern))
    },

    async type(key: string): Promise<Result<string, CacheError>> {
      return wrapOperation(() => client!.type(key))
    },
  }
}
