import { expect, test } from '@playwright/test'
import { dutyAccounts, loginOnPage, registerAndLogin } from './helpers'

test('侧栏导航、别名重定向和环境标记反映真实页面', async ({ page, request }) => {
  await registerAndLogin(page, request, 'layout')
  const sidebar = page.locator('aside').first()
  await expect(sidebar.locator('a[href="/admin"]').first()).toHaveClass(/bg-primary/)
  await expect(page.getByTestId('app-environment-badge')).toHaveCount(0)
  for (const [target, destination] of [
    ['/admin/iam/users', '/admin/iam/users'],
    ['/admin/iam/roles', '/admin/iam/roles'],
    ['/admin/iam/permissions', '/admin/iam/permissions'],
    ['/admin/modules', '/admin/modules'],
    ['/admin/ui-gallery', '/admin/ui-gallery/primitives'],
  ]) {
    await sidebar.locator(`a[href="${target}"]`).click()
    await expect(page).toHaveURL(new RegExp(`${destination}$`))
    await expect(page.locator('h1').first()).toBeVisible()
  }
  for (const alias of ['/admin/iam', '/admin/users']) {
    await page.goto(alias)
    await expect(page).toHaveURL(/\/admin\/iam\/users/)
    await expect(page.locator('table')).toBeVisible()
  }
  await expect(sidebar.locator('a[href="/admin/settings"]')).toHaveCount(0)
  await page.request.post('/api/auth/logout')
  await loginOnPage(page, dutyAccounts.config.username, dutyAccounts.config.password)
  await page.locator('aside a[href="/admin/settings"]').first().click()
  await expect(page).toHaveURL(/\/admin\/settings$/)
  await expect(page.locator('h1').first()).toBeVisible()
})

test('用户菜单可进入资料页并登出，原会话随后不能访问后台', async ({ page, request }) => {
  const user = await registerAndLogin(page, request, 'menu')
  const menu = page.locator('.user-menu-container')
  await expect(menu.getByText(user.username, { exact: true })).toBeVisible()
  await menu.locator(':scope > button').click()
  await expect(menu.getByText(`@${user.username}`)).toBeVisible()
  await expect(menu.locator('a[href="/admin/settings"]')).toHaveCount(0)
  await menu.locator('a[href="/admin/profile"]').click()
  await expect(page.locator('[data-testid="profile-username"]')).toHaveText(user.username)
  await menu.locator(':scope > button').click()
  await menu.locator('[class*="text-error"]').click()
  await expect(page).toHaveURL(/\/auth\/login/)
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/auth\/login/)
})
