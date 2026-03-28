/**
 * =============================================================================
 * @h-ai/cache - KV 高级操作测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { cache } from '../src/index.js'
import { defineCacheSuite, memoryEnv, redisEnv } from './helpers/cache-test-suite.js'

describe('cache kv advanced operations', () => {
  const defineCommon = () => {
    // ─── get 边界 ───

    it('get 不存在的 key 应返回 null', async () => {
      const result = await cache.kv.get('nonexistent')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBeNull()
      }
    })

    // ─── set 选项 ───

    it('set nx: 仅在 key 不存在时设置', async () => {
      const first = await cache.kv.set('nx-key', 'v1', { nx: true })
      expect(first.success).toBe(true)

      // 第二次设置应不覆盖原值
      await cache.kv.set('nx-key', 'v2', { nx: true })
      const result = await cache.kv.get('nx-key')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe('v1')
      }
    })

    it('set xx: 仅在 key 已存在时设置', async () => {
      // key 不存在时设置应无效
      await cache.kv.set('xx-key', 'v1', { xx: true })
      const result1 = await cache.kv.get('xx-key')
      expect(result1.success).toBe(true)
      if (result1.success) {
        expect(result1.data).toBeNull()
      }

      // key 存在时设置应生效
      await cache.kv.set('xx-key', 'orig')
      await cache.kv.set('xx-key', 'updated', { xx: true })
      const result2 = await cache.kv.get('xx-key')
      expect(result2.success).toBe(true)
      if (result2.success) {
        expect(result2.data).toBe('updated')
      }
    })

    it('set ex: 设置秒级过期时间', async () => {
      await cache.kv.set('ex-key', 'temp', { ex: 100 })
      const ttl = await cache.kv.ttl('ex-key')
      expect(ttl.success).toBe(true)
      if (ttl.success) {
        expect(ttl.data).toBeGreaterThan(0)
        expect(ttl.data).toBeLessThanOrEqual(100)
      }
    })

    it('set keepTtl: 保留原有过期时间', async () => {
      await cache.kv.set('keep-key', 'v1', { ex: 200 })
      await cache.kv.set('keep-key', 'v2', { keepTtl: true })

      const val = await cache.kv.get('keep-key')
      expect(val.success).toBe(true)
      if (val.success) {
        expect(val.data).toBe('v2')
      }

      const ttl = await cache.kv.ttl('keep-key')
      expect(ttl.success).toBe(true)
      if (ttl.success) {
        expect(ttl.data).toBeGreaterThan(0)
      }
    })

    // ─── del 边界 ───

    it('del 不存在的 key 应返回 0', async () => {
      const result = await cache.kv.del('nonexistent-del')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(0)
      }
    })

    // ─── exists 边界 ───

    it('exists 不存在的 key 应返回 0', async () => {
      const result = await cache.kv.exists('nonexistent-exists')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(0)
      }
    })

    // ─── expireAt ───

    it('expireAt 应按时间戳设置过期', async () => {
      await cache.kv.set('ea-key', 'v')
      const future = Math.floor(Date.now() / 1000) + 300
      const result = await cache.kv.expireAt('ea-key', future)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(true)
      }

      const ttl = await cache.kv.ttl('ea-key')
      expect(ttl.success).toBe(true)
      if (ttl.success) {
        expect(ttl.data).toBeGreaterThan(0)
        // 允许 1 秒容差：Redis TTL 取整可能返回 301
        expect(ttl.data).toBeLessThanOrEqual(301)
      }
    })

    it('expireAt 不存在的 key 应返回 false', async () => {
      const future = Math.floor(Date.now() / 1000) + 300
      const result = await cache.kv.expireAt('nonexistent-ea', future)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(false)
      }
    })

    // ─── ttl 边界 ───

    it('ttl 不存在的 key 应返回 -2', async () => {
      const result = await cache.kv.ttl('nonexistent-ttl')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(-2)
      }
    })

    // ─── expire/persist 边界 ───

    it('expire 不存在的 key 应返回 false', async () => {
      const result = await cache.kv.expire('nonexistent-expire', 60)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(false)
      }
    })

    it('persist 不存在的 key 应返回 false', async () => {
      const result = await cache.kv.persist('nonexistent-persist')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(false)
      }
    })

    // ─── incr / decr ───

    it('incr/decr 应正确自增自减', async () => {
      const incr1 = await cache.kv.incr('counter')
      expect(incr1.success).toBe(true)
      if (incr1.success) {
        expect(incr1.data).toBe(1)
      }

      const incr2 = await cache.kv.incr('counter')
      expect(incr2.success).toBe(true)
      if (incr2.success) {
        expect(incr2.data).toBe(2)
      }

      const decr = await cache.kv.decr('counter')
      expect(decr.success).toBe(true)
      if (decr.success) {
        expect(decr.data).toBe(1)
      }
    })

    it('incrBy/decrBy 应正确自增自减指定值', async () => {
      await cache.kv.set('cnt', 10)
      const incrBy = await cache.kv.incrBy('cnt', 5)
      expect(incrBy.success).toBe(true)
      if (incrBy.success) {
        expect(incrBy.data).toBe(15)
      }

      const decrBy = await cache.kv.decrBy('cnt', 3)
      expect(decrBy.success).toBe(true)
      if (decrBy.success) {
        expect(decrBy.data).toBe(12)
      }
    })

    it('incr 对不存在的 key 应从 0 开始', async () => {
      const result = await cache.kv.incr('new-counter')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(1)
      }
    })

    // ─── scan ───

    it('scan 应能分页遍历所有键', async () => {
      // 写入一批 key
      for (let i = 0; i < 5; i++) {
        await cache.kv.set(`scan:${i}`, `v${i}`)
      }

      const allKeys: string[] = []
      let cursor = 0
      // 最多循环 10 次防止死循环
      for (let round = 0; round < 10; round++) {
        const result = await cache.kv.scan(cursor, { match: 'scan:*', count: 2 })
        expect(result.success).toBe(true)
        if (result.success) {
          const [nextCursor, keys] = result.data
          allKeys.push(...keys)
          cursor = nextCursor
          if (cursor === 0)
            break
        }
      }
      expect(allKeys.sort()).toEqual(['scan:0', 'scan:1', 'scan:2', 'scan:3', 'scan:4'])
    })

    // ─── keys ───

    it('keys 应返回匹配的所有键', async () => {
      await cache.kv.set('kp:a', '1')
      await cache.kv.set('kp:b', '2')
      await cache.kv.set('other', '3')

      const result = await cache.kv.keys('kp:*')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.sort()).toEqual(['kp:a', 'kp:b'])
      }
    })

    it('keys 无匹配时应返回空数组', async () => {
      const result = await cache.kv.keys('no-match:*')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual([])
      }
    })

    // ─── type ───

    it('type 应返回正确的值类型', async () => {
      await cache.kv.set('t-str', 'hello')
      const strType = await cache.kv.type('t-str')
      expect(strType.success).toBe(true)
      if (strType.success) {
        expect(strType.data).toBe('string')
      }

      // 不存在的 key
      const noneType = await cache.kv.type('nonexistent-type')
      expect(noneType.success).toBe(true)
      if (noneType.success) {
        expect(noneType.data).toBe('none')
      }
    })

    // ─── 序列化 ───

    it('set/get 应处理数字、布尔、null 和复杂对象', async () => {
      await cache.kv.set('num', 42)
      const numResult = await cache.kv.get<number>('num')
      expect(numResult.success).toBe(true)
      if (numResult.success) {
        expect(numResult.data).toBe(42)
      }

      await cache.kv.set('bool', true)
      const boolResult = await cache.kv.get<boolean>('bool')
      expect(boolResult.success).toBe(true)
      if (boolResult.success) {
        expect(boolResult.data).toBe(true)
      }

      await cache.kv.set('obj', { nested: { arr: [1, 2, 3] } })
      const objResult = await cache.kv.get<{ nested: { arr: number[] } }>('obj')
      expect(objResult.success).toBe(true)
      if (objResult.success) {
        expect(objResult.data).toEqual({ nested: { arr: [1, 2, 3] } })
      }

      await cache.kv.set('nil', null)
      const nilResult = await cache.kv.get('nil')
      expect(nilResult.success).toBe(true)
      if (nilResult.success) {
        expect(nilResult.data).toBeNull()
      }
    })
  }

  defineCacheSuite('memory', memoryEnv, defineCommon)
  defineCacheSuite('redis', redisEnv, defineCommon)
})
