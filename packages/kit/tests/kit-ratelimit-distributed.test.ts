/** 共享原子计数、固定窗口边界、故障关闭与可信地址规范化。 */
import type { RequestEvent } from '@sveltejs/kit'
import type { MiddlewareContext } from '../src/kit-types.js'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it, vi } from 'vitest'
import { cache } from '../../cache/src/cache-main.js'
import { acquireRedisContainer } from '../../iam/tests/helpers/redis-container.js'
import { createCacheRateLimitStore, MemoryRateLimitStore, rateLimitMiddleware } from '../src/middleware/kit-ratelimit.js'

/** 仅创建该中间件实际访问的RequestEvent字段，不模拟SvelteKit路由实现。 */
function context(address = '127.0.0.1'): MiddlewareContext {
  return { event: { getClientAddress: () => address, request: new Request('https://app.test', { headers: { 'x-forwarded-for': 'attacker-controlled' } }) } as RequestEvent, requestId: 'test-rate-limit' }
}

afterEach(async () => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  await cache.close()
})

it('没有原子计数器时立即拒绝构造，不使用get/set回退', () => {
  // 运行时输入验证覆盖JS消费者缺失store的情况。
  expect(() => rateLimitMiddleware({ windowMs: 1000, maxRequests: 1, store: undefined! })).toThrow('atomic')
})

it('固定窗口等于边界时重置，后续请求不延长期限', async () => {
  vi.useFakeTimers()
  const store = new MemoryRateLimitStore()
  const limited = rateLimitMiddleware({ windowMs: 1000, maxRequests: 1, store })
  const next = vi.fn(async () => new Response('OK'))
  expect((await limited(context(), next)).status).toBe(200)
  await vi.advanceTimersByTimeAsync(999)
  expect((await limited(context(), next)).status).toBe(429)
  await vi.advanceTimersByTimeAsync(1)
  expect((await limited(context(), next)).status).toBe(200)
  expect(next).toHaveBeenCalledTimes(2)
})

it('共享存储故障返回503且不执行后续业务；生产拒绝内存后端', async () => {
  const next = vi.fn(async () => new Response('OK'))
  const failed = rateLimitMiddleware({ windowMs: 1000, maxRequests: 1, store: { scope: 'shared', increment: async () => {
    throw new Error('offline')
  } } })
  expect((await failed(context(), next)).status).toBe(503)
  expect(next).not.toHaveBeenCalled()
  await cache.init({ type: 'memory' })
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('HAI_E2E', '0')
  vi.stubEnv('HAI_E2E_MOCK', '0')
  expect(() => rateLimitMiddleware({ windowMs: 1000, maxRequests: 1, store: new MemoryRateLimitStore() })).toThrow('Memory')
  const shared = rateLimitMiddleware({ windowMs: 1000, maxRequests: 1, store: createCacheRateLimitStore(cache, { namespace: 'production', allowMemory: true }) })
  expect((await shared(context(), next)).status).toBe(503)
  vi.stubEnv('HAI_E2E', '1')
  expect((await shared(context(), next)).status).toBe(200)
})

it('等价IPv6/IPv4映射地址共享计数，不采信任意代理请求头', async () => {
  const limited = rateLimitMiddleware({ windowMs: 1000, maxRequests: 1, store: new MemoryRateLimitStore() })
  const next = async () => new Response('OK')
  expect((await limited(context('2001:0db8:0000:0000:0000:0000:0000:0001'), next)).status).toBe(200)
  expect((await limited(context('2001:db8::1'), next)).status).toBe(429)
  expect((await limited(context('::ffff:127.0.0.1'), next)).status).toBe(200)
  expect((await limited(context('127.0.0.1'), next)).status).toBe(429)
})

it('两个独立HTTP进程共享Redis总放行5次，节点时钟差异不提前重置TTL', async () => {
  const redis = await acquireRedisContainer()
  const children: ReturnType<typeof spawn>[] = []
  try {
    const config = { type: 'redis' as const, host: redis.host, port: redis.port }
    await cache.init(config)
    const namespace = `process-${crypto.randomUUID()}`
    const urls = await Promise.all([0, 7200000].map(async (clockSkew) => {
      const child = spawn(process.execPath, [fileURLToPath(new URL('./helpers-rate-limit-worker.mjs', import.meta.url))], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'ipc'], env: { ...process.env, KIT_RATE_LIMIT_WORKER: JSON.stringify({ cache: config, namespace, clockSkew }) } })
      children.push(child)
      const ready = await Promise.race([once(child, 'message'), once(child, 'exit').then(() => {
        throw new Error('Worker exited before listening')
      })])
      const message = ready[0] as { port: number }
      return `http://127.0.0.1:${message.port}`
    }))
    const statuses = await Promise.all(Array.from({ length: 40 }, async (_, i) => (await fetch(urls[i % 2]!)).status))
    expect(statuses.filter(status => status === 200)).toHaveLength(5)
    expect(statuses.every(status => status === 200 || status === 429)).toBe(true)
    const keys = await cache.kv.keys('hai:kit:ratelimit:*')
    if (!keys.success || keys.data.length !== 1)
      throw new Error('Expected one shared counter')
    const ttl = await cache.kv.ttl(keys.data[0]!)
    expect(ttl.success && ttl.data).toBeGreaterThanOrEqual(0)
    expect(ttl.success && ttl.data).toBeLessThanOrEqual(3)
    await new Promise(resolve => setTimeout(resolve, 3100))
    expect((await fetch(urls[0]!)).status).toBe(200)
  }
  finally {
    for (const child of children) {
      if (child.connected)
        child.send('close')
      child.kill()
    }
    await cache.close()
    await redis.release()
  }
}, 120000)
