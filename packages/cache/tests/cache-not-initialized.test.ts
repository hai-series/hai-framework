/**
 * =============================================================================
 * @hai/cache - 未初始化行为测试
 * =============================================================================
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { cache, CacheErrorCode } from '../src/index.js'

describe.sequential('cache (not initialized)', () => {
  beforeEach(async () => {
    await cache.close()
  })

  it('基础操作应返回 NOT_INITIALIZED', async () => {
    const result = await cache.get('k1')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(CacheErrorCode.NOT_INITIALIZED)
    }
  })

  it('hash/list/set/zset 操作应返回 NOT_INITIALIZED', async () => {
    const hash = await cache.hash.hget('h1', 'f1')
    expect(hash.success).toBe(false)
    if (!hash.success) {
      expect(hash.error.code).toBe(CacheErrorCode.NOT_INITIALIZED)
    }

    const list = await cache.list.lpop('l1')
    expect(list.success).toBe(false)
    if (!list.success) {
      expect(list.error.code).toBe(CacheErrorCode.NOT_INITIALIZED)
    }

    const setResult = await cache.set_.sadd('s1', 'a')
    expect(setResult.success).toBe(false)
    if (!setResult.success) {
      expect(setResult.error.code).toBe(CacheErrorCode.NOT_INITIALIZED)
    }

    const zset = await cache.zset.zadd('z1', { score: 1, member: 'm1' })
    expect(zset.success).toBe(false)
    if (!zset.success) {
      expect(zset.error.code).toBe(CacheErrorCode.NOT_INITIALIZED)
    }
  })
})
