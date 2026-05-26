/**
 * =============================================================================
 * E2E 测试 - IAM 角色管理页面 UI
 * =============================================================================
 * 覆盖范围：
 * - 页面结构（标题、按钮、表格）
 * - 新建角色抽屉（结构、权限选择、关闭）
 * - 通过 UI 抽屉创建、编辑角色（走 apiFetch 传输加密链路）
 * =============================================================================
 */

import { expect, test } from '@playwright/test'
import { registerAndLogin } from './helpers'

test.describe('IAM Roles UI', () => {
  const editDrawerHeading = /编辑角色管理|编辑角色/

  async function openCreateDrawer(page: import('@playwright/test').Page) {
    const createBtn = page.locator('main').getByRole('button', { name: /新建|创建|添加/ })
    const drawer = page.locator('.drawer-side .menu').filter({ has: page.locator('#name') }).last()
    const nameInput = drawer.locator('#name')

    await expect(createBtn.first()).toBeVisible()
    await expect(createBtn.first()).toBeEnabled()

    for (let attempt = 0; attempt < 2; attempt++) {
      await createBtn.first().click({ force: true })
      try {
        await expect(nameInput).toBeVisible({ timeout: 3_000 })
        return drawer
      }
      catch (error) {
        if (attempt === 1) {
          throw error
        }
      }
    }

    return drawer
  }

  // ---------------------------------------------------------------------------
  // 页面结构
  // ---------------------------------------------------------------------------
  test('页面标题和新建按钮可见', async ({ page, request }) => {
    await registerAndLogin(page, request, 'roleui')
    await page.goto('/admin/iam/roles')
    await page.waitForLoadState('domcontentloaded')

    // 页面标题
    const heading = page.locator('h1, h2').filter({ hasText: /角色/ })
    await expect(heading.first()).toBeVisible()

    // 新建角色按钮
    const createBtn = page.getByRole('button', { name: /新建|创建|添加/ })
    await expect(createBtn.first()).toBeVisible()
  })

  // ---------------------------------------------------------------------------
  // 角色表格
  // ---------------------------------------------------------------------------
  test('角色以表格形式展示', async ({ page, request }) => {
    await registerAndLogin(page, request, 'roleui')
    await page.goto('/admin/iam/roles')
    await page.waitForLoadState('domcontentloaded')

    await expect(page.locator('table').first()).toBeVisible()
    const rows = page.locator('tbody tr')
    expect(await rows.count()).toBeGreaterThan(0)
  })

  test('角色表格显示名称和操作按钮', async ({ page, request }) => {
    await registerAndLogin(page, request, 'roleui')
    await page.goto('/admin/iam/roles')
    await page.waitForLoadState('domcontentloaded')

    const firstRow = page.locator('tbody tr').first()
    await expect(firstRow).toBeVisible()
    await expect(firstRow.getByRole('button', { name: /编辑|Edit/ })).toBeVisible()
    await expect(firstRow.getByRole('button', { name: /删除|Delete/ })).toBeVisible()
  })

  // ---------------------------------------------------------------------------
  // 新建角色抽屉
  // ---------------------------------------------------------------------------
  test('点击新建按钮打开角色抽屉', async ({ page, request }) => {
    await registerAndLogin(page, request, 'roleui')
    await page.goto('/admin/iam/roles')
    await page.waitForLoadState('domcontentloaded')

    const drawer = await openCreateDrawer(page)

    // 抽屉可见
    await expect(drawer).toBeVisible()

    // 包含名称输入框
    await expect(drawer.locator('#name')).toBeVisible()
    // 包含描述输入框
    await expect(drawer.locator('#description')).toBeVisible()
  })

  test('角色抽屉包含权限选择区域', async ({ page, request }) => {
    await registerAndLogin(page, request, 'roleui')
    await page.goto('/admin/iam/roles')
    await page.waitForLoadState('domcontentloaded')

    const drawer = await openCreateDrawer(page)

    // 权限选择区域（checkbox 列表）
    await expect(drawer.locator('input[type="checkbox"]').first()).toBeVisible()
  })

  test('角色抽屉可通过取消按钮关闭', async ({ page, request }) => {
    await registerAndLogin(page, request, 'roleui')
    await page.goto('/admin/iam/roles')
    await page.waitForLoadState('domcontentloaded')

    const drawer = await openCreateDrawer(page)

    // 点击取消
    const cancelBtn = drawer.getByRole('button', { name: /取消|Cancel/ })
    await cancelBtn.first().click()
    await page.waitForTimeout(300)

    // 抽屉消失
    await expect(drawer.locator('#name')).not.toBeVisible()
  })

  // ---------------------------------------------------------------------------
  // 通过 UI 对话框创建角色
  // ---------------------------------------------------------------------------
  test('通过抽屉创建角色后出现在表格列表中', async ({ page, request }) => {
    await registerAndLogin(page, request, 'roleui')
    await page.goto('/admin/iam/roles')
    await page.waitForLoadState('domcontentloaded')

    const roleName = `role_${Date.now().toString(36)}`
    const roleDesc = 'E2E 测试创建的角色'

    // 打开新建抽屉
    const drawer = await openCreateDrawer(page)

    // 填写表单
    await drawer.locator('#name').fill(roleName)
    await drawer.locator('#description').fill(roleDesc)

    // 点击创建按钮
    const submitBtn = drawer.getByRole('button', { name: /新建|创建|保存|提交/ }).last()
    await submitBtn.click()

    // 新角色出现在表格中
    const row = page.locator('tbody tr').filter({ hasText: roleName })
    await expect(row.first()).toBeVisible({ timeout: 10_000 })
  })

  // ---------------------------------------------------------------------------
  // 通过 UI 对话框编辑角色
  // ---------------------------------------------------------------------------
  test('通过抽屉编辑角色描述', async ({ page, request }) => {
    await registerAndLogin(page, request, 'roleui')

    // 先通过 API 创建一个角色
    const roleName = `edit_${Date.now().toString(36)}`
    await request.post('/api/iam/roles', {
      data: { name: roleName, description: 'original', permissions: [] },
    })

    await page.goto('/admin/iam/roles')
    await page.waitForLoadState('domcontentloaded')

    // 找到角色表格行并点击编辑
    const row = page.locator('tbody tr').filter({ hasText: roleName })
    await expect(row.first()).toBeVisible({ timeout: 5_000 })
    await row.first().getByRole('button', { name: /编辑|Edit/ }).click()

    // 等待编辑抽屉打开
    const heading = page.getByRole('heading', { name: editDrawerHeading }).last()
    await expect(heading).toBeVisible()

    const drawer = page.locator('.drawer-side .menu').filter({ has: heading }).last()
    await expect(drawer.locator('#description')).toBeVisible()

    // 修改描述
    const newDesc = 'UI 编辑后的描述'
    await drawer.locator('#description').fill(newDesc)

    // 点击保存
    const saveBtn = drawer.getByRole('button', { name: /保存|提交/ }).last()
    await saveBtn.click()

    // 抽屉应关闭
    await expect(page.getByRole('heading', { name: editDrawerHeading })).toHaveCount(0, { timeout: 10_000 })
  })

  // ---------------------------------------------------------------------------
  // 通过 UI 删除角色
  // ---------------------------------------------------------------------------
  test('通过 UI 删除自定义角色', async ({ page, request }) => {
    await registerAndLogin(page, request, 'roleui')

    // 先通过 API 创建一个角色
    const roleName = `del_${Date.now().toString(36)}`
    await request.post('/api/iam/roles', {
      data: { name: roleName, description: 'to be deleted', permissions: [] },
    })

    await page.goto('/admin/iam/roles')
    await page.waitForLoadState('domcontentloaded')

    // 找到角色所在的表格行
    const row = page.locator('tbody tr').filter({ hasText: roleName })
    await expect(row.first()).toBeVisible({ timeout: 5_000 })

    // 点击删除
    const deleteBtn = row.first().getByRole('button', { name: /删除|Delete/ })
    await deleteBtn.click()

    // 确认删除
    await page.locator('dialog[open]').getByRole('button', { name: /删除|Delete/ }).click()

    // 角色应从列表中消失
    await expect(row.first()).not.toBeVisible({ timeout: 10_000 })
  })
})
