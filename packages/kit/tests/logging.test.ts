/** 请求日志须支持 prerender，保留路由路径和查询参数数量，并且不消费请求正文。 */
import type { RequestEvent } from '@sveltejs/kit'
import { core, HaiCommonError } from '@h-ai/core'
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
      Object.defineProperty(url, property, {
        get() {
          throw new Error(`Cannot access url.${property} on a page with prerendering enabled`)
        },
      })
    }
  }
  // 只模拟宿主 RequestEvent；中间件链、日志脱敏、请求/响应均使用实际实现。
  return {
    request,
    url,
    locals: {},
    route: { id: pathname },
    cookies: {
      get: () => undefined,
    },
    getClientAddress: () => {
      if (prerender)
        throw new Error('Client address is unavailable during prerendering')
      return '127.0.0.1'
    },
  } as RequestEvent
}

it('默认请求日志支持 prerender 受限 URL，保留公开页面和安全响应头', async () => {
  const input = event(new Request('https://example.test/docs?language=zh-CN', {
    headers: { 'x-request-id': 'prerender-request', 'user-agent': 'static-build' },
  }), '/docs', true)
  const resolve = vi.fn(async () => new Response('<h1>Documentation</h1>', {
    headers: { 'content-type': 'text/html' },
  }))
  const response = await kit.createHandle()({ event: input, resolve })
  expect(response.status).toBe(200)
  expect(await response.text()).toBe('<h1>Documentation</h1>')
  expect(resolve).toHaveBeenCalledWith(input)
  expect(response.headers.get('x-request-id')).toBe('prerender-request')
  expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  expect(core.logger.trace).toHaveBeenCalledWith('Incoming request', expect.objectContaining({
    path: '/docs',
    queryParameterCount: 1,
    ip: 'unknown',
    userAgent: 'static-build',
  }))
})

it('查询只记录参数数量，保留重写后的路由路径', async () => {
  const input = event(new Request('https://example.test/original?token=private-token&search=person%40example.invalid&page=2'), '/docs/resolved')
  const response = await kit.createHandle()({
    event: input,
    resolve: async () => new Response('OK'),
  })
  expect(response.status).toBe(200)
  expect(core.logger.trace).toHaveBeenCalledWith('Incoming request', expect.objectContaining({
    path: '/docs/resolved',
    queryParameterCount: 3,
  }))
  const calls = JSON.stringify(vi.mocked(core.logger.trace).mock.calls)
  expect(calls).not.toContain('example.invalid')
  expect(calls).not.toContain('private-token')
  expect(input.request.url).toContain('token=private-token')
})

it('正文诊断只保留存在标记，认证处理器仍能读取原始请求', async () => {
  const data = { code: 'one-time-value', identifier: 'person@example.invalid' }
  const input = event(new Request('https://example.test/api/auth/login/otp?secret=query-secret', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-request-id': 'otp-diagnostics' },
    body: JSON.stringify(data),
  }))
  const response = await kit.createHandle({
    logging: { logBody: true },
  })({
    event: input,
    resolve: async (received) => {
      expect(await received.request.json()).toEqual(data)
      return kit.response.badRequest('Verification failed', received.request.headers.get('x-request-id') ?? undefined)
    },
  })
  expect(response.status).toBe(400)
  expect((await response.json()).error.code).toBe(HaiCommonError.INVALID_REQUEST.code)
  expect(response.headers.get('x-trace-id')).toBe('otp-diagnostics')
  expect(core.logger.trace).toHaveBeenCalledWith('Incoming request', expect.objectContaining({
    requestId: 'otp-diagnostics',
    queryParameterCount: 1,
    hasBody: true,
  }))
  expect(core.logger.trace).toHaveBeenCalledWith('Request completed', expect.objectContaining({
    requestId: 'otp-diagnostics',
    status: 400,
  }))
  const calls = JSON.stringify(vi.mocked(core.logger.trace).mock.calls)
  expect(calls).not.toContain(data.code)
  expect(calls).not.toContain(data.identifier)
})
