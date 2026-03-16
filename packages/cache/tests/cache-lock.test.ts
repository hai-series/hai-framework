/**
 * =============================================================================
 * @h-ai/cache - 分布式锁操作测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { cache } from '../src/index.js'
import { defineCacheSuite, memoryEnv, redisEnv } from './helpers/cache-test-suite.js'

describe('cache lock operations', () => {
  const defineCommon = () => {
    // ─── acquire ───

    it('首次 acquire 应成功', async () => {
      const result = await cache.lock.acquire('my-lock')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(true)
      }
    })

    it('同一锁键 acquire 两次，第二次应失败', async () => {
      const first = await cache.lock.acquire('dup-lock')
      expect(first.success).toBe(true)
      if (first.success)
        expect(first.data).toBe(true)

      const second = await cache.lock.acquire('dup-lock')
      expect(second.success).toBe(true)
      if (second.success)
        expect(second.data).toBe(false)
    })

    it('不同锁键应各自独立', async () => {
      const a = await cache.lock.acquire('lock-a')
      const b = await cache.lock.acquire('lock-b')
      expect(a.success).toBe(true)
      expect(b.success).toBe(true)
      if (a.success)
        expect(a.data).toBe(true)
      if (b.success)
        expect(b.data).toBe(true)
    })

    it('acquire 支持自定义 owner', async () => {
      const result = await cache.lock.acquire('owned-lock', { owner: 'node-1' })
      expect(result.success).toBe(true)
      if (result.success)
        expect(result.data).toBe(true)
    })

    it('acquire 支持自定义 ttl', async () => {
      const result = await cache.lock.acquire('ttl-lock', { ttl: 5 })
      expect(result.success).toBe(true)
      if (result.success)
        expect(result.data).toBe(true)
    })

    // ─── release ───

    it('release 已持有的锁应成功', async () => {
      await cache.lock.acquire('rel-lock')
      const released = await cache.lock.release('rel-lock')
      expect(released.success).toBe(true)
      if (released.success)
        expect(released.data).toBe(true)
    })

    it('release 不存在的锁应返回 false', async () => {
      const released = await cache.lock.release('nonexistent-lock')
      expect(released.success).toBe(true)
      if (released.success)
        expect(released.data).toBe(false)
    })

    it('release 后可重新 acquire', async () => {
      await cache.lock.acquire('reacquire-lock')
      await cache.lock.release('reacquire-lock')

      const result = await cache.lock.acquire('reacquire-lock')
      expect(result.success).toBe(true)
      if (result.success)
        expect(result.data).toBe(true)
    })

    it('release 带 owner 匹配时应成功', async () => {
      await cache.lock.acquire('owner-rel', { owner: 'node-1' })
      const released = await cache.lock.release('owner-rel', 'node-1')
      expect(released.success).toBe(true)
      if (released.success)
        expect(released.data).toBe(true)
    })

    it('release 带 owner 不匹配时应失败', async () => {
      await cache.lock.acquire('owner-mismatch', { owner: 'node-1' })
      const released = await cache.lock.release('owner-mismatch', 'node-2')
      expect(released.success).toBe(true)
      if (released.success)
        expect(released.data).toBe(false)
    })

    // ─── isLocked ───

    it('isLocked 已持有锁应返回 true', async () => {
      await cache.lock.acquire('check-lock')
      const result = await cache.lock.isLocked('check-lock')
      expect(result.success).toBe(true)
      if (result.success)
        expect(result.data).toBe(true)
    })

    it('isLocked 不存在的锁应返回 false', async () => {
      const result = await cache.lock.isLocked('no-lock')
      expect(result.success).toBe(true)
      if (result.success)
        expect(result.data).toBe(false)
    })

    it('isLocked 释放后应返回 false', async () => {
      await cache.lock.acquire('check-release')
      await cache.lock.release('check-release')
      const result = await cache.lock.isLocked('check-release')
      expect(result.success).toBe(true)
      if (result.success)
        expect(result.data).toBe(false)
    })

    // ─── extend ───

    it('extend 已持有锁应成功', async () => {
      await cache.lock.acquire('ext-lock', { ttl: 10 })
      const result = await cache.lock.extend('ext-lock', 60)
      expect(result.success).toBe(true)
      if (result.success)
        expect(result.data).toBe(true)
    })

    it('extend 不存在的锁应返回 false', async () => {
      const result = await cache.lock.extend('no-ext-lock', 60)
      expect(result.success).toBe(true)
      if (result.success)
        expect(result.data).toBe(false)
    })

    it('extend 带 owner 匹配应成功', async () => {
      await cache.lock.acquire('ext-owner', { owner: 'node-1' })
      const result = await cache.lock.extend('ext-owner', 60, 'node-1')
      expect(result.success).toBe(true)
      if (result.success)
        expect(result.data).toBe(true)
    })

    it('extend 带 owner 不匹配应失败', async () => {
      await cache.lock.acquire('ext-mismatch', { owner: 'node-1' })
      const result = await cache.lock.extend('ext-mismatch', 60, 'node-2')
      expect(result.success).toBe(true)
      if (result.success)
        expect(result.data).toBe(false)
    })

    // ─── 过期自动释放 ───

    it('锁过期后应自动释放（可重新获取）', async () => {
      await cache.lock.acquire('expire-lock', { ttl: 1 })
      // 等待锁过期
      await new Promise(resolve => setTimeout(resolve, 1100))
      const result = await cache.lock.acquire('expire-lock')
      expect(result.success).toBe(true)
      if (result.success)
        expect(result.data).toBe(true)
    })
  }

  defineCacheSuite('memory', memoryEnv, defineCommon)
  defineCacheSuite('redis', redisEnv, defineCommon)
})
