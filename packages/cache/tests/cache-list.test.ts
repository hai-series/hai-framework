/**
 * =============================================================================
 * @hai/cache - List 操作测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { cache, CacheErrorCode } from '../src/index.js'
import { defineCacheSuite, memoryEnv, redisEnv } from './helpers/cache-test-suite.js'

describe('cache list operations', () => {
  const defineCommon = (expectations: {
    rangeAfterPush: string[]
    lpopValue: string
    missingKeyError: number
  }) => {
    it('lpush/rpush/llen/lrange/lpop/rpop 应该工作', async () => {
      const lpush = await cache.list.lpush('l1', 'a', 'b')
      expect(lpush.success).toBe(true)

      const rpush = await cache.list.rpush('l1', 'c')
      expect(rpush.success).toBe(true)

      const len = await cache.list.llen('l1')
      expect(len.success).toBe(true)
      if (len.success) {
        expect(len.data).toBe(3)
      }

      const range = await cache.list.lrange('l1', 0, -1)
      expect(range.success).toBe(true)
      if (range.success) {
        expect(range.data).toEqual(expectations.rangeAfterPush)
      }

      const lpop = await cache.list.lpop('l1')
      expect(lpop.success).toBe(true)
      if (lpop.success) {
        expect(lpop.data).toBe(expectations.lpopValue)
      }

      const rpop = await cache.list.rpop('l1')
      expect(rpop.success).toBe(true)
      if (rpop.success) {
        expect(rpop.data).toBe('c')
      }
    })

    it('lindex/lset/ltrim 应该工作', async () => {
      await cache.list.rpush('l2', 'x', 'y', 'z')

      const index = await cache.list.lindex('l2', 1)
      expect(index.success).toBe(true)
      if (index.success) {
        expect(index.data).toBe('y')
      }

      const setResult = await cache.list.lset('l2', 1, 'yy')
      expect(setResult.success).toBe(true)

      const trimmed = await cache.list.ltrim('l2', 0, 1)
      expect(trimmed.success).toBe(true)

      const range = await cache.list.lrange('l2', 0, -1)
      expect(range.success).toBe(true)
      if (range.success) {
        expect(range.data).toEqual(['x', 'yy'])
      }
    })

    it('lset 在 key 不存在时应返回 KEY_NOT_FOUND', async () => {
      const result = await cache.list.lset('missing', 0, 'x')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(expectations.missingKeyError)
      }
    })
  }

  defineCacheSuite('memory', memoryEnv, () => defineCommon({
    rangeAfterPush: ['a', 'b', 'c'],
    lpopValue: 'a',
    missingKeyError: CacheErrorCode.KEY_NOT_FOUND,
  }))

  defineCacheSuite('redis', redisEnv, () => defineCommon({
    rangeAfterPush: ['b', 'a', 'c'],
    lpopValue: 'b',
    missingKeyError: CacheErrorCode.OPERATION_FAILED,
  }))
})
