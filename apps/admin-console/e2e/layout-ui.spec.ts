/**
 * =============================================================================
 * E2E 测试 - Admin 布局 UI（侧边栏、顶栏、用户菜单、页脚）
 * =============================================================================
 */

import { expect, test } from '@playwright/test'
import { registerAndLogin } from './helpers'

// ---------------------------------------------------------------------------
// 侧边栏
// ---------------------------------------------------------------------------
test.describe('Sidebar', () => {
  test('侧边栏包含所有导航菜单项', async ({ page, request }) => {
    await registerAndLogin(page, request, 'layout')

    const sidebar = page.locator('aside').first()
    await expect(sidebar).toBeVisible()

    // 主菜单项
    await expect(sidebar.locator('a[href="/admin"]').first()).toBeVisible()
    await expect(sidebar.locator('a[href="/admin/ui-gallery"]')).toBeVisible()
    await expect(sidebar.locator('a[href="/admin/modules"]')).toBeVisible()
    await expect(sidebar.locator('a[href="/admin/settings"]')).toBeVisible()
    // IAM 子菜单 - 默认展开
    await expect(sidebar.locator('a[href="/admin/iam/users"]')).toBeVisible()
    await expect(sidebar.locator('a[href="/admin/iam/roles"]')).toBeVisible()
    await expect(sidebar.locator('a[href="/admin/iam/permissions"]')).toBeVisible()
  })

  test('侧边栏导航 - 点击用户管理跳转', async ({ page, request }) => {
    await registerAndLogin(page, request, 'layout')

    await page.locator('aside a[href="/admin/iam/users"]').click()
    await page.waitForURL('**/admin/iam/users**', { timeout: 10_000 })
    expect(page.url()).toContain('/admin/iam/users')
  })

  test('侧边栏导航 - 点击角色管理跳转', async ({ page, request }) => {
    await registerAndLogin(page, request, 'layout')

    await page.locator('aside a[href="/admin/iam/roles"]').click()
    await page.waitForURL('**/admin/iam/roles**', { timeout: 10_000 })
    expect(page.url()).toContain('/admin/iam/roles')
  })

  test('侧边栏导航 - 点击系统设置跳转', async ({ page, request }) => {
    await registerAndLogin(page, request, 'layout')

    await page.locator('aside a[href="/admin/settings"]').click()
    await page.waitForURL('**/admin/settings**', { timeout: 10_000 })
    expect(page.url()).toContain('/admin/settings')
  })

  test('侧边栏 Logo 区域显示应用名', async ({ page, request }) => {
    await registerAndLogin(page, request, 'layout')

    // Logo 区域在 aside 内
    const logoArea = page.locator('aside .h-16').first()
    await expect(logoArea).toBeVisible()
  })

  test('当前页面的菜单项高亮（active 样式）', async ({ page, request }) => {
    await registerAndLogin(page, request, 'layout')
    // 仪表盘页面 — 仪表盘菜单应高亮
    const dashLink = page.locator('aside a[href="/admin"]').first()
    await expect(dashLink).toHaveClass(/bg-primary/)
  })
})

// ---------------------------------------------------------------------------
// 顶栏 Header
// ---------------------------------------------------------------------------
test.describe('Header', () => {
  test('顶栏显示用户名', async ({ page, request }) => {
    const user = await registerAndLogin(page, request, 'header')

    const header = page.locator('header').first()
    await expect(header).toBeVisible()

    // 用户名应显示在顶栏
    await expect(header.locator(`text=${user.username}`)).toBeVisible()
  })

  test('顶栏显示开发环境徽章', async ({ page, request }) => {
    await registerAndLogin(page, request, 'header')

    // 开发环境徽章
    const devBadge = page.locator('header .bg-amber-100')
    await expect(devBadge).toBeVisible()
  })

  test('顶栏面包屑导航可见', async ({ page, request }) => {
    await registerAndLogin(page, request, 'header')

    // 面包屑中应有仪表盘链接
    const breadcrumb = page.locator('header nav').first()
    await expect(breadcrumb).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// 用户下拉菜单
// ---------------------------------------------------------------------------
test.describe('User Menu', () => {
  test('点击用户头像打开下拉菜单', async ({ page, request }) => {
    await registerAndLogin(page, request, 'usermenu')

    // 点击用户菜单按钮（包含 Avatar 的按钮）
    const userBtn = page.locator('.user-menu-container button').first()
    await userBtn.click()

    // 下拉菜单应出现
    const dropdown = page.locator('.user-menu-container .absolute')
    await expect(dropdown).toBeVisible()
  })

  test('下拉菜单包含个人资料和设置链接', async ({ page, request }) => {
    await registerAndLogin(page, request, 'usermenu')

    // 打开菜单
    await page.locator('.user-menu-container button').first().click()

    // 个人资料链接
    await expect(page.locator('a[href="/admin/profile"]')).toBeVisible()
    // 设置链接
    await expect(page.locator('.user-menu-container a[href="/admin/settings"]')).toBeVisible()
  })

  test('下拉菜单包含退出按钮', async ({ page, request }) => {
    await registerAndLogin(page, request, 'usermenu')

    await page.locator('.user-menu-container button').first().click()

    // 退出按钮（text-error 样式）
    const logoutBtn = page.locator('.user-menu-container .text-error')
    await expect(logoutBtn).toBeVisible()
  })

  test('点击退出按钮跳转到登录页', async ({ page, request }) => {
    await registerAndLogin(page, request, 'usermenu')

    // 打开菜单
    await page.locator('.user-menu-container button').first().click()
    await page.waitForTimeout(300)

    // 点击退出
    const logoutBtn = page.locator('.user-menu-container .text-error')
    await logoutBtn.click()

    // 应跳转到登录页
    await page.waitForURL('**/auth/login**', { timeout: 10_000 })
    expect(page.url()).toContain('/auth/login')
  })

  test('用户下拉菜单显示角色信息', async ({ page, request }) => {
    await registerAndLogin(page, request, 'usermenu')

    await page.locator('.user-menu-container button').first().click()

    // 下拉菜单中应该有用户信息区域
    const dropdown = page.locator('.user-menu-container .absolute')
    await expect(dropdown).toBeVisible()

    // 显示用户名
    const usernameText = dropdown.locator('text=usermenu_')
    await expect(usernameText.first()).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// 页脚
// ---------------------------------------------------------------------------
test.describe('Footer', () => {
  test('页脚显示应用名和版本', async ({ page, request }) => {
    await registerAndLogin(page, request, 'footer')

    const footer = page.locator('footer').first()
    await expect(footer).toBeVisible()

    // 应包含版本号文本
    await expect(footer).toContainText('v')
  })
})
