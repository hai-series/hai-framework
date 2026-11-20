/**
 * @h-ai/cache — Redis Provider
 *
 * 基于 ioredis 的 Redis/Cluster 缓存实现。
 * @module cache-provider-redis
 */

import type { HaiResult } from '@h-ai/core'
import type { Cluster, ClusterOptions, RedisOptions } from 'ioredis'
import type { CacheConfig } from '../cache-config.js'
import type { CacheValue, HashOperations, KvOperations, ListOperations, LockOperations, LockOptions, ScanOptions, SetOperations, SetOptions, ZMember, ZSetOperations } from '../cache-types.js'
import type { CacheProvider } from './cache-provider-types.js'

import { setMaxListeners } from 'node:events'
import { core, err, ok } from '@h-ai/core'
import Redis from 'ioredis'
import { cacheM } from '../cache-i18n.js'
import { HaiCacheError } from '../cache-types.js'
import { RedisScanError, scanRedisKeys } from './cache-redis-scan.js'
import { isValidLockOwner, isValidLockTtl, validateSetOptions } from './cache-set-options.js'
import { CacheSerializationError, serializeCacheValue } from './cache-value.js'

const logger = core.logger.child({ module: 'cache', scope: 'redis' })

/** 连接错误只记录诊断代码，避免 Redis 响应或连接参数进入日志。 */
function redisErrorDiagnostics(error: unknown) {
  const cause = error && typeof error === 'object' && 'lastNodeError' in error
    ? error.lastNodeError ?? error
    : error
  const code = cause && typeof cause === 'object' && 'code' in cause
    ? cause.code
    : undefined
  return {
    causeName: cause instanceof Error
      ? cause.name
      : undefined,
    causeCode: typeof code === 'string' && /^[A-Z0-9_]{1,64}$/.test(code)
      ? code
      : cause instanceof Error
        ? /^(NOAUTH|WRONGPASS|NOPERM|LOADING|CLUSTERDOWN)\b/.exec(cause.message)?.[1]
        : undefined,
  }
}

/** Redis 用 inf/-inf 表示有序集合的无穷分数。 */
function deserializeScore(score: string): number {
  if (score === 'inf')
    return Infinity
  if (score === '-inf')
    return -Infinity
  return Number(score)
}

function deserializeScoredMembers(result: string[]): ZMember[] {
  const members: ZMember[] = []
  for (let i = 0; i < result.length; i += 2) {
    members.push({
      member: result[i],
      score: deserializeScore(result[i + 1]),
    })
  }
  return members
}

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

/** 原子核对租约的 owner；仅保存大于 1 的重入次数。 */
const UPDATE_LOCK_SCRIPT = `
  local key, owner, operation = KEYS[1], ARGV[1], ARGV[2]
  local value = redis.call('get', key)
  if not value then return 0 end

  local depth = 1
  local maxDepth = 9007199254740991
  if value ~= owner then
    local storedOwner, storedDepth = string.match(value, '^(.-)|([1-9]%d*)$')
    if storedOwner ~= owner then return 0 end
    depth = tonumber(storedDepth)
    if depth < 2 or depth > maxDepth then return 0 end
  end

  if operation == 'extend' then
    return redis.call('expire', key, ARGV[3])
  end
  if operation == 'release' then
    if depth == 1 then return redis.call('del', key) end
    depth = depth - 1
  else
    if depth == maxDepth then return 0 end
    depth = depth + 1
  end

  local nextValue = owner
  if depth > 1 then nextValue = owner .. '|' .. string.format('%.0f', depth) end
  redis.call('set', key, nextValue, 'KEEPTTL')
  return 1
`

/**
 * Provider 持有的专用锁连接与共享建连状态。
 * @example 模块内部上下文
 * ```ts
 * async function waitForLockClient(connection: RedisLockConnection) {
 *   await connection.connected
 *   connection.cancellation.signal.throwIfAborted()
 *   return connection.client
 * }
 * ```
 */
interface RedisLockConnection {
  client: Redis | Cluster
  cancellation: AbortController
  connected: Promise<void>
}

/** 分开管理不允许在重连后重放的操作。 */
function duplicateWithoutReplay(source: Redis | Cluster, overrides: Pick<RedisOptions, 'commandTimeout'> = {}): Redis | Cluster {
  const redisOptions = { ...overrides, autoResendUnfulfilledCommands: false }
  if (!(source instanceof Redis.Cluster))
    return source.duplicate({ ...redisOptions, retryStrategy: null })
  return source.duplicate(
    source.nodes('master').map(node => ({ host: node.options.host, port: node.options.port })),
    {
      clusterRetryStrategy: () => null,
      retryDelayOnFailover: 0,
      redisOptions,
    },
  )
}

/** 集群在发现节点或就绪检查中被断开时，驱动的 connect Promise 可能保持未完成。 */
async function withCancellation<T>(signal: AbortSignal, start: () => Promise<T>): Promise<T> {
  signal.throwIfAborted()
  let rejectCancellation!: (reason: unknown) => void
  const canceled = new Promise<never>((_resolve, reject) => {
    rejectCancellation = reject
  })
  const cancel = () => rejectCancellation(signal.reason)
  signal.addEventListener('abort', cancel, { once: true })
  try {
    return await Promise.race([
      canceled,
      Promise.resolve().then(() => {
        signal.throwIfAborted()
        return start()
      }),
    ])
  }
  finally {
    signal.removeEventListener('abort', cancel)
  }
}

// ─── Redis Provider ───

/**
 * 创建 Redis Provider 实例
 *
 * 基于 ioredis 实现，支持单机 / 集群 / 哨兵 / URL 四种连接模式。
 * 连接优先级：url > cluster > sentinel > host。
 * 缓存值统一经 JSON.stringify 序列化，包括字符串。
 *
 * @returns CacheProvider 实例
 * @example 模块内部上下文
 * ```ts
 * const provider = createRedisProvider()
 * async function connect(config: CacheConfig) {
 *   const connected = await provider.connect(config)
 *   if (!connected.success) return connected
 *   try { return await provider.ping() } finally { await provider.close() }
 * }
 * ```
 */
export function createRedisProvider(): CacheProvider {
  /** ioredis 客户端实例；connect 后赋值，close 后置 null */
  let client: Redis | Cluster | null = null
  let ready = false
  let closing: Promise<void> | null = null
  let lockConnection: RedisLockConnection | null = null
  const blockingClients = new Map<Redis | Cluster, AbortController>()

  function cancelLockConnection(connection: RedisLockConnection): void {
    connection.cancellation.abort(new Error(cacheM('cache_lockOperationInterrupted')))
  }

  function disconnectLockConnection(connection: RedisLockConnection | null): void {
    if (connection && connection === lockConnection) {
      cancelLockConnection(connection)
      connection.client.disconnect()
      lockConnection = null
    }
  }

  function disconnectBlockingClient(blockingClient: Redis | Cluster): void {
    if (blockingClients.has(blockingClient)) {
      blockingClient.disconnect()
      blockingClients.delete(blockingClient)
    }
  }

  /** 停止接收业务操作；QUIT 失败时强制断开，只有实际释放成功才丢弃引用。 */
  function closeClient(): Promise<void> {
    const graceful = ready && client?.status === 'ready'
    ready = false
    if (closing)
      return closing
    const owned = client
    if (!owned && !lockConnection && blockingClients.size === 0)
      return Promise.resolve()
    closing = (async () => {
      for (const cancellation of blockingClients.values())
        cancellation.abort(new Error(cacheM('cache_blockingPopCanceled')))
      if (lockConnection)
        cancelLockConnection(lockConnection)
      for (const blockingClient of blockingClients.keys())
        disconnectBlockingClient(blockingClient)
      disconnectLockConnection(lockConnection)
      try {
        if (graceful && owned)
          await owned.quit()
      }
      catch (error) {
        logger.warn('Redis graceful shutdown failed; disconnecting client', redisErrorDiagnostics(error))
      }
      owned?.disconnect()
      client = null
    })().finally(() => { closing = null })
    return closing
  }

  // ─── 辅助函数 ───

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
      if (error instanceof CacheSerializationError)
        return err(HaiCacheError.SERIALIZATION_FAILED, cacheM('cache_serializationFailed'), error)
      if (error instanceof RedisScanError) {
        return error.reason === 'topology'
          ? err(HaiCacheError.SCAN_TOPOLOGY_CHANGED, cacheM('cache_scanTopologyChanged'), error)
          : err(HaiCacheError.INVALID_SCAN, cacheM('cache_invalidScan'), error)
      }
      if (error instanceof Error && error.message.startsWith('CROSSSLOT'))
        return err(HaiCacheError.CROSS_SLOT, cacheM('cache_crossSlot'), error)
      return err(
        HaiCacheError.OPERATION_FAILED,
        cacheM('cache_operationFailed', {
          params: {
            error: error instanceof Error
              ? error.message
              : String(error),
          },
        }),
        error,
      )
    }
  }

  function isRedisOne(result: unknown): boolean {
    return result === 1 || result === '1'
  }

  function getLockConnection(): RedisLockConnection {
    if (lockConnection?.cancellation.signal.aborted)
      disconnectLockConnection(lockConnection)
    if (lockConnection)
      return lockConnection

    const owned = duplicateWithoutReplay(client!)
    const cancellation = new AbortController()
    setMaxListeners(0, cancellation.signal)
    const connection = {
      client: owned,
      cancellation,
      connected: withCancellation(cancellation.signal, () => owned.connect()),
    }
    lockConnection = connection
    owned.on('error', (error: unknown) => {
      if (!cancellation.signal.aborted)
        logger.warn('Redis lock connection error', redisErrorDiagnostics(error))
    })
    owned.once('end', () => {
      cancelLockConnection(connection)
      if (lockConnection === connection)
        lockConnection = null
    })
    return connection
  }

  /** 共享锁连接；丢失响应时只释放连接，由后续调用重新建立。 */
  async function runLockMutation<T>(operation: (connection: Redis | Cluster) => Promise<T>): Promise<T> {
    const connection = getLockConnection()
    try {
      await connection.connected
      return await withCancellation(connection.cancellation.signal, () => operation(connection.client))
    }
    catch (error) {
      if (connection.client.status !== 'ready' || (error instanceof Error && ['Connection is closed.', 'Command timed out'].includes(error.message))) {
        try {
          disconnectLockConnection(connection)
        }
        catch (cleanupError) {
          logger.warn('Redis lock connection cleanup failed', redisErrorDiagnostics(cleanupError))
        }
      }
      throw error
    }
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
        return isRedisOne(await client!.eval(COMPARE_AND_SWAP_SCRIPT, 1, key, expected === undefined
          ? 'missing'
          : 'value', expected === undefined
          ? ''
          : serializeCacheValue(expected), value === undefined
          ? 'delete'
          : 'value', value === undefined
          ? ''
          : serializeCacheValue(value), options?.keepTtl
          ? 'keep'
          : options?.px !== undefined
            ? 'px'
            : 'none', options?.px ?? 0))
      })
    },
    async get<T = CacheValue>(key: string): Promise<HaiResult<T | null>> {
      return wrapOperation(async () => {
        const value = await client!.get(key)
        return deserialize<T>(value)
      })
    },

    async set(key: string, value: CacheValue, options?: SetOptions): Promise<HaiResult<boolean>> {
      const validated = validateSetOptions(options)
      if (!validated.success)
        return validated
      return wrapOperation(async () => {
        const policy = validated.data
        const args: (string | number)[] = [
          key,
          serializeCacheValue(value),
        ]
        if (policy.expiry)
          args.push(...policy.expiry)
        if (policy.nx)
          args.push('NX')
        else if (policy.xx)
          args.push('XX')
        if (policy.keepTtl)
          args.push('KEEPTTL')
        const result = await client!.call('SET', ...args)
        if (result !== 'OK' && result !== null)
          throw new Error(cacheM('cache_setUnexpectedReply'))
        return result === 'OK'
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
        const source = client!
        const values = keys.length === 0
          ? []
          : source instanceof Redis.Cluster
            ? await mapIndependentKeys(keys, async key => (await source.mget(key))[0])
            : await source.mget(...keys)
        return values.map(v => deserialize<T>(v))
      })
    },

    async mset(entries: Array<[string, CacheValue]>): Promise<HaiResult<void>> {
      return wrapOperation(async () => {
        if (entries.length === 0)
          return
        const args: string[] = []
        for (const [key, value] of entries) {
          args.push(key, serializeCacheValue(value))
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
          return client!.hset(key, fieldOrData, serializeCacheValue(value))
        }
        if (typeof fieldOrData === 'object') {
          const serialized = Object.fromEntries(Object.entries(fieldOrData).map(([key, value]) => [
            key,
            serializeCacheValue(value),
          ]))
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
        return Object.fromEntries(Object.entries(data).map(([key, value]) => [
          key,
          deserialize(value),
        ])) as T
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

  function popBlocking<T>(method: 'blpop' | 'brpop', timeout: number, keys: string[]): Promise<HaiResult<[string, T] | null>> {
    return wrapOperation(async () => {
      const source = client!
      // 每个阻塞读取独占连接，由 Redis 判断超时，避免阻塞普通命令或在重连后重放取值。
      const blockingClient = duplicateWithoutReplay(source, { commandTimeout: undefined })
      const cancellation = new AbortController()
      const { signal } = cancellation
      blockingClients.set(blockingClient, cancellation)
      blockingClient.on('error', (error: unknown) => {
        if (!signal.aborted)
          logger.warn('Redis blocking connection error', redisErrorDiagnostics(error))
      })
      blockingClient.once('end', () => cancellation.abort(new Error(cacheM('cache_blockingPopCanceled'))))
      try {
        const result = await withCancellation(signal, async () => {
          await blockingClient.connect()
          signal.throwIfAborted()
          return blockingClient[method](...keys, timeout)
        })
        if (!result)
          return null
        const prefix = source.options.keyPrefix ?? ''
        return [
          result[0].slice(prefix.length),
          deserialize<T>(result[1]),
        ]
      }
      finally {
        disconnectBlockingClient(blockingClient)
      }
    })
  }

  const list: ListOperations = {
    async lpush(key: string, ...values: CacheValue[]): Promise<HaiResult<number>> {
      return wrapOperation(() => client!.lpush(key, ...values.map(serializeCacheValue)))
    },

    async rpush(key: string, ...values: CacheValue[]): Promise<HaiResult<number>> {
      return wrapOperation(() => client!.rpush(key, ...values.map(serializeCacheValue)))
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
        await client!.lset(key, index, serializeCacheValue(value))
      })
    },

    async ltrim(key: string, start: number, stop: number): Promise<HaiResult<void>> {
      return wrapOperation(async () => {
        await client!.ltrim(key, start, stop)
      })
    },

    async blpop<T = CacheValue>(timeout: number, ...keys: string[]): Promise<HaiResult<[string, T] | null>> {
      return popBlocking<T>('blpop', timeout, keys)
    },

    async brpop<T = CacheValue>(timeout: number, ...keys: string[]): Promise<HaiResult<[string, T] | null>> {
      return popBlocking<T>('brpop', timeout, keys)
    },
  }

  // ─── Set 操作 ───

  const set_: SetOperations = {
    async sadd(key: string, ...members: CacheValue[]): Promise<HaiResult<number>> {
      return wrapOperation(() => client!.sadd(key, ...members.map(serializeCacheValue)))
    },

    async srem(key: string, ...members: CacheValue[]): Promise<HaiResult<number>> {
      return wrapOperation(() => client!.srem(key, ...members.map(serializeCacheValue)))
    },

    async smembers<T = CacheValue>(key: string): Promise<HaiResult<T[]>> {
      return wrapOperation(async () => {
        const members = await client!.smembers(key)
        return members.map(m => deserialize<T>(m))
      })
    },

    async sismember(key: string, member: CacheValue): Promise<HaiResult<boolean>> {
      return wrapOperation(async () => {
        const result = await client!.sismember(key, serializeCacheValue(member))
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
        return score !== null
          ? deserializeScore(score)
          : null
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
        if (withScores)
          return deserializeScoredMembers(await client!.zrange(key, String(start), String(stop), 'WITHSCORES'))
        return client!.zrange(key, String(start), String(stop))
      })
    },

    async zrevrange(key: string, start: number, stop: number, withScores?: boolean): Promise<HaiResult<string[] | ZMember[]>> {
      return wrapOperation(async () => {
        if (withScores)
          return deserializeScoredMembers(await client!.zrevrange(key, start, stop, 'WITHSCORES'))
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
        const paginated = options?.offset !== undefined || options?.count !== undefined
        const offset = options?.offset ?? 0
        const count = options?.count ?? -1
        if (options?.withScores) {
          const members = paginated
            ? await client!.zrangebyscore(key, min, max, 'WITHSCORES', 'LIMIT', offset, count)
            : await client!.zrangebyscore(key, min, max, 'WITHSCORES')
          return deserializeScoredMembers(members)
        }
        return paginated
          ? client!.zrangebyscore(key, min, max, 'LIMIT', offset, count)
          : client!.zrangebyscore(key, min, max)
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
        return deserializeScore(result)
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

  async function updateLock(key: string, owner: string, operation: 'reenter' | 'release' | 'extend', ttl?: number): Promise<boolean> {
    const result = await runLockMutation(connection => connection.eval(
      UPDATE_LOCK_SCRIPT,
      1,
      `${LOCK_PREFIX}${key}`,
      owner,
      operation,
      ...(ttl === undefined
        ? []
        : [ttl]),
    ))
    return isRedisOne(result)
  }

  const lock: LockOperations = {
    async acquire(key: string, options?: LockOptions): Promise<HaiResult<string | null>> {
      const { ttl, owner } = options ?? {}
      if (owner !== undefined) {
        if (ttl !== undefined)
          return err(HaiCacheError.OPERATION_FAILED, cacheM('cache_invalidLockOwnerOptions'))
        return wrapOperation(async () => {
          if (!isValidLockOwner(owner))
            return null
          return (await updateLock(key, owner, 'reenter'))
            ? owner
            : null
        })
      }
      const lockTtl = ttl === undefined
        ? 30
        : ttl
      if (!isValidLockTtl(lockTtl))
        return err(HaiCacheError.OPERATION_FAILED, cacheM('cache_invalidLockTtl'))
      return wrapOperation(async () => {
        const lockKey = `${LOCK_PREFIX}${key}`
        const token = core.id.uuid()
        // SET key value NX EX ttl — 原子获锁
        const result = await runLockMutation(connection => connection.set(lockKey, token, 'EX', lockTtl, 'NX'))
        return result === 'OK'
          ? token
          : null
      })
    },

    async release(key: string, owner: string): Promise<HaiResult<boolean>> {
      return wrapOperation(async () => {
        if (!isValidLockOwner(owner))
          return false
        return updateLock(key, owner, 'release')
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
      if (!isValidLockTtl(ttl))
        return err(HaiCacheError.OPERATION_FAILED, cacheM('cache_invalidLockTtl'))
      return wrapOperation(async () => {
        if (!isValidLockOwner(owner))
          return false
        return updateLock(key, owner, 'extend', ttl)
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
          cacheM('cache_unsupportedType', {
            params: { type: config.type },
          }),
        )
      }

      let connectionError: unknown
      try {
        await closeClient()
        const redisOptions: RedisOptions = {
          ...(!config.url && config.password !== undefined
            ? { password: config.password }
            : {}),
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

        const connectedClient = client
        connectedClient.on('error', (error: unknown) => {
          if (client !== connectedClient)
            return
          if (ready) {
            logger.warn('Redis client connection error', {
              status: connectedClient.status,
              ...redisErrorDiagnostics(error),
            })
          }
          else {
            connectionError = error
          }
        })
        await client.connect()
        await client.ping()

        connectionError = undefined
        ready = true
        const address = config.url
          ? core.sanitize.sanitizeUrl(config.url)
          : `${config.host}:${config.port}`
        logger.info('Redis connected', { address })

        return ok(undefined)
      }
      catch (error) {
        const diagnostics = redisErrorDiagnostics(error)
        logger.error('Redis connection failed', {
          errorCode: HaiCacheError.CONNECTION_FAILED.code,
          status: client?.status,
          ...(diagnostics.causeCode || connectionError === undefined
            ? diagnostics
            : redisErrorDiagnostics(connectionError)),
        })
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
          cacheM('cache_redisConnectionFailed', {
            params: {
              error: error instanceof Error
                ? error.message
                : String(error),
            },
          }),
          error,
        )
        if (cleanupError !== undefined && !result.success) {
          return err({
            ...result.error,
            ext: { cleanupPending: true, cleanupError },
          })
        }
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
