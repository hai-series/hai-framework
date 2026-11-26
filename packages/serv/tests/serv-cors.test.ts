import type { ServContext } from '../src/index.js'
import { apiContract } from '@h-ai/api-contract'
import { describe, expect, it, vi } from 'vitest'
import { serv } from '../src/index.js'

const contract = apiContract.create({})
const procedures = serv.implement(contract).context<ServContext>().build()
const origin = 'https://client.test'

describe('serv.cors', () => {
  it('有路径范围的中间件把范围外的 OPTIONS 交给业务路由和限流', async () => {
    const increment = vi.fn(() => ({ count: 1, resetAt: Date.now() + 60_000 }))
    const app = serv.createApp({
      contract,
      procedures,
      http: {
        access: {
          global: {
            allowIps: ['192.0.2.10'],
          },
        },
        rateLimit: {
          maxRequests: 5,
          store: { scope: 'shared', increment },
        },
      },
      middlewares: [
        {
          middleware: serv.cors({
            origin,
            paths: ['/api/partner'],
          }),
        },
      ],
    })
    app.options('/api/catalog', c => c.body(null, 200, { Allow: 'GET, OPTIONS' }))
    const dispatch = (path: string) => app.fetch(new Request(`https://service.test${path}`, {
      method: 'OPTIONS',
      headers: { origin, 'access-control-request-method': 'GET' },
    }), { remoteAddress: '192.0.2.10' })

    expect((await dispatch('/api/partner/orders')).status).toBe(204)
    expect(increment).not.toHaveBeenCalled()
    const response = await dispatch('/api/catalog')
    expect(response.headers.get('allow')).toBe('GET, OPTIONS')
    expect(increment).toHaveBeenCalledOnce()
  })

  it('普通 OPTIONS 经过访问策略并保留路由的响应', async () => {
    const app = serv.createApp({
      contract,
      procedures,
      http: {
        access: {
          global: {
            allowIps: ['192.0.2.10'],
          },
        },
      },
      middlewares: [
        {
          middleware: serv.cors({ origin }),
        },
        {
          path: '/widget',
          middleware: c => c.text('widget options'),
        },
      ],
    })

    const request = new Request('https://service.test/widget', {
      method: 'OPTIONS',
      headers: { origin },
    })
    const response = await app.fetch(request, { remoteAddress: '192.0.2.10' })
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('widget options')
    expect(response.headers.get('access-control-allow-origin')).toBe(origin)
    expect(response.headers.has('access-control-allow-methods')).toBe(false)
    expect(response.headers.get('vary')).toContain('Access-Control-Request-Method')

    request.headers.set('Access-Control-Request-Method', 'GET')
    const preflight = await app.fetch(request, { remoteAddress: '192.0.2.10' })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-origin')).toBe(origin)
  })

  it.each([
    {
      allowedHeaders: ['Content-Type', 'X-Widget-Id'],
      expected: 'content-type, x-widget-id',
    },
    { allowedHeaders: [], expected: null },
  ])('预检使用显式请求头列表 $allowedHeaders', async ({ allowedHeaders, expected }) => {
    const app = serv.createApp({
      contract,
      procedures,
      middlewares: [
        {
          middleware: serv.cors({ origin, allowedHeaders }),
        },
      ],
    })
    const response = await app.request('/health', {
      method: 'OPTIONS',
      headers: {
        origin,
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'content-type',
      },
    })

    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-headers')).toBe(expected)
    expect(response.headers.get('vary')).not.toContain('Access-Control-Request-Headers')
  })

  it('省略请求头列表时，预检回显并为缓存标记请求头差异', async () => {
    const app = serv.createApp({
      contract,
      procedures,
      middlewares: [
        {
          middleware: serv.cors(),
        },
      ],
    })
    const headers = new Headers({ origin, 'access-control-request-method': 'GET' })

    const withDefaults = await app.request('/health', { method: 'OPTIONS', headers })
    expect(withDefaults.headers.get('access-control-allow-headers')).toContain('Authorization')
    expect(withDefaults.headers.get('vary')).toContain('Access-Control-Request-Headers')

    headers.set('access-control-request-headers', 'x-widget-id')
    const withRequested = await app.request('/health', { method: 'OPTIONS', headers })
    expect(withRequested.headers.get('access-control-allow-origin')).toBe('*')
    expect(withRequested.headers.get('access-control-allow-headers')).toBe('x-widget-id')
    expect(withRequested.headers.get('vary')).toContain('Access-Control-Request-Headers')
  })

  it.each([undefined, 'https://other.test'])('来源 %s 未获准时也保留 Origin 缓存差异', async (requestOrigin) => {
    const app = serv.createApp({
      contract,
      procedures,
      middlewares: [
        {
          middleware: serv.cors({ origin }),
        },
        {
          path: '/widget',
          middleware: c => c.text('widget', 200, { Vary: 'Accept-Encoding' }),
        },
      ],
    })
    const response = await app.request('/widget', {
      headers: requestOrigin
        ? { origin: requestOrigin }
        : undefined,
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
    expect(response.headers.get('vary')).toBe('Accept-Encoding, Origin')
  })
})

it('顶层 CORS 让浏览器读取访问拒绝、超限及存储故障', async () => {
  const increment = vi.fn()
    .mockReturnValueOnce({ count: 1, resetAt: Date.now() + 60_000 })
    .mockReturnValueOnce({ count: 2, resetAt: Date.now() + 60_000 })
    .mockImplementationOnce(() => { throw new Error('rate counter unavailable') })
  const app = serv.createApp({
    contract,
    procedures,
    cors: {
      origin,
      credentials: true,
      paths: ['/api/partner'],
      exposedHeaders: ['Retry-After'],
    },
    http: {
      access: {
        rules: [
          {
            id: 'office',
            paths: ['/api/partner/private'],
            allowIps: ['192.0.2.10'],
          },
        ],
      },
      rateLimit: {
        store: { scope: 'shared', increment },
        maxRequests: 1,
      },
    },
    middlewares: [
      {
        path: '/api/partner/orders',
        middleware: context => context.text(context.req.method, 200, { Vary: 'Accept-Encoding' }),
      },
    ],
  })
  const preflight = (path: string) => app.request(path, {
    method: 'OPTIONS',
    headers: { origin, 'access-control-request-method': 'GET' },
  })
  const blocked = await preflight('/api/partner/private')
  expect(blocked.status).toBe(403)
  expect(blocked.headers.get('access-control-allow-origin')).toBe(origin)
  expect((await preflight('/api/partner/orders')).status).toBe(204)
  expect(increment).not.toHaveBeenCalled()

  const dispatch = (method: string) => app.request('/api/partner/orders', {
    method,
    headers: { origin },
  })
  const options = await dispatch('OPTIONS')
  expect(options.status).toBe(200)
  expect(await options.text()).toBe('OPTIONS')
  expect(options.headers.get('vary')).toContain('Accept-Encoding')
  expect(options.headers.get('vary')).toContain('Origin')

  const limited = await dispatch('GET')
  expect(limited.status).toBe(429)
  expect(limited.headers.get('retry-after')).toMatch(/^\d+$/)
  expect(limited.headers.get('access-control-allow-origin')).toBe(origin)
  expect(limited.headers.get('access-control-allow-credentials')).toBe('true')
  expect(limited.headers.get('access-control-expose-headers')).toContain('Retry-After')
  const unavailable = await dispatch('GET')
  expect(unavailable.status).toBe(503)
  expect(unavailable.headers.get('access-control-allow-origin')).toBe(origin)
})
