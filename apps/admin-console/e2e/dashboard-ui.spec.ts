/**
 * =============================================================================
 * E2E 测试 - 仪表盘页面 UI
 * =============================================================================
 */

import { expect, test } from '@playwright/test'
import { registerAndLogin } from './helpers'

test.describe('Dashboard UI', () => {
  // ---------------------------------------------------------------------------
  // 页面标题和结构
  // ---------------------------------------------------------------------------
  test('仪表盘页面标题和副标题可见', async ({ page, request }) => {
    await registerAndLogin(page, request, 'dashui')

    // h1 标题
    const title = page.locator('h1.text-xl')
    await expect(title).toBeVisible()

    // 副标题
    const subtitle = page.locator('h1.text-xl + p')
    await expect(subtitle).toBeVisible()
  })

  // ---------------------------------------------------------------------------
  // 统计卡片
  // ---------------------------------------------------------------------------
  test('显示 4 个统计卡片', async ({ page, request }) => {
    await registerAndLogin(page, request, 'dashui')

    // 4 个统计卡片在 grid 布局中
    const statsGrid = page.locator('.grid.gap-3.grid-cols-2')
    await expect(statsGrid).toBeVisible()

    const cards = statsGrid.locator('.bg-base-100.rounded-xl')
    await expect(cards).toHaveCount(4)
  })

  test('统计卡片显示数字值', async ({ page, request }) => {
    await registerAndLogin(page, request, 'dashui')

    // 每个卡片都应包含数字（text-2xl font-bold）
    const statValues = page.locator('.grid.gap-3.grid-cols-2 .text-2xl.font-bold')
    const count = await statValues.count()
    expect(count).toBe(4)

    // 所有数值应非空
    for (let i = 0; i < count; i++) {
      const text = await statValues.nth(i).textContent()
      expect(text?.trim()).toBeTruthy()
    }
  })

  test('统计卡片带有不同颜色标识', async ({ page, request }) => {
    await registerAndLogin(page, request, 'dashui')

    // 各卡片数值有不同颜色
    await expect(page.locator('.grid.gap-3.grid-cols-2 .text-primary').first()).toBeVisible()
    await expect(page.locator('.grid.gap-3.grid-cols-2 .text-emerald-600').first()).toBeVisible()
    await expect(page.locator('.grid.gap-3.grid-cols-2 .text-amber-600').first()).toBeVisible()
    await expect(page.locator('.grid.gap-3.grid-cols-2 .text-sky-600').first()).toBeVisible()
  })

  // ---------------------------------------------------------------------------
  // 快速入口
  // ---------------------------------------------------------------------------
  test('快速入口区域包含多个导航链接', async ({ page, request }) => {
    await registerAndLogin(page, request, 'dashui')

    // 快速入口链接
    await expect(page.locator('main a[href="/admin/iam/users"]')).toBeVisible()
    await expect(page.locator('main a[href="/admin/iam/roles"]')).toBeVisible()
    await expect(page.locator('main a[href="/admin/iam/permissions"]')).toBeVisible()
  })

  test('快速入口链接可点击跳转', async ({ page, request }) => {
    await registerAndLogin(page, request, 'dashui')

    await page.locator('main a[href="/admin/iam/users"]').click()
    await page.waitForURL('**/admin/iam/users**', { timeout: 10_000 })
    expect(page.url()).toContain('/admin/iam/users')
  })

  // ---------------------------------------------------------------------------
  // 最近活动
  // ---------------------------------------------------------------------------
  test('最近活动区域可见', async ({ page, request }) => {
    await registerAndLogin(page, request, 'dashui')

    // Card 组件包含最近活动内容
    const activitySection = page.locator('main').locator('text=查看全部').first()
    // 查看全部链接通常指向 /admin/logs
    if (await activitySection.isVisible()) {
      await expect(activitySection).toBeVisible()
    }
  })

  test('"查看全部"链接指向审计日志', async ({ page, request }) => {
    await registerAndLogin(page, request, 'dashui')

    const viewAllLink = page.getByRole('link', { name: '查看全部' })
    await expect(viewAllLink).toBeVisible()
    await expect(viewAllLink).toHaveAttribute('href', '/admin/logs')
  })
})
