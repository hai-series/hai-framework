/**
 * =============================================================================
 * E2E 测试 - IAM 权限管理页面 UI
 * =============================================================================
 * 覆盖范围：
 * - 页面结构（标题、统计卡片、权限表格）
 * - 新建权限抽屉（字段、自动名称生成、关闭）
 * - 通过 UI 抽屉创建、删除权限（走 apiFetch 传输加密链路）
 * =============================================================================
 */

import { expect, test } from '@playwright/test'
import { registerAndLogin, waitForHydration } from './helpers'

test.describe('IAM Permissions UI', () => {
  async function openCreatePanel(page: import('@playwright/test').Page) {
    await waitForHydration(page)
    const createBtn = page.locator('main').getByRole('button', { name: /新建|创建|添加/ })
    const resourceInput = page.locator('#resource:visible').last()

    await expect(createBtn.first()).toBeVisible()
    for (let attempt = 0; attempt < 2; attempt++) {
      await createBtn.first().click()
      try {
        await expect(resourceInput).toBeVisible({ timeout: 3_000 })
        break
      }
      catch (error) {
        if (attempt === 1) {
          throw error
        }
      }
    }

    const panel = resourceInput.locator('xpath=ancestor::*[contains(@class, "menu")]').first()
    return panel
  }

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

  test('权限列表表格可见', async ({ page, request }) => {
    await registerAndLogin(page, request, 'permui')
    await page.goto('/admin/iam/permissions')
    await page.waitForLoadState('domcontentloaded')

    await expect(page.locator('table').first()).toBeVisible()
  })

  // ---------------------------------------------------------------------------
  // 新建权限抽屉
  // ---------------------------------------------------------------------------
  test('点击新建按钮打开权限抽屉', async ({ page, request }) => {
    await registerAndLogin(page, request, 'permui')
    await page.goto('/admin/iam/permissions')
    await page.waitForLoadState('domcontentloaded')

    const panel = await openCreatePanel(page)
    await expect(panel.locator('#name')).toBeVisible()
    await expect(panel.locator('#action')).toBeVisible()
    await expect(panel.locator('#resource')).toBeVisible()
  })

  test('新建抽屉可关闭', async ({ page, request }) => {
    await registerAndLogin(page, request, 'permui')
    await page.goto('/admin/iam/permissions')
    await page.waitForLoadState('domcontentloaded')

    const panel = await openCreatePanel(page)
    await expect(panel.locator('#resource')).toBeVisible()

    // 点击取消按钮关闭抽屉
    const cancelBtn = panel.getByRole('button', { name: /取消|Cancel/ })
    await cancelBtn.click({ force: true })

    await expect(panel.locator('#resource')).not.toBeVisible({ timeout: 5000 })
  })

  // ---------------------------------------------------------------------------
  // 通过 UI 对话框创建权限
  // ---------------------------------------------------------------------------
  test('通过抽屉创建权限后出现在列表中', async ({ page, request }) => {
    await registerAndLogin(page, request, 'permui')
    await page.goto('/admin/iam/permissions')
    await page.waitForLoadState('domcontentloaded')

    const ts = Date.now().toString(36)
    const resource = `res_${ts}`
    const action = 'read'
    const permissionName = `${resource}:${action}`

    // 打开新建抽屉
    const panel = await openCreatePanel(page)

    // 填写资源和操作
    await panel.locator('#resource').fill(resource)
    await panel.locator('#action').fill(action)
    // name 字段应自动生成（resource:action）
    await page.waitForTimeout(300)

    // 点击创建
    const submitBtn = panel.getByRole('button', { name: /创建|提交|新建/ }).last()
    await submitBtn.click()

    // 抽屉应关闭
    await expect(panel.locator('#resource')).not.toBeVisible({ timeout: 10_000 })

    // 新权限应出现在页面中（列表展示 name/code，不展示 resource 单列）
    const permRow = page.locator('tbody tr').filter({ hasText: permissionName })
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

    // 找到同行的删除按钮
    const row = permCell.first().locator('xpath=ancestor::tr')
    const deleteBtn = row.getByRole('button', { name: /删除|Delete/ })
    await deleteBtn.click()

    // 确认删除
    await page.locator('dialog[open]').getByRole('button', { name: /删除|Delete/ }).click()

    // 权限应从列表中消失
    await expect(permCell.first()).not.toBeVisible({ timeout: 10_000 })
  })
})
