/**
 * =============================================================================
 * @hai/kit - Handle Hook 测试
 * =============================================================================
 */

import type { SessionData } from '../src/kit-types.js'
import { describe, expect, it, vi } from 'vitest'
import { createHandle, sequence } from '../src/hooks/index.js'

/**
 * 创建模拟 RequestEvent
 */
function createMockEvent(options: {
  method?: string
  path?: string
  cookies?: Record<string, string>
} = {}) {
  const { method = 'GET', path = '/', cookies = {} } = options

  const url = new URL(`http://localhost${path}`)

  return {
    request: new Request(url, { method }),
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
    route: { id: path },
    platform: undefined,
    isDataRequest: false,
    isSubRequest: false,
    fetch: vi.fn(),
    setHeaders: vi.fn(),
  } as any
}

describe('createHandle', () => {
  it('应该创建基本 handle', async () => {
    const handle = createHandle({ logging: false })

    const event = createMockEvent()
    const resolve = vi.fn().mockResolvedValue(new Response('OK'))

    const response = await handle({ event, resolve })

    expect(response.headers.get('X-Request-Id')).toMatch(/^req_[a-z0-9]+$/)
    expect(resolve).toHaveBeenCalledWith(event)
  })

  it('应该验证会话', async () => {
    const mockSession: SessionData = {
      userId: 'user1',
      username: 'testuser',
      roles: ['user'],
      permissions: ['read'],
    }

    const validateSession = vi.fn().mockResolvedValue(mockSession)

    const handle = createHandle({
      logging: false,
      validateSession,
      sessionCookieName: 'test_session',
    })

    const event = createMockEvent({
      cookies: { test_session: 'token123' },
    })
    const resolve = vi.fn().mockResolvedValue(new Response('OK'))

    await handle({ event, resolve })

    expect(validateSession).toHaveBeenCalledWith('token123')
    expect((event.locals as any).session).toEqual(mockSession)
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
    expect(body.error.code).toBe('INTERNAL_ERROR')
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
  it('应该组合多个 handle', async () => {
    const order: number[] = []

    const handle1 = vi.fn(async ({ event, resolve }: any) => {
      order.push(1)
      const response = await resolve(event)
      order.push(4)
      return response
    })

    const handle2 = vi.fn(async ({ event, resolve }: any) => {
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
