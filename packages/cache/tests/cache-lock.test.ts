/** @h-ai/cache — 租约所有权、重入与清理回归。 */
import { describe, expect, it } from 'vitest'
import { CacheConfigSchema } from '../src/cache-config.js'
import { cache, HaiCacheError } from '../src/index.js'
import { createRedisProvider } from '../src/providers/cache-provider-redis.js'
import { defineCacheSuite, memoryEnv, redisEnv } from './helpers/cache-test-suite.js'
import { acquireRedisContainer } from './helpers/redis-container.js'

async function acquire(key: string, ttl = 30): Promise<string> {
  const result = await cache.lock.acquire(key, { ttl })
  if (!result.success || !result.data)
    throw new Error('Expected an acquisition token')
  return result.data
}

describe('cache lock operations', () => {
  const common = () => {
    it('首次获取返回唯一凭据，无凭据的再次获取视为竞争', async () => {
      const first = await acquire('key')
      expect(typeof first).toBe('string')
      expect(await cache.lock.acquire('key')).toEqual({ success: true, data: null })
      expect(await acquire('other')).not.toBe(first)
      expect((await cache.lock.isLocked('key')).success).toBe(true)
    })

    it('同一 owner 可重入，逐层释放只在最后一次解锁', async () => {
      const owner = await acquire('nested')
      const other = await acquire('other-owner')
      expect(await cache.lock.acquire('nested', { owner: other })).toEqual({ success: true, data: null })
      expect(await cache.lock.acquire('nested', { owner: '' })).toEqual({ success: true, data: null })
      expect(await cache.lock.acquire('nested', { owner, ttl: 60 })).toMatchObject({
        success: false,
        error: { code: HaiCacheError.OPERATION_FAILED.code },
      })
      const nested = await Promise.all([
        cache.lock.acquire('nested', { owner }),
        cache.lock.acquire('nested', { owner }),
      ])
      expect(nested).toEqual([
        { success: true, data: owner },
        { success: true, data: owner },
      ])
      expect(await cache.lock.release('nested', other)).toEqual({ success: true, data: false })
      expect(await cache.lock.extend('nested', 60, other)).toEqual({ success: true, data: false })
      expect(await cache.lock.extend('nested', 60, owner)).toEqual({ success: true, data: true })
      for (let index = 0; index < 2; index++) {
        expect(await cache.lock.release('nested', owner)).toEqual({ success: true, data: true })
        expect(await cache.lock.acquire('nested')).toEqual({ success: true, data: null })
      }
      expect(await cache.lock.release('nested', owner)).toEqual({ success: true, data: true })
      expect(await cache.lock.isLocked('nested')).toEqual({ success: true, data: false })
      expect(await cache.lock.release('nested', owner)).toEqual({ success: true, data: false })
      expect(await cache.lock.acquire('nested', { owner })).toEqual({ success: true, data: null })
      expect(await cache.lock.isLocked('nested')).toEqual({ success: true, data: false })
      expect(await acquire('nested')).not.toBe(owner)
    })

    it('仅本次凭据可释放，重新获取使用新凭据', async () => {
      const first = await acquire('key')
      expect(await cache.lock.release('key', 'wrong')).toEqual({ success: true, data: false })
      expect(await cache.lock.release('key', first)).toEqual({ success: true, data: true })
      const second = await acquire('key')
      expect(second).not.toBe(first)
      expect(await cache.lock.release('key', first)).toEqual({ success: true, data: false })
      expect(await cache.lock.isLocked('key')).toEqual({ success: true, data: true })
    })

    it('仅本次凭据可续租，缺失凭据不能强制操作', async () => {
      const owner = await acquire('key')
      expect(await cache.lock.extend('key', 60, 'wrong')).toEqual({ success: true, data: false })
      expect(await cache.lock.extend('key', 60, owner)).toEqual({ success: true, data: true })
      // @ts-expect-error 同时校验 JavaScript 消费者绕过类型时仍拒绝无凭据释放。
      expect(await cache.lock.release('key')).toEqual({ success: true, data: false })
      // @ts-expect-error 无凭据续租不允许绕过所有权检查。
      expect(await cache.lock.extend('key', 60)).toEqual({ success: true, data: false })
      expect(await cache.lock.isLocked('key')).toEqual({ success: true, data: true })
    })

    it('不存在的锁不能释放或续租', async () => {
      expect(await cache.lock.release('missing', 'wrong')).toEqual({ success: true, data: false })
      expect(await cache.lock.extend('missing', 60, 'wrong')).toEqual({ success: true, data: false })
      expect(await cache.lock.isLocked('missing')).toEqual({ success: true, data: false })
    })

    it('过期重获后旧凭据不能影响新锁', async () => {
      const old = await acquire('key', 1)
      expect(await cache.lock.acquire('key', { owner: old })).toEqual({ success: true, data: old })
      const deadline = Date.now() + 4000
      let next = await cache.lock.acquire('key')
      while (next.success && !next.data && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 50))
        next = await cache.lock.acquire('key')
      }
      expect(next.success && next.data).toBeTruthy()
      if (!next.success || !next.data)
        throw new Error('Lock did not expire')
      expect(next.data).not.toBe(old)
      expect(await cache.lock.acquire('key', { owner: old })).toEqual({ success: true, data: null })
      expect(await cache.lock.release('key', old)).toEqual({ success: true, data: false })
      expect(await cache.lock.extend('key', 600, old)).toEqual({ success: true, data: false })
      expect(await cache.lock.isLocked('key')).toEqual({ success: true, data: true })
      expect(await cache.lock.release('key', next.data)).toEqual({ success: true, data: true })
    })
  }
  defineCacheSuite('memory', memoryEnv, common)
  defineCacheSuite('redis', redisEnv, common)

  it('两个 Redis 客户端在同一键上重入，维持原期限和旧版单层值', async () => {
    const lease = await acquireRedisContainer()
    const left = createRedisProvider()
    const right = createRedisProvider()
    try {
      const config = CacheConfigSchema.parse({
        type: 'redis',
        host: lease.host,
        port: lease.port,
        keyPrefix: 'cache-lock:',
      })
      expect((await left.connect(config)).success).toBe(true)
      expect((await right.connect(config)).success).toBe(true)
      const key = 'reentrant-client'
      const lockKey = `__lock:${key}`
      const original = await left.lock.acquire(key, { ttl: 60 })
      if (!original.success || !original.data)
        throw new Error('Initial lock failed')
      const owner = original.data
      expect(await right.kv.get(lockKey)).toEqual({ success: true, data: owner })
      expect(await left.kv.expire(lockKey, 15)).toEqual({ success: true, data: true })
      expect(await right.lock.acquire(key, { owner })).toEqual({ success: true, data: owner })
      expect(await left.kv.get(lockKey)).toEqual({ success: true, data: `${owner}|2` })
      const ttl = await left.kv.ttl(lockKey)
      expect(ttl.success && ttl.data > 0 && ttl.data <= 15).toBe(true)
      expect(await left.lock.release(key, owner)).toEqual({ success: true, data: true })
      expect(await right.kv.get(lockKey)).toEqual({ success: true, data: owner })
      expect(await left.lock.acquire(key)).toEqual({ success: true, data: null })
      expect(await right.lock.release(key, owner)).toEqual({ success: true, data: true })
      expect(await left.lock.isLocked(key)).toEqual({ success: true, data: false })
    }
    finally {
      try {
        await Promise.allSettled([
          left.close(),
          right.close(),
        ])
      }
      finally {
        await lease.release()
      }
    }
  }, 120000)

  it('独立Redis客户端接管后拒绝旧客户端凭据', async () => {
    const lease = await acquireRedisContainer()
    const left = createRedisProvider()
    const right = createRedisProvider()
    try {
      const config = CacheConfigSchema.parse({ type: 'redis', host: lease.host, port: lease.port })
      expect((await left.connect(config)).success).toBe(true)
      expect((await right.connect(config)).success).toBe(true)
      const original = await left.lock.acquire('cross-client', { ttl: 1 })
      if (!original.success || !original.data)
        throw new Error('Initial lock failed')
      expect(await right.lock.acquire('cross-client')).toEqual({ success: true, data: null })
      let current = await right.lock.acquire('cross-client')
      const deadline = Date.now() + 4000
      while (current.success && !current.data && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 50))
        current = await right.lock.acquire('cross-client')
      }
      if (!current.success || !current.data)
        throw new Error('Takeover failed')
      expect(await left.lock.release('cross-client', original.data)).toEqual({ success: true, data: false })
      expect(await left.lock.extend('cross-client', 600, original.data)).toEqual({ success: true, data: false })
      expect(await right.lock.release('cross-client', current.data)).toEqual({ success: true, data: true })
    }
    finally {
      try {
        await Promise.allSettled([
          left.close(),
          right.close(),
        ])
      }
      finally {
        await lease.release()
      }
    }
  }, 120000)
})
