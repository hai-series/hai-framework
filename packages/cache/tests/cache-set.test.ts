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
  }

  defineCacheSuite('memory', memoryEnv, defineCommon)
  defineCacheSuite('redis', redisEnv, defineCommon)
})
