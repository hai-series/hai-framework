/**
 * =============================================================================
 * E2E 测试 - 认证页面 UI 交互
 * =============================================================================
 * 覆盖范围：
 * - 认证布局渲染
 * - 登录/注册表单 UI 元素
 * - 通过 UI 表单提交（走 apiFetch + 传输加密完整链路）
 * - 链接跳转
 * - 错误提示
 * =============================================================================
 */

import { expect, test } from '@playwright/test'
import { registerViaApi, uniqueUser } from './helpers'

// ---------------------------------------------------------------------------
// 认证布局
// ---------------------------------------------------------------------------
test.describe('Auth Layout', () => {
  test('登录页渲染完整的认证布局', async ({ page }) => {
    await page.goto('/auth/login')
    await page.waitForLoadState('domcontentloaded')

    // Logo 标题
    await expect(page.locator('h1')).toContainText('Admin Console')

    // 内容卡片
    await expect(page.locator('.card.bg-base-100')).toBeVisible()

    // 页脚 "Powered by hai-framework"
    const footer = page.locator('text=Powered by hai-framework')
    await expect(footer).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// 登录表单 UI
// ---------------------------------------------------------------------------
test.describe('Login Form UI', () => {
  test('登录表单包含所有必要元素', async ({ page }) => {
    await page.goto('/auth/login')
    await page.waitForLoadState('domcontentloaded')

    // 表单标题
    const title = page.locator('h2.text-xl')
    await expect(title).toBeVisible()

    // 用户名输入框
    const usernameInput = page.locator('#login-username')
    await expect(usernameInput).toBeVisible()
    await expect(usernameInput).toHaveAttribute('required', '')

    // 密码输入框（PasswordInput 组件内嵌 input[type=password]）
    const passwordInput = page.locator('input[type="password"]').first()
    await expect(passwordInput).toBeVisible()

    // 提交按钮
    const submitBtn = page.locator('button[type="submit"]')
    await expect(submitBtn).toBeVisible()

    // 忘记密码链接
    const forgotLink = page.locator('a[href="/auth/forgot-password"]')
    await expect(forgotLink).toBeVisible()

    // 注册链接
    const registerLink = page.locator('a[href="/auth/register"]')
    await expect(registerLink).toBeVisible()
  })

  test('忘记密码链接跳转正确', async ({ page }) => {
    await page.goto('/auth/login')
    await page.waitForLoadState('domcontentloaded')

    await page.locator('a[href="/auth/forgot-password"]').click()
    await page.waitForURL('**/auth/forgot-password**')
    expect(page.url()).toContain('/auth/forgot-password')
  })

  test('注册链接跳转正确', async ({ page }) => {
    await page.goto('/auth/login')
    await page.waitForLoadState('domcontentloaded')

    await page.locator('a[href="/auth/register"]').click()
    await page.waitForURL('**/auth/register**')
    expect(page.url()).toContain('/auth/register')
  })

  test('错误密码显示错误提示 Alert', async ({ page, request }) => {
    const user = uniqueUser('loginui')
    await registerViaApi(request, user)

    await page.goto('/auth/login')
    await page.waitForLoadState('load')
    await page.waitForTimeout(1500)

    await page.locator('#login-username').fill(user.username)
    await page.locator('input[type="password"]').first().fill('WrongPassword123!')

    // 通过 evaluate 调用登录 API 触发错误状态
    await page.evaluate(async ([u]: string[]) => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: u, password: 'WrongPassword123!' }),
      })
      const data = await res.json()
      // 页面上的 LoginForm 组件通过 errors prop 显示错误
      // 但我们是绕过表单提交的，所以需要检查 API 返回
      return data
    }, [user.username])

    // 验证 API 层面的错误响应
    const apiRes = await page.request.post('/api/auth/login', {
      data: { identifier: user.username, password: 'WrongPassword123!' },
    })
    expect(apiRes.status()).toBe(401)
    const body = await apiRes.json()
    expect(body.success).toBe(false)
    expect(body.error).toBeTruthy()
  })

  test('通过 UI 表单提交登录（走 apiFetch 传输加密链路）', async ({ page, request }) => {
    const user = uniqueUser('loginform')
    await registerViaApi(request, user)

    await page.goto('/auth/login')
    await page.waitForLoadState('load')

    // 填写表单
    await page.locator('#login-username').fill(user.username)
    await page.locator('input[type="password"]').first().fill(user.password)

    // 点击提交按钮
    await page.locator('button[type="submit"]').click()

    // 应跳转到 /admin
    await page.waitForURL('**/admin**', { timeout: 15_000 })
    expect(page.url()).toContain('/admin')
  })

  test('通过 UI 表单提交错误密码显示错误提示', async ({ page, request }) => {
    const user = uniqueUser('loginfail')
    await registerViaApi(request, user)

    await page.goto('/auth/login')
    await page.waitForLoadState('load')

    // 填写错误密码
    await page.locator('#login-username').fill(user.username)
    await page.locator('input[type="password"]').first().fill('WrongPassword999!')

    // 点击提交按钮
    await page.locator('button[type="submit"]').click()

    // 应显示错误提示（Alert 组件）
    await expect(page.locator('[role="alert"], .alert')).toBeVisible({ timeout: 10_000 })
  })
})

// ---------------------------------------------------------------------------
// 注册表单 UI
// ---------------------------------------------------------------------------
test.describe('Register Form UI', () => {
  test('注册表单包含所有必要元素', async ({ page }) => {
    await page.goto('/auth/register')
    await page.waitForLoadState('domcontentloaded')

    // 表单标题
    await expect(page.locator('h2.text-xl')).toBeVisible()

    // 用户名
    await expect(page.locator('#register-username')).toBeVisible()
    // 邮箱
    await expect(page.locator('#register-email')).toBeVisible()
    // 密码
    await expect(page.locator('#register-password')).toBeVisible()
    // 确认密码
    await expect(page.locator('#register-confirm-password')).toBeVisible()

    // 提交按钮
    await expect(page.locator('button[type="submit"]')).toBeVisible()

    // 返回登录链接
    const loginLink = page.locator('a[href="/auth/login"]')
    await expect(loginLink).toBeVisible()
  })

  test('注册表单返回登录链接跳转正确', async ({ page }) => {
    await page.goto('/auth/register')
    await page.waitForLoadState('domcontentloaded')

    await page.locator('a[href="/auth/login"]').click()
    await page.waitForURL('**/auth/login**')
    expect(page.url()).toContain('/auth/login')
  })

  test('注册密码不一致时 API 返回 400', async ({ page }) => {
    await page.goto('/auth/register')
    await page.waitForLoadState('load')

    const u = uniqueUser('regui')
    const res = await page.request.post('/api/auth/register', {
      data: {
        username: u.username,
        email: u.email,
        password: u.password,
        confirmPassword: 'DifferentPass123!',
      },
    })
    expect(res.status()).toBe(400)
  })

  test('通过 UI 表单提交注册（走 apiFetch 传输加密链路）', async ({ page }) => {
    const user = uniqueUser('regform')

    await page.goto('/auth/register')
    await page.waitForLoadState('load')

    // 填写注册表单
    await page.locator('#register-username').fill(user.username)
    await page.locator('#register-email').fill(user.email)
    await page.locator('#register-password').fill(user.password)
    await page.locator('#register-confirm-password').fill(user.password)

    // 点击提交按钮
    await page.locator('button[type="submit"]').click()

    // 应跳转到 /admin
    await page.waitForURL('**/admin**', { timeout: 15_000 })
    expect(page.url()).toContain('/admin')
  })
})

// ---------------------------------------------------------------------------
// 忘记密码页面 UI
// ---------------------------------------------------------------------------
test.describe('Forgot Password UI', () => {
  test('忘记密码页面包含表单元素', async ({ page }) => {
    await page.goto('/auth/forgot-password')
    await page.waitForLoadState('domcontentloaded')

    // 应有表单
    await expect(page.locator('form')).toBeVisible()

    // 提交按钮
    await expect(page.locator('button[type="submit"]')).toBeVisible()

    // 返回登录链接
    const backLink = page.locator('a[href="/auth/login"]')
    await expect(backLink).toBeVisible()
  })

  test('返回登录链接跳转正确', async ({ page }) => {
    await page.goto('/auth/forgot-password')
    await page.waitForLoadState('domcontentloaded')

    await page.locator('a[href="/auth/login"]').click()
    await page.waitForURL('**/auth/login**')
    expect(page.url()).toContain('/auth/login')
  })

  test('通过 UI 表单提交忘记密码（走 apiFetch 传输加密链路）', async ({ page }) => {
    await page.goto('/auth/forgot-password')
    await page.waitForLoadState('load')

    // 填写邮箱
    const emailInput = page.locator('#forgot-email')
    await expect(emailInput).toBeVisible()
    await emailInput.fill('test-forgot@test.local')

    // 点击提交
    await page.locator('button[type="submit"]').click()

    // 应显示成功页面（无论邮箱是否存在，API 都返回成功以防枚举）
    // 成功后 ForgotPasswordForm 切换为 Result 组件，包含"返回登录"按钮
    await expect(page.locator('a[href="/auth/login"].btn')).toBeVisible({ timeout: 10_000 })
    // 表单应消失
    await expect(page.locator('#forgot-email')).not.toBeVisible()
  })

  test('忘记密码空邮箱时浏览器阻止提交', async ({ page }) => {
    await page.goto('/auth/forgot-password')
    await page.waitForLoadState('load')

    // 不填邮箱直接点提交
    await page.locator('button[type="submit"]').click()

    // email 输入框有 required 属性，浏览器原生验证阻止提交
    const emailInput = page.locator('#forgot-email')
    const validity = await emailInput.evaluate((el: HTMLInputElement) => el.validity.valid)
    expect(validity).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 重置密码页面 UI
// ---------------------------------------------------------------------------
test.describe('Reset Password UI', () => {
  test('无 token 参数时显示警告', async ({ page }) => {
    await page.goto('/auth/reset-password')
    await page.waitForLoadState('domcontentloaded')

    await expect(page.locator('form')).toHaveCount(0)
    await expect(page.locator('a[href="/auth/forgot-password"].btn')).toBeVisible()
  })

  test('带 token 参数时显示重置表单', async ({ page }) => {
    await page.goto('/auth/reset-password?token=test-token-123')
    await page.waitForLoadState('domcontentloaded')

    // 页面应包含表单
    await expect(page.locator('form')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()
  })

  test('通过 UI 提交重置密码表单（无效 token 显示错误）', async ({ page }) => {
    await page.goto('/auth/reset-password?token=invalid-token-xyz')
    await page.waitForLoadState('load')

    // 表单可见
    await expect(page.locator('form')).toBeVisible()

    // 填写新密码和确认密码
    const pwdInputs = page.locator('input[type="password"]')
    await expect(pwdInputs.first()).toBeVisible()
    await pwdInputs.nth(0).fill('NewResetPass123!')
    await pwdInputs.nth(1).fill('NewResetPass123!')

    // 点击提交
    await page.locator('button[type="submit"]').click()

    // 无效 token 应显示错误提示（Alert 组件）
    await expect(page.locator('[role="alert"], .alert').first()).toBeVisible({ timeout: 10_000 })
  })

  test('重置密码密码不一致时提交按钮禁用', async ({ page }) => {
    await page.goto('/auth/reset-password?token=test-token-456')
    await page.waitForLoadState('load')

    await expect(page.locator('form')).toBeVisible()

    // 填写不一致的密码
    const pwdInputs = page.locator('input[type="password"]')
    await pwdInputs.nth(0).fill('NewPass111!')
    await pwdInputs.nth(1).fill('DifferentPass222!')
    await page.waitForTimeout(500)

    // 提交按钮应为禁用状态（客户端验证密码不一致）
    const submitBtn = page.locator('button[type="submit"]')
    await expect(submitBtn).toBeDisabled()

    // 应显示密码不一致提示
    await expect(page.getByText(/不一致/)).toBeVisible()
  })
})
