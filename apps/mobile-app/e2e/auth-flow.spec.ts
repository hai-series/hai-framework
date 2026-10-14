/** 移动/桌面浏览器共用真实 API service、加密客户端与通知 HTTP 收件箱。 */
import type { Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { expect, test } from '@playwright/test'

const evidence = process.env.HAI_AUTH_EVIDENCE_DIR || path.resolve('test-results/auth-screenshots')
async function screenshot(page: Page, name: string) {
  await mkdir(evidence, { recursive: true })
  await page.screenshot({ path: path.join(evidence, `${name}.png`), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}
async function notification(page: Page, email: string, template: string) {
  const response = await page.request.get(`http://127.0.0.1:12580/messages?to=${encodeURIComponent(email)}`)
  const messages = await response.json() as { template: string, vars: Record<string, string> }[]
  return messages.findLast(message => message.template === template)?.vars
}
for (const platform of ['mobile', 'desktop'] as const) {
  test(`${platform} 注册、邮件验证码登录、密码重置与布局`, async ({ page, baseURL }) => {
    test.setTimeout(90_000)
    const url = platform === 'mobile' ? `${baseURL}/auth/login` : 'http://127.0.0.1:12582/#/login'
    if (platform === 'desktop')
      await page.setViewportSize({ width: 1280, height: 800 })
    const suffix = Date.now()
    const username = `${platform}${suffix}`
    const email = `${username}@example.com`
    await page.goto(url)
    await expect(page.locator('#login-username')).toBeVisible()
    await screenshot(page, `${platform}-login`)
    await page.getByRole('link', { name: /立即注册|Register now/i }).click()
    await expect(page.locator('input[name="username"]')).toBeVisible()
    await screenshot(page, `${platform}-register`)
    // Markdown 来自 API 配置，优先于 URL；关闭弹窗后继续完成同一注册流程。
    await page.getByRole('button', { name: /用户协议|User Agreement/i, exact: true }).click()
    await expect(page.getByRole('dialog').getByRole('heading', { name: '移动与桌面配置协议' })).toBeVisible()
    await expect(page.locator('iframe')).toHaveCount(0)
    await screenshot(page, `${platform}-agreement`)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).not.toBeVisible()
    await page.getByRole('button', { name: /隐私政策|Privacy Policy/i, exact: true }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.locator('iframe')).toHaveAttribute('src', 'http://127.0.0.1:12580/privacy')
    await screenshot(page, `${platform}-privacy`)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).not.toBeVisible()
    await page.locator('input[name="username"]').fill(username)
    await page.locator('input[name="email"]').fill(email)
    await page.locator('input[type="password"]').nth(0).fill('NativePassword123')
    await page.locator('input[type="password"]').nth(1).fill('NativePassword123')
    await page.locator('button[type="submit"]').click()
    await expect(page).not.toHaveURL(/register/)
    // Web 预览采用内存 TokenStore；刷新后重新走认证入口。
    await page.reload()
    await page.goto(url)
    await expect(page.locator('#login-username')).toBeVisible()
    await page.getByRole('button', { name: /邮件验证码|Email code/i, exact: true }).click()
    await screenshot(page, `${platform}-email-code`)
    await page.locator('#login-username').fill(email)
    await page.getByRole('button', { name: /发送验证码|Send code/i, exact: true }).click()
    await expect(page.getByRole('button', { name: /秒后重发|Resend in/ })).toBeDisabled()
    const sent = await notification(page, email, 'otp_email')
    expect(Boolean(sent?.code)).toBe(true)
    await page.locator('#login-code').fill(sent?.code ?? '')
    await page.locator('button[type="submit"]').click()
    await expect(page).not.toHaveURL(/login/)
    await page.reload()
    await page.goto(url)
    await expect(page.locator('#login-username')).toBeVisible()
    await page.getByRole('button', { name: /忘记密码|Forgot password/i }).click()
    await screenshot(page, `${platform}-forgot`)
    await page.locator('input[type="email"]').fill(email)
    await page.locator('button[type="submit"]').click()
    await expect(page.locator('.alert-success')).toBeVisible()
    const reset = await notification(page, email, 'password_reset')
    expect(Boolean(reset?.token)).toBe(true)
    await page.getByRole('button', { name: /已有重置令牌|I have a reset token/i }).click()
    await screenshot(page, `${platform}-reset`)
    await page.locator('#reset-code').fill(reset?.token ?? '')
    await page.locator('input[type="password"]').nth(0).fill('NewNativePassword456')
    await page.locator('input[type="password"]').nth(1).fill('NewNativePassword456')
    await page.locator('button[type="submit"]').click()
    await expect(page.locator('.alert-success')).toBeVisible()
    await page.getByRole('link', { name: /^(登录|Sign in|Login)$/i }).click()
    await page.locator('#login-username').fill(username)
    await page.locator('input[type="password"]').fill('NewNativePassword456')
    await page.locator('button[type="submit"]').click()
    await expect(page).not.toHaveURL(/login/)
  })
}
