/**
 * =============================================================================
 * @hai/cache - ZSet 操作测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { cache } from '../src/index.js'
import { defineCacheSuite, memoryEnv, redisEnv } from './helpers/cache-test-suite.js'

describe('cache zset operations', () => {
  const defineCommon = () => {
    it('zadd/zrange/zrevrange/zscore/zrank 应该工作', async () => {
      await cache.zset.zadd('z1', { score: 10, member: 'a' }, { score: 20, member: 'b' })

      const range = await cache.zset.zrange('z1', 0, -1, true)
      expect(range.success).toBe(true)
      if (range.success) {
        expect(range.data).toEqual([
          { member: 'a', score: 10 },
          { member: 'b', score: 20 },
        ])
      }

      const revrange = await cache.zset.zrevrange('z1', 0, -1)
      expect(revrange.success).toBe(true)
      if (revrange.success) {
        expect(revrange.data).toEqual(['b', 'a'])
      }

      const score = await cache.zset.zscore('z1', 'b')
      expect(score.success).toBe(true)
      if (score.success) {
        expect(score.data).toBe(20)
      }

      const rank = await cache.zset.zrank('z1', 'b')
      expect(rank.success).toBe(true)
      if (rank.success) {
        expect(rank.data).toBe(1)
      }
    })

    it('zincrBy/zcount/zrem 应该工作', async () => {
      await cache.zset.zadd('z2', { score: 1, member: 'x' })

      const incr = await cache.zset.zincrBy('z2', 4, 'x')
      expect(incr.success).toBe(true)
      if (incr.success) {
        expect(incr.data).toBe(5)
      }

      const count = await cache.zset.zcount('z2', 0, 10)
      expect(count.success).toBe(true)
      if (count.success) {
        expect(count.data).toBe(1)
      }

      const rem = await cache.zset.zrem('z2', 'x')
      expect(rem.success).toBe(true)
      if (rem.success) {
        expect(rem.data).toBe(1)
      }
    })
  }

  defineCacheSuite('memory', memoryEnv, defineCommon)
  defineCacheSuite('redis', redisEnv, defineCommon)
})
