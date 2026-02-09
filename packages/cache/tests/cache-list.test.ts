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

    it('lset 在 key 不存在时应返回错误', async () => {
      const result = await cache.list.lset('missing', 0, 'x')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(expectations.missingKeyError)
      }
    })

    // ─── 边界场景 ───

    it('lpop/rpop 在空/不存在的列表应返回 null', async () => {
      const lpop = await cache.list.lpop('nonexistent-list')
      expect(lpop.success).toBe(true)
      if (lpop.success) {
        expect(lpop.data).toBeNull()
      }

      const rpop = await cache.list.rpop('nonexistent-list')
      expect(rpop.success).toBe(true)
      if (rpop.success) {
        expect(rpop.data).toBeNull()
      }
    })

    it('llen 不存在的 key 应返回 0', async () => {
      const result = await cache.list.llen('nonexistent-llen')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(0)
      }
    })

    it('lrange 不存在的 key 应返回空数组', async () => {
      const result = await cache.list.lrange('nonexistent-lrange', 0, -1)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual([])
      }
    })

    it('lindex 不存在的 key 应返回 null', async () => {
      const result = await cache.list.lindex('nonexistent-lindex', 0)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBeNull()
      }
    })

    it('lrange 使用负数索引应正确工作', async () => {
      await cache.list.rpush('l-neg', 'a', 'b', 'c', 'd', 'e')
      const result = await cache.list.lrange('l-neg', -3, -1)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual(['c', 'd', 'e'])
      }
    })

    it('lindex 使用负数索引应返回倒数元素', async () => {
      await cache.list.rpush('l-neg-idx', 'a', 'b', 'c')
      const result = await cache.list.lindex('l-neg-idx', -1)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe('c')
      }
    })

    it('blpop 在有数据时应立即返回', async () => {
      await cache.list.rpush('bq', 'task1')
      const result = await cache.list.blpop<string>(1, 'bq')
      expect(result.success).toBe(true)
      if (result.success && result.data) {
        const [key, value] = result.data
        expect(key).toBe('bq')
        expect(value).toBe('task1')
      }
    })

    it('brpop 在有数据时应立即返回', async () => {
      await cache.list.rpush('brq', 'task1', 'task2')
      const result = await cache.list.brpop<string>(1, 'brq')
      expect(result.success).toBe(true)
      if (result.success && result.data) {
        const [key, value] = result.data
        expect(key).toBe('brq')
        expect(value).toBe('task2')
      }
    })

    it('list 应支持对象类型', async () => {
      const item = { id: 1, name: 'test' }
      await cache.list.rpush('l-obj', item)
      const result = await cache.list.lpop<{ id: number, name: string }>('l-obj')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual(item)
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
