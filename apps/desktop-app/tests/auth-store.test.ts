import { beforeEach, describe, expect, it, vi } from 'vitest'

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
    localStorage.clear()
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
      data: { id: 'u-3', username: 'carol' },
    })
    logout.mockResolvedValueOnce({ success: true, data: undefined })

    const authStore = await import('../src/lib/auth-store.svelte.js')
    await authStore.refreshCurrentUser()
    await authStore.logout()

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

  it('refreshCurrentUser 会恢复同一用户的本地权限快照', async () => {
    localStorage.setItem('hai.desktop.auth.access-scope', JSON.stringify({
      userId: 'u-5',
      roles: ['admin'],
      permissions: ['dashboard:view', 'user:list'],
    }))
    currentUser.mockResolvedValueOnce({
      success: true,
      data: { id: 'u-5', username: 'erin' },
    })

    const authStore = await import('../src/lib/auth-store.svelte.js')
    await expect(authStore.refreshCurrentUser()).resolves.toBeUndefined()

    expect(authStore.currentUser()).toEqual({ id: 'u-5', username: 'erin' })
    expect(authStore.currentRoles()).toEqual(['admin'])
    expect(authStore.hasPermission('user:list')).toBe(true)
  })

  it('logout 服务端失败时仍会清理本地 token', async () => {
    currentUser.mockResolvedValueOnce({
      success: true,
      data: { id: 'u-4', username: 'dave' },
    })
    logout.mockRejectedValueOnce(new Error('offline'))

    const authStore = await import('../src/lib/auth-store.svelte.js')
    await authStore.refreshCurrentUser()
    await expect(authStore.logout()).resolves.toBeUndefined()

    expect(clearTokens).toHaveBeenCalledTimes(1)
    expect(authStore.currentUser()).toBeNull()
    expect(localStorage.getItem('hai.desktop.auth.access-scope')).toBeNull()
    expect(authStore.isAuthenticated()).toBe(false)
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
