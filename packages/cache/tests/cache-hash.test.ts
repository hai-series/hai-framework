/**
 * =============================================================================
 * @hai/cache - Hash 操作测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { cache } from '../src/index.js'
import { defineCacheSuite, memoryEnv, redisEnv } from './helpers/cache-test-suite.js'

describe('cache hash operations', () => {
  const defineCommon = () => {
    it('hset/hget/hgetall/hexists/hdel 应该工作', async () => {
      const setOne = await cache.hash.hset('h1', 'f1', 'v1')
      expect(setOne.success).toBe(true)

      const setMany = await cache.hash.hset('h1', { f2: 'v2', f3: 'v3' })
      expect(setMany.success).toBe(true)

      const getOne = await cache.hash.hget('h1', 'f1')
      expect(getOne.success).toBe(true)
      if (getOne.success) {
        expect(getOne.data).toBe('v1')
      }

      const exists = await cache.hash.hexists('h1', 'f2')
      expect(exists.success).toBe(true)
      if (exists.success) {
        expect(exists.data).toBe(true)
      }

      const all = await cache.hash.hgetall('h1')
      expect(all.success).toBe(true)
      if (all.success) {
        expect(all.data).toEqual({ f1: 'v1', f2: 'v2', f3: 'v3' })
      }

      const del = await cache.hash.hdel('h1', 'f3')
      expect(del.success).toBe(true)
      if (del.success) {
        expect(del.data).toBe(1)
      }
    })

    it('hmget/hkeys/hvals/hlen/hincrBy 应该工作', async () => {
      await cache.hash.hset('h2', { a: 1, b: 2 })

      const keys = await cache.hash.hkeys('h2')
      expect(keys.success).toBe(true)
      if (keys.success) {
        expect(keys.data.sort()).toEqual(['a', 'b'])
      }

      const values = await cache.hash.hvals<number>('h2')
      expect(values.success).toBe(true)
      if (values.success) {
        expect(values.data.sort()).toEqual([1, 2])
      }

      const len = await cache.hash.hlen('h2')
      expect(len.success).toBe(true)
      if (len.success) {
        expect(len.data).toBe(2)
      }

      const hmget = await cache.hash.hmget<number>('h2', 'a', 'c')
      expect(hmget.success).toBe(true)
      if (hmget.success) {
        expect(hmget.data).toEqual([1, null])
      }

      const incr = await cache.hash.hincrBy('h2', 'a', 3)
      expect(incr.success).toBe(true)
      if (incr.success) {
        expect(incr.data).toBe(4)
      }
    })
  }

  defineCacheSuite('memory', memoryEnv, defineCommon)
  defineCacheSuite('redis', redisEnv, defineCommon)
})
