/**
 * =============================================================================
 * @h-ai/kit - IAM Module 测试
 * =============================================================================
 */

import type { Cookies, RequestEvent } from '@sveltejs/kit'
import type { IamHandleConfig, IamLocals } from '../src/modules/iam/iam-types.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createIamHandle, requireAuth } from '../src/modules/iam/iam-handle.js'

/**
 * 创建模拟的 IAM 服务
 *
 * 模拟 IamFunctions 的子功能接口，仅包含 Handle 和 Actions 需要的方法。
 */
function createMockIam() {
  return {
    config: {
      session: { maxAge: 604800 },
      password: { minLength: 8 },
    },
    isInitialized: true,
    auth: {
      login: vi.fn(),
      loginWithOtp: vi.fn(),
      loginWithLdap: vi.fn(),
      logout: vi.fn(),
      verifyToken: vi.fn(),
      sendOtp: vi.fn(),
    },
    session: {
      create: vi.fn(),
      get: vi.fn(),
      verifyToken: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteByUserId: vi.fn(),
    },
    user: {
      register: vi.fn(),
      getCurrentUser: vi.fn(),
      updateCurrentUser: vi.fn(),
      getUser: vi.fn(),
      listUsers: vi.fn(),
      updateUser: vi.fn(),
      deleteUser: vi.fn(),
      adminResetPassword: vi.fn(),
      changePassword: vi.fn(),
      changeCurrentUserPassword: vi.fn(),
      requestPasswordReset: vi.fn(),
      confirmPasswordReset: vi.fn(),
      validatePassword: vi.fn(),
    },
    authz: {
      checkPermission: vi.fn(),
      getUserPermissions: vi.fn(),
      getUserRoles: vi.fn(),
      assignRole: vi.fn(),
      removeRole: vi.fn(),
      createRole: vi.fn(),
      getRole: vi.fn(),
      getRoleByCode: vi.fn(),
      getAllRoles: vi.fn(),
      updateRole: vi.fn(),
      deleteRole: vi.fn(),
      createPermission: vi.fn(),
      getPermission: vi.fn(),
      getAllPermissions: vi.fn(),
      deletePermission: vi.fn(),
      assignPermissionToRole: vi.fn(),
      removePermissionFromRole: vi.fn(),
      getRolePermissions: vi.fn(),
    },
    client: {
      create: vi.fn(),
    },
    init: vi.fn(),
    close: vi.fn(),
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
    mockIam.auth.verifyToken.mockResolvedValue({
      success: true,
      data: {
        userId: 'user-1',
        roles: [],
        accessToken: 'valid-token',
        expiresAt: new Date(),
        createdAt: new Date(),
        lastActiveAt: new Date(),
      },
    })

    const handle = createIamHandle({
      iam: mockIam as unknown as IamHandleConfig['iam'],
      publicPaths: [],
    })

    const event = createMockEvent('/dashboard', { sessionToken: 'valid-token' })
    const resolve = vi.fn().mockResolvedValue(new Response('OK'))

    await handle({ event, resolve })

    expect(mockIam.auth.verifyToken).toHaveBeenCalledWith('valid-token')
    expect((event.locals as IamLocals).session).toEqual({
      userId: 'user-1',
      roles: [],
      accessToken: 'valid-token',
      expiresAt: expect.any(Date),
      createdAt: expect.any(Date),
      lastActiveAt: expect.any(Date),
    })
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
    mockIam.auth.verifyToken.mockRejectedValue(new Error('Invalid token'))

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
    mockIam.auth.verifyToken.mockResolvedValue({
      success: true,
      data: {
        userId: 'user-1',
        roles: [],
        accessToken: 'valid-token',
        expiresAt: new Date(),
        createdAt: new Date(),
        lastActiveAt: new Date(),
      },
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
    ;(event.locals as IamLocals).session = { userId: 'session-user', roles: [], accessToken: 'token', expiresAt: new Date(), createdAt: new Date(), lastActiveAt: new Date() } as any

    const result = requireAuth(event)

    expect(result.session).toBeDefined()
  })

  it('应该在未认证时抛出 401', () => {
    const event = createMockEvent('/api/data')

    expect(() => requireAuth(event)).toThrow()
  })
})
