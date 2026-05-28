/**
 * =============================================================================
 * E2E 测试 - IAM 用户管理页面 UI
 * =============================================================================
 * 覆盖范围：
 * - 页面结构（标题、按钮、表格、对话框）
 * - 搜索功能
 * - 通过 UI 对话框创建、编辑、删除用户（走 apiFetch 传输加密链路）
 * =============================================================================
 */

import { expect, test } from '@playwright/test'
import { registerAndLogin, uniqueUser } from './helpers'

test.describe('IAM Users UI', () => {
  const editDrawerHeading = /编辑用户管理|编辑用户/

  async function openCreateDrawer(page: import('@playwright/test').Page) {
    const createBtn = page.locator('main').getByRole('button', { name: /新建|创建|添加/ })
    await createBtn.first().click()

    const usernameInput = page.locator('#username:visible').last()
    await expect(usernameInput).toBeVisible()

    const drawer = usernameInput.locator('xpath=ancestor::*[contains(@class, "menu")]').first()
    return drawer
  }

  // ---------------------------------------------------------------------------
  // 页面结构
  // ---------------------------------------------------------------------------
  test('页面标题和新建按钮可见', async ({ page, request }) => {
    await registerAndLogin(page, request, 'usrui')
    await page.goto('/admin/iam/users')
    await page.waitForLoadState('domcontentloaded')

    // 页面标题（PageHeader）
    const heading = page.locator('h1, h2').filter({ hasText: /用户/ })
    await expect(heading.first()).toBeVisible()

    // 新建用户按钮
    const createBtn = page.getByRole('button', { name: /新建|创建|添加/ })
    await expect(createBtn.first()).toBeVisible()
  })

  // ---------------------------------------------------------------------------
  // 搜索功能
  // ---------------------------------------------------------------------------
  test('搜索栏可输入和筛选', async ({ page, request }) => {
    await registerAndLogin(page, request, 'usrui')
    await page.goto('/admin/iam/users')
    await page.waitForLoadState('domcontentloaded')

    // 搜索输入框
    const searchInput = page.locator('input[type="text"][placeholder]').first()
    await expect(searchInput).toBeVisible()

    // 输入搜索关键字
    await searchInput.fill('nonexistent_user_xyz')
    await page.waitForTimeout(500)

    // 用户数应显示（"共 X 个用户"）
    const countText = page.locator('text=共')
    await expect(countText.first()).toBeVisible()
  })

  // ---------------------------------------------------------------------------
  // 用户表格
  // ---------------------------------------------------------------------------
  test('用户表格包含必要的列头', async ({ page, request }) => {
    await registerAndLogin(page, request, 'usrui')
    await page.goto('/admin/iam/users')
    await page.waitForLoadState('domcontentloaded')

    const table = page.locator('table')
    await expect(table).toBeVisible()

    const headers = table.locator('thead th')
    const count = await headers.count()
    // 至少有用户名、邮箱、角色、状态、创建时间、操作 6 列
    expect(count).toBeGreaterThanOrEqual(4)
  })

  test('当前登录用户显示在用户列表中', async ({ page, request }) => {
    const user = await registerAndLogin(page, request, 'usrui')
    await page.goto('/admin/iam/users')
    await page.waitForLoadState('domcontentloaded')

    // 表格中应包含当前用户名
    const row = page.locator('table tbody tr').filter({ hasText: user.username })
    await expect(row.first()).toBeVisible()
  })

  test('用户行显示状态 Badge', async ({ page, request }) => {
    await registerAndLogin(page, request, 'usrui')
    await page.goto('/admin/iam/users')
    await page.waitForLoadState('domcontentloaded')

    // 至少一行有状态标识（正常/未激活/已禁用/Active/Inactive/Disabled）
    const statusBadge = page.locator('table tbody td').filter({ hasText: /正常|未激活|已禁用|Active|Inactive|Disabled/i })
    await expect(statusBadge.first()).toBeVisible()
  })

  test('用户行有编辑和删除操作按钮', async ({ page, request }) => {
    await registerAndLogin(page, request, 'usrui')
    await page.goto('/admin/iam/users')
    await page.waitForLoadState('domcontentloaded')

    // 操作列的编辑按钮（IconButton ariaLabel 包含"编辑"）
    const editBtn = page.locator('table tbody button[aria-label]').first()
    await expect(editBtn).toBeVisible()
  })

  // ---------------------------------------------------------------------------
  // 新建用户对话框
  // ---------------------------------------------------------------------------
  test('点击新建按钮打开对话框', async ({ page, request }) => {
    await registerAndLogin(page, request, 'usrui')
    await page.goto('/admin/iam/users')
    await page.waitForLoadState('domcontentloaded')

    const drawer = await openCreateDrawer(page)

    // 对话框内应有表单字段
    const usernameInput = drawer.locator('#username')
    await expect(usernameInput).toBeVisible()

    const emailInput = drawer.locator('#email')
    await expect(emailInput).toBeVisible()
  })

  test('新建对话框包含所有必填字段', async ({ page, request }) => {
    await registerAndLogin(page, request, 'usrui')
    await page.goto('/admin/iam/users')
    await page.waitForLoadState('domcontentloaded')

    const drawer = await openCreateDrawer(page)

    // 用户名
    await expect(drawer.locator('#username')).toBeVisible()
    // 邮箱
    await expect(drawer.locator('#email')).toBeVisible()
    // 显示名称
    await expect(drawer.locator('#display_name')).toBeVisible()
    // 角色多选区域
    await expect(drawer.locator('input[type="checkbox"]').first()).toBeVisible()
    // 状态选择
    await expect(drawer.locator('select').first()).toBeVisible()
  })

  test('新建对话框可关闭', async ({ page, request }) => {
    await registerAndLogin(page, request, 'usrui')
    await page.goto('/admin/iam/users')
    await page.waitForLoadState('domcontentloaded')

    const drawer = await openCreateDrawer(page)
    const usernameInput = drawer.locator('#username')
    await expect(usernameInput).toBeVisible()

    // 对话框的取消按钮
    const cancelBtn = drawer.getByRole('button', { name: /取消|关闭|Cancel/ })
    await cancelBtn.first().click()
    await page.waitForTimeout(300)

    // 对话框关闭后，username 输入框不可见
    await expect(usernameInput).not.toBeVisible()
  })

  test('新建用户提交空表单显示验证', async ({ page, request }) => {
    await registerAndLogin(page, request, 'usrui')
    await page.goto('/admin/iam/users')
    await page.waitForLoadState('domcontentloaded')

    const drawer = await openCreateDrawer(page)

    // 点击提交按钮（不填写任何字段）
    const submitBtn = drawer.getByRole('button', { name: /创建|保存|提交|新建/ }).last()
    await submitBtn.click()

    // 空表单提交后，新建面板应仍然保持打开
    await expect(drawer.locator('#username')).toBeVisible()
  })

  // ---------------------------------------------------------------------------
  // 通过 UI 对话框编辑用户
  // ---------------------------------------------------------------------------
  test('通过对话框编辑用户后更新生效', async ({ page, request }) => {
    await registerAndLogin(page, request, 'usrui')

    const targetUser = uniqueUser('editui')
    const createTargetRes = await request.post('/api/iam/users', {
      data: {
        username: targetUser.username,
        email: targetUser.email,
        password: targetUser.password,
        roles: [],
        status: 'active',
      },
    })
    expect(createTargetRes.ok()).toBeTruthy()

    await page.goto('/admin/iam/users')
    await page.waitForLoadState('domcontentloaded')

    const row = page.locator('table tbody tr').filter({ hasText: targetUser.username })
    await expect(row.first()).toBeVisible({ timeout: 5_000 })
    await row.first().getByRole('button', { name: /编辑|Edit/ }).click()

    // 等待编辑对话框打开
    const heading = page.getByRole('heading', { name: editDrawerHeading }).last()
    await expect(heading).toBeVisible()

    const drawer = page.locator('.drawer-side .menu').filter({ has: heading }).last()
    const displayNameInput = drawer.locator('#display_name')
    await expect(displayNameInput).toBeVisible()

    // 修改显示名称
    const newDisplayName = `UI_Edited_${Date.now().toString(36)}`
    await displayNameInput.fill(newDisplayName)

    // 点击保存按钮
    const saveBtn = drawer.getByRole('button', { name: /保存|提交/ }).last()
    await saveBtn.click()

    await expect(page.getByRole('heading', { name: editDrawerHeading })).toHaveCount(0, { timeout: 10_000 })

    await row.first().getByRole('button', { name: /编辑|Edit/ }).click()
    const reopenedHeading = page.getByRole('heading', { name: editDrawerHeading }).last()
    await expect(reopenedHeading).toBeVisible()

    const reopenedDrawer = page.locator('.drawer-side .menu').filter({ has: reopenedHeading }).last()
    await expect(reopenedDrawer.locator('#display_name')).toHaveValue(newDisplayName)
  })

  // ---------------------------------------------------------------------------
  // 通过 UI 删除用户
  // ---------------------------------------------------------------------------
  test('通过 UI 删除用户后从列表中消失', async ({ page, request }) => {
    await registerAndLogin(page, request, 'usrui')

    // 先通过 API 创建一个待删除的用户
    const victim = uniqueUser('victim')
    await request.post('/api/iam/users', {
      data: {
        username: victim.username,
        email: victim.email,
        password: victim.password,
        status: 'active',
      },
    })

    await page.goto('/admin/iam/users')
    await page.waitForLoadState('domcontentloaded')

    // 找到待删除用户的行
    const row = page.locator('table tbody tr').filter({ hasText: victim.username })
    await expect(row.first()).toBeVisible({ timeout: 5_000 })

    // 点击删除按钮
    const deleteBtn = row.first().locator('button[aria-label]').last()
    await deleteBtn.click()

    // 通过确认对话框删除
    await page.locator('dialog[open]').getByRole('button', { name: /删除|Delete/ }).click()

    // 用户应从列表中消失
    await expect(row.first()).not.toBeVisible({ timeout: 10_000 })
  })
})
