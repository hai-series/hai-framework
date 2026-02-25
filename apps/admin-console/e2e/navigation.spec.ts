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
