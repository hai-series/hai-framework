/** @h-ai/cache — 每次获取独立凭据的锁契约回归。 */
import { describe, expect, it } from 'vitest'
import { CacheConfigSchema } from '../src/cache-config.js'
import { cache } from '../src/index.js'
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
    it('每次获取返回唯一凭据，重入返回null', async () => {
      const first = await acquire('key')
      expect(typeof first).toBe('string')
      expect(await cache.lock.acquire('key')).toEqual({ success: true, data: null })
      expect(await acquire('other')).not.toBe(first)
      expect((await cache.lock.isLocked('key')).success).toBe(true)
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
      expect(await cache.lock.release('key', old)).toEqual({ success: true, data: false })
      expect(await cache.lock.extend('key', 600, old)).toEqual({ success: true, data: false })
      expect(await cache.lock.isLocked('key')).toEqual({ success: true, data: true })
      expect(await cache.lock.release('key', next.data)).toEqual({ success: true, data: true })
    })
  }
  defineCacheSuite('memory', memoryEnv, common)
  defineCacheSuite('redis', redisEnv, common)

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
        await Promise.allSettled([left.close(), right.close()])
      }
      finally {
        await lease.release()
      }
    }
  }, 120000)
})
