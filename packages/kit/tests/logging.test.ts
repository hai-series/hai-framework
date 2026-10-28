/** 公共 handle 的日志不得读取 prerender 受限 URL；路由路径、查询脱敏和正文消费仍保持一致。 */
import type { RequestEvent } from '@sveltejs/kit'
import { core } from '@h-ai/core'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { kit } from '../src/index.js'

beforeEach(() => {
  vi.spyOn(core.logger, 'trace').mockImplementation(() => {})
})

afterEach(() => vi.restoreAllMocks())

function event(request: Request, pathname = new URL(request.url).pathname, prerender = false): RequestEvent {
  const url = new URL(request.url)
  url.pathname = pathname
  if (prerender) {
    // 与 SvelteKit disable_search 一致：追踪 URL 禁止访问查询，不限制 request.url。
    for (const property of ['search', 'searchParams']) {
      Object.defineProperty(url, property, { get() {
        throw new Error(`Cannot access url.${property} on a page with prerendering enabled`)
      } })
    }
  }
  // 只模拟宿主 RequestEvent；中间件链、日志脱敏、请求/响应均使用实际实现。
  return {
    request,
    url,
    locals: {},
    route: { id: pathname },
    cookies: { get: () => undefined },
    getClientAddress: () => {
      if (prerender)
        throw new Error('Client address is unavailable during prerendering')
      return '127.0.0.1'
    },
  } as RequestEvent
}

it('默认请求日志支持 prerender 受限 URL，保留公开页面和安全响应头', async () => {
  const input = event(new Request('https://example.test/docs?language=zh-CN', { headers: { 'x-request-id': 'prerender-request', 'user-agent': 'static-build' } }), '/docs', true)
  const resolve = vi.fn(async () => new Response('<h1>Documentation</h1>', { headers: { 'content-type': 'text/html' } }))
  const response = await kit.createHandle()({ event: input, resolve })
  expect(response.status).toBe(200)
  expect(await response.text()).toBe('<h1>Documentation</h1>')
  expect(resolve).toHaveBeenCalledWith(input)
  expect(response.headers.get('x-request-id')).toBe('prerender-request')
  expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  expect(core.logger.trace).toHaveBeenCalledWith('Incoming request', expect.objectContaining({ path: '/docs', query: { language: 'zh-CN' }, ip: 'unknown', userAgent: 'static-build' }))
})

it('查询从原请求读取，保留重写后的路由路径并在日志入口脱敏', async () => {
  const input = event(new Request('https://example.test/original?token=private-token&api_key=private-key&page=2'), '/docs/resolved')
  const response = await kit.createHandle()({ event: input, resolve: async () => new Response('OK') })
  expect(response.status).toBe(200)
  expect(core.logger.trace).toHaveBeenCalledWith('Incoming request', expect.objectContaining({ path: '/docs/resolved', query: { token: '[REDACTED]', api_key: '[REDACTED]', page: '2' } }))
  expect(input.request.url).toContain('token=private-token')
})

it('开启正文日志仍先脱敏副本，不消费应用读取的 JSON 请求体', async () => {
  const input = event(new Request('https://example.test/orders?secret=query-secret', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'body-secret', orderId: 'order-1' }) }))
  const response = await kit.createHandle({ logging: { logBody: true } })({ event: input, resolve: async (received) => {
    expect(await received.request.json()).toEqual({ password: 'body-secret', orderId: 'order-1' })
    return new Response('Created', { status: 201 })
  } })
  expect(response.status).toBe(201)
  expect(core.logger.trace).toHaveBeenCalledWith('Incoming request', expect.objectContaining({ query: { secret: '[REDACTED]' }, body: { password: '[REDACTED]', orderId: 'order-1' } }))
  expect(core.logger.trace).toHaveBeenCalledWith('Request completed', expect.objectContaining({ status: 201 }))
})
