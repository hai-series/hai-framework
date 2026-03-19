/**
 * @h-ai/cache — Redis Provider
 *
 * 基于 ioredis 的 Redis/Cluster 缓存实现。
 * @module cache-provider-redis
 */

import type { Result } from '@h-ai/core'
import type { Cluster, ClusterOptions, RedisOptions } from 'ioredis'
import type { CacheConfig } from '../cache-config.js'
import type {
  CacheError,
  CacheProvider,
  CacheValue,
  HashOperations,
  KvOperations,
  ListOperations,
  LockOperations,
  LockOptions,
  ScanOptions,
  SetOperations,
  SetOptions,
  ZMember,
  ZSetOperations,
} from '../cache-types.js'

import { core, err, ok } from '@h-ai/core'
import Redis from 'ioredis'
import { CacheErrorCode } from '../cache-config.js'
import { cacheM } from '../cache-i18n.js'

const logger = core.logger.child({ module: 'cache', scope: 'redis' })

/**
 * 剥离 URL 中的认证信息，避免密码泄露到日志
 */
function sanitizeRedisUrl(url: string): string {
  try {
    const u = new URL(url)
    if (u.password)
      u.password = '***'
    if (u.username)
      u.username = '***'
    return u.toString()
  }
  catch {
    return '(invalid url)'
  }
}

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

  // ─── 辅助函数 ───

  /**
   * 连接阶段失败时主动断开，避免遗留后台重连中的 client
   */
  function disposeFailedClient(failedClient: Redis | Cluster): void {
    try {
      (failedClient as { disconnect: (reconnect?: boolean) => void }).disconnect(false)
    }
    catch {
      // ignore cleanup errors
    }
  }

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
   * 包装 Redis 操作为 Result 结果
   *
   * 统一处理未初始化检查和异常捕获：
   * - client 为 null → NOT_INITIALIZED
   * - 操作抛异常 → OPERATION_FAILED
   *
   * @param operation - 实际的 Redis 命令执行函数
   * @returns Result 包装的操作结果
   */
  async function wrapOperation<T>(operation: () => Promise<T>): Promise<Result<T, CacheError>> {
    if (!client) {
      return err({
        code: CacheErrorCode.NOT_INITIALIZED,
        message: cacheM('cache_notInitialized'),
      })
    }
    try {
      const result = await operation()
      return ok(result)
    }
    catch (error) {
      return err({
        code: CacheErrorCode.OPERATION_FAILED,
        message: cacheM('cache_operationFailed', { params: { error: error instanceof Error ? error.message : String(error) } }),
        cause: error,
      })
    }
  }

  // ─── KV 操作 ───

  const kv: KvOperations = {
    async get<T = CacheValue>(key: string): Promise<Result<T | null, CacheError>> {
      return wrapOperation(async () => {
        const value = await client!.get(key)
        return deserialize<T>(value)
      })
    },

    async set(key: string, value: CacheValue, options?: SetOptions): Promise<Result<void, CacheError>> {
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

  // ─── Hash 操作 ───

  const hash: HashOperations = {
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
        if (typeof fieldOrData === 'object') {
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

  // ─── List 操作 ───

  const list: ListOperations = {
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

    async blpop<T = CacheValue>(timeout: number, ...keys: string[]): Promise<Result<[string, T] | null, CacheError>> {
      return wrapOperation(async () => {
        const result = await client!.blpop(...keys, timeout)
        if (!result)
          return null
        return [result[0], deserialize<T>(result[1])!]
      })
    },

    async brpop<T = CacheValue>(timeout: number, ...keys: string[]): Promise<Result<[string, T] | null, CacheError>> {
      return wrapOperation(async () => {
        const result = await client!.brpop(...keys, timeout)
        if (!result)
          return null
        return [result[0], deserialize<T>(result[1])!]
      })
    },
  }

  // ─── Set 操作 ───

  const set_: SetOperations = {
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

    async srandmember<T = CacheValue>(key: string, count?: number): Promise<Result<T | T[] | null, CacheError>> {
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

  // ─── ZSet 操作 ───

  const zset: ZSetOperations = {
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

    async zrange(key: string, start: number, stop: number, withScores?: boolean): Promise<Result<string[] | ZMember[], CacheError>> {
      return wrapOperation(async () => {
        if (withScores) {
          const result = await client!.zrange(key, start, stop, 'WITHSCORES')
          const members: ZMember[] = []
          for (let i = 0; i < result.length; i += 2) {
            members.push({ member: result[i], score: Number.parseFloat(result[i + 1]) })
          }
          return members
        }
        return client!.zrange(key, start, stop)
      })
    },

    async zrevrange(key: string, start: number, stop: number, withScores?: boolean): Promise<Result<string[] | ZMember[], CacheError>> {
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
    ): Promise<Result<string[] | ZMember[], CacheError>> {
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

    async zremRangeByScore(key: string, min: number | string, max: number | string): Promise<Result<number, CacheError>> {
      return wrapOperation(() => client!.zremrangebyscore(key, min, max))
    },
  }

  // ─── Lock 操作 ───

  /** 锁前缀，用于区分锁键与普通 KV 键 */
  const LOCK_PREFIX = '__lock:'

  const lock: LockOperations = {
    async acquire(key: string, options?: LockOptions): Promise<Result<boolean, CacheError>> {
      return wrapOperation(async () => {
        const lockKey = `${LOCK_PREFIX}${key}`
        const ttl = options?.ttl ?? 30
        const owner = options?.owner ?? 'default'
        // SET key value NX EX ttl — 原子获锁
        const result = await client!.set(lockKey, owner, 'EX', ttl, 'NX')
        return result === 'OK'
      })
    },

    async release(key: string, owner?: string): Promise<Result<boolean, CacheError>> {
      return wrapOperation(async () => {
        const lockKey = `${LOCK_PREFIX}${key}`
        if (owner !== undefined) {
          const result = await client!.eval(RELEASE_LOCK_SCRIPT, 1, lockKey, owner) as number
          return result === 1
        }
        const deleted = await client!.del(lockKey)
        return deleted === 1
      })
    },

    async isLocked(key: string): Promise<Result<boolean, CacheError>> {
      return wrapOperation(async () => {
        const lockKey = `${LOCK_PREFIX}${key}`
        const exists = await client!.exists(lockKey)
        return exists === 1
      })
    },

    async extend(key: string, ttl: number, owner?: string): Promise<Result<boolean, CacheError>> {
      return wrapOperation(async () => {
        const lockKey = `${LOCK_PREFIX}${key}`
        if (owner !== undefined) {
          const result = await client!.eval(EXTEND_LOCK_SCRIPT, 1, lockKey, owner, ttl) as number
          return result === 1
        }
        const result = await client!.expire(lockKey, ttl)
        return result === 1
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
    async connect(config: CacheConfig): Promise<Result<void, CacheError>> {
      if (config.type !== 'redis') {
        return err({
          code: CacheErrorCode.UNSUPPORTED_TYPE,
          message: cacheM('cache_unsupportedType', { params: { type: config.type } }),
        })
      }

      try {
        const redisOptions: RedisOptions = {
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
            password: config.password,
            db: config.db,
          })
        }
        else {
          client = new Redis({
            ...redisOptions,
            host: config.host,
            port: config.port,
            password: config.password,
            db: config.db,
          })
        }

        await client.connect()
        await client.ping()

        const address = config.url ? sanitizeRedisUrl(config.url) : `${config.host}:${config.port}`
        logger.info('Redis connected', { address })

        return ok(undefined)
      }
      catch (error) {
        const failedClient = client
        client = null
        if (failedClient) {
          disposeFailedClient(failedClient)
        }

        return err({
          code: CacheErrorCode.CONNECTION_FAILED,
          message: cacheM('cache_redisConnectionFailed', { params: { error: error instanceof Error ? error.message : String(error) } }),
          cause: error,
        })
      }
    },

    async close(): Promise<void> {
      if (client) {
        logger.info('Disconnecting Redis')
        await client.quit()
        client = null
        logger.info('Redis disconnected')
      }
    },

    isConnected: () => client !== null,

    kv,
    hash,
    list,
    set_,
    zset,
    lock,

    async ping(): Promise<Result<string, CacheError>> {
      return wrapOperation(() => client!.ping())
    },
  }
}
