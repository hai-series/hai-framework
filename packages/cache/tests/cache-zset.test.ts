/**
 * =============================================================================
 * @h-ai/cache - ZSet 操作测试
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

    // ─── 边界场景 ───

    it('zscore 不存在的成员应返回 null', async () => {
      const result = await cache.zset.zscore('nonexistent-zscore', 'missing')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBeNull()
      }
    })

    it('zrank/zrevrank 不存在的成员应返回 null', async () => {
      const rank = await cache.zset.zrank('nonexistent-zrank', 'missing')
      expect(rank.success).toBe(true)
      if (rank.success) {
        expect(rank.data).toBeNull()
      }

      const revrank = await cache.zset.zrevrank('nonexistent-zrevrank', 'missing')
      expect(revrank.success).toBe(true)
      if (revrank.success) {
        expect(revrank.data).toBeNull()
      }
    })

    it('zrange 不存在的 key 应返回空数组', async () => {
      const result = await cache.zset.zrange('nonexistent-zrange', 0, -1)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual([])
      }
    })

    it('zcard 不存在的 key 应返回 0', async () => {
      const result = await cache.zset.zcard('nonexistent-zcard')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(0)
      }
    })

    it('zcount 不存在的 key 应返回 0', async () => {
      const result = await cache.zset.zcount('nonexistent-zcount', 0, 100)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(0)
      }
    })

    it('zrem 不存在的成员应返回 0', async () => {
      await cache.zset.zadd('z-rem', { score: 1, member: 'a' })
      const result = await cache.zset.zrem('z-rem', 'nonexistent')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(0)
      }
    })

    it('zrevrank 应返回逆序排名', async () => {
      await cache.zset.zadd('z-revrank', { score: 10, member: 'a' }, { score: 20, member: 'b' }, { score: 30, member: 'c' })
      const result = await cache.zset.zrevrank('z-revrank', 'a')
      expect(result.success).toBe(true)
      if (result.success) {
        // a 分数最低，逆序排名最后 (index=2)
        expect(result.data).toBe(2)
      }
    })

    it('zrangeByScore 应按分数范围查询', async () => {
      await cache.zset.zadd('z-score', { score: 1, member: 'a' }, { score: 5, member: 'b' }, { score: 10, member: 'c' }, { score: 20, member: 'd' })

      const result = await cache.zset.zrangeByScore('z-score', 3, 15)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual(['b', 'c'])
      }
    })

    it('zrangeByScore withScores 应返回带分数的结果', async () => {
      await cache.zset.zadd('z-score-ws', { score: 1, member: 'a' }, { score: 5, member: 'b' })

      const result = await cache.zset.zrangeByScore('z-score-ws', 0, 10, { withScores: true })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual([
          { member: 'a', score: 1 },
          { member: 'b', score: 5 },
        ])
      }
    })

    it('zrangeByScore 使用 offset/count 应分页', async () => {
      await cache.zset.zadd('z-page', { score: 1, member: 'a' }, { score: 2, member: 'b' }, { score: 3, member: 'c' }, { score: 4, member: 'd' })

      const result = await cache.zset.zrangeByScore('z-page', 0, 10, { offset: 1, count: 2 })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual(['b', 'c'])
      }
    })

    it('zremRangeByRank 应按排名范围删除', async () => {
      await cache.zset.zadd('z-rrr', { score: 1, member: 'a' }, { score: 2, member: 'b' }, { score: 3, member: 'c' })

      // 删除排名 0~1（分数最低的两个）
      const result = await cache.zset.zremRangeByRank('z-rrr', 0, 1)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(2)
      }

      const remaining = await cache.zset.zrange('z-rrr', 0, -1)
      expect(remaining.success).toBe(true)
      if (remaining.success) {
        expect(remaining.data).toEqual(['c'])
      }
    })

    it('zremRangeByScore 应按分数范围删除', async () => {
      await cache.zset.zadd('z-rrs', { score: 1, member: 'a' }, { score: 5, member: 'b' }, { score: 10, member: 'c' })

      const result = await cache.zset.zremRangeByScore('z-rrs', 3, 15)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(2)
      }

      const remaining = await cache.zset.zrange('z-rrs', 0, -1)
      expect(remaining.success).toBe(true)
      if (remaining.success) {
        expect(remaining.data).toEqual(['a'])
      }
    })

    it('zadd 已存在的成员应更新分数而非新增', async () => {
      await cache.zset.zadd('z-update', { score: 10, member: 'a' })
      const addResult = await cache.zset.zadd('z-update', { score: 20, member: 'a' })
      expect(addResult.success).toBe(true)
      if (addResult.success) {
        // 已存在的成员不计入新增数
        expect(addResult.data).toBe(0)
      }

      const score = await cache.zset.zscore('z-update', 'a')
      expect(score.success).toBe(true)
      if (score.success) {
        expect(score.data).toBe(20)
      }
    })

    it('zrevrange 带 withScores 应返回降序带分数结果', async () => {
      await cache.zset.zadd('z-revws', { score: 10, member: 'a' }, { score: 20, member: 'b' })
      const result = await cache.zset.zrevrange('z-revws', 0, -1, true)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual([
          { member: 'b', score: 20 },
          { member: 'a', score: 10 },
        ])
      }
    })
  }

  defineCacheSuite('memory', memoryEnv, defineCommon)
  defineCacheSuite('redis', redisEnv, defineCommon)
})
