/**
 * =============================================================================
 * E2E 测试 - 页面导航与设置
 * =============================================================================
 */

import { expect, test } from '@playwright/test'
import { registerAndLogin } from './helpers'

// ---------------------------------------------------------------------------
// 页面导航
// ---------------------------------------------------------------------------
test.describe('Page Navigation', () => {
  test('设置页面可访问', async ({ page, request }) => {
    await registerAndLogin(page, request, 'nav')
    await page.goto('/admin/settings')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('body')).toBeVisible()
  })

  test('模块展示页面可访问', async ({ page, request }) => {
    await registerAndLogin(page, request, 'nav')
    await page.goto('/admin/modules')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('body')).toBeVisible()
  })

  test('模块展示页支持 AI / VecDB / DataPipe 示例切换', async ({ page, request }) => {
    await registerAndLogin(page, request, 'nav')
    await page.goto('/admin/modules')
    await page.waitForLoadState('domcontentloaded')

    const tabs = page.locator('[role="tab"]')
    await expect(tabs).toHaveCount(8)

    const aiTab = page.getByRole('tab', { name: /ai/i })
    const vecdbTab = page.getByRole('tab', { name: /vecdb/i })
    const datapipeTab = page.getByRole('tab', { name: /datapipe/i })

    // AI
    await aiTab.click()
    await expect(page.locator('h3:visible').filter({ hasText: /@h-ai\/ai/ }).first()).toBeVisible()

    // VecDB
    await vecdbTab.click()
    await expect(page.locator('h3:visible').filter({ hasText: /@h-ai\/vecdb/ }).first()).toBeVisible()

    // DataPipe
    await datapipeTab.click()
    await expect(page.locator('h3:visible').filter({ hasText: /@h-ai\/datapipe/ }).first()).toBeVisible()
  })

  test('UI Gallery 页面可访问', async ({ page, request }) => {
    await registerAndLogin(page, request, 'nav')
    await page.goto('/admin/ui-gallery')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('body')).toBeVisible()
  })

  test('个人资料页面可访问', async ({ page, request }) => {
    await registerAndLogin(page, request, 'nav')
    await page.goto('/admin/profile')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('h1')).toContainText(/个人资料|Profile/)
  })

  test('/admin/iam 重定向到 /admin/iam/users', async ({ page, request }) => {
    await registerAndLogin(page, request, 'nav')
    await page.goto('/admin/iam')
    await page.waitForURL('**/admin/iam/users**', { timeout: 10_000 })
    expect(page.url()).toContain('/admin/iam/users')
  })
})
