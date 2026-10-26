import { expect, test } from '@playwright/test'
import { dutyAccounts, loginOnPage, waitForHydration } from './helpers'

test.describe('Settings UI', () => {
  test('主题选择、刷新持久化和关于分区可连续操作', async ({ page }) => {
    await loginOnPage(page, dutyAccounts.config.username, dutyAccounts.config.password)
    await page.goto('/admin/settings')
    await waitForHydration(page)
    await page.getByRole('button', { name: '外观', exact: true }).click()
    await page.getByRole('button', { name: '选择主题', exact: true }).last().click()
    await page.getByRole('button', { name: 'Dark', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.reload()
    await waitForHydration(page)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.getByRole('button', { name: /关于|About/, exact: true }).click()
    await expect(page.locator('main dl dd').first()).toHaveText('hai 管理控制台')
  })

  test('日语切换后页面和组件文案同步并在刷新后保留', async ({ page }) => {
    await loginOnPage(page, dutyAccounts.config.username, dutyAccounts.config.password)
    await page.goto('/admin/settings')
    await waitForHydration(page)
    await page.getByRole('button', { name: /区域|Region/ }).click()
    await page.getByRole('button', { name: /切换语言|Switch language/ }).last().click()
    await page.getByRole('button', { name: /日本語/ }).click()
    await expect(page.locator('html')).toHaveAttribute('lang', 'ja-JP')
    await expect(page.locator('h1')).toHaveText('システム設定')
    await expect(page.getByRole('button', { name: '外観', exact: true })).toBeVisible()
    await page.reload()
    await waitForHydration(page)
    await expect(page.locator('html')).toHaveAttribute('lang', 'ja-JP')
    await expect(page.locator('h1')).toHaveText('システム設定')
    await page.getByRole('button', { name: '地域', exact: true }).click()
    await expect(page.getByRole('button', { name: '言語を切り替え' }).last()).toContainText('日本語')
  })
})
