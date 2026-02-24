/**
 * =============================================================================
 * E2E 测试 - 认证流程（注册 → 登录 → 登出）
 * =============================================================================
 */

import { expect, test } from '@playwright/test'
import { loginOnPage, registerViaApi, uniqueUser } from './helpers'

// ---------------------------------------------------------------------------
// 注册
// ---------------------------------------------------------------------------
test.describe('Register', () => {
  test('注册页面可访问', async ({ page }) => {
    await page.goto('/auth/register')
    await expect(page).toHaveURL(/\/auth\/register/)
    // 页面应包含注册表单
    await expect(page.locator('form')).toBeVisible()
  })

  test('通过 API 注册成功后可访问 /admin', async ({ page, request }) => {
    const u = uniqueUser()
    const res = await registerViaApi(request, u)
    expect(res.ok()).toBeTruthy()

    // 注册 API 会设置 session cookie，但 request fixture 不与 page 共享 cookie
    // 用 page.evaluate 登录来获取 cookie
    await loginOnPage(page, u.username, u.password)
    expect(page.url()).toContain('/admin')
  })
})

// ---------------------------------------------------------------------------
// 登录
// ---------------------------------------------------------------------------
test.describe('Login', () => {
  const user = uniqueUser()

  test.beforeAll(async ({ request }) => {
    // 通过 API 创建测试用户
    await registerViaApi(request, user)
  })

  test('登录页面可访问', async ({ page }) => {
    await page.goto('/auth/login')
    await expect(page).toHaveURL(/\/auth\/login/)
    await expect(page.locator('form')).toBeVisible()
  })

  test('登录成功后跳转到 /admin', async ({ page }) => {
    await loginOnPage(page, user.username, user.password)
    expect(page.url()).toContain('/admin')
  })

  test('错误密码不跳转', async ({ page }) => {
    await page.goto('/auth/login')
    await page.waitForLoadState('domcontentloaded')

    // 通过 evaluate 调用 API 验证错误密码行为
    const result = await page.evaluate(async ([u]: string[]) => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: u, password: 'wrongpassword' }),
      })
      return { status: res.status, body: await res.json() }
    }, [user.username])

    expect(result.status).toBe(401)
    expect(result.body.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 登出
// ---------------------------------------------------------------------------
test.describe('Logout', () => {
  const user = uniqueUser()

  test.beforeAll(async ({ request }) => {
    await registerViaApi(request, user)
  })

  test('登出后重定向到登录页', async ({ page }) => {
    // 先登录
    await loginOnPage(page, user.username, user.password)

    // 通过 API 登出
    await page.request.post('/api/auth/logout')

    // 访问受保护页面应重定向到登录
    await page.goto('/admin')
    await page.waitForURL('**/auth/login**', { timeout: 10_000 })
    expect(page.url()).toContain('/auth/login')
  })
})
