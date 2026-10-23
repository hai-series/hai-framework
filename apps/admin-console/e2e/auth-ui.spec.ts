import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { registerViaApi, uniqueUser, waitForHydration } from './helpers'

async function gotoHydrated(page: Page, url: string): Promise<void> {
  await page.goto(url)
  await waitForHydration(page)
}

test.describe('Login Form UI', () => {
  test('通过 UI 表单提交错误密码显示错误提示', async ({ page, request }) => {
    const user = uniqueUser('loginfail')
    await registerViaApi(request, user)

    await gotoHydrated(page, '/auth/login')
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

test.describe('Forgot Password UI', () => {
  test('忘记密码空邮箱时浏览器阻止提交', async ({ page }) => {
    await gotoHydrated(page, '/auth/forgot-password')
    await page.waitForLoadState('load')

    // 不填邮箱直接点提交
    await page.locator('button[type="submit"]').click()

    // email 输入框有 required 属性，浏览器原生验证阻止提交
    const emailInput = page.locator('#forgot-email')
    const validity = await emailInput.evaluate((el: HTMLInputElement) => el.validity.valid)
    expect(validity).toBe(false)
  })
})

test.describe('Reset Password UI', () => {
  test('通过 UI 提交重置密码表单（无效 token 显示错误）', async ({ page }) => {
    await gotoHydrated(page, '/auth/reset-password?token=invalid-token-xyz')
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
    await gotoHydrated(page, '/auth/reset-password?token=test-token-456')
    await page.waitForLoadState('load')

    await expect(page.locator('form')).toBeVisible()

    // 填写不一致的密码
    const pwdInputs = page.locator('input[type="password"]')
    await pwdInputs.nth(0).fill('NewPass111!')
    await pwdInputs.nth(1).fill('DifferentPass222!')

    // 提交按钮应为禁用状态（客户端验证密码不一致）
    const submitBtn = page.locator('button[type="submit"]')
    await expect(submitBtn).toBeDisabled()

    // 应显示密码不一致提示
    await expect(page.getByText(/不一致/)).toBeVisible()
  })
})
