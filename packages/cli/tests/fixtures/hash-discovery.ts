import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { expect, test } from '@playwright/test'

// 门禁复制此文件时替换应用类型；生产路由器不接收测试参数。
const appType: string = 'SCAFFOLD_HASH_APP_TYPE'

test('new page is discovered without changing routes and survives refresh and history', async ({ page }) => {
  test.setTimeout(90_000)
  const mobile = appType === 'mobile-app'
  if (mobile)
    await page.setViewportSize({ width: 390, height: 844 })
  const username = mobile ? `hash${Date.now()}` : 'admin'
  const password = mobile ? 'ScaffoldHash123!' : process.env.E2E_ADMIN_PASSWORD || 'Scaffold-test-Admin123!'
  await page.goto('/#/auto-discovered?source=probe')
  await expect(page.locator('#login-username')).toBeVisible()
  if (mobile) {
    await page.getByRole('button', { name: /立即注册|Register now/i }).click()
    await page.locator('input[name="username"]').fill(username)
    await page.locator('input[name="email"]').fill(`${username}@example.com`)
    await page.locator('input[type="password"]').nth(0).fill(password)
    await page.locator('input[type="password"]').nth(1).fill(password)
  }
  else {
    await page.locator('#login-username').fill(username)
    await page.locator('input[type="password"]').fill(password)
  }
  await page.locator('button[type="submit"]').click()
  if (!mobile) {
    await expect(page.getByTestId('logout')).toBeVisible()
    if (await page.getByTestId('guide-later').isVisible())
      await page.getByTestId('guide-later').click()
  }
  await expect(page.getByTestId('route-probe')).toBeVisible()
  await expect(page).toHaveURL(/#\/auto-discovered\?source=probe$/)
  await expect(page.locator('header')).toBeVisible()
  await expect(page.locator('footer')).toBeVisible()
  await page.evaluate((target) => {
    location.hash = target
  }, mobile ? '/home' : '/settings')
  await expect(page.getByTestId('route-probe')).toHaveCount(0)
  await page.goBack()
  await expect(page.getByTestId('route-probe')).toBeVisible()
  await page.reload()
  await expect(page.locator('[data-testid="route-probe"], #login-username')).toBeVisible()
  if (await page.locator('#login-username').isVisible()) {
    await page.locator('#login-username').fill(username)
    await page.locator('input[type="password"]').fill(password)
    await page.locator('button[type="submit"]').click()
  }
  await expect(page.getByTestId('route-probe')).toBeVisible()
  await expect(page).toHaveURL(/#\/auto-discovered\?source=probe$/)
  const evidence = process.env.HAI_AUTH_EVIDENCE_DIR || path.resolve('test-results/hash-discovery')
  await mkdir(evidence, { recursive: true })
  await page.screenshot({ path: path.join(evidence, `${appType}-hash-discovery.png`), fullPage: true, animations: 'disabled' })
})
