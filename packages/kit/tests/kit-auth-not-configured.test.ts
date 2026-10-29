/**
 * =============================================================================
 * @h-ai/kit - kit.auth 未配置场景测试
 * =============================================================================
 * 验证：当未通过 createHandle 注入 auth.operations 时，公共 API 必须返回
 * 失败 HaiResult（KIT_AUTH_NOT_CONFIGURED），禁止抛出未捕获异常。
 * =============================================================================
 */

import type { AuthResult } from '@h-ai/iam'
import type { AuthOperations } from '../src/kit-types.js'
import { err, ok } from '@h-ai/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { configureAuth, login, loginWithApiKey, loginWithLdap, loginWithOtp, logout, registerAndLogin } from '../src/kit-auth.js'

function createCookies() {
  return {
    set: vi.fn(),
    delete: vi.fn(),
  }
}

afterEach(() => vi.unstubAllEnvs())

/** 使用真实认证契约构造成功响应，避免强制断言掩盖 Cookie 消费字段变化。 */
function createAuthOperations() {
  const result: AuthResult = {
    user: { id: '1', username: 'user', accountStatus: 'active', createdAt: new Date(), updatedAt: new Date() },
    tokens: { accessToken: 'tk', refreshToken: 'refresh', expiresIn: 3600, tokenType: 'Bearer' },
    roles: [],
    permissions: [],
  }
  return {
    login: vi.fn<AuthOperations['login']>().mockResolvedValue(ok(result)),
    loginWithOtp: vi.fn<AuthOperations['loginWithOtp']>().mockResolvedValue(ok(result)),
    loginWithLdap: vi.fn<AuthOperations['loginWithLdap']>().mockResolvedValue(ok(result)),
    loginWithApiKey: vi.fn<AuthOperations['loginWithApiKey']>().mockResolvedValue(ok(result)),
    registerAndLogin: vi.fn<AuthOperations['registerAndLogin']>().mockResolvedValue(ok(result)),
    logout: vi.fn<AuthOperations['logout']>().mockResolvedValue(ok(undefined)),
  } satisfies AuthOperations
}

describe('kit.auth 未配置时返回 HaiResult 错误', () => {
  // 每个用例前重置 authState（通过 configureAuth 清空 operations）
  function resetAuthState() {
    // 通过传 undefined 无法清空（configureAuth 只在有值时写入），
    // 因此用一个永远 throw 的 operations 占位，再通过另外的测试覆盖该路径
    // 这里直接利用模块加载顺序：本文件单独运行不会先注入 operations
  }

  it('login 未配置时返回 KIT_AUTH_NOT_CONFIGURED', async () => {
    resetAuthState()
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
    await expect(logout(cookies, 'some-token')).resolves.toMatchObject({ success: false, error: { code: 'KIT_AUTH_NOT_CONFIGURED' } })
    expect(cookies.delete).toHaveBeenCalledWith('hai_access_token', { path: '/' })
  })

  it('logout 在 accessToken 缺失时也只清 Cookie', async () => {
    const cookies = createCookies()
    await expect(logout(cookies, null)).resolves.toEqual(ok(undefined))
    expect(cookies.delete).toHaveBeenCalledWith('hai_access_token', { path: '/' })
  })
})

describe('kit.auth 已配置时正常委托给 operations', () => {
  it('logout 保留服务端失败结果，同时清理当前Cookie', async () => {
    const operations = createAuthOperations()
    const failure = err({ code: 'STATE_UNAVAILABLE', message: 'Session state unavailable' })
    operations.logout.mockResolvedValueOnce(failure)
    configureAuth({ operations })
    const cookies = createCookies()
    expect(await logout(cookies, 'held-token')).toBe(failure)
    expect(operations.logout).toHaveBeenCalledWith('held-token')
    expect(cookies.delete).toHaveBeenCalledWith('hai_access_token', { path: '/' })
  })

  it('logout 成功和底层异常都清Cookie，异常不被转换为成功', async () => {
    const operations = createAuthOperations()
    configureAuth({ operations })
    const cookies = createCookies()
    expect(await logout(cookies, 'held-token')).toEqual(ok(undefined))
    operations.logout.mockRejectedValueOnce(new Error('Injected control-flow failure'))
    await expect(logout(cookies, 'held-token')).rejects.toThrow('Injected control-flow failure')
    expect(cookies.delete).toHaveBeenCalledTimes(2)
  })

  it('login 已配置时调用 operations 并写入 Cookie', async () => {
    const mockOps = createAuthOperations()
    configureAuth({ operations: mockOps })

    const cookies = createCookies()
    const result = await login(cookies, { identifier: 'u', password: 'p' })
    expect(result.success).toBe(true)
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
    configureAuth({ operations: createAuthOperations() })
    const cookies = createCookies()
    await login(cookies, { identifier: 'user', password: 'password' })
    expect(cookies.set).toHaveBeenCalledWith('hai_access_token', 'tk', expect.objectContaining({ secure: true }))
  })
})
