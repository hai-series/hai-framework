/**
 * =============================================================================
 * @hai/cache - 基础操作测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { cache } from '../src/index.js'
import { defineCacheSuite, memoryEnv, redisEnv } from './helpers/cache-test-suite.js'

describe('cache basic operations', () => {
  const defineCommon = (expectedMget: Array<string | number | null>) => {
    it('set/get 应该读写字符串与对象', async () => {
      const setResult = await cache.set('k1', 'v1')
      expect(setResult.success).toBe(true)

      const getResult = await cache.get('k1')
      expect(getResult.success).toBe(true)
      if (getResult.success) {
        expect(getResult.data).toBe('v1')
      }

      await cache.set('k2', { a: 1, b: 'x' })
      const objResult = await cache.get<{ a: number, b: string }>('k2')
      expect(objResult.success).toBe(true)
      if (objResult.success) {
        expect(objResult.data).toEqual({ a: 1, b: 'x' })
      }
    })

    it('mset/mget 应该批量读写', async () => {
      const setResult = await cache.mset([
        ['a', '1'],
        ['b', '2'],
      ])
      expect(setResult.success).toBe(true)

      const getResult = await cache.mget('a', 'b', 'c')
      expect(getResult.success).toBe(true)
      if (getResult.success) {
        expect(getResult.data).toEqual(expectedMget)
      }
    })

    it('exists/del 应该返回正确计数', async () => {
      await cache.set('e1', 'x')
      await cache.set('e2', 'y')

      const existsResult = await cache.exists('e1', 'e2', 'e3')
      expect(existsResult.success).toBe(true)
      if (existsResult.success) {
        expect(existsResult.data).toBe(2)
      }

      const delResult = await cache.del('e1', 'e2')
      expect(delResult.success).toBe(true)
      if (delResult.success) {
        expect(delResult.data).toBe(2)
      }
    })

    it('ttl/expire/persist 应该按预期工作', async () => {
      await cache.set('t1', 'v')
      const ttl1 = await cache.ttl('t1')
      expect(ttl1.success).toBe(true)
      if (ttl1.success) {
        expect(ttl1.data).toBe(-1)
      }

      const expireResult = await cache.expire('t1', 1)
      expect(expireResult.success).toBe(true)
      if (expireResult.success) {
        expect(expireResult.data).toBe(true)
      }

      const ttl2 = await cache.ttl('t1')
      expect(ttl2.success).toBe(true)
      if (ttl2.success) {
        expect(ttl2.data).toBeGreaterThanOrEqual(0)
      }

      const persistResult = await cache.persist('t1')
      expect(persistResult.success).toBe(true)
      if (persistResult.success) {
        expect(persistResult.data).toBe(true)
      }

      const ttl3 = await cache.ttl('t1')
      expect(ttl3.success).toBe(true)
      if (ttl3.success) {
        expect(ttl3.data).toBe(-1)
      }
    })
  }

  defineCacheSuite('memory', memoryEnv, () => defineCommon(['1', '2', null]))
  defineCacheSuite('redis', redisEnv, () => defineCommon([1, 2, null]))
})
