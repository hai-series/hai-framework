import { expect, test } from '@playwright/test'

test.describe('mobile-app smoke', () => {
  test('日语切换同步页面与组件并保持当前会话', async ({ page }) => {
    test.setTimeout(60_000)
    await page.goto('/auth/login')
    await expect(page.locator('#login-username')).toBeVisible({ timeout: 20_000 })
    await page.getByRole('link', { name: /立即注册|Register now/i }).click()
    await page.locator('input[name="username"]').fill(`ja${Date.now()}`)
    await page.locator('input[type="email"]').fill(`ja${Date.now()}@example.com`)
    await page.locator('input[type="password"]').nth(0).fill('NativePassword123')
    await page.locator('input[type="password"]').nth(1).fill('NativePassword123')
    await page.locator('button[type="submit"]').click()
    await expect(page).not.toHaveURL(/register/)
    await page.getByRole('button', { name: /我的|Profile/, exact: true }).click()
    await page.getByRole('button', { name: /切换语言|Switch language/ }).click()
    await page.getByRole('button', { name: /日本語/ }).click()
    await expect(page.locator('html')).toHaveAttribute('lang', 'ja-JP')
    await expect(page.getByText('モバイル画面の言語を変更')).toBeVisible()
    await expect(page.getByRole('button', { name: 'プロフィール', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '言語を切り替え' })).toContainText('日本語')
    await expect(page).toHaveURL(/profile/)
  })

  test('未登录访问首页会进入移动端登录页', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('h1')).toContainText(/登录|Login/)
  })
})
