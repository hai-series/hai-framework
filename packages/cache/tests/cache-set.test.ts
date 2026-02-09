/**
 * =============================================================================
 * @hai/cache - Set 操作测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { cache } from '../src/index.js'
import { defineCacheSuite, memoryEnv, redisEnv } from './helpers/cache-test-suite.js'

describe('cache set operations', () => {
  const defineCommon = () => {
    it('sadd/smembers/sismember/srem/scard 应该工作', async () => {
      const add = await cache.set_.sadd('s1', 'a', 'b')
      expect(add.success).toBe(true)

      const members = await cache.set_.smembers('s1')
      expect(members.success).toBe(true)
      if (members.success) {
        expect(members.data.sort()).toEqual(['a', 'b'])
      }

      const isMember = await cache.set_.sismember('s1', 'a')
      expect(isMember.success).toBe(true)
      if (isMember.success) {
        expect(isMember.data).toBe(true)
      }

      const count = await cache.set_.scard('s1')
      expect(count.success).toBe(true)
      if (count.success) {
        expect(count.data).toBe(2)
      }

      const rem = await cache.set_.srem('s1', 'a')
      expect(rem.success).toBe(true)
      if (rem.success) {
        expect(rem.data).toBe(1)
      }
    })

    it('sinter/sunion/sdiff 应该工作', async () => {
      await cache.set_.sadd('s2', 'a', 'b', 'c')
      await cache.set_.sadd('s3', 'b', 'c', 'd')

      const inter = await cache.set_.sinter('s2', 's3')
      expect(inter.success).toBe(true)
      if (inter.success) {
        expect(inter.data.sort()).toEqual(['b', 'c'])
      }

      const union = await cache.set_.sunion('s2', 's3')
      expect(union.success).toBe(true)
      if (union.success) {
        expect(union.data.sort()).toEqual(['a', 'b', 'c', 'd'])
      }

      const diff = await cache.set_.sdiff('s2', 's3')
      expect(diff.success).toBe(true)
      if (diff.success) {
        expect(diff.data.sort()).toEqual(['a'])
      }
    })

    // ─── 边界场景 ───

    it('sadd 重复成员应返回 0 新增计数', async () => {
      await cache.set_.sadd('s-dup', 'a', 'b')
      const result = await cache.set_.sadd('s-dup', 'b', 'c')
      expect(result.success).toBe(true)
      if (result.success) {
        // 只有 'c' 是新增的
        expect(result.data).toBe(1)
      }
    })

    it('smembers 不存在的 key 应返回空数组', async () => {
      const result = await cache.set_.smembers('nonexistent-set')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual([])
      }
    })

    it('sismember 不存在的 key 应返回 false', async () => {
      const result = await cache.set_.sismember('nonexistent-set-is', 'a')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(false)
      }
    })

    it('scard 不存在的 key 应返回 0', async () => {
      const result = await cache.set_.scard('nonexistent-scard')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(0)
      }
    })

    it('srem 不存在的成员应返回 0', async () => {
      await cache.set_.sadd('s-rem', 'a')
      const result = await cache.set_.srem('s-rem', 'nonexistent')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(0)
      }
    })

    it('srandmember 应返回集合中的成员', async () => {
      await cache.set_.sadd('s-rand', 'x', 'y', 'z')
      const result = await cache.set_.srandmember<string>('s-rand')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(['x', 'y', 'z']).toContain(result.data)
      }
    })

    it('srandmember 不存在的 key 应返回 null', async () => {
      const result = await cache.set_.srandmember('nonexistent-srand')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBeNull()
      }
    })

    it('srandmember 传 count 应返回数组', async () => {
      await cache.set_.sadd('s-rand-c', 'a', 'b', 'c')
      const result = await cache.set_.srandmember<string>('s-rand-c', 2)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(Array.isArray(result.data)).toBe(true)
        expect((result.data as string[]).length).toBeLessThanOrEqual(2)
      }
    })

    it('spop 应弹出并移除成员', async () => {
      await cache.set_.sadd('s-pop', 'a', 'b', 'c')
      const result = await cache.set_.spop<string>('s-pop')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(['a', 'b', 'c']).toContain(result.data)
      }

      // 弹出后集合应少一个成员
      const count = await cache.set_.scard('s-pop')
      expect(count.success).toBe(true)
      if (count.success) {
        expect(count.data).toBe(2)
      }
    })

    it('spop 不存在的 key 应返回 null', async () => {
      const result = await cache.set_.spop('nonexistent-spop')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBeNull()
      }
    })

    it('sinter 含不存在的 key 应返回空数组', async () => {
      await cache.set_.sadd('s-inter-exist', 'a', 'b')
      const result = await cache.set_.sinter('s-inter-exist', 'nonexistent-inter')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual([])
      }
    })
  }

  defineCacheSuite('memory', memoryEnv, defineCommon)
  defineCacheSuite('redis', redisEnv, defineCommon)
})
