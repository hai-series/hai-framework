import type { RequestEvent } from '@sveltejs/kit'
import { expect, it, vi } from 'vitest'
import { kit } from '../src/index.js'

function platformEvent(request: Request): RequestEvent {
  // 只准备 Handle 读取的平台事件字段，其余使用实际中间件与路由响应。
  return {
    request,
    url: new URL(request.url),
    locals: {},
    route: { id: '/api/partner/orders' },
    getClientAddress: () => '127.0.0.1',
  } as RequestEvent
}

it('顶层 CORS 让浏览器读取访问拒绝、超限及存储故障', async () => {
  const origin = 'https://client.test'
  const increment = vi.fn()
    .mockReturnValueOnce({ count: 1, resetAt: Date.now() + 60_000 })
    .mockReturnValueOnce({ count: 2, resetAt: Date.now() + 60_000 })
    .mockImplementationOnce(() => { throw new Error('rate counter unavailable') })
  const handle = kit.createHandle({
    logging: false,
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
  })
  const resolve = vi.fn(({ request }: RequestEvent) => new Response(request.method, {
    headers: { Vary: 'Accept-Encoding' },
  }))
  const dispatch = (path: string, method: string, headers: HeadersInit) => handle({
    event: platformEvent(new Request(`https://service.test${path}`, { method, headers })),
    resolve,
  })
  const preflight = (path: string) => dispatch(path, 'OPTIONS', { origin, 'access-control-request-method': 'GET' })
  const blocked = await preflight('/api/partner/private')
  expect(blocked.status).toBe(403)
  expect(blocked.headers.get('access-control-allow-origin')).toBe(origin)
  expect((await preflight('/api/partner/orders')).status).toBe(204)
  expect(increment).not.toHaveBeenCalled()
  expect(resolve).not.toHaveBeenCalled()

  const options = await dispatch('/api/partner/orders', 'OPTIONS', { origin })
  expect(options.status).toBe(200)
  expect(await options.text()).toBe('OPTIONS')
  expect(options.headers.get('vary')).toContain('Accept-Encoding')
  expect(options.headers.get('vary')).toContain('Origin')

  const limited = await dispatch('/api/partner/orders', 'GET', { origin })
  expect(limited.status).toBe(429)
  expect(limited.headers.get('retry-after')).toMatch(/^\d+$/)
  expect(limited.headers.get('access-control-allow-origin')).toBe(origin)
  expect(limited.headers.get('access-control-allow-credentials')).toBe('true')
  expect(limited.headers.get('access-control-expose-headers')).toContain('Retry-After')
  const unavailable = await dispatch('/api/partner/orders', 'GET', { origin })
  expect(unavailable.status).toBe(503)
  expect(unavailable.headers.get('access-control-allow-origin')).toBe(origin)
  expect(resolve).toHaveBeenCalledOnce()
})

it('cORS 只在配置范围内答复预检，另一个路径的 OPTIONS 使用路由配额', async () => {
  const origin = 'https://client.test'
  const increment = vi.fn(() => ({ count: 1, resetAt: Date.now() + 60_000 }))
  const handle = kit.createHandle({
    logging: false,
    cors: {
      origin,
      paths: ['/api/partner'],
    },
    http: {
      rateLimit: {
        maxRequests: 5,
        store: { scope: 'shared', increment },
      },
    },
  })
  const resolve = vi.fn(() => new Response(null, {
    headers: { Allow: 'GET, OPTIONS' },
  }))
  const dispatch = (path: string) => handle({
    event: platformEvent(new Request(`https://service.test${path}`, {
      method: 'OPTIONS',
      headers: { origin, 'access-control-request-method': 'GET' },
    })),
    resolve,
  })

  expect((await dispatch('/api/partner/orders')).status).toBe(204)
  expect(increment).not.toHaveBeenCalled()
  const response = await dispatch('/api/catalog')
  expect(response.headers.get('allow')).toBe('GET, OPTIONS')
  expect(increment).toHaveBeenCalledOnce()
  expect(resolve).toHaveBeenCalledOnce()
})
