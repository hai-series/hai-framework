import type { CacheValue, SetOptions } from '../src/index.js'
import { describe, expect, it } from 'vitest'
import { cache, HaiCacheError } from '../src/index.js'
import { defineCacheSuite, memoryEnv, redisEnv } from './helpers/cache-test-suite.js'

function defineSetOptionsTests(): void {
  it.each(['ex', 'px', 'exat', 'pxat'] as const)('拒绝 %s 的零、负数、非整数及溢出值，保留值和 TTL', async (mode) => {
    await cache.kv.set('expiry', 'original', { ex: 120 })
    for (const value of [0, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      expect(await cache.kv.set('expiry', 'changed', { [mode]: value })).toMatchObject({ success: false, error: { code: HaiCacheError.INVALID_SET_OPTIONS.code } })
      expect(await cache.kv.get('expiry')).toMatchObject({ success: true, data: 'original' })
      const ttl = await cache.kv.ttl('expiry')
      expect(ttl.success && ttl.data > 0 && ttl.data <= 120).toBe(true)
    }
  })

  it.each<SetOptions>([{ ex: 10, px: 1000 }, { exat: 1, pxat: 1 }, { ex: 10, keepTtl: true }, { nx: true, xx: true }])('拒绝冲突策略 %j 且不创建键', async (options) => {
    expect(await cache.kv.set('conflict', 'value', options)).toMatchObject({ success: false, error: { code: HaiCacheError.INVALID_SET_OPTIONS.code } })
    expect(await cache.kv.ttl('conflict')).toMatchObject({ success: true, data: -2 })
  })

  it('正数的过去绝对时间实际写入后立即过期，不能变为永久键', async () => {
    for (const options of [{ exat: Math.floor(Date.now() / 1000) - 10 }, { pxat: Date.now() - 10_000 }]) {
      await cache.kv.set('past', 'old')
      expect(await cache.kv.set('past', 'new', options)).toEqual({ success: true, data: true })
      expect(await cache.kv.get('past')).toMatchObject({ success: true, data: null })
      expect(await cache.kv.ttl('past')).toMatchObject({ success: true, data: -2 })
    }
  })

  it('并发 NX 只有一次实际写入，未命中不覆盖值和 TTL，XX 缺失返回 false', async () => {
    const results = await Promise.all(Array.from({ length: 12 }, (_, index) => cache.kv.set('claim', index, { nx: true, ex: 120 })))
    expect(results.filter(result => result.success && result.data)).toHaveLength(1)
    expect(results.every(result => result.success)).toBe(true)
    const value = await cache.kv.get('claim')
    expect(await cache.kv.set('claim', 'overwritten', { nx: true })).toEqual({ success: true, data: false })
    expect(await cache.kv.get('claim')).toEqual(value)
    const ttl = await cache.kv.ttl('claim')
    expect(ttl.success && ttl.data > 0 && ttl.data <= 120).toBe(true)
    expect(await cache.kv.set('missing', 'value', { xx: true, ex: 20 })).toEqual({ success: true, data: false })
    expect(await cache.kv.ttl('missing')).toMatchObject({ success: true, data: -2 })
    expect(await cache.kv.set('claim', 'updated', { xx: true, keepTtl: true })).toEqual({ success: true, data: true })
    const kept = await cache.kv.ttl('claim')
    expect(kept.success && kept.data > 0 && kept.data <= 120).toBe(true)
    expect(await cache.kv.set('claim', 'permanent', { xx: true })).toEqual({ success: true, data: true })
    expect(await cache.kv.ttl('claim')).toMatchObject({ success: true, data: -1 })
    expect(await cache.kv.set('absent', 'permanent', { nx: true, keepTtl: true })).toEqual({ success: true, data: true })
    expect(await cache.kv.ttl('absent')).toMatchObject({ success: true, data: -1 })
  })

  it('条件检查包含其他 Redis 数据类型，SET 成功才替换原结构', async () => {
    await cache.hash.hset('typed', 'field', 'original')
    expect(await cache.kv.set('typed', 'replacement', { nx: true })).toEqual({ success: true, data: false })
    expect(await cache.hash.hget('typed', 'field')).toMatchObject({ success: true, data: 'original' })
    expect(await cache.kv.set('typed', 'replacement', { xx: true })).toEqual({ success: true, data: true })
    expect(await cache.kv.get('typed')).toMatchObject({ success: true, data: 'replacement' })
    expect(await cache.kv.type('typed')).toMatchObject({ success: true, data: 'string' })
  })

  it('使用 JSON 快照，序列化失败不会破坏原值和 TTL', async () => {
    const value = { nested: { value: 1 } }
    await cache.kv.set('snapshot', value, { px: 120_000 })
    value.nested.value = 2
    expect(await cache.kv.get('snapshot')).toMatchObject({ success: true, data: { nested: { value: 1 } } })
    const circular: Record<string, CacheValue> = {}
    circular.self = circular
    expect((await cache.kv.set('snapshot', circular)).success).toBe(false)
    expect(await cache.kv.get('snapshot')).toMatchObject({ success: true, data: { nested: { value: 1 } } })
    const ttl = await cache.kv.ttl('snapshot')
    expect(ttl.success && ttl.data > 0 && ttl.data <= 120).toBe(true)
  })
}

describe('sET expiry and applied contract', () => {
  defineCacheSuite('memory SET contract', memoryEnv, defineSetOptionsTests)
  defineCacheSuite('real Redis SET contract with keyPrefix', async () => {
    const env = await redisEnv()
    if (env.config.type !== 'redis')
      throw new Error('Redis test configuration required')
    return { ...env, config: { ...env.config, keyPrefix: 'cache-set-options:' } }
  }, defineSetOptionsTests)
})
