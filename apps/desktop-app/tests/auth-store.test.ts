import { beforeEach, describe, expect, it, vi } from 'vitest'

const locale = vi.hoisted(() => ({ current: 'en-US' }))
vi.mock('@h-ai/ui/i18n', async importOriginal => ({ ...await importOriginal<typeof import('@h-ai/ui/i18n')>(), getGlobalLocale: () => locale.current }))

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
    login.mockRejectedValueOnce(new Error('Private network connection detail'))

    const authStore = await import('../src/lib/auth-store.svelte.js')
    const error = await authStore.login({ identifier: 'alice', password: 'secret' })

    expect(error).toEqual(expect.any(String))
    expect(error).not.toContain('Private network connection detail')
    expect(setTokens).not.toHaveBeenCalled()
    expect(authStore.isLoading()).toBe(false)
  })

  it.each(['login', 'register'] as const)('%s 使用统一凭据提示并隐藏未知服务错误', async (method) => {
    const action = method === 'login' ? login : register
    action.mockResolvedValueOnce({ success: false, error: { code: 'hai:iam:002', message: 'Private account field', httpStatus: 401, traceId: 'desktop-auth' } })
    const store = await import('../src/lib/auth-store.svelte.js')
    const authenticate = () => method === 'login' ? store.login({ identifier: 'alice', password: 'example' }) : store.register({ username: 'alice', password: 'example' })
    const credentials = await authenticate()
    expect(credentials).toMatch(/用户名或密码不正确|Username or password is incorrect/)
    expect(credentials).toContain('traceId: desktop-auth')
    action.mockResolvedValueOnce({ success: false, error: { code: 'app:unknown', message: 'Private database detail', httpStatus: 500, traceId: 'desktop-internal' } })
    const unknown = await authenticate()
    expect(unknown).not.toContain('Private')
    expect(unknown).toContain('traceId: desktop-internal')
    expect(setTokens).not.toHaveBeenCalled()
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

  it.each([
    { language: 'en-US', message: 'Server sign-out was not confirmed' },
    { language: 'zh-CN', message: '服务端登出未确认' },
    { language: 'ja-JP', message: 'サーバーでのログアウトを確認できませんでした' },
  ])('logout HaiResult失败使用$language文案且仍清理本地凭据', async ({ language, message }) => {
    locale.current = language
    logout.mockResolvedValueOnce({ success: false, error: { code: 'REPOSITORY_ERROR', message: 'state unavailable' } })
    const authStore = await import('../src/lib/auth-store.svelte.js')
    const error = await authStore.logout()
    expect(error).toContain(message)
    expect(clearTokens).toHaveBeenCalledOnce()
    expect(authStore.isAuthenticated()).toBe(false)
    expect(authStore.isLoading()).toBe(false)
  })

  it.each([
    { language: 'en-US', loginRequest: 'Login request failed', registerRequest: 'Register request failed', loginResponse: 'Unexpected login response from server', registerResponse: 'Unexpected register response from server' },
    { language: 'zh-CN', loginRequest: '登录请求失败', registerRequest: '注册请求失败', loginResponse: '服务端登录响应异常', registerResponse: '服务端注册响应异常' },
    { language: 'ja-JP', loginRequest: 'ログインリクエストに失敗しました', registerRequest: '登録リクエストに失敗しました', loginResponse: 'サーバーからのログイン応答が無効です', registerResponse: 'サーバーからの登録応答が無効です' },
  ])('登录注册的未知响应与请求失败使用$language文案', async (messages) => {
    locale.current = messages.language
    const authStore = await import('../src/lib/auth-store.svelte.js')
    const loginInput = { identifier: 'alice', password: 'secret12' }
    const registerInput = { username: 'alice', password: 'secret12' }
    login.mockResolvedValueOnce({})
    expect(await authStore.login(loginInput)).toBe(messages.loginResponse)
    register.mockResolvedValueOnce({})
    expect(await authStore.register(registerInput)).toBe(messages.registerResponse)
    login.mockRejectedValueOnce({})
    expect(await authStore.login(loginInput)).toBe(messages.loginRequest)
    register.mockRejectedValueOnce({})
    expect(await authStore.register(registerInput)).toBe(messages.registerRequest)
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
