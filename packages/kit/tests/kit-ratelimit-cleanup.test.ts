/** 无定时器的内存限流：生命周期、容量、惰性回收与外部存储所有权。 */
import type { RequestEvent } from '@sveltejs/kit'
import type { MiddlewareContext } from '../src/kit-types.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryRateLimitStore, rateLimitMiddleware } from '../src/middleware/kit-ratelimit.js'

function context(key = 'client'): MiddlewareContext {
  return { event: { getClientAddress: () => key } as RequestEvent, requestId: 'memory-lifecycle' }
}

describe('memory rate limit lifecycle', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('重复创建和使用不产生计时器，丢弃引用即可回收', async () => {
    const timers = vi.getTimerCount()
    for (let index = 0; index < 100; index++) {
      const middleware = rateLimitMiddleware({ windowMs: 1000, maxRequests: 1, store: createMemoryRateLimitStore() })
      expect((await middleware(context(), async () => new Response())).status).toBe(200)
    }
    expect(vi.getTimerCount()).toBe(timers)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(vi.getTimerCount()).toBe(timers)
  })

  it('容量满时拒绝新 key，保留已有有效计数，过期后按请求回收空间', async () => {
    const store = createMemoryRateLimitStore()
    for (let index = 0; index < 10_000; index++)
      store.increment(`client-${index}`, 1000)
    const middleware = rateLimitMiddleware({ windowMs: 1000, maxRequests: 1, store })
    const next = vi.fn(async () => new Response())
    expect((await middleware(context('overflow'), next)).status).toBe(503)
    expect(next).not.toHaveBeenCalled()
    expect((await middleware(context('client-9999'), next)).status).toBe(429)
    await vi.advanceTimersByTimeAsync(1000)
    for (let index = 0; index < 200; index++)
      expect((await middleware(context(`new-${index}`), next)).status).toBe(200)
    expect(store.increment('client-9999', 1000).count).toBe(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('窗口快照不泄漏内部可变状态，活动窗口不被惰性清理提前删除', () => {
    const store = createMemoryRateLimitStore()
    const original = store.increment('client', 1000)
    original.count = 0
    original.resetAt = 0
    vi.advanceTimersByTime(999)
    expect(store.increment('client', 1000)).toMatchObject({ count: 2, resetAt: Date.now() + 1 })
    vi.advanceTimersByTime(1)
    expect(store.increment('client', 1000).count).toBe(1)
  })

  it('外部注入 store 的关闭与资源生命周期仍由调用者管理', async () => {
    const external = { scope: 'shared' as const, increment: vi.fn(() => ({ count: 1, resetAt: Date.now() + 1000 })), close: vi.fn(), stopCleanup: vi.fn() }
    for (let index = 0; index < 100; index++) {
      const middleware = rateLimitMiddleware({ windowMs: 1000, maxRequests: 1, store: external })
      await middleware(context(), async () => new Response())
    }
    expect(external.close).not.toHaveBeenCalled()
    expect(external.stopCleanup).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})
