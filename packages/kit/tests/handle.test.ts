import type { HttpRateLimitContext } from '@h-ai/core'
import type { RequestEvent } from '@sveltejs/kit'
/**
 * =============================================================================
 * @h-ai/kit - Handle Hook 测试
 * =============================================================================
 */

import type { Handle } from '@sveltejs/kit/hooks'
import type { SessionData } from '../src/kit-types.js'
import { core, HaiCommonError } from '@h-ai/core'
import { describe, expect, it, vi } from 'vitest'
import { createHandle, sequence } from '../src/hooks/index.js'
import { kit } from '../src/kit-main.js'

/**
 * 创建模拟 RequestEvent
 */
function createMockEvent(options: {
  method?: string
  path?: string
  routeId?: string
  cookies?: Record<string, string>
  headers?: Record<string, string>
} = {}) {
  const { method = 'GET', path = '/', routeId = path, cookies = {}, headers = {} } = options

  const url = new URL(`http://localhost${path}`)

  return {
    request: new Request(url, { method, headers }),
    url,
    cookies: {
      get: vi.fn((name: string) => cookies[name]),
      set: vi.fn(),
      delete: vi.fn(),
      getAll: vi.fn(() => []),
      serialize: vi.fn(),
    },
    locals: {},
    getClientAddress: () => '127.0.0.1',
    params: {},
    route: { id: routeId },
    platform: undefined,
    isDataRequest: false,
    isSubRequest: false,
    fetch: vi.fn(),
    setHeaders: vi.fn(),
  } as unknown as RequestEvent
}

describe('createHandle', () => {
  it.each(['/api/private', '/(service)/api/private'])('带挂载前缀的API仍返回401，不重定向或绕过认证：%s', async (routeId) => {
    const handle = createHandle({
      logging: false,
      auth: {
        verifyToken: async () => core.err(HaiCommonError.UNAUTHORIZED),
        protectedPaths: ['/yyy/api/**'],
        loginUrl: '/yyy/auth/login',
      },
    })
    const event = createMockEvent({ path: '/yyy/api/private', routeId })
    const resolve = vi.fn().mockResolvedValue(new Response('must not resolve'))
    const response = await handle({ event, resolve })
    expect(response.status).toBe(401)
    expect(response.headers.get('Location')).toBeNull()
    expect(resolve).not.toHaveBeenCalled()
  })

  it('应该创建基本 handle', async () => {
    const handle = createHandle({ logging: false })

    const event = createMockEvent()
    const resolve = vi.fn().mockResolvedValue(new Response('OK'))

    const response = await handle({ event, resolve })

    expect(response.headers.get('X-Request-Id')).toMatch(/^req_[a-z0-9]+$/)
    expect(resolve).toHaveBeenCalledWith(event)
  })

  it.each([false, true])('保留原生重定向并附加响应头（限流：%s）', async (rateLimited) => {
    const handle = kit.createHandle({
      logging: false,
      http: {
        rateLimit: rateLimited && {
          store: core.access.createMemoryRateLimitStore(),
        },
      },
    })
    const response = await handle({
      event: createMockEvent(),
      resolve: async () => Response.redirect('http://localhost/account', 303),
    })

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('http://localhost/account')
    expect(response.headers.get('x-request-id')).toMatch(/^req_/)
    expect(response.headers.get('x-ratelimit-remaining')).toBe(rateLimited ? '99' : null)
    expect(response.body).toBeNull()
  })

  it('只对实际 CORS 预检免计数，普通 OPTIONS 仍占用限流窗口', async () => {
    const handle = kit.createHandle({
      logging: false,
      cors: { origin: 'https://example.test' },
      http: {
        rateLimit: {
          maxRequests: 1,
          store: core.access.createMemoryRateLimitStore(),
        },
      },
    })
    const resolve = vi.fn(() => new Response(null, { status: 204 }))
    const preflight = await handle({
      event: createMockEvent({
        method: 'OPTIONS',
        headers: { 'Origin': 'https://example.test', 'Access-Control-Request-Method': 'GET' },
      }),
      resolve,
    })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe('https://example.test')
    expect(preflight.headers.get('X-RateLimit-Remaining')).toBeNull()
    const plainOptions = await handle({
      event: createMockEvent({ method: 'OPTIONS' }),
      resolve,
    })
    expect(plainOptions.status).toBe(204)
    expect(plainOptions.headers.get('X-RateLimit-Remaining')).toBe('0')
    expect((await handle({
      event: createMockEvent(),
      resolve,
    })).status).toBe(429)
    expect(resolve).toHaveBeenCalledOnce()
  })

  it('拒绝旧的顶层 rateLimit 和缺少原子存储的运行时配置', () => {
    const legacy = { logging: false, rateLimit: false }
    expect(() => kit.createHandle(legacy)).toThrow('http.rateLimit')
    expect(() => kit.createHandle({
      http: {
        rateLimit: { maxRequests: 1, store: undefined! },
      },
    })).toThrow('atomic')
  })

  it('保留原生 Fetch 响应的流式正文与原有响应头', async () => {
    const response = await kit.createHandle({ logging: false })({
      event: createMockEvent(),
      resolve: () => fetch('data:text/plain,upstream%20body'),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/plain')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(await response.text()).toBe('upstream body')
  })

  it('应该通过 Authorization header 验证会话', async () => {
    const mockSession: SessionData = {
      userId: 'user1',
      username: 'testuser',
      roles: ['user'],
      permissions: ['read'],
    }

    const validateSession = vi.fn().mockResolvedValue(core.ok(mockSession))

    const handle = createHandle({
      logging: false,
      auth: { verifyToken: validateSession },
    })

    const event = createMockEvent({
      headers: { Authorization: 'Bearer token123' },
    })
    const resolve = vi.fn().mockResolvedValue(new Response('OK'))

    await handle({ event, resolve })

    expect(validateSession).toHaveBeenCalledWith('token123')
    expect((event.locals as Record<string, unknown>).session).toEqual(mockSession)
  })

  it('iAM 依赖故障返回安全的 503，业务及页面重定向均不执行', async () => {
    const verifyToken = vi.fn(async () => core.err(HaiCommonError.SERVICE_UNAVAILABLE, 'Identity storage details'))
    const handle = createHandle({
      auth: {
        verifyToken,
        protectedPaths: ['/admin/**'],
        loginUrl: '/auth/login',
      },
    })
    const resolve = vi.fn(() => new Response('Private content'))
    const response = await handle({
      event: createMockEvent({
        path: '/admin/reports',
        headers: { authorization: 'Bearer sample-token' },
      }),
      resolve,
    })
    expect(response.status).toBe(503)
    expect(response.headers.get('Location')).toBeNull()
    expect(await response.text()).not.toContain('Identity storage details')
    expect(resolve).not.toHaveBeenCalled()
  })

  it('缺少 Authorization 时不应触发会话验证', async () => {
    const mockSession: SessionData = {
      userId: 'user1',
      username: 'testuser',
      roles: ['user'],
      permissions: ['read'],
    }

    const validateSession = vi.fn().mockResolvedValue(core.ok(mockSession))

    const handle = createHandle({
      logging: false,
      auth: { verifyToken: validateSession },
    })

    const event = createMockEvent()
    const resolve = vi.fn().mockResolvedValue(new Response('OK'))

    await handle({ event, resolve })

    expect(validateSession).not.toHaveBeenCalled()
    expect((event.locals as Record<string, unknown>).session).toBeUndefined()
  })

  it('应该执行守卫', async () => {
    const handle = createHandle({
      logging: false,
      guards: [
        {
          guard: () => ({ allowed: false, redirect: '/login' }),
          paths: ['/protected/*'],
        },
      ],
    })

    const event = createMockEvent({ path: '/protected/page' })
    const resolve = vi.fn()

    const response = await handle({ event, resolve })

    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe('/login')
    expect(resolve).not.toHaveBeenCalled()
  })

  it('应该跳过不匹配路径的守卫', async () => {
    const guard = vi.fn().mockReturnValue({ allowed: true })

    const handle = createHandle({
      logging: false,
      guards: [
        {
          guard,
          paths: ['/admin/*'],
        },
      ],
    })

    const event = createMockEvent({ path: '/public/page' })
    const resolve = vi.fn().mockResolvedValue(new Response('OK'))

    await handle({ event, resolve })

    expect(guard).not.toHaveBeenCalled()
    expect(resolve).toHaveBeenCalled()
  })

  it('按应用的解码路径选择守卫，保留挂载前缀和公开目录例外', async () => {
    const guard = vi.fn().mockReturnValue({ allowed: true })
    const handle = kit.createHandle({
      logging: false,
      guards: [
        {
          guard,
          paths: ['/yyy/目录/**'],
          exclude: ['/yyy/目录/%E5%85%AC%E5%BC%80'],
        },
      ],
    })
    const resolve = () => new Response('OK')

    expect((await handle({
      event: createMockEvent({ path: '/yyy/目录/详情' }),
      resolve,
    })).status).toBe(200)
    expect(guard).toHaveBeenCalledOnce()
    expect((await handle({
      event: createMockEvent({ path: '/yyy/目录/公开' }),
      resolve,
    })).status).toBe(200)
    expect(guard).toHaveBeenCalledOnce()
  })

  it('按地址限流涵盖 A2A 入口，拒绝请求时不会执行会话验证', async () => {
    const getAgentCard = vi.fn(async () => Response.json({ name: 'Example Agent' }))
    const verifyToken = vi.fn(async () => core.err(HaiCommonError.UNAUTHORIZED))
    const handle = kit.createHandle({
      logging: false,
      a2a: {
        cardPath: '/.well-known/agent-card.json',
        rpcPath: '/a2a',
        handleRequest: getAgentCard,
      },
      auth: { verifyToken },
      http: {
        rateLimit: {
          maxRequests: 1,
          store: core.access.createMemoryRateLimitStore(),
        },
      },
    })
    const resolve = vi.fn(() => new Response('OK'))

    const card = await handle({
      event: createMockEvent({ path: '/.well-known/agent-card.json' }),
      resolve,
    })
    expect(card.status).toBe(200)
    expect(await card.json()).toEqual({ name: 'Example Agent' })
    const event = createMockEvent({
      path: '/api/member',
      headers: { authorization: 'Bearer fixture' },
    })
    const refused = await handle({ event, resolve })
    expect(refused.status).toBe(429)
    expect(getAgentCard).toHaveBeenCalledOnce()
    expect(verifyToken).not.toHaveBeenCalled()
    expect(resolve).not.toHaveBeenCalled()
  })

  it('自定义限流键可以在验证会话后从 locals 获取用户', async () => {
    const session: SessionData = {
      userId: 'member',
      roles: ['member'],
      permissions: [],
    }
    const verifyToken = vi.fn().mockResolvedValue(core.ok(session))
    const keyGenerator = vi.fn((context: HttpRateLimitContext) => {
      expect(context).toMatchObject({ session })
      return session.userId
    })
    const handle = kit.createHandle({
      logging: false,
      auth: {
        verifyToken,
        protectedPaths: ['/api/member'],
      },
      http: {
        rateLimit: {
          keyGenerator,
          store: core.access.createMemoryRateLimitStore(),
        },
      },
    })

    const response = await handle({
      event: createMockEvent({
        path: '/api/member',
        headers: { authorization: 'Bearer fixture' },
      }),
      resolve: () => new Response('OK'),
    })
    expect(response.status).toBe(200)
    expect(verifyToken).toHaveBeenCalledBefore(keyGenerator)
  })

  it('应该执行中间件', async () => {
    const middleware = vi.fn(async (ctx, next) => {
      const response = await next()
      response.headers.set('X-Middleware', 'executed')
      return response
    })

    const handle = createHandle({
      logging: false,
      middleware: [middleware],
    })

    const event = createMockEvent()
    const resolve = vi.fn().mockResolvedValue(new Response('OK'))

    const response = await handle({ event, resolve })

    expect(middleware).toHaveBeenCalled()
    expect(response.headers.get('X-Middleware')).toBe('executed')
  })

  it('应该处理错误', async () => {
    const handle = createHandle({ logging: false })

    const event = createMockEvent()
    const resolve = vi.fn().mockRejectedValue(new Error('Test error'))

    const response = await handle({ event, resolve })

    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body.success).toBe(false)
    expect(body.error.code).toBe(HaiCommonError.INTERNAL_ERROR.code)
  })

  it('应该使用自定义错误处理', async () => {
    const onError = vi.fn().mockReturnValue(
      new Response('Custom Error', { status: 500 }),
    )

    const handle = createHandle({
      logging: false,
      onError,
    })

    const event = createMockEvent()
    const resolve = vi.fn().mockRejectedValue(new Error('Test error'))

    const response = await handle({ event, resolve })

    expect(onError).toHaveBeenCalled()
    expect(await response.text()).toBe('Custom Error')
  })
})

describe('sequence', () => {
  it('保留语言转换并按顺序组合 resolve 选项', async () => {
    const first: Handle = ({ event, resolve }) => resolve(event, {
      transformPageChunk: ({ html }) => html.replace('%lang%', 'ja-JP'),
      preload: () => false,
    })
    const second: Handle = ({ event, resolve }) => resolve(event, {
      transformPageChunk: ({ html }) => `${html}<p>日本語</p>`,
      preload: () => true,
    })
    const combined = sequence(first, second)
    const resolve: Parameters<Handle>[0]['resolve'] = async (_event, options) => {
      expect(options?.preload?.({ type: 'js', path: '/app.js' })).toBe(false)
      const html = await options?.transformPageChunk?.({ html: '<html lang="%lang%">', done: true })
      return new Response(html)
    }
    const response = await combined({
      event: createMockEvent(),
      resolve,
    })
    expect(await response.text()).toBe('<html lang="ja-JP"><p>日本語</p>')
  })

  it('应该组合多个 handle', async () => {
    const order: number[] = []

    const handle1 = vi.fn(async ({ event, resolve }: Parameters<Handle>[0]) => {
      order.push(1)
      const response = await resolve(event)
      order.push(4)
      return response
    })

    const handle2 = vi.fn(async ({ event, resolve }: Parameters<Handle>[0]) => {
      order.push(2)
      const response = await resolve(event)
      order.push(3)
      return response
    })

    const combined = sequence(handle1, handle2)

    const event = createMockEvent()
    const resolve = vi.fn().mockResolvedValue(new Response('OK'))

    await combined({ event, resolve })

    expect(order).toEqual([1, 2, 3, 4])
  })
})
