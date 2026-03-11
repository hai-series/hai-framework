/**
 * =============================================================================
 * E2E 测试 - Auth API 接口
 * =============================================================================
 */

import { expect, test } from '@playwright/test'

function uniqueUser() {
  const entropy = `${Date.now().toString(36)}${process.pid.toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const id = entropy.slice(-10)
  return {
    username: `api_${id}`.slice(0, 20),
    email: `api_${id}@test.local`,
    password: 'Test1234!@',
  }
}

function getUserPayload(body: { user?: unknown, data?: { user?: unknown } }) {
  return body.user ?? body.data?.user
}

// ---------------------------------------------------------------------------
// POST /api/auth/register
// ---------------------------------------------------------------------------
test.describe('POST /api/auth/register', () => {
  test('成功注册返回用户信息', async ({ request }) => {
    const u = uniqueUser()
    const res = await request.post('/api/auth/register', {
      data: {
        username: u.username,
        email: u.email,
        password: u.password,
        confirmPassword: u.password,
      },
    })
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.success).toBe(true)
    const user = getUserPayload(body)
    expect(user).toBeDefined()
    expect(user).toHaveProperty('roles')
  })

  test('重复用户名返回 400', async ({ request }) => {
    const u = uniqueUser()
    // 先注册一次
    await request.post('/api/auth/register', {
      data: { username: u.username, email: u.email, password: u.password, confirmPassword: u.password },
    })
    // 再次注册相同用户名
    const res = await request.post('/api/auth/register', {
      data: { username: u.username, email: `dup_${u.email}`, password: u.password, confirmPassword: u.password },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.success).toBe(false)
  })

  test('缺少必填字段返回 400', async ({ request }) => {
    const res = await request.post('/api/auth/register', {
      data: { username: '', email: '', password: '' },
    })
    expect(res.status()).toBe(400)
  })

  test('密码不一致返回 400', async ({ request }) => {
    const u = uniqueUser()
    const res = await request.post('/api/auth/register', {
      data: {
        username: u.username,
        email: u.email,
        password: u.password,
        confirmPassword: 'different',
      },
    })
    expect(res.status()).toBe(400)
  })
})

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------
test.describe('POST /api/auth/login', () => {
  const user = uniqueUser()

  test.beforeAll(async ({ request }) => {
    await request.post('/api/auth/register', {
      data: { username: user.username, email: user.email, password: user.password, confirmPassword: user.password },
    })
  })

  test('正确凭据登录成功', async ({ request }) => {
    const res = await request.post('/api/auth/login', {
      data: { identifier: user.username, password: user.password },
    })
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data?.accessToken).toBeTruthy()
    const loginUser = getUserPayload(body) as { id: string, username: string }
    expect(loginUser).toHaveProperty('id')
    expect(loginUser.username).toBe(user.username)
  })

  test('用邮箱登录成功', async ({ request }) => {
    const res = await request.post('/api/auth/login', {
      data: { identifier: user.email, password: user.password },
    })
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data?.accessToken).toBeTruthy()
  })

  test('错误密码返回 401', async ({ request }) => {
    const res = await request.post('/api/auth/login', {
      data: { identifier: user.username, password: 'wrongpassword' },
    })
    expect(res.status()).toBe(401)
  })

  test('不存在的用户返回 401', async ({ request }) => {
    const res = await request.post('/api/auth/login', {
      data: { identifier: 'nonexistent_user_xyz', password: 'whatever' },
    })
    expect(res.status()).toBe(401)
  })

  test('缺少字段返回 400', async ({ request }) => {
    const res = await request.post('/api/auth/login', {
      data: { identifier: '', password: '' },
    })
    expect(res.status()).toBe(400)
  })
})

// ---------------------------------------------------------------------------
// POST /api/auth/logout
// ---------------------------------------------------------------------------
test.describe('POST /api/auth/logout', () => {
  test('登出始终返回 success', async ({ request }) => {
    const res = await request.post('/api/auth/logout')
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// GET /api/auth/me
// ---------------------------------------------------------------------------
test.describe('GET /api/auth/me', () => {
  test('未登录返回 user: null', async ({ request }) => {
    const res = await request.get('/api/auth/me')
    const body = await res.json()
    // 未认证时返回 success: false 或 user: null
    expect(body.user === null || body.success === false).toBeTruthy()
  })

  test('登录后返回用户信息', async ({ request }) => {
    const u = uniqueUser()
    // 注册并使用返回 token 请求 me
    const registerRes = await request.post('/api/auth/register', {
      data: { username: u.username, email: u.email, password: u.password, confirmPassword: u.password },
    })
    const registerBody = await registerRes.json()
    const accessToken = registerBody.data?.accessToken as string | undefined
    expect(accessToken).toBeTruthy()

    const res = await request.get('/api/auth/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })
    const body = await res.json()
    expect(body.success).toBe(true)
    const meUser = getUserPayload(body) as { id: string, username: string }
    expect(meUser).toHaveProperty('id')
    expect(meUser.username).toBe(u.username)
  })
})
