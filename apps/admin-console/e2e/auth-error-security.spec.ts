/** 真实加密认证、改密及安全错误提示的宽窄屏截图验收。 */
import type { Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { expect, test } from '@playwright/test'
import { dutyAccounts, waitForHydration } from './helpers'

async function capture(page: Page, name: string) {
  const directory = process.env.HAI_AUTH_EVIDENCE_DIR || path.resolve('test-results/auth-errors')
  await mkdir(directory, { recursive: true })
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: path.join(directory, `${name}.png`), fullPage: true, animations: 'disabled' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}

async function dismissToasts(page: Page) {
  const dismiss = page.locator('.hai-toast-layer').getByRole('button', { name: '关闭', exact: true })
  for (let count = 0; count < 10 && await dismiss.count(); count++)
    await dismiss.click()
}

async function submitLogin(page: Page, username: string, password: string) {
  await dismissToasts(page)
  await page.locator('#login-username').fill(username)
  await page.locator('form.login-form input[type=password]').fill(password)
  const response = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/login')
  await page.locator('form.login-form button[type=submit]').click()
  await response
}

test('登录、首次改密和个人改密共用友好安全提示，完成改密后重新登录', async ({ page }) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.goto('/auth/reset-password?token=invalid-test-link')
  await waitForHydration(page)
  const reset = page.locator('form.reset-password-form')
  await reset.locator('input[type=password]').nth(0).fill('Recovery-example123!')
  await reset.locator('input[type=password]').nth(1).fill('Recovery-example123!')
  await reset.locator('button[type=submit]').click()
  await expect(page.locator('.hai-toast-item[data-variant=error]')).toContainText(/无效或已过期/)
  await expect(page.locator('.hai-toast-item[data-variant=error]')).not.toContainText('traceId:')
  await expect(page.getByRole('button', { name: '查看排查信息', exact: true })).toBeVisible()
  await capture(page, 'admin-reset-invalid-link-1440')
  await page.goto('/auth/login')
  await waitForHydration(page)
  const initial = dutyAccounts.config.password
  for (const username of ['missing-config-admin', dutyAccounts.config.username]) {
    await submitLogin(page, username, 'Incorrect-example123!')
    const error = page.locator('.hai-toast-item[data-variant=error]')
    await expect(error).toContainText('用户名或密码不正确')
    await expect(error).not.toContainText('traceId:')
    await expect(error.getByRole('button', { name: '查看排查信息', exact: true })).toBeVisible()
    await expect(error).not.toContainText(/用户不存在|原密码错误|账户未设置密码/)
  }
  await capture(page, 'admin-login-credentials-1440')
  await submitLogin(page, dutyAccounts.config.username, initial)
  const renew = page.locator('form.change-password-form')
  await expect(renew).toBeVisible()
  await expect(page.locator('.hai-toast-item[data-variant=error]')).toContainText('修改初始密码')
  await dismissToasts(page)
  await renew.locator('#old-password').fill(initial)
  await renew.locator('#new-password').fill(initial)
  await renew.locator('#confirm-password').fill(initial)
  await renew.locator('button[type=submit]').click()
  await expect(page.locator('.hai-toast-item[data-variant=error]')).toContainText('新密码不能与当前密码相同')
  await expect(page.locator('.hai-toast-item[data-variant=error]')).not.toContainText('traceId:')
  await expect(page.getByRole('button', { name: '查看排查信息', exact: true })).toBeVisible()
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 960 })
    await capture(page, `admin-initial-password-same-${width}`)
  }
  await expect(renew.locator('.alert-error')).toHaveCount(0)
  await dismissToasts(page)
  const chosen = `${initial}-Chosen!`
  await renew.locator('#new-password').fill(chosen)
  await renew.locator('#confirm-password').fill(chosen)
  await renew.locator('button[type=submit]').click()
  await expect(page.locator('form.login-form')).toBeVisible()
  await submitLogin(page, dutyAccounts.config.username, chosen)
  await expect(page).toHaveURL(/\/admin/)
  if (await page.getByTestId('guide-later').isVisible())
    await page.getByTestId('guide-later').click()
  await page.goto('/admin/profile')
  await waitForHydration(page)
  const form = page.locator('[data-testid=profile-password-card] form')
  await expect(form).toBeVisible()
  let changes = 0
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/auth/profile/password')
      changes++
  })
  await form.locator('#old-password').fill(chosen)
  await form.locator('#new-password').fill(chosen)
  await form.locator('#confirm-password').fill(chosen)
  await form.locator('button[type=submit]').click()
  await expect(page.locator('.hai-toast-item[data-variant=error]')).toContainText('新密码不能与当前密码相同')
  await dismissToasts(page)
  const next = `${initial}-Next!`
  await form.locator('#old-password').fill('Incorrect-example123!')
  await form.locator('#new-password').fill(next)
  await form.locator('#confirm-password').fill(next)
  await form.locator('button[type=submit]').click()
  await expect(page.locator('.hai-toast-item[data-variant=error]')).toContainText('用户名或密码不正确')
  await expect(page.getByTestId('session-recovery-dialog')).toHaveCount(0)
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 960 })
    await expect(page.locator('.hai-toast-item[data-variant=error]')).toBeInViewport({ ratio: 1 })
    await capture(page, `admin-profile-credentials-${width}`)
  }
  await dismissToasts(page)
  const previous = changes
  await form.locator('#old-password').fill(chosen)
  await form.locator('#confirm-password').fill(`Ｎ${next}`)
  await expect(form).toContainText('两次密码输入不一致')
  await expect(form.locator('button[type=submit]')).toBeDisabled()
  expect(changes).toBe(previous)
  await form.locator('#confirm-password').fill(next)
  await form.locator('button[type=submit]').click()
  await expect(page.locator('form.login-form')).toBeVisible()
  await submitLogin(page, dutyAccounts.config.username, next)
  await expect(page).toHaveURL(/\/admin/)
})
