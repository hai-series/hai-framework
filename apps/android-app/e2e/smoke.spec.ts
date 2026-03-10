import { expect, test } from '@playwright/test'

test.describe('Android App Smoke', () => {
  test('首页可访问并显示应用标题', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('h1')).toContainText('hai Android App')
  })
})
