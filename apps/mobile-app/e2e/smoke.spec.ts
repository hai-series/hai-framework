import { expect, test } from '@playwright/test'

test.describe('mobile-app smoke', () => {
  test('未登录访问首页会进入移动端登录页', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('h1')).toContainText(/登录|Login/)
  })
})
