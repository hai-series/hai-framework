/**
 * =============================================================================
 * @h-ai/kit - kit.auth 未配置场景测试
 * =============================================================================
 * 验证：当未通过 createHandle 注入 auth.iam 时，公共 API 必须返回
 * 失败 HaiResult（KIT_AUTH_NOT_CONFIGURED），禁止抛出未捕获异常。
 * =============================================================================
 */

import type { AuthResult } from '@h-ai/iam'
import type { AuthOperations } from '@h-ai/kit'
import type { RequestEvent } from '@sveltejs/kit'
import { core, HaiCommonError } from '@h-ai/core'
import { kit } from '@h-ai/kit'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { login, loginWithApiKey, loginWithLdap, loginWithOtp, logout, registerAndLogin } = kit.auth

function createCookies() {
  return {
    get: vi.fn<(name: string) => string | undefined>(),
    set: vi.fn(),
    delete: vi.fn(),
  }
}

function requestEvent(cookies: ReturnType<typeof createCookies>): RequestEvent {
  const url = new URL('https://app.example.test/api/auth/login')
  // 仅提供本测试中 Hook 消费的 SvelteKit 字段，其余由真实宿主提供。
  return {
    request: new Request(url),
    url,
    cookies,
    locals: {},
    route: { id: '/api/auth/login' },
  } as RequestEvent
}

async function withAuthCookies(
  cookies: ReturnType<typeof createCookies>,
  operations: AuthOperations,
  run: (cookies: RequestEvent['cookies']) => Promise<void>,
) {
  const handle = kit.createHandle({
    logging: false,
    auth: {
      iam: {
        auth: {
          ...operations,
          verifyToken: async () => core.err(HaiCommonError.UNAUTHORIZED),
        },
      },
    },
  })
  const response = await handle({
    event: requestEvent(cookies),
    resolve: async ({ cookies }) => {
      await run(cookies)
      return new Response()
    },
  })
  expect(response.ok).toBe(true)
}

afterEach(() => vi.unstubAllEnvs())

/** 使用真实认证契约构造成功响应，避免强制断言掩盖 Cookie 消费字段变化。 */
function createAuthOperations() {
  const result: AuthResult = {
    user: {
      id: '1',
      username: 'user',
      accountStatus: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    tokens: {
      accessToken: 'tk',
      refreshToken: 'refresh',
      expiresIn: 3600,
      tokenType: 'Bearer',
    },
    roles: [],
    permissions: [],
  }
  return {
    login: vi.fn<AuthOperations['login']>().mockResolvedValue(core.ok(result)),
    loginWithOtp: vi.fn<AuthOperations['loginWithOtp']>().mockResolvedValue(core.ok(result)),
    loginWithLdap: vi.fn<AuthOperations['loginWithLdap']>().mockResolvedValue(core.ok(result)),
    loginWithApiKey: vi.fn<AuthOperations['loginWithApiKey']>().mockResolvedValue(core.ok(result)),
    registerAndLogin: vi.fn<AuthOperations['registerAndLogin']>().mockResolvedValue(core.ok(result)),
    logout: vi.fn<AuthOperations['logout']>().mockResolvedValue(core.ok(undefined)),
  } satisfies AuthOperations
}

describe('kit.auth 未配置时返回 HaiResult 错误', () => {
  it('login 未配置时返回 KIT_AUTH_NOT_CONFIGURED', async () => {
    const cookies = createCookies()
    const result = await login(cookies, { identifier: 'a', password: 'b' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('KIT_AUTH_NOT_CONFIGURED')
    }
    expect(cookies.set).not.toHaveBeenCalled()
  })

  it('loginWithOtp 未配置时返回 KIT_AUTH_NOT_CONFIGURED', async () => {
    const cookies = createCookies()
    const result = await loginWithOtp(cookies, { identifier: 'a', code: '123' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('KIT_AUTH_NOT_CONFIGURED')
    }
  })

  it('loginWithLdap 未配置时返回 KIT_AUTH_NOT_CONFIGURED', async () => {
    const cookies = createCookies()
    const result = await loginWithLdap(cookies, { username: 'a', password: 'b' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('KIT_AUTH_NOT_CONFIGURED')
    }
  })

  it('loginWithApiKey 未配置时返回 KIT_AUTH_NOT_CONFIGURED', async () => {
    const cookies = createCookies()
    const result = await loginWithApiKey(cookies, { key: 'k' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('KIT_AUTH_NOT_CONFIGURED')
    }
  })

  it('registerAndLogin 未配置时返回 KIT_AUTH_NOT_CONFIGURED', async () => {
    const cookies = createCookies()
    const result = await registerAndLogin(cookies, { username: 'u', password: 'p' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('KIT_AUTH_NOT_CONFIGURED')
    }
  })

  it('logout 有token但未配置时清除Cookie且返回失败，不能假称服务端已撤销', async () => {
    const cookies = createCookies()
    await expect(logout(cookies, 'some-token')).resolves.toMatchObject({
      success: false,
      error: { code: 'KIT_AUTH_NOT_CONFIGURED' },
    })
    expect(cookies.delete).toHaveBeenCalledWith('hai_access_token', { path: '/' })
  })

  it('logout 在 accessToken 缺失时也只清 Cookie', async () => {
    const cookies = createCookies()
    await expect(logout(cookies, null)).resolves.toEqual(core.ok(undefined))
    expect(cookies.delete).toHaveBeenCalledWith('hai_access_token', { path: '/' })
  })
})

describe('kit.auth 已配置时正常委托给 operations', () => {
  it('logout 保留服务端失败结果，同时清理当前Cookie', async () => {
    const operations = createAuthOperations()
    const failure = core.err({ code: 'STATE_UNAVAILABLE', message: 'Session state unavailable' })
    operations.logout.mockResolvedValueOnce(failure)
    const cookies = createCookies()
    await withAuthCookies(cookies, operations, async (boundCookies) => {
      expect(await logout(boundCookies, 'held-token')).toBe(failure)
    })
    expect(operations.logout).toHaveBeenCalledWith('held-token')
    expect(cookies.delete).toHaveBeenCalledWith('hai_access_token', { path: '/' })
  })

  it('logout 成功和底层异常都清Cookie，异常不被转换为成功', async () => {
    const operations = createAuthOperations()
    const cookies = createCookies()
    await withAuthCookies(cookies, operations, async (boundCookies) => {
      expect(await logout(boundCookies, 'held-token')).toEqual(core.ok(undefined))
      operations.logout.mockRejectedValueOnce(new Error('Injected control-flow failure'))
      await expect(logout(boundCookies, 'held-token')).rejects.toThrow('Injected control-flow failure')
    })
    expect(cookies.delete).toHaveBeenCalledTimes(2)
  })

  it('login 已配置时调用 operations 并写入 Cookie', async () => {
    const mockOps = createAuthOperations()
    const cookies = createCookies()
    await withAuthCookies(cookies, mockOps, async (boundCookies) => {
      const result = await login(boundCookies, { identifier: 'u', password: 'p' })
      expect(result.success).toBe(true)
    })
    expect(mockOps.login).toHaveBeenCalledOnce()
    expect(cookies.set).toHaveBeenCalledWith(
      'hai_access_token',
      'tk',
      expect.objectContaining({ httpOnly: true, path: '/' }),
    )
  })

  it.each(['NODE_ENV', 'HAI_CORE_ENV'])('%s 为 production 时使用 Secure Cookie，测试开关不放宽', async (productionFlag) => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('HAI_CORE_ENV', 'development')
    vi.stubEnv(productionFlag, 'production')
    vi.stubEnv('HAI_E2E', '1')
    const cookies = createCookies()
    await withAuthCookies(cookies, createAuthOperations(), async (boundCookies) => {
      const result = await login(boundCookies, { identifier: 'user', password: 'password' })
      expect(result.success).toBe(true)
    })
    expect(cookies.set).toHaveBeenCalledWith('hai_access_token', 'tk', expect.objectContaining({ secure: true }))
  })

  it('每个 Handle 使用自己的 Cookie、验证器和认证操作', async () => {
    const fixtures = ['first', 'second'].map((id) => {
      const operations = createAuthOperations()
      const cookies = createCookies()
      const verifyToken = vi.fn(async () => core.ok({ userId: id, roles: [], permissions: [] }))
      cookies.get.mockImplementation(name => name === `${id}_cookie`
        ? `${id}_access`
        : undefined)
      const handle = kit.createHandle({
        logging: false,
        auth: {
          cookieName: `${id}_cookie`,
          iam: {
            auth: { ...operations, verifyToken },
          },
        },
      })
      return {
        id,
        operations,
        cookies,
        verifyToken,
        handle,
      }
    })

    await Promise.all(fixtures.map(async ({ cookies, operations, id, verifyToken, handle }) => {
      const resolve = vi.fn(async (event: RequestEvent) => {
        expect(event.locals).toMatchObject({
          session: { userId: id },
          accessToken: `${id}_access`,
        })
        const result = await login(event.cookies, { identifier: id, password: 'fixture-password' })
        expect(result.success).toBe(true)
        return new Response()
      })
      expect((await handle({
        event: requestEvent(cookies),
        resolve,
      })).ok).toBe(true)
      expect(verifyToken).toHaveBeenCalledExactlyOnceWith(`${id}_access`)
      expect(operations.login).toHaveBeenCalledExactlyOnceWith({ identifier: id, password: 'fixture-password' }, undefined)
      expect(cookies.set).toHaveBeenCalledExactlyOnceWith(`${id}_cookie`, 'tk', expect.objectContaining({ httpOnly: true }))
    }))
    expect((await login(createCookies(), { identifier: 'unconfigured', password: 'fixture-password' }))).toMatchObject({
      success: false,
      error: { code: 'KIT_AUTH_NOT_CONFIGURED' },
    })
  })
})
