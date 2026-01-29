/**
 * =============================================================================
 * @hai/cache - Redis 容器化测试（契约化精简版）
 * =============================================================================
 *
 * 核心契约测试：验证 Redis Provider 必须满足的行为一致性。
 * 使用 testcontainers 进行集成测试，需要 Docker 环境。
 *
 * =============================================================================
 */

import type { StartedTestContainer } from 'testcontainers'
import { GenericContainer } from 'testcontainers'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cache, CacheErrorCode } from '../src/index.js'

describe('@hai/cache - Redis (容器化测试)', () => {
  let container: StartedTestContainer

  beforeAll(async () => {
    container = await new GenericContainer('redis:alpine')
      .withExposedPorts(6379)
      .start()

    const result = await cache.init({
      type: 'redis',
      host: container.getHost(),
      port: container.getMappedPort(6379),
      silent: true,
    })
    expect(result.success).toBe(true)
  }, 120000)

  afterAll(async () => {
    await cache.close()
    if (container)
      await container.stop()
  })

  // =========================================================================
  // 初始化契约
  // =========================================================================
  describe('初始化契约', () => {
    it('isInitialized/config/ping', async () => {
      expect(cache.isInitialized).toBe(true)
      expect(cache.config?.type).toBe('redis')
      const ping = await cache.ping()
      expect(ping.success).toBe(true)
      expect(ping.data).toBe('PONG')
    })
  })

  // =========================================================================
  // 基础操作契约
  // =========================================================================
  describe('基础操作契约', () => {
    beforeEach(async () => {
      await cache.del('t:k', 't:obj', 't:cnt')
    })

    it('set/get 字符串与对象', async () => {
      await cache.set('t:k', 'hello')
      expect((await cache.get<string>('t:k')).data).toBe('hello')

      const obj = { name: '张三', age: 25 }
      await cache.set('t:obj', obj)
      expect((await cache.get<typeof obj>('t:obj')).data).toEqual(obj)
    })

    it('set 过期时间 & ttl', async () => {
      await cache.set('t:k', 'v', { ex: 10 })
      const ttl = await cache.ttl('t:k')
      expect(ttl.data).toBeGreaterThan(0)
      expect(ttl.data).toBeLessThanOrEqual(10)
    })

    it('get 不存在返回 null', async () => {
      expect((await cache.get('nonexistent')).data).toBeNull()
    })

    it('del/exists', async () => {
      await cache.set('t:k', 'v')
      expect((await cache.exists('t:k')).data).toBe(1)
      expect((await cache.del('t:k')).data).toBe(1)
      expect((await cache.get('t:k')).data).toBeNull()
    })

    it('incr/decr', async () => {
      await cache.set('t:cnt', 10)
      expect((await cache.incr('t:cnt')).data).toBe(11)
      expect((await cache.decr('t:cnt')).data).toBe(10)
      expect((await cache.incrBy('t:cnt', 5)).data).toBe(15)
    })
  })

  // =========================================================================
  // Hash 契约
  // =========================================================================
  describe('hash 契约', () => {
    const k = 't:hash'
    beforeEach(async () => {
      await cache.del(k)
    })

    it('hset/hget/hgetall', async () => {
      await cache.hash.hset(k, 'name', '李四')
      expect((await cache.hash.hget<string>(k, 'name')).data).toBe('李四')

      await cache.hash.hset(k, { a: 1, b: 2 })
      const all = (await cache.hash.hgetall(k)).data
      expect(all).toMatchObject({ name: '李四', a: 1, b: 2 })
    })

    it('hdel/hexists', async () => {
      await cache.hash.hset(k, { x: 1, y: 2 })
      await cache.hash.hdel(k, 'x')
      expect((await cache.hash.hexists(k, 'x')).data).toBe(false)
      expect((await cache.hash.hexists(k, 'y')).data).toBe(true)
    })
  })

  // =========================================================================
  // List 契约
  // =========================================================================
  describe('list 契约', () => {
    const k = 't:list'
    beforeEach(async () => {
      await cache.del(k)
    })

    it('lpush/rpush/lrange/lpop/rpop', async () => {
      await cache.list.rpush(k, 'a', 'b')
      await cache.list.lpush(k, 'c')
      expect((await cache.list.lrange<string>(k, 0, -1)).data).toEqual(['c', 'a', 'b'])
      expect((await cache.list.lpop<string>(k)).data).toBe('c')
      expect((await cache.list.rpop<string>(k)).data).toBe('b')
    })

    it('llen', async () => {
      await cache.list.rpush(k, 'x', 'y', 'z')
      expect((await cache.list.llen(k)).data).toBe(3)
    })
  })

  // =========================================================================
  // Set 契约
  // =========================================================================
  describe('set 契约', () => {
    const k = 't:set'
    beforeEach(async () => {
      await cache.del(k, 't:set2')
    })

    it('sadd/smembers/srem/sismember/scard', async () => {
      await cache.set_.sadd(k, 'a', 'b', 'c')
      expect((await cache.set_.smembers<string>(k)).data?.sort()).toEqual(['a', 'b', 'c'])
      await cache.set_.srem(k, 'b')
      expect((await cache.set_.sismember(k, 'b')).data).toBe(false)
      expect((await cache.set_.scard(k)).data).toBe(2)
    })

    it('sinter/sunion/sdiff', async () => {
      await cache.set_.sadd(k, 'a', 'b', 'c')
      await cache.set_.sadd('t:set2', 'b', 'c', 'd')
      expect((await cache.set_.sinter<string>(k, 't:set2')).data?.sort()).toEqual(['b', 'c'])
      expect((await cache.set_.sunion<string>(k, 't:set2')).data?.sort()).toEqual(['a', 'b', 'c', 'd'])
      expect((await cache.set_.sdiff<string>(k, 't:set2')).data).toEqual(['a'])
    })
  })

  // =========================================================================
  // SortedSet 契约
  // =========================================================================
  describe('sortedSet 契约', () => {
    const k = 't:zset'
    beforeEach(async () => {
      await cache.del(k)
    })

    it('zadd/zrange/zrevrange/zscore/zrank', async () => {
      await cache.zset.zadd(k, { score: 1, member: 'a' }, { score: 2, member: 'b' }, { score: 3, member: 'c' })
      expect((await cache.zset.zrange(k, 0, -1)).data).toEqual(['a', 'b', 'c'])
      expect((await cache.zset.zrevrange(k, 0, -1)).data).toEqual(['c', 'b', 'a'])
      expect((await cache.zset.zscore(k, 'b')).data).toBe(2)
      expect((await cache.zset.zrank(k, 'b')).data).toBe(1)
    })

    it('zincrBy/zrem/zcard', async () => {
      await cache.zset.zadd(k, { score: 100, member: 'p1' })
      expect((await cache.zset.zincrBy(k, 50, 'p1')).data).toBe(150)
      await cache.zset.zrem(k, 'p1')
      expect((await cache.zset.zcard(k)).data).toBe(0)
    })
  })
})

// =============================================================================
// 未初始化契约
// =============================================================================
describe('@hai/cache - 未初始化', () => {
  it('操作应返回 NOT_INITIALIZED', async () => {
    await cache.close()
    const r = await cache.get('key')
    expect(r.success).toBe(false)
    expect(r.error?.code).toBe(CacheErrorCode.NOT_INITIALIZED)
  })
})
