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

    // ─── 边界场景 ───

    it('hget 不存在的 key 应返回 null', async () => {
      const result = await cache.hash.hget('nonexistent-hash', 'f1')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBeNull()
      }
    })

    it('hget 不存在的 field 应返回 null', async () => {
      await cache.hash.hset('h-partial', 'f1', 'v1')
      const result = await cache.hash.hget('h-partial', 'missing')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBeNull()
      }
    })

    it('hgetall 不存在的 key 应返回空对象', async () => {
      const result = await cache.hash.hgetall('nonexistent-hash-all')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual({})
      }
    })

    it('hexists 不存在的 key 应返回 false', async () => {
      const result = await cache.hash.hexists('nonexistent-hash-ex', 'f1')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(false)
      }
    })

    it('hdel 不存在的 field 应返回 0', async () => {
      await cache.hash.hset('h-del', 'f1', 'v1')
      const result = await cache.hash.hdel('h-del', 'missing')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(0)
      }
    })

    it('hlen 不存在的 key 应返回 0', async () => {
      const result = await cache.hash.hlen('nonexistent-hlen')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(0)
      }
    })

    it('hkeys/hvals 不存在的 key 应返回空数组', async () => {
      const keys = await cache.hash.hkeys('nonexistent-hkeys')
      expect(keys.success).toBe(true)
      if (keys.success) {
        expect(keys.data).toEqual([])
      }

      const vals = await cache.hash.hvals('nonexistent-hvals')
      expect(vals.success).toBe(true)
      if (vals.success) {
        expect(vals.data).toEqual([])
      }
    })

    it('hincrBy 对不存在的 key/field 应从 0 开始', async () => {
      const result = await cache.hash.hincrBy('new-hash-incr', 'counter', 5)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(5)
      }
    })

    it('hset 覆盖已有字段不应增加计数', async () => {
      await cache.hash.hset('h-overwrite', 'f1', 'v1')
      const result = await cache.hash.hset('h-overwrite', 'f1', 'v2')
      expect(result.success).toBe(true)
      if (result.success) {
        // hset 返回的是新增字段数，覆盖已有字段返回 0
        expect(result.data).toBe(0)
      }

      const val = await cache.hash.hget('h-overwrite', 'f1')
      expect(val.success).toBe(true)
      if (val.success) {
        expect(val.data).toBe('v2')
      }
    })
  }

  defineCacheSuite('memory', memoryEnv, defineCommon)
  defineCacheSuite('redis', redisEnv, defineCommon)
})
