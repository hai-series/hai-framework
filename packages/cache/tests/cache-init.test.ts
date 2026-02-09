/**
 * =============================================================================
 * @hai/cache - 初始化与状态测试
 * =============================================================================
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { cache, CacheErrorCode } from '../src/index.js'
import { defineCacheSuite, memoryEnv, redisEnv } from './helpers/cache-test-suite.js'

describe('cache.init', () => {
  // ─── 初始化前状态 ───

  describe.sequential('初始化前状态', () => {
    beforeEach(async () => {
      await cache.close()
    })

    it('isInitialized 初始化前应为 false', () => {
      expect(cache.isInitialized).toBe(false)
    })

    it('config 初始化前应为 null', () => {
      expect(cache.config).toBeNull()
    })

    it('close 在未初始化时应安全调用', async () => {
      await cache.close()
      expect(cache.isInitialized).toBe(false)
    })
  })

  // ─── 非法配置 ───

  describe.sequential('非法配置', () => {
    beforeEach(async () => {
      await cache.close()
    })

    it('init 传入非法 type 应返回 CONNECTION_FAILED', async () => {
      const result = await cache.init({ type: 'unknown' } as never)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(CacheErrorCode.CONNECTION_FAILED)
      }
      expect(cache.isInitialized).toBe(false)
    })

    it('init 传入空对象应返回 CONNECTION_FAILED', async () => {
      const result = await cache.init({} as never)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(CacheErrorCode.CONNECTION_FAILED)
      }
    })
  })

  // ─── Memory ───

  defineCacheSuite('memory', memoryEnv, () => {
    it('memory: init 应该初始化缓存并返回配置', async () => {
      expect(cache.isInitialized).toBe(true)
      expect(cache.config?.type).toBe('memory')
    })

    it('memory: ping 在初始化后应返回 PONG', async () => {
      const result = await cache.ping()
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe('PONG')
      }
    })

    it('memory: close 后应恢复未初始化状态', async () => {
      await cache.close()
      expect(cache.isInitialized).toBe(false)
      expect(cache.config).toBeNull()
      const result = await cache.ping()
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(CacheErrorCode.NOT_INITIALIZED)
      }
    })

    it('memory: 重复 init 应先关闭再重新初始化', async () => {
      await cache.kv.set('before', 'v1')
      const initResult = await cache.init({ type: 'memory' })
      expect(initResult.success).toBe(true)
      expect(cache.isInitialized).toBe(true)

      // 重新初始化后旧数据应被清除
      const result = await cache.kv.get('before')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBeNull()
      }
    })
  })

  // ─── Redis ───

  defineCacheSuite('redis', redisEnv, () => {
    it('redis: init 应该初始化缓存并返回配置', async () => {
      expect(cache.isInitialized).toBe(true)
      expect(cache.config?.type).toBe('redis')
    })

    it('redis: ping 在初始化后应返回 PONG', async () => {
      const result = await cache.ping()
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe('PONG')
      }
    })

    it('redis: close 后应恢复未初始化状态', async () => {
      await cache.close()
      expect(cache.isInitialized).toBe(false)
      expect(cache.config).toBeNull()
      const result = await cache.ping()
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(CacheErrorCode.NOT_INITIALIZED)
      }
    })
  })
})
