import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { mountRefreshCookieRoutes } from '../src/serv-cookie-auth.js'

const API_PREFIX = '/api/v1'
const COOKIE_NAME = 'hai_refresh_token'
const REFRESH_PATH = `${API_PREFIX}/auth/refresh`
// OTP 登录的实际路径（与 apiContract.iam 对齐）
const LOGIN_WITH_OTP_PATH = `${API_PREFIX}/auth/login/otp`

const MOCK_TOKENS = {
  accessToken: 'new-access-token',
  refreshToken: 'new-refresh-token',
  expiresIn: 3600,
  tokenType: 'Bearer',
}

const MOCK_AUTH_RESULT = {
  tokens: MOCK_TOKENS,
  user: { id: 'user-1', identifier: 'alice' },
  roles: [],
  permissions: [],
}

/** 创建携带 cookie 认证路由的测试 app。使用 `iam` 风格配置（推荐用法）。 */
function createTestApp(
  refreshFn = vi.fn().mockResolvedValue({ success: true, data: MOCK_TOKENS }),
): { app: Hono, refreshFn: ReturnType<typeof vi.fn> } {
  const app = new Hono()

  const iam = { session: { verifyToken: vi.fn(), refresh: refreshFn } }
  mountRefreshCookieRoutes(app, API_PREFIX, { secure: false }, iam)

  // 模拟 oRPC 处理器（在 cookie 路由之后注册，由 next() 触发）
  app.post(`${API_PREFIX}/auth/login`, c =>
    c.json({ success: true, data: MOCK_AUTH_RESULT }))
  app.post(LOGIN_WITH_OTP_PATH, c =>
    c.json({ success: true, data: MOCK_AUTH_RESULT }))
  app.post(`${API_PREFIX}/auth/register`, c =>
    c.json({ success: true, data: MOCK_AUTH_RESULT }))
  app.post(`${API_PREFIX}/auth/logout`, c =>
    c.json({ success: true, data: null }))

  return { app, refreshFn }
}

describe('mountRefreshCookieRoutes', () => {
  describe('login', () => {
    it('成功登录后，响应中包含 httpOnly refresh token cookie', async () => {
      const { app } = createTestApp()
      const res = await app.request(`${API_PREFIX}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'alice', password: 'secret' }),
      })

      expect(res.status).toBe(200)
      const cookies = res.headers.getSetCookie()
      const refreshCookie = cookies.find(c => c.startsWith(COOKIE_NAME))
      expect(refreshCookie).toBeDefined()
      expect(refreshCookie).toContain(encodeURIComponent(MOCK_TOKENS.refreshToken))
      expect(refreshCookie).toContain(`Path=${REFRESH_PATH}`)
      expect(refreshCookie).toContain('HttpOnly')
      expect(refreshCookie).toContain('SameSite=Strict')
    })

    it('登录失败时（oRPC 返回 success:false），不设置 cookie', async () => {
      const app = new Hono()
      const iam = { session: { verifyToken: vi.fn(), refresh: vi.fn() } }
      mountRefreshCookieRoutes(app, API_PREFIX, { secure: false }, iam)
      app.post(`${API_PREFIX}/auth/login`, c =>
        c.json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Bad credentials' } }))

      const res = await app.request(`${API_PREFIX}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'alice', password: 'wrong' }),
      })

      expect(res.status).toBe(200)
      const cookies = res.headers.getSetCookie()
      expect(cookies.filter(c => c.startsWith(COOKIE_NAME))).toHaveLength(0)
    })

    it('登录成功后，响应体擦除 refreshToken 并保留 accessToken', async () => {
      const { app } = createTestApp()
      const res = await app.request(`${API_PREFIX}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'alice', password: 'secret' }),
      })

      const body = await res.json()
      expect(body.success).toBe(true)
      expect(body.data.tokens.accessToken).toBe(MOCK_TOKENS.accessToken)
      expect(body.data.tokens.refreshToken).toBeUndefined()
      expect(body.data.user.id).toBe('user-1')
    })
  })

  describe('register', () => {
    it('注册成功后，响应中包含 httpOnly refresh token cookie', async () => {
      const { app } = createTestApp()

      const res = await app.request(`${API_PREFIX}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'bob', password: 'secret' }),
      })

      expect(res.status).toBe(200)
      const cookies = res.headers.getSetCookie()
      expect(cookies.find(c => c.startsWith(COOKIE_NAME))).toBeDefined()
    })
  })

  describe('loginWithOtp', () => {
    it('oTP 登录成功后设置 cookie', async () => {
      const { app } = createTestApp()

      const res = await app.request(LOGIN_WITH_OTP_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'alice', otp: '123456' }),
      })

      expect(res.status).toBe(200)
      const cookies = res.headers.getSetCookie()
      expect(cookies.find(c => c.startsWith(COOKIE_NAME))).toBeDefined()
    })
  })

  describe('logout', () => {
    it('登出成功后，响应中包含清除 cookie 的指令（Max-Age=0）', async () => {
      const { app } = createTestApp()

      const res = await app.request(`${API_PREFIX}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': `${COOKIE_NAME}=old-refresh-token` },
        body: JSON.stringify({ refreshToken: 'old-refresh-token' }),
      })

      expect(res.status).toBe(200)
      const cookies = res.headers.getSetCookie()
      const clearCookie = cookies.find(c => c.startsWith(COOKIE_NAME))
      expect(clearCookie).toBeDefined()
      expect(clearCookie).toContain('Max-Age=0')
    })
  })

  describe('refresh', () => {
    it('携带有效 cookie 时，刷新成功并更新 cookie', async () => {
      const { app, refreshFn } = createTestApp()

      const res = await app.request(`${API_PREFIX}/auth/refresh`, {
        method: 'POST',
        headers: { Cookie: `${COOKIE_NAME}=old-refresh-token` },
      })

      expect(res.status).toBe(200)
      expect(refreshFn).toHaveBeenCalledWith('old-refresh-token')

      const body = await res.json()
      expect(body.success).toBe(true)
      expect(body.data.tokens.accessToken).toBe(MOCK_TOKENS.accessToken)
      expect(body.data.tokens.refreshToken).toBeUndefined()

      const cookies = res.headers.getSetCookie()
      const refreshCookie = cookies.find(c => c.startsWith(COOKIE_NAME))
      expect(refreshCookie).toBeDefined()
      expect(refreshCookie).toContain(encodeURIComponent(MOCK_TOKENS.refreshToken))
    })

    it('未携带 cookie 时，返回 401', async () => {
      const { app } = createTestApp()

      const res = await app.request(`${API_PREFIX}/auth/refresh`, {
        method: 'POST',
        headers: { 'accept-language': 'zh-CN' },
      })

      expect(res.status).toBe(401)
      const body = await res.json()
      expect(body.success).toBe(false)
      expect(body.error.message).toBe('未登录或登录已失效')
    })

    it('onRefresh 回调失败时，返回错误并清除 cookie', async () => {
      const failFn = vi.fn().mockResolvedValue({
        success: false,
        error: { code: 'SESSION_EXPIRED', message: 'Session expired', httpStatus: 401 },
      })
      const iam = { session: { verifyToken: vi.fn(), refresh: failFn } }
      const app = new Hono()
      mountRefreshCookieRoutes(app, API_PREFIX, { secure: false }, iam)

      const res = await app.request(`${API_PREFIX}/auth/refresh`, {
        method: 'POST',
        headers: { Cookie: `${COOKIE_NAME}=expired-token` },
      })

      expect(res.status).toBe(401)
      const body = await res.json()
      expect(body.success).toBe(false)

      // 失败时清除失效 cookie
      const cookies = res.headers.getSetCookie()
      const clearCookie = cookies.find(c => c.startsWith(COOKIE_NAME))
      expect(clearCookie).toBeDefined()
      expect(clearCookie).toContain('Max-Age=0')
    })
  })

  describe('cookie 属性', () => {
    it('secure: false 时，cookie 不含 Secure 属性', async () => {
      const { app } = createTestApp()

      const res = await app.request(`${API_PREFIX}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'alice', password: 'secret' }),
      })

      const cookies = res.headers.getSetCookie()
      const refreshCookie = cookies.find(c => c.startsWith(COOKIE_NAME))
      expect(refreshCookie).not.toContain('Secure')
    })

    it('secure: true 时，cookie 包含 Secure 属性', async () => {
      const app = new Hono()
      const iam = { session: { verifyToken: vi.fn(), refresh: vi.fn().mockResolvedValue({ success: true, data: MOCK_TOKENS }) } }
      mountRefreshCookieRoutes(app, API_PREFIX, { secure: true }, iam)
      app.post(`${API_PREFIX}/auth/login`, c => c.json({ success: true, data: MOCK_AUTH_RESULT }))

      const res = await app.request(`${API_PREFIX}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'alice', password: 'secret' }),
      })

      const cookies = res.headers.getSetCookie()
      const refreshCookie = cookies.find(c => c.startsWith(COOKIE_NAME))
      expect(refreshCookie).toContain('Secure')
    })

    it('cookie path 限制为 refresh 端点路径', async () => {
      const { app } = createTestApp()

      const res = await app.request(`${API_PREFIX}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'alice', password: 'secret' }),
      })

      const cookies = res.headers.getSetCookie()
      const refreshCookie = cookies.find(c => c.startsWith(COOKIE_NAME))
      expect(refreshCookie).toContain(`Path=${API_PREFIX}/auth/refresh`)
    })

    it('自定义 cookieName 时使用指定名称', async () => {
      const customName = 'my_refresh_token'
      const app = new Hono()
      const iam = { session: { verifyToken: vi.fn(), refresh: vi.fn().mockResolvedValue({ success: true, data: MOCK_TOKENS }) } }
      mountRefreshCookieRoutes(app, API_PREFIX, { cookieName: customName, secure: false }, iam)
      app.post(`${API_PREFIX}/auth/login`, c => c.json({ success: true, data: MOCK_AUTH_RESULT }))

      const res = await app.request(`${API_PREFIX}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'alice', password: 'secret' }),
      })

      const cookies = res.headers.getSetCookie()
      expect(cookies.find(c => c.startsWith(customName))).toBeDefined()
      expect(cookies.find(c => c.startsWith(COOKIE_NAME))).toBeUndefined()
    })
  })
})
