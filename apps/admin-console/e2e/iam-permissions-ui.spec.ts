/**
 * =============================================================================
 * E2E 测试 - IAM 权限管理页面 UI
 * =============================================================================
 * 覆盖范围：
 * - 页面结构（标题、统计卡片、资源分组表格）
 * - 新建权限对话框（字段、自动名称生成、关闭）
 * - 通过 UI 对话框创建、删除权限（走 apiFetch 传输加密链路）
 * =============================================================================
 */

import { expect, test } from '@playwright/test'
import { registerAndLogin } from './helpers'

test.describe('IAM Permissions UI', () => {
  // ---------------------------------------------------------------------------
  // 页面结构
  // ---------------------------------------------------------------------------
  test('页面标题和新建按钮可见', async ({ page, request }) => {
    await registerAndLogin(page, request, 'permui')
    await page.goto('/admin/iam/permissions')
    await page.waitForLoadState('domcontentloaded')

    // 页面标题
    const heading = page.locator('h1, h2').filter({ hasText: /权限/ })
    await expect(heading.first()).toBeVisible()

    // 新建按钮
    const createBtn = page.getByRole('button', { name: /新建|创建|添加/ })
    await expect(createBtn.first()).toBeVisible()
  })

  test('页面包含统计卡片', async ({ page, request }) => {
    await registerAndLogin(page, request, 'permui')
    await page.goto('/admin/iam/permissions')
    await page.waitForLoadState('domcontentloaded')

    // 至少有统计信息
    const stats = page.locator('.stat, .card')
    const count = await stats.count()
    expect(count).toBeGreaterThanOrEqual(1)
  })

  test('权限以资源分组展示', async ({ page, request }) => {
    await registerAndLogin(page, request, 'permui')
    await page.goto('/admin/iam/permissions')
    await page.waitForLoadState('domcontentloaded')

    // 至少有一个表格（权限分组）
    const tables = page.locator('table')
    const count = await tables.count()
    expect(count).toBeGreaterThanOrEqual(1)
  })

  // ---------------------------------------------------------------------------
  // 新建权限对话框
  // ---------------------------------------------------------------------------
  test('点击新建按钮打开权限对话框', async ({ page, request }) => {
    await registerAndLogin(page, request, 'permui')
    await page.goto('/admin/iam/permissions')
    await page.waitForLoadState('domcontentloaded')

    const createBtn = page.locator('main').getByRole('button', { name: /新建|创建|添加/ })
    await createBtn.first().click()

    // 对话框中应有资源和操作输入框
    await expect(page.locator('#resource')).toBeVisible()
    await expect(page.locator('#action')).toBeVisible()
    await expect(page.locator('#name')).toBeVisible()
  })

  test('新建对话框可关闭', async ({ page, request }) => {
    await registerAndLogin(page, request, 'permui')
    await page.goto('/admin/iam/permissions')
    await page.waitForLoadState('domcontentloaded')

    const createBtn = page.locator('main').getByRole('button', { name: /新建|创建|添加/ })
    await createBtn.first().click()
    await expect(page.locator('#resource')).toBeVisible()

    // 点击取消按钮关闭对话框
    const cancelBtn = page.locator('.modal-action').getByRole('button', { name: /取消|Cancel/ })
    await cancelBtn.click({ force: true })

    await expect(page.locator('#resource')).not.toBeVisible({ timeout: 5000 })
  })

  // ---------------------------------------------------------------------------
  // 通过 UI 对话框创建权限
  // ---------------------------------------------------------------------------
  test('通过对话框创建权限后出现在列表中', async ({ page, request }) => {
    await registerAndLogin(page, request, 'permui')
    await page.goto('/admin/iam/permissions')
    await page.waitForLoadState('domcontentloaded')

    const ts = Date.now().toString(36)
    const resource = `res_${ts}`
    const action = 'read'

    // 打开新建对话框
    const createBtn = page.locator('main').getByRole('button', { name: /新建|创建|添加/ })
    await createBtn.first().click()
    await expect(page.locator('#resource')).toBeVisible()

    // 填写资源和操作
    await page.locator('#resource').fill(resource)
    await page.locator('#action').fill(action)
    // name 字段应自动生成（resource:action）
    await page.waitForTimeout(300)

    // 点击创建
    const submitBtn = page.locator('.modal-box, dialog').getByRole('button', { name: /创建|提交/ }).last()
    await submitBtn.click()

    // 对话框应关闭
    await expect(page.locator('#resource')).not.toBeVisible({ timeout: 10_000 })

    // 新权限应出现在页面中
    const permRow = page.locator('table').filter({ hasText: resource })
    await expect(permRow.first()).toBeVisible({ timeout: 5_000 })
  })

  // ---------------------------------------------------------------------------
  // 通过 UI 删除权限
  // ---------------------------------------------------------------------------
  test('通过 UI 删除自定义权限', async ({ page, request }) => {
    await registerAndLogin(page, request, 'permui')

    // 先通过 API 创建一个权限
    const ts = Date.now().toString(36)
    const permName = `delres_${ts}:delete`
    await request.post('/api/iam/permissions', {
      data: {
        name: permName,
        resource: `delres_${ts}`,
        action: 'delete',
        description: 'to be deleted',
      },
    })

    await page.goto('/admin/iam/permissions')
    await page.waitForLoadState('domcontentloaded')

    // 找到该权限所在的表格区域
    const permCell = page.locator('td').filter({ hasText: permName })
    await expect(permCell.first()).toBeVisible({ timeout: 5_000 })

    // 监听 confirm 对话框并点击确认
    page.on('dialog', dialog => dialog.accept())

    // 找到同行的删除按钮
    const row = permCell.first().locator('..')
    const deleteBtn = row.locator('button[aria-label]').last()
    await deleteBtn.click()

    // 权限应从列表中消失
    await expect(permCell.first()).not.toBeVisible({ timeout: 10_000 })
  })
})
