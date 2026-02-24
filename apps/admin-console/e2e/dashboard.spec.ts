/**
 * =============================================================================
 * E2E 测试 - Admin 仪表盘
 * =============================================================================
 */

import { expect, test } from '@playwright/test'
import { registerAndLogin } from './helpers'

// ---------------------------------------------------------------------------
test.describe('Admin Dashboard', () => {
  test('未登录访问 /admin 重定向到登录页', async ({ page }) => {
    await page.goto('/admin')
    await page.waitForURL('**/auth/login**', { timeout: 10_000 })
    expect(page.url()).toContain('/auth/login')
  })

  test('根路径 / 重定向到 /admin', async ({ page, request }) => {
    await registerAndLogin(page, request, 'dash')
    await page.goto('/')
    await page.waitForURL('**/admin**', { timeout: 10_000 })
    expect(page.url()).toContain('/admin')
  })

  test('仪表盘显示统计卡片', async ({ page, request }) => {
    await registerAndLogin(page, request, 'dash')

    // 仪表盘应包含统计数据（数字）
    await expect(page.locator('.stat-value, .text-3xl, .text-4xl').first()).toBeVisible({ timeout: 5000 })
  })

  test('侧边栏导航可见', async ({ page, request }) => {
    await registerAndLogin(page, request, 'dash')

    // 侧边栏应该有导航链接
    const sidebar = page.locator('aside, nav, [class*="sidebar"]').first()
    await expect(sidebar).toBeVisible({ timeout: 5000 })
  })
})
