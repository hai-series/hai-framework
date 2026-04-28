/**
 * =============================================================================
 * @h-ai/kit - kit.auth 未配置场景测试
 * =============================================================================
 * 验证：当未通过 createHandle 注入 auth.operations 时，公共 API 必须返回
 * 失败 HaiResult（KIT_AUTH_NOT_CONFIGURED），禁止抛出未捕获异常。
 * =============================================================================
 */

import { describe, expect, it, vi } from 'vitest'
import { configureAuth, login, loginWithApiKey, loginWithLdap, loginWithOtp, logout, registerAndLogin } from '../src/kit-auth.js'

function createCookies() {
  return {
    set: vi.fn(),
    delete: vi.fn(),
  }
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

  it('logout 未配置时仍清除 Cookie，且不抛出', async () => {
    const cookies = createCookies()
    await expect(logout(cookies, 'some-token')).resolves.toBeUndefined()
    expect(cookies.delete).toHaveBeenCalledWith('hai_access_token', { path: '/' })
  })

  it('logout 在 accessToken 缺失时也只清 Cookie', async () => {
    const cookies = createCookies()
    await expect(logout(cookies, null)).resolves.toBeUndefined()
    expect(cookies.delete).toHaveBeenCalledWith('hai_access_token', { path: '/' })
  })
})

describe('kit.auth 已配置时正常委托给 operations', () => {
  it('login 已配置时调用 operations 并写入 Cookie', async () => {
    const mockOps = {
      login: vi.fn().mockResolvedValue({
        success: true,
        data: {
          user: { id: '1' },
          tokens: { accessToken: 'tk', expiresIn: 3600 },
          roles: [],
          permissions: [],
        },
      }),
      loginWithOtp: vi.fn(),
      loginWithLdap: vi.fn(),
      loginWithApiKey: vi.fn(),
      registerAndLogin: vi.fn(),
      logout: vi.fn().mockResolvedValue(undefined),
    }
    configureAuth({ operations: mockOps as never })

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
})
