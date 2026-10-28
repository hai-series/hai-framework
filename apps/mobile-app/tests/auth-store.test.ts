import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  currentUser: vi.fn(),
  setTokens: vi.fn(),
  clear: vi.fn(),
}))

vi.mock('../src/lib/api.js', () => ({
  mobileApiClient: {
    iam: { auth: { login: mocks.login, register: mocks.register, logout: mocks.logout, currentUser: mocks.currentUser } },
    auth: { setTokens: mocks.setTokens, clear: mocks.clear },
  },
}))

beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  // 本组只验证 store 的业务状态与错误传播；页面响应式更新留给浏览器验收。
  vi.stubGlobal('$state', <T>(value: T) => value)
  mocks.login.mockResolvedValue({
    success: true,
    data: { user: { id: 'user-a' }, roles: ['user'], permissions: ['profile:read'], tokens: { accessToken: 'a' } },
  })
  mocks.register.mockImplementation(mocks.login)
  mocks.logout.mockResolvedValue({ success: true })
})

afterEach(() => vi.unstubAllGlobals())

describe('auth store persistence failures', () => {
  it.each(['login', 'register'] as const)('%s 使用安全认证提示，不显示原始字段或数据库错误', async (method) => {
    const store = await import('../src/lib/stores/auth-store.svelte.js')
    const action = mocks[method]
    action.mockResolvedValueOnce({ success: false, error: { code: 'hai:iam:002', message: 'Private original-password detail', httpStatus: 401, traceId: 'mobile-auth' } })
    const authenticate = () => method === 'login'
      ? store.login({ identifier: 'alice', password: 'example' })
      : store.register({ username: 'alice', password: 'example', confirmPassword: 'example' })
    const credentials = await authenticate()
    expect(credentials).toMatch(/用户名或密码不正确|Username or password is incorrect/)
    expect(credentials).toContain('traceId: mobile-auth')
    action.mockResolvedValueOnce({ success: false, error: { code: 'app:unknown', message: 'Private database detail', httpStatus: 500, traceId: 'mobile-internal' } })
    const unknown = await authenticate()
    expect(unknown).not.toContain('Private')
    expect(unknown).toContain('traceId: mobile-internal')
    expect(mocks.setTokens).not.toHaveBeenCalled()
    expect(store.isAuthenticated()).toBe(false)
  })

  it.each(['login', 'register'] as const)('%s 保存失败时不标记已认证并释放 loading', async (method) => {
    const store = await import('../src/lib/stores/auth-store.svelte.js')
    mocks.setTokens.mockRejectedValue(new Error('secure storage failed'))

    const result = method === 'login'
      ? store.login({ identifier: 'alice', password: 'test-password' })
      : store.register({ username: 'alice', password: 'test-password', confirmPassword: 'test-password' })

    await expect(result).resolves.toEqual(expect.any(String))
    expect(mocks.clear).toHaveBeenCalledOnce()
    expect(store.isAuthenticated()).toBe(false)
    expect(store.isLoading()).toBe(false)
  })

  it.each(['login', 'register'] as const)('%s 部分保存后的清理再失败时给出不同错误提示', async (method) => {
    const store = await import('../src/lib/stores/auth-store.svelte.js')
    mocks.setTokens.mockRejectedValue(new Error('refresh write failed after access write'))
    const authenticate = () => method === 'login'
      ? store.login({ identifier: 'alice', password: 'test-password' })
      : store.register({ username: 'alice', password: 'test-password', confirmPassword: 'test-password' })
    const savedFailure = await authenticate()
    mocks.clear.mockRejectedValue(new Error('native cleanup failed'))
    const cleanupFailure = await authenticate()

    expect(mocks.clear).toHaveBeenCalledTimes(2)
    expect(cleanupFailure).toEqual(expect.any(String))
    expect(cleanupFailure).not.toBe(savedFailure)
    expect(store.isAuthenticated()).toBe(false)
    expect(store.isLoading()).toBe(false)
  })

  it('原生清理失败仍清除内存身份并传播失败', async () => {
    const store = await import('../src/lib/stores/auth-store.svelte.js')
    await store.login({ identifier: 'alice', password: 'test-password' })
    mocks.clear.mockRejectedValue(new Error('native clear failed'))

    await expect(store.logout()).rejects.toThrow('native clear failed')
    expect(store.isAuthenticated()).toBe(false)
    expect(store.currentRoles()).toEqual([])
    expect(store.currentPermissions()).toEqual([])
    expect(store.isLoading()).toBe(false)
  })

  it('服务端退出抛错时仍执行本地清理并释放 loading', async () => {
    const store = await import('../src/lib/stores/auth-store.svelte.js')
    await store.login({ identifier: 'alice', password: 'test-password' })
    mocks.logout.mockRejectedValue(new Error('server logout failed'))

    await expect(store.logout()).rejects.toThrow('server logout failed')
    expect(mocks.clear).toHaveBeenCalledOnce()
    expect(store.isAuthenticated()).toBe(false)
    expect(store.isLoading()).toBe(false)
  })
})
