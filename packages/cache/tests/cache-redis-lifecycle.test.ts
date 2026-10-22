/** 对真实 Redis 连接注入建连/健康检查/关闭故障，核验客户端不随重试累积。 */
import Redis from 'ioredis'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cache } from '../src/index.js'
import { acquireRedisContainer } from './helpers/redis-container.js'

describe.sequential('redis lifecycle ownership', () => {
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
