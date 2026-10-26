import type { Page, TestInfo } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { expect, test } from '@playwright/test'
import { loginOnPage, registerAndLogin, uniqueUser, waitForHydration } from './helpers'

async function capture(page: Page, name: string, testInfo: TestInfo) {
  const evidence = process.env.HAI_AUTH_EVIDENCE_DIR
  if (evidence)
    await mkdir(evidence, { recursive: true })
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: evidence ? path.join(evidence, name) : testInfo.outputPath(name), fullPage: true, animations: 'disabled' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}

test('登录注册使用配置驱动的认证布局', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.goto('/auth/login')
  await expect(page.locator('#login-username')).toBeEditable()
  await expect(page.getByRole('heading', { name: 'IAM flow branding' })).toBeVisible()
  await expect(page.locator('img[src="/iam-illustration.svg"]')).toBeVisible()
  await expect(page.getByRole('heading', { name: /^(登录|Login)$/ })).toHaveCount(1)
  await capture(page, 'admin-login-desktop.png', testInfo)
  await page.getByRole('link', { name: /立即注册|Register now/ }).click()
  await expect(page.locator('#register-username')).toBeEditable()
  await expect(page.getByRole('heading', { name: 'IAM flow branding' })).toBeVisible()
  await capture(page, 'admin-register-desktop.png', testInfo)
  await page.setViewportSize({ width: 390, height: 844 })
  await capture(page, 'admin-register-mobile.png', testInfo)
  await page.getByRole('link', { name: /立即登录|Login now/ }).click()
  await expect(page.locator('#login-username')).toBeEditable()
  await capture(page, 'admin-login-mobile.png', testInfo)
})

test('个人资料失焦校验与响应式布局', async ({ page, request }, testInfo) => {
  await registerAndLogin(page, request, 'blur')
  await page.goto('/admin/profile')
  await waitForHydration(page)
  const email = page.locator('.user-profile input[name="email"]')
  await email.fill('invalid-email')
  await email.press('Tab')
  await expect(email).toHaveAttribute('aria-invalid', 'true')
  await capture(page, 'admin-profile-blur-error.png', testInfo)
  await email.fill('corrected@example.com')
  await expect(email).not.toHaveAttribute('aria-invalid')
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 960 })
    const fields = await page.locator('.user-profile .hai-form-field').evaluateAll(elements => elements.map((field) => {
      const label = field.querySelector('label')!.getBoundingClientRect()
      const control = field.querySelector('input')!.getBoundingClientRect()
      return { labelBottom: label.bottom, controlTop: control.top, controlRight: control.right }
    }))
    for (const field of fields) {
      expect(field.labelBottom).toBeLessThanOrEqual(field.controlTop)
      expect(field.controlRight).toBeLessThanOrEqual(width)
    }
    await capture(page, `admin-profile-${width}.png`, testInfo)
  }
  await expect(page.locator('#old-password')).toHaveAttribute('autocomplete', 'current-password')
  await page.locator('#old-password').scrollIntoViewIfNeeded()
  await capture(page, 'admin-password-mobile.png', testInfo)
})

test('CRUD 新建和编辑失焦后提示，关闭重开清除错误', async ({ page }, testInfo) => {
  await loginOnPage(page, 'admin', process.env.E2E_ADMIN_PASSWORD || 'admin123456')
  const editUser = uniqueUser('ablur')
  // 使用真实分页让待编辑用户离开当前页，避免依赖全量测试的数据量与执行顺序。
  for (const user of [editUser, uniqueUser('zzblur')]) {
    const created = await page.request.post('/api/iam/users', { data: user })
    await expect(created).toBeOK()
    expect((await created.json()).success).toBe(true)
  }
  await page.goto('/admin/iam/users?pageSize=1&sortBy=username&sortDirection=desc')
  await waitForHydration(page)
  await expect(page.locator('tbody tr')).toHaveCount(1)
  const editRow = page.getByRole('row').filter({ has: page.getByRole('button', { name: editUser.username, exact: true }) })
  await expect(editRow).toHaveCount(0)
  await page.locator('main').getByRole('button', { name: /新建|创建|添加/ }).first().click()
  const username = page.locator('input[name="username"]:visible').last()
  await username.fill('a')
  await username.press('Tab')
  await expect(username).toHaveAttribute('aria-invalid', 'true')
  await capture(page, 'admin-create-blur-error.png', testInfo)
  await username.fill('corrected_user')
  await expect(username).not.toHaveAttribute('aria-invalid')
  const drawer = page.locator('.drawer-side .menu').filter({ has: username }).last()
  await drawer.getByRole('button', { name: /取消|Cancel/, exact: true }).click()
  await page.locator('main').getByRole('button', { name: /新建|创建|添加/ }).first().click()
  await expect(drawer.locator('[aria-invalid="true"]')).toHaveCount(0)
  await drawer.getByRole('button', { name: /取消|Cancel/, exact: true }).click()
  const search = page.getByPlaceholder(/搜索用户名、邮箱或显示名称/)
  await search.fill(editUser.username)
  await search.press('Enter')
  await expect(editRow).toBeVisible()
  await editRow.getByRole('button', { name: /编辑|Edit/, exact: true }).click()
  await expect(page.locator('input[name="username"]:visible').last()).toHaveValue(editUser.username)
  const email = page.locator('input[name="email"]:visible').last()
  await email.fill('invalid-email')
  await email.press('Tab')
  await expect(email).toHaveAttribute('aria-invalid', 'true')
  await capture(page, 'admin-edit-blur-error.png', testInfo)
  await email.fill('corrected@example.com')
  await expect(email).not.toHaveAttribute('aria-invalid')
})
