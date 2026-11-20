/** 对真实 Redis 连接注入建连/健康检查/关闭故障，核验客户端不随重试累积。 */
import { core } from '@h-ai/core'
import Redis from 'ioredis'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cache, HaiCacheError } from '../src/index.js'
import { acquireRedisContainer } from './helpers/redis-container.js'

describe('redis lifecycle ownership', { concurrent: false }, () => {
  let lease: Awaited<ReturnType<typeof acquireRedisContainer>> | undefined
  let observer: Redis | undefined
  beforeAll(async () => {
    lease = await acquireRedisContainer()
    observer = new Redis({ host: lease.host, port: lease.port })
    await observer.ping()
  }, 120_000)
  afterEach(async () => {
    vi.restoreAllMocks()
    expect((await cache.close()).success).toBe(true)
  })
  afterAll(async () => {
    observer?.disconnect()
    await lease?.release()
  }, 30_000)

  function config() {
    if (!lease)
      throw new Error('Missing Redis container')
    return { type: 'redis' as const, host: lease.host, port: lease.port }
  }
  async function expectOnlyObserver() {
    await vi.waitFor(async () => {
      const clients = await observer!.client('LIST') as string
      expect(clients.trim().split('\n')).toHaveLength(1)
    }, { timeout: 10_000 })
  }

  async function expectBlockedClients(count: number) {
    await vi.waitFor(async () => {
      const clients = await observer!.info('clients')
      expect(clients).toMatch(new RegExp(`^blocked_clients:${count}\\r?$`, 'm'))
    })
  }

  it.each(['blpop', 'brpop'] as const)('%s uses an independent connection and returns a logical key', async (method) => {
    expect((await cache.init({
      ...config(),
      keyPrefix: 'queue[*]:',
      commandTimeout: 250,
    })).success).toBe(true)
    const pending = cache.list[method](0, 'empty', 'jobs')
    try {
      await expectBlockedClients(1)
      expect(await cache.kv.set('processed', 1)).toEqual({ success: true, data: true })
      expect(await cache.list.rpush('jobs', 'job')).toEqual({ success: true, data: 1 })
      expect(await pending).toEqual({
        success: true,
        data: ['jobs', 'job'],
      })
    }
    finally {
      if ((await observer!.info('clients')).includes('blocked_clients:1'))
        await observer!.rpush('queue[*]:jobs', JSON.stringify('cleanup'))
      await pending
    }
  })

  it('waits for the blocking timeout without consuming messages after returning', async () => {
    expect((await cache.init({
      ...config(),
      commandTimeout: 250,
    })).success).toBe(true)
    const result = await cache.list.blpop(1, 'expired-pop')
    const pushed = await observer!.rpush('expired-pop', JSON.stringify('late job'))
    expect(result).toEqual({ success: true, data: null })
    expect(pushed).toBe(1)
    expect(await cache.list.lrange('expired-pop', 0, -1)).toEqual({
      success: true,
      data: ['late job'],
    })
  })

  it('cancels an indefinite pop on close and releases its connection', async () => {
    expect((await cache.init({
      ...config(),
      commandTimeout: 250,
    })).success).toBe(true)
    const pending = cache.list.blpop(0, 'close-pop')
    await expectBlockedClients(1)
    expect(await cache.close()).toEqual({ success: true, data: undefined })
    expect(await pending).toMatchObject({
      success: false,
      error: { code: HaiCacheError.OPERATION_FAILED.code },
    })
    await expectOnlyObserver()
  })

  it('fails an interrupted pop without replaying it when the server closes the connection', async () => {
    expect((await cache.init(config())).success).toBe(true)
    const pending = cache.list.blpop(0, 'interrupted-pop')
    await expectBlockedClients(1)
    const clients = await observer!.client('LIST') as string
    const blockingClient = clients.split('\n').find(line => line.includes('cmd=blpop'))
    const clientId = /^id=(\d+)/.exec(blockingClient ?? '')?.[1]
    if (!clientId)
      throw new Error('Missing blocked client')
    expect(await observer!.client('KILL', 'ID', clientId)).toBe(1)
    expect(await pending).toMatchObject({
      success: false,
      error: { code: HaiCacheError.OPERATION_FAILED.code },
    })
    expect(await cache.list.rpush('interrupted-pop', 'next job')).toEqual({ success: true, data: 1 })
    expect(await cache.list.lrange('interrupted-pop', 0, -1)).toEqual({
      success: true,
      data: ['next job'],
    })
  })

  it('preserves unbounded scores and honors count or offset independently', async () => {
    expect((await cache.init(config())).success).toBe(true)
    const members = [
      { member: 'first', score: -Infinity },
      { member: 'middle', score: 1 },
      { member: 'last', score: Infinity },
    ]
    expect(await cache.zset.zadd('scores', ...members)).toEqual({ success: true, data: 3 })
    expect(await cache.zset.zrange('scores', 0, -1, true)).toEqual({ success: true, data: members })
    expect(await cache.zset.zrevrange('scores', 0, -1, true)).toEqual({
      success: true,
      data: [...members].reverse(),
    })
    expect(await cache.zset.zscore('scores', 'first')).toEqual({ success: true, data: -Infinity })
    expect(await cache.zset.zincrBy('scores', 1, 'last')).toEqual({ success: true, data: Infinity })
    expect(await cache.zset.zrangeByScore('scores', '-inf', '+inf', { count: 1, withScores: true })).toEqual({
      success: true,
      data: [members[0]],
    })
    expect(await cache.zset.zrangeByScore('scores', '-inf', '+inf', { offset: 1 })).toEqual({
      success: true,
      data: ['middle', 'last'],
    })
  })

  it('returns serialization failures without changing Redis values or partially applying a batch', async () => {
    expect((await cache.init(config())).success).toBe(true)
    const circular: { self?: object } = {}
    circular.self = circular
    const failure = {
      success: false,
      error: { code: HaiCacheError.SERIALIZATION_FAILED.code },
    }
    expect(await cache.kv.set('serialized', 'original')).toEqual({ success: true, data: true })
    expect(await cache.kv.set('serialized', circular)).toMatchObject(failure)
    expect(await cache.kv.compareAndSwap('serialized', 'original', circular)).toMatchObject(failure)
    expect(await cache.kv.mset([
      ['serialized', 'overwritten'],
      ['invalid', circular],
    ])).toMatchObject(failure)
    expect(await cache.kv.mget('serialized', 'invalid')).toEqual({
      success: true,
      data: ['original', null],
    })
  })

  it('rejects invalid lock TTLs and leaves the live lock in place', async () => {
    expect((await cache.init(config())).success).toBe(true)
    const acquired = await cache.lock.acquire('live-lock', { ttl: 30 })
    if (!acquired.success || acquired.data === null)
      throw new Error('Expected to acquire the Redis lock')
    const failure = {
      success: false,
      error: { code: HaiCacheError.OPERATION_FAILED.code },
    }
    for (const ttl of [
      0,
      -1,
      1.5,
      Infinity,
      Number.MAX_SAFE_INTEGER,
      null as never,
    ]) {
      expect(await cache.lock.acquire('invalid-lock', { ttl })).toMatchObject(failure)
      expect(await cache.lock.extend('live-lock', ttl, acquired.data)).toMatchObject(failure)
    }
    expect(await cache.lock.isLocked('invalid-lock')).toEqual({ success: true, data: false })
    expect(await cache.lock.release('live-lock', acquired.data)).toEqual({ success: true, data: true })
  })

  it.each(['connect', 'ping'] as const)('%s failure after actual connection disconnects the candidate', async (method) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (method === 'connect') {
        const connect = Redis.prototype.connect
        vi.spyOn(Redis.prototype, 'connect').mockImplementationOnce(async function (this: Redis) {
          await connect.call(this)
          throw new Error('injected post-connect failure')
        })
      }
      else {
        const ping = Redis.prototype.ping
        vi.spyOn(Redis.prototype, 'ping').mockImplementationOnce(async function (this: Redis) {
          await ping.call(this)
          throw new Error('injected post-ping failure')
        })
      }
      expect((await cache.init(config())).success).toBe(false)
      expect(cache.isInitialized).toBe(false)
      await expectOnlyObserver()
      vi.restoreAllMocks()
    }
    expect((await cache.init(config())).success).toBe(true)
  }, 30_000)

  it('qUIT failure falls back to actual disconnect and releases the client', async () => {
    expect((await cache.init(config())).success).toBe(true)
    vi.spyOn(Redis.prototype, 'quit').mockRejectedValueOnce(new Error('injected QUIT failure'))
    expect((await cache.close()).success).toBe(true)
    await expectOnlyObserver()
  })

  it('includes the connection event code once when connect rejects without a code', async () => {
    const observations: Array<{ message: string }> = []
    const stop = core.logger.observe(entry => observations.push(entry))
    const connect = Redis.prototype.connect
    vi.spyOn(Redis.prototype, 'connect').mockImplementationOnce(async function (this: Redis) {
      await connect.call(this)
      this.emit('error', new Error('WRONGPASS private credential diagnostic'))
      throw new Error('Connection is closed')
    })
    try {
      expect((await cache.init(config())).success).toBe(false)
      const failures = observations.filter(entry => /Redis (?:client )?connection|Cache module initialization failed/.test(entry.message))
      expect(failures).toHaveLength(1)
      expect(JSON.stringify(failures)).toContain('WRONGPASS')
      expect(JSON.stringify(failures)).not.toContain('private credential diagnostic')
      await expectOnlyObserver()
    }
    finally {
      stop()
    }
  })

  it('failed QUIT and disconnect retain one client until retry succeeds', async () => {
    expect((await cache.init(config())).success).toBe(true)
    const owners = new Set<Redis>()
    let failures = 2
    const disconnect = Redis.prototype.disconnect
    vi.spyOn(Redis.prototype, 'quit').mockRejectedValue(new Error('injected QUIT failure'))
    vi.spyOn(Redis.prototype, 'disconnect').mockImplementation(function (this: Redis) {
      owners.add(this)
      if (failures-- > 0)
        throw new Error('injected disconnect failure')
      disconnect.call(this)
    })
    const connect = vi.spyOn(Redis.prototype, 'connect')
    expect((await cache.close()).success).toBe(false)
    expect(cache.isInitialized).toBe(false)
    expect((await cache.kv.get('closed')).success).toBe(false)
    expect((await cache.init(config())).success).toBe(false)
    expect(connect).not.toHaveBeenCalled()
    expect(owners.size).toBe(1)
    expect((await cache.close()).success).toBe(true)
    await expectOnlyObserver()
    expect((await cache.init(config())).success).toBe(true)
  })
})
