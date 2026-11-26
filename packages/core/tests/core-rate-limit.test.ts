import type { LogRecord } from '../src/index.js'
import { afterEach, expect, it, vi } from 'vitest'
import { core, HaiCommonError, HttpRateLimitConfigSchema } from '../src/index.js'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

it('默认关闭，显式启用后补齐固定窗口和请求额度', () => {
  expect(HttpRateLimitConfigSchema.parse(undefined)).toBe(false)
  expect(HttpRateLimitConfigSchema.parse(false)).toBe(false)
  expect(HttpRateLimitConfigSchema.parse({})).toEqual({ windowMs: 60000, maxRequests: 100 })
  expect(HttpRateLimitConfigSchema.safeParse(true).success).toBe(false)
  expect(HttpRateLimitConfigSchema.safeParse({ windowMs: 2147483648 }).success).toBe(false)
  expect(HttpRateLimitConfigSchema.safeParse({ maxRequests: 1.5 }).success).toBe(false)
  expect(HttpRateLimitConfigSchema.safeParse({ store: 'memory' }).success).toBe(false)
})

it('按可信主体共用固定窗口，超限返回 429，过期后恢复额度', async () => {
  vi.useFakeTimers({
    toFake: ['Date'],
  })
  vi.setSystemTime(new Date('2026-11-26T00:00:00.000Z'))
  const limiter = core.access.createRateLimiter({
    store: core.access.createMemoryRateLimitStore(),
    maxRequests: 2,
    windowMs: 10000,
  })
  const check = (clientAddress: string) => limiter({ requestId: 'fixed-window', clientAddress, context: undefined })

  const first = await check('::ffff:192.0.2.10')
  const second = await check('192.0.2.10')
  if (!(first instanceof Headers && second instanceof Headers))
    throw new TypeError('The first two requests should be allowed')
  expect(first.get('x-ratelimit-remaining')).toBe('1')
  expect(second.get('x-ratelimit-remaining')).toBe('0')
  expect(second.get('x-ratelimit-reset')).toBe(first.get('x-ratelimit-reset'))

  vi.advanceTimersByTime(3000)
  const denied = await check('::ffff:c000:20a')
  if (!(denied instanceof Response))
    throw new TypeError('The third request should be limited')
  expect(denied.status).toBe(429)
  expect(denied.headers.get('retry-after')).toBe('7')
  expect(denied.headers.get('x-ratelimit-reset')).toBe(first.get('x-ratelimit-reset'))
  expect(denied.headers.get('x-trace-id')).toBe('fixed-window')
  expect(await denied.json()).toMatchObject({
    success: false,
    error: { code: HaiCommonError.RATE_LIMIT_EXCEEDED.code, traceId: 'fixed-window' },
  })

  vi.advanceTimersByTime(7000)
  const restored = await check('192.0.2.10')
  if (!(restored instanceof Headers))
    throw new TypeError('The expired window should start again')
  expect(restored.get('x-ratelimit-remaining')).toBe('1')
  expect(restored.get('x-ratelimit-reset')).not.toBe(first.get('x-ratelimit-reset'))
})

it('共享存储故障返回带追踪编号的 503，诊断不公开故障细节', async () => {
  const limiter = core.access.createRateLimiter({
    store: {
      scope: 'shared',
      increment: () => {
        throw Object.assign(new Error('Counter unavailable'), { code: 'ECOUNTER', password: 'private-cache-password' })
      },
    },
  })
  const logs: LogRecord[] = []
  const stop = core.logger.observe(record => logs.push(record))
  try {
    const result = await core.i18n.runWithLocale('en-US', () => limiter({ requestId: 'counter-failure', context: undefined }))
    if (!(result instanceof Response))
      throw new TypeError('A failing counter should return unavailable')
    expect(result.status).toBe(503)
    expect(result.headers.get('x-trace-id')).toBe('counter-failure')
    const body = await result.json()
    expect(body).toMatchObject({
      success: false,
      error: { code: HaiCommonError.SERVICE_UNAVAILABLE.code, message: 'Internal error (traceId: counter-failure)' },
    })
    expect(JSON.stringify(body)).not.toMatch(/ECOUNTER|private-cache-password/)
    expect(logs).toContainEqual(expect.objectContaining({
      level: 'error',
      context: expect.objectContaining({ traceId: 'counter-failure', status: 503 }),
    }))
    expect(JSON.stringify(logs)).toContain('ECOUNTER')
    expect(JSON.stringify(logs)).not.toContain('private-cache-password')
  }
  finally {
    stop()
  }
})

it('自定义超限正文仍保留 429、Retry-After 和可信限额头', async () => {
  const onLimitReached = vi.fn((_context: { accountId: string }, fallback: Response) => {
    expect(fallback.status).toBe(429)
    expect(fallback.headers.get('x-trace-id')).toBe('partner-orders')
    return new Response('Try again tomorrow', {
      status: 200,
      headers: { 'x-ratelimit-limit': '999', 'X-Order-Limit': 'account' },
    })
  })
  const limiter = core.access.createRateLimiter({
    keyGenerator: ({ accountId }: { accountId: string }) => accountId,
    maxRequests: 1,
    store: core.access.createMemoryRateLimitStore(),
    onLimitReached,
  })
  const check = () => limiter({
    requestId: 'partner-orders',
    context: { accountId: 'shared-orders' },
  })

  expect(await check()).toBeInstanceOf(Headers)
  const response = await check()
  if (!(response instanceof Response))
    throw new TypeError('Expected a rate-limited response')
  expect(onLimitReached).toHaveBeenCalledOnce()
  expect(response.status).toBe(429)
  expect(response.headers.get('retry-after')).toMatch(/^\d+$/)
  expect(response.headers.get('x-trace-id')).toBe('partner-orders')
  expect(response.headers.get('x-ratelimit-limit')).toBe('1')
  expect(response.headers.get('x-order-limit')).toBe('account')
  expect(await response.text()).toBe('Try again tomorrow')
})
