import { beforeEach, describe, expect, it, vi } from 'vitest'

const locale = vi.hoisted(() => ({ current: 'en-US' }))
vi.mock('@h-ai/ui/i18n', () => ({ getGlobalLocale: () => locale.current }))

const login = vi.fn()
const register = vi.fn()
const logout = vi.fn()
const currentUser = vi.fn()
const setTokens = vi.fn(async () => undefined)
const clearTokens = vi.fn(async () => undefined)

vi.mock('../src/lib/api.js', () => ({
  desktopApiClient: {
    iam: {
      auth: {
        login,
        register,
        logout,
        currentUser,
      },
    },
    auth: {
      setTokens,
      clear: clearTokens,
    },
  },
}))

describe('auth-store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    locale.current = 'en-US'
  })

  it('login 成功后写入 token 并更新当前用户', async () => {
    login.mockResolvedValueOnce({
      success: true,
      data: {
        user: { id: 'u-1', username: 'alice' },
        tokens: { accessToken: 'access-1', expiresIn: 3600, tokenType: 'Bearer' },
        roles: ['admin'],
        permissions: ['dashboard:view', 'user:list'],
      },
    })

    const authStore = await import('../src/lib/auth-store.svelte.js')
    const error = await authStore.login({ identifier: 'alice', password: 'secret' })

    expect(error).toBeNull()
    expect(setTokens).toHaveBeenCalledWith({
      accessToken: 'access-1',
      expiresIn: 3600,
      tokenType: 'Bearer',
    })
    expect(authStore.currentUser()).toEqual({ id: 'u-1', username: 'alice' })
    expect(authStore.currentRoles()).toEqual(['admin'])
    expect(authStore.currentPermissions()).toEqual(['dashboard:view', 'user:list'])
    expect(authStore.hasPermission('user:list')).toBe(true)
    expect(authStore.isAuthenticated()).toBe(true)
  })

  it('register 成功后写入 token 并更新当前用户', async () => {
    register.mockResolvedValueOnce({
      success: true,
      data: {
        user: { id: 'u-2', username: 'bob' },
        tokens: { accessToken: 'access-2', expiresIn: 3600, tokenType: 'Bearer' },
        roles: ['user'],
        permissions: ['dashboard:view', 'profile:read'],
      },
    })

    const authStore = await import('../src/lib/auth-store.svelte.js')
    const error = await authStore.register({ username: 'bob', password: 'secret12' })

    expect(error).toBeNull()
    expect(setTokens).toHaveBeenCalledWith({
      accessToken: 'access-2',
      expiresIn: 3600,
      tokenType: 'Bearer',
    })
    expect(authStore.currentUser()).toEqual({ id: 'u-2', username: 'bob' })
    expect(authStore.hasPermission('user:list')).toBe(false)
  })

  it('logout 会清理 token 与本地用户状态', async () => {
    currentUser.mockResolvedValueOnce({
      success: true,
      data: { id: 'u-3', username: 'carol', roles: ['user'], permissions: ['profile:read'] },
    })
    logout.mockResolvedValueOnce({ success: true, data: undefined })

    const authStore = await import('../src/lib/auth-store.svelte.js')
    await authStore.refreshCurrentUser()
    expect(await authStore.logout()).toBeNull()

    expect(clearTokens).toHaveBeenCalledTimes(1)
    expect(authStore.currentUser()).toBeNull()
    expect(authStore.currentPermissions()).toEqual([])
    expect(authStore.isAuthenticated()).toBe(false)
  })

  it('login 网络异常时返回可展示错误而不是抛出', async () => {
    login.mockRejectedValueOnce(new Error('Failed to fetch'))

    const authStore = await import('../src/lib/auth-store.svelte.js')
    const error = await authStore.login({ identifier: 'alice', password: 'secret' })

    expect(error).toBe('Failed to fetch')
    expect(setTokens).not.toHaveBeenCalled()
    expect(authStore.isLoading()).toBe(false)
  })

  it('register 收到异常响应形态时返回兜底消息而不是抛出 TypeError', async () => {
    register.mockResolvedValueOnce({
      encryptedKey: 'raw',
      ciphertext: 'payload',
      iv: 'value',
    })

    const authStore = await import('../src/lib/auth-store.svelte.js')
    const error = await authStore.register({ username: 'bob', password: 'secret12' })

    expect(error).toBe('Unexpected register response from server')
    expect(setTokens).not.toHaveBeenCalled()
    expect(authStore.isLoading()).toBe(false)
  })

  it('refreshCurrentUser 使用服务端返回的最新权限快照', async () => {
    currentUser.mockResolvedValueOnce({
      success: true,
      data: {
        id: 'u-5',
        username: 'erin',
        roles: ['admin'],
        permissions: ['dashboard:view', 'user:list'],
      },
    })

    const authStore = await import('../src/lib/auth-store.svelte.js')
    await expect(authStore.refreshCurrentUser()).resolves.toBeUndefined()

    expect(authStore.currentUser()).toEqual({ id: 'u-5', username: 'erin' })
    expect(authStore.currentRoles()).toEqual(['admin'])
    expect(authStore.hasPermission('user:list')).toBe(true)
  })

  it('logout 网络失败清理本地token，但向调用方返回服务端撤销未确认', async () => {
    currentUser.mockResolvedValueOnce({
      success: true,
      data: { id: 'u-4', username: 'dave', roles: ['user'], permissions: [] },
    })
    logout.mockRejectedValueOnce(new Error('offline'))

    const authStore = await import('../src/lib/auth-store.svelte.js')
    await authStore.refreshCurrentUser()
    await expect(authStore.logout()).resolves.toMatch('Server sign-out was not confirmed')

    expect(clearTokens).toHaveBeenCalledTimes(1)
    expect(authStore.currentUser()).toBeNull()
    expect(authStore.isAuthenticated()).toBe(false)
    expect(authStore.isLoading()).toBe(false)
  })

  it.each(['en-US', 'zh-CN'])('logout HaiResult失败使用%s文案且仍清理本地凭据', async (language) => {
    locale.current = language
    logout.mockResolvedValueOnce({ success: false, error: { code: 'REPOSITORY_ERROR', message: 'state unavailable' } })
    const authStore = await import('../src/lib/auth-store.svelte.js')
    const error = await authStore.logout()
    expect(error).toContain(language === 'zh-CN' ? '服务端登出未确认' : 'Server sign-out was not confirmed')
    expect(clearTokens).toHaveBeenCalledOnce()
    expect(authStore.isAuthenticated()).toBe(false)
    expect(authStore.isLoading()).toBe(false)
  })

  it('logout本地安全存储清理失败也显示明确错误并结束加载', async () => {
    logout.mockResolvedValueOnce({ success: true, data: undefined })
    clearTokens.mockRejectedValueOnce(new Error('Injected storage failure'))
    const authStore = await import('../src/lib/auth-store.svelte.js')
    expect(await authStore.logout()).toContain('Local credentials could not be cleared')
    expect(authStore.isLoading()).toBe(false)
    expect(authStore.currentUser()).toBeNull()
  })

  it('refreshCurrentUser 网络异常时回退为未登录并完成初始化', async () => {
    currentUser.mockRejectedValueOnce(new Error('offline'))

    const authStore = await import('../src/lib/auth-store.svelte.js')
    await expect(authStore.refreshCurrentUser()).resolves.toBeUndefined()

    expect(authStore.currentUser()).toBeNull()
    expect(authStore.currentPermissions()).toEqual([])
    expect(authStore.isInitialized()).toBe(true)
    expect(authStore.isLoading()).toBe(false)
  })
})
