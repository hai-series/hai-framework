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
  })

  it('login 成功后写入 token 并更新当前用户', async () => {
    login.mockResolvedValueOnce({
      success: true,
      data: {
        user: { id: 'u-1', username: 'alice' },
        tokens: { accessToken: 'access-1', expiresIn: 3600, tokenType: 'Bearer' },
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
    expect(authStore.isAuthenticated()).toBe(true)
  })

  it('register 成功后写入 token 并更新当前用户', async () => {
    register.mockResolvedValueOnce({
      success: true,
      data: {
        user: { id: 'u-2', username: 'bob' },
        tokens: { accessToken: 'access-2', expiresIn: 3600, tokenType: 'Bearer' },
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
    expect(authStore.isAuthenticated()).toBe(false)
  })
})
