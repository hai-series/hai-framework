/**
 * =============================================================================
 * @hai/cache - 初始化与状态测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { cache, CacheErrorCode } from '../src/index.js'
import { defineCacheSuite, memoryEnv, redisEnv } from './helpers/cache-test-suite.js'

describe('cache.init', () => {
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
      const result = await cache.ping()
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(CacheErrorCode.NOT_INITIALIZED)
      }
    })
  })

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
      const result = await cache.ping()
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(CacheErrorCode.NOT_INITIALIZED)
      }
    })
  })
})
