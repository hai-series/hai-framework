/**
 * =============================================================================
 * @h-ai/kit - MemoryRateLimitStore stopCleanup 测试
 * =============================================================================
 * 验证：startCleanup 启动的定时器必须能通过 stopCleanup 正确清理，
 * 防止资源泄漏（符合 hai-framework 性能/分布式约束）。
 * =============================================================================
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRateLimitStore } from '../src/middleware/kit-ratelimit.js'

describe('memoryRateLimitStore.stopCleanup', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('startCleanup 后过期条目会被定期清理', () => {
    const store = new MemoryRateLimitStore()
    store.set('a', { count: 1, resetAt: Date.now() - 1000 })
    expect(store.get('a')).toBeDefined()

    store.startCleanup(50)
    vi.advanceTimersByTime(60)

    expect(store.get('a')).toBeUndefined()
    store.stopCleanup()
  })

  it('stopCleanup 后定时器不再触发', () => {
    const store = new MemoryRateLimitStore()
    store.startCleanup(50)
    store.stopCleanup()

    // 在停止后写入过期条目，定时器若仍在运行则会清除
    store.set('b', { count: 1, resetAt: Date.now() - 1000 })
    vi.advanceTimersByTime(200)

    expect(store.get('b')).toBeDefined()
  })

  it('stopCleanup 可重复调用且幂等', () => {
    const store = new MemoryRateLimitStore()
    store.startCleanup(50)
    expect(() => {
      store.stopCleanup()
      store.stopCleanup()
    }).not.toThrow()
  })

  it('stopCleanup 后再次 startCleanup 可正常工作', () => {
    const store = new MemoryRateLimitStore()
    store.startCleanup(50)
    store.stopCleanup()
    store.startCleanup(50)

    store.set('c', { count: 1, resetAt: Date.now() - 1000 })
    vi.advanceTimersByTime(60)

    expect(store.get('c')).toBeUndefined()
    store.stopCleanup()
  })
})
