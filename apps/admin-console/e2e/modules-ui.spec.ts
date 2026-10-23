import { expect, test } from '@playwright/test'
import { registerAndLogin, waitForHydration } from './helpers'

test('八个模块示例可切换，AI 示例包含实际文生图入口', async ({ page, request }) => {
  await registerAndLogin(page, request, 'modules')
  await page.goto('/admin/modules')
  await waitForHydration(page)
  await expect(page.getByRole('tab')).toHaveCount(8)
  for (const [tab, module] of [['core', 'core'], ['db', 'reldb'], ['cache', 'cache'], ['storage', 'storage'], ['ai', 'ai'], ['vecdb', 'vecdb'], ['datapipe', 'datapipe'], ['crypto', 'crypto']]) {
    await page.getByRole('tab', { name: new RegExp(`^${tab}(?: |$)`, 'i') }).click()
    await expect(page.locator('h3:visible').filter({ hasText: `@h-ai/${module}` }).first()).toBeVisible()
    if (tab === 'ai') {
      await expect(page.locator('code').filter({ hasText: 'ai.image.generate' }).first()).toBeVisible()
      await expect(page.getByText(/Seedream/i).first()).toBeVisible()
    }
  }
})
