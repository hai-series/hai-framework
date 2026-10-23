import { expect, test } from '@playwright/test'
import { registerAndLogin } from './helpers'

test('匿名访问后台进入登录页', async ({ page }) => {
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/auth\/login/)
  await expect(page.locator('#login-username')).toBeVisible()
})

test('根路径进入仪表盘，统计、快速入口和审计导航可用', async ({ page, request }) => {
  await registerAndLogin(page, request, 'dashboard')
  await page.goto('/')
  await expect(page).toHaveURL(/\/admin\/?$/)
  await expect(page.locator('h1')).toBeVisible()
  const values = page.locator('.grid.gap-3.grid-cols-2 .text-2xl.font-bold')
  await expect(values).toHaveCount(4)
  await expect(values).toHaveText([/\d+/, /\d+/, /\d+/, /\d+/])
  await expect(page.getByRole('link', { name: '查看全部' })).toHaveAttribute('href', '/admin/logs')
  for (const target of ['users', 'roles', 'permissions'])
    await expect(page.locator(`main a[href="/admin/iam/${target}"]`)).toBeVisible()
  await page.locator('main a[href="/admin/iam/users"]').click()
  await expect(page).toHaveURL(/\/admin\/iam\/users/)
  await expect(page.locator('table')).toBeVisible()
})
