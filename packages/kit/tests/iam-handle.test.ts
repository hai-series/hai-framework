/**
 * =============================================================================
 * @hai/kit - IAM Module 测试
 * =============================================================================
 */

import type { Cookies, RequestEvent } from '@sveltejs/kit'
import type { IamActionsConfig, IamHandleConfig, IamLocals } from '../src/modules/iam/iam-types.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createIamHandle, requireAuth } from '../src/modules/iam/iam-handle.js'

/**
 * 创建模拟的 IAM 服务
 */
function createMockIam() {
  return {
    session: {
      verifyToken: vi.fn(),
      getByToken: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    user: {
      getById: vi.fn(),
      register: vi.fn(),
    },
    auth: {
      authenticate: vi.fn(),
    },
    authz: {
      hasRole: vi.fn(),
      checkPermission: vi.fn(),
    },
  }
}

/**
 * 创建模拟的 Cookies
 */
function createMockCookies(): Cookies {
  const store = new Map<string, string>()
  return {
    get: vi.fn((name: string) => store.get(name)),
    set: vi.fn((name: string, value: string) => store.set(name, value)),
    delete: vi.fn((name: string) => store.delete(name)),
    getAll: vi.fn(() => Array.from(store.entries()).map(([name, value]) => ({ name, value }))),
    serialize: vi.fn(),
  } as unknown as Cookies
}

/**
 * 创建模拟的 RequestEvent
 */
function createMockEvent(
  path = '/',
  options: {
    sessionToken?: string
    headers?: Record<string, string>
  } = {},
): RequestEvent {
  const url = new URL(`http://localhost${path}`)
  const cookies = createMockCookies()

  if (options.sessionToken) {
    (cookies.get as ReturnType<typeof vi.fn>).mockReturnValue(options.sessionToken)
  }

  return {
    request: new Request(url, {
      headers: options.headers,
    }),
    url,
    cookies,
    locals: {} as IamLocals,
    params: {},
    route: { id: path },
    getClientAddress: () => '127.0.0.1',
  } as unknown as RequestEvent
}

describe('createIamHandle', () => {
  let mockIam: ReturnType<typeof createMockIam>

  beforeEach(() => {
    mockIam = createMockIam()
  })

  it('应该允许公开路径访问', async () => {
    const handle = createIamHandle({
      iam: mockIam as unknown as IamHandleConfig['iam'],
      publicPaths: ['/login', '/register', '/api/health'],
    })

    const event = createMockEvent('/login')
    const resolve = vi.fn().mockResolvedValue(new Response('OK'))

    await handle({ event, resolve })

    expect(resolve).toHaveBeenCalled()
  })

  it('应该支持通配符路径匹配', async () => {
    const handle = createIamHandle({
      iam: mockIam as unknown as IamHandleConfig['iam'],
      publicPaths: ['/api/public/*'],
    })

    const event = createMockEvent('/api/public/health')
    const resolve = vi.fn().mockResolvedValue(new Response('OK'))

    await handle({ event, resolve })

    expect(resolve).toHaveBeenCalled()
  })

  it('应该验证有效的会话令牌', async () => {
    mockIam.session.verifyToken.mockResolvedValue({
      success: true,
      data: { userId: 'user-1' },
    })
    mockIam.session.getByToken.mockResolvedValue({
      success: true,
      data: { id: 'session-1', userId: 'user-1' },
    })
    mockIam.user.getById.mockResolvedValue({
      success: true,
      data: { id: 'user-1', username: 'testuser' },
    })

    const handle = createIamHandle({
      iam: mockIam as unknown as IamHandleConfig['iam'],
      publicPaths: [],
    })

    const event = createMockEvent('/dashboard', { sessionToken: 'valid-token' })
    const resolve = vi.fn().mockResolvedValue(new Response('OK'))

    await handle({ event, resolve })

    expect(mockIam.session.verifyToken).toHaveBeenCalledWith('valid-token')
    expect((event.locals as IamLocals).user).toEqual({ id: 'user-1', username: 'testuser' })
    expect(resolve).toHaveBeenCalled()
  })

  it('应该拒绝未认证用户访问受保护路径', async () => {
    const handle = createIamHandle({
      iam: mockIam as unknown as IamHandleConfig['iam'],
      publicPaths: ['/login'],
    })

    const event = createMockEvent('/dashboard')
    const resolve = vi.fn().mockResolvedValue(new Response('OK'))

    const response = await handle({ event, resolve })

    expect(response.status).toBe(401)
    expect(resolve).not.toHaveBeenCalled()
  })

  it('应该调用 onUnauthenticated 回调', async () => {
    const onUnauthenticated = vi.fn().mockReturnValue(
      new Response('Redirect', { status: 302 }),
    )

    const handle = createIamHandle({
      iam: mockIam as unknown as IamHandleConfig['iam'],
      publicPaths: [],
      onUnauthenticated,
    })

    const event = createMockEvent('/protected')
    const resolve = vi.fn()

    await handle({ event, resolve })

    expect(onUnauthenticated).toHaveBeenCalledWith(event)
  })

  it('应该清除无效的会话 Cookie', async () => {
    mockIam.session.verifyToken.mockRejectedValue(new Error('Invalid token'))

    const handle = createIamHandle({
      iam: mockIam as unknown as IamHandleConfig['iam'],
      publicPaths: ['/'],
    })

    const event = createMockEvent('/', { sessionToken: 'invalid-token' })
    const resolve = vi.fn().mockResolvedValue(new Response('OK'))

    await handle({ event, resolve })

    expect(event.cookies.delete).toHaveBeenCalledWith('hai_session', { path: '/' })
  })

  it('应该使用自定义 Cookie 名称', async () => {
    mockIam.session.verifyToken.mockResolvedValue({
      success: true,
      data: { userId: 'user-1' },
    })
    mockIam.session.getByToken.mockResolvedValue({
      success: true,
      data: { id: 'session-1', userId: 'user-1' },
    })
    mockIam.user.getById.mockResolvedValue({
      success: true,
      data: { id: 'user-1', username: 'testuser' },
    })

    const handle = createIamHandle({
      iam: mockIam as unknown as IamHandleConfig['iam'],
      publicPaths: [],
      sessionCookieName: 'custom_session',
    })

    const event = createMockEvent('/dashboard')
    ;(event.cookies.get as ReturnType<typeof vi.fn>).mockReturnValue('valid-token')
    const resolve = vi.fn().mockResolvedValue(new Response('OK'))

    await handle({ event, resolve })

    expect(event.cookies.get).toHaveBeenCalledWith('custom_session')
  })
})

describe('requireAuth', () => {
  it('应该返回已认证的 locals', () => {
    const event = createMockEvent('/api/data')
    ;(event.locals as IamLocals).session = { id: 'session-1' } as any
    ;(event.locals as IamLocals).user = { id: 'user-1' } as any

    const result = requireAuth(event)

    expect(result.session).toBeDefined()
    expect(result.user).toBeDefined()
  })

  it('应该在未认证时抛出 401', () => {
    const event = createMockEvent('/api/data')

    expect(() => requireAuth(event)).toThrow()
  })
})
