/**
 * =============================================================================
 * @h-ai/cache - 未初始化行为测试
 * =============================================================================
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { cache, CacheErrorCode } from '../src/index.js'

describe.sequential('cache (not initialized)', () => {
  beforeEach(async () => {
    await cache.close()
  })

  // ─── KV 操作 ───

  it('kv.get 应返回 NOT_INITIALIZED', async () => {
    const result = await cache.kv.get('k1')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(CacheErrorCode.NOT_INITIALIZED)
    }
  })

  it('kv.set 应返回 NOT_INITIALIZED', async () => {
    const result = await cache.kv.set('k1', 'v1')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(CacheErrorCode.NOT_INITIALIZED)
    }
  })

  it('kv.del 应返回 NOT_INITIALIZED', async () => {
    const result = await cache.kv.del('k1')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(CacheErrorCode.NOT_INITIALIZED)
    }
  })

  it('kv.exists 应返回 NOT_INITIALIZED', async () => {
    const result = await cache.kv.exists('k1')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(CacheErrorCode.NOT_INITIALIZED)
    }
  })

  it('kv.incr 应返回 NOT_INITIALIZED', async () => {
    const result = await cache.kv.incr('k1')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(CacheErrorCode.NOT_INITIALIZED)
    }
  })

  it('kv.mget 应返回 NOT_INITIALIZED', async () => {
    const result = await cache.kv.mget('k1', 'k2')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(CacheErrorCode.NOT_INITIALIZED)
    }
  })

  it('kv.mset 应返回 NOT_INITIALIZED', async () => {
    const result = await cache.kv.mset([['k1', 'v1']])
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(CacheErrorCode.NOT_INITIALIZED)
    }
  })

  // ─── Hash 操作 ───

  it('hash.hget 应返回 NOT_INITIALIZED', async () => {
    const result = await cache.hash.hget('h1', 'f1')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(CacheErrorCode.NOT_INITIALIZED)
    }
  })

  it('hash.hset 应返回 NOT_INITIALIZED', async () => {
    const result = await cache.hash.hset('h1', 'f1', 'v1')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(CacheErrorCode.NOT_INITIALIZED)
    }
  })

  // ─── List 操作 ───

  it('list.lpush 应返回 NOT_INITIALIZED', async () => {
    const result = await cache.list.lpush('l1', 'v1')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(CacheErrorCode.NOT_INITIALIZED)
    }
  })

  it('list.lpop 应返回 NOT_INITIALIZED', async () => {
    const result = await cache.list.lpop('l1')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(CacheErrorCode.NOT_INITIALIZED)
    }
  })

  // ─── Set 操作 ───

  it('set_.sadd 应返回 NOT_INITIALIZED', async () => {
    const result = await cache.set_.sadd('s1', 'a')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(CacheErrorCode.NOT_INITIALIZED)
    }
  })

  it('set_.smembers 应返回 NOT_INITIALIZED', async () => {
    const result = await cache.set_.smembers('s1')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(CacheErrorCode.NOT_INITIALIZED)
    }
  })

  // ─── ZSet 操作 ───

  it('zset.zadd 应返回 NOT_INITIALIZED', async () => {
    const result = await cache.zset.zadd('z1', { score: 1, member: 'm1' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(CacheErrorCode.NOT_INITIALIZED)
    }
  })

  it('zset.zrange 应返回 NOT_INITIALIZED', async () => {
    const result = await cache.zset.zrange('z1', 0, -1)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(CacheErrorCode.NOT_INITIALIZED)
    }
  })

  // ─── ping ───

  it('ping 应返回 NOT_INITIALIZED', async () => {
    const result = await cache.ping()
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(CacheErrorCode.NOT_INITIALIZED)
    }
  })
})
