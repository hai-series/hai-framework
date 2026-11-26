import type { ServContext } from '../src/serv-context.js'
import { apiContract } from '@h-ai/api-contract'
import { core, HaiCommonError } from '@h-ai/core'
import { afterEach, expect, it, vi } from 'vitest'
import { serv } from '../src/serv-main.js'

const contract = apiContract.create({})
const procedures = serv.implement(contract).context<ServContext>().build()
const endpoint = 'https://service.test/api/v1/echo'

afterEach(() => vi.useRealTimers())

it('使用可信转发地址独立计数，窗口到期后恢复，不采用直接客户端自报的地址', async () => {
  vi.useFakeTimers({
    toFake: ['Date'],
  })
  vi.setSystemTime(new Date('2026-02-01T00:00:00Z'))
  const app = serv.createApp({
    contract,
    procedures,
    http: {
      trustedProxies: ['192.0.2.10'],
      rateLimit: {
        maxRequests: 1,
        windowMs: 1000,
        store: core.access.createMemoryRateLimitStore(),
      },
    },
    middlewares: [
      {
        path: '/api/v1/echo',
        middleware: c => c.json({ ok: true }),
      },
    ],
  })
  const request = async (peer: string, forwarded: string) => app.fetch(new Request(endpoint, {
    headers: { 'x-forwarded-for': forwarded },
  }), { remoteAddress: peer })

  expect((await request('192.0.2.10', '198.51.100.1')).status).toBe(200)
  const firstLimit = await request('192.0.2.10', '198.51.100.1')
  expect(firstLimit.status).toBe(429)
  expect(await firstLimit.json()).toMatchObject({
    success: false,
    error: { code: HaiCommonError.RATE_LIMIT_EXCEEDED.code },
  })
  expect(firstLimit.headers.get('retry-after')).toBe('1')
  expect(firstLimit.headers.get('x-ratelimit-remaining')).toBe('0')
  expect((await request('192.0.2.10', '198.51.100.2')).status).toBe(200)

  expect((await request('198.51.100.3', '198.51.100.4')).status).toBe(200)
  expect((await request('198.51.100.3', '198.51.100.5')).status).toBe(429)

  vi.setSystemTime(new Date('2026-02-01T00:00:01Z'))
  const recovered = await request('192.0.2.10', '198.51.100.1')
  expect(recovered.status).toBe(200)
  expect(recovered.headers.get('x-ratelimit-remaining')).toBe('0')
  expect(recovered.headers.get('x-ratelimit-reset')).not.toBe(firstLimit.headers.get('x-ratelimit-reset'))
})

it('策略拒绝、探针与 CORS 预检不计数；存储失败返回 503 并保留 CORS', async () => {
  const increment = vi.fn(() => {
    throw new Error('internal-fixture')
  })
  const handler = vi.fn()
  const origin = 'https://app.test'
  const app = serv.createApp({
    contract,
    procedures,
    http: {
      health: { path: '/healthz', readyPath: '/readyz' },
      access: {
        rules: [
          {
            id: 'internal',
            paths: ['/internal'],
            allowIps: ['192.0.2.10'],
          },
        ],
      },
      rateLimit: {
        store: { scope: 'shared', increment },
      },
    },
    middlewares: [
      {
        middleware: serv.cors({ origin }),
      },
      {
        path: '/api/v1/echo',
        middleware: (c) => {
          handler()
          return c.json({ ok: true })
        },
      },
    ],
  })

  expect((await app.request('/internal')).status).toBe(403)
  expect((await app.request('/healthz')).status).toBe(200)
  expect((await app.request('/readyz', { method: 'HEAD' })).status).toBe(200)
  expect((await app.request(endpoint, {
    method: 'OPTIONS',
    headers: { origin, 'access-control-request-method': 'GET' },
  })).status).toBe(204)
  expect(increment).not.toHaveBeenCalled()

  const failed = await app.request(endpoint, {
    headers: { origin },
  })
  expect(failed.status).toBe(503)
  expect(failed.headers.get('access-control-allow-origin')).toBe(origin)
  const body = await failed.json()
  expect(body).toMatchObject({
    success: false,
    error: { code: HaiCommonError.SERVICE_UNAVAILABLE.code },
  })
  expect(JSON.stringify(body)).not.toContain('internal-fixture')
  expect(increment).toHaveBeenCalledOnce()
  expect(handler).not.toHaveBeenCalled()
})

it('自定义限流键按可信会话跨 IP 计数，保留标准超限状态和响应头', async () => {
  const verifyToken = vi.fn(async (token: string) => core.ok({
    userId: token === 'auditor-token'
      ? 'auditor'
      : 'operator',
    roles: ['member'],
    permissions: [],
  }))
  const app = serv.createApp({
    contract,
    procedures,
    auth: { verifyToken },
    http: {
      rateLimit: {
        maxRequests: 1,
        store: core.access.createMemoryRateLimitStore(),
        keyGenerator: context => context.session?.userId ?? context.clientAddress ?? 'anonymous',
        onLimitReached: () => Response.json({ message: 'Please wait' }, {
          headers: { 'x-quota-class': 'member' },
        }),
      },
    },
    middlewares: [
      {
        path: '/api/v1/echo',
        middleware: () => new Response('Allowed'),
      },
    ],
  })
  const request = (token: string, remoteAddress: string) => app.fetch(new Request(endpoint, {
    headers: { authorization: `Bearer ${token}` },
  }), { remoteAddress })
  expect((await request('auditor-token', '192.0.2.4')).status).toBe(200)
  const denied = await request('auditor-token', '192.0.2.8')
  expect(denied.status).toBe(429)
  expect(denied.headers.get('retry-after')).not.toBeNull()
  expect(denied.headers.get('x-ratelimit-remaining')).toBe('0')
  expect(denied.headers.get('x-quota-class')).toBe('member')
  expect(await denied.json()).toEqual({ message: 'Please wait' })
  expect((await request('operator-token', '192.0.2.8')).status).toBe(200)
  expect(verifyToken).toHaveBeenCalledTimes(3)
})
