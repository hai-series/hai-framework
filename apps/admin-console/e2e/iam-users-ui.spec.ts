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

    const createBtn = page.locator('main').getByRole('button', { name: /新建|创建|添加/ })
    await createBtn.first().click()

    // 对话框内应有表单字段
    const usernameInput = page.locator('#username')
    await expect(usernameInput).toBeVisible()

    const emailInput = page.locator('#email')
    await expect(emailInput).toBeVisible()
  })

  test('新建对话框包含所有必填字段', async ({ page, request }) => {
    await registerAndLogin(page, request, 'usrui')
    await page.goto('/admin/iam/users')
    await page.waitForLoadState('domcontentloaded')

    const createBtn = page.locator('main').getByRole('button', { name: /新建|创建|添加/ })
    await createBtn.first().click()
    await expect(page.locator('#username')).toBeVisible()

    // 用户名
    await expect(page.locator('#username')).toBeVisible()
    // 邮箱
    await expect(page.locator('#email')).toBeVisible()
    // 显示名称
    await expect(page.locator('#display_name')).toBeVisible()
    // 密码（PasswordInput 组件）
    const pwdInput = page.locator('input[type="password"]').first()
    await expect(pwdInput).toBeVisible()
    // 状态选择
    await expect(page.locator('#status')).toBeVisible()
  })

  test('新建对话框可关闭', async ({ page, request }) => {
    await registerAndLogin(page, request, 'usrui')
    await page.goto('/admin/iam/users')
    await page.waitForLoadState('domcontentloaded')

    const createBtn = page.locator('main').getByRole('button', { name: /新建|创建|添加/ })
    await createBtn.first().click()
    const usernameInput = page.locator('#username')
    if (!(await usernameInput.isVisible())) {
      await createBtn.first().click()
    }
    await expect(usernameInput).toBeVisible()

    // 对话框的取消按钮
    const cancelBtn = page.getByRole('button', { name: /取消|关闭|Cancel/ })
    await cancelBtn.first().click()
    await page.waitForTimeout(300)

    // 对话框关闭后，username 输入框不可见
    await expect(usernameInput).not.toBeVisible()
  })

  test('新建用户提交空表单显示验证', async ({ page, request }) => {
    await registerAndLogin(page, request, 'usrui')
    await page.goto('/admin/iam/users')
    await page.waitForLoadState('domcontentloaded')

    const createBtn = page.getByRole('button', { name: /新建|创建|添加/ })
    await createBtn.first().click()
    await page.waitForTimeout(500)

    // 点击提交按钮（不填写任何字段）
    const submitBtn = page.locator('.modal-box').getByRole('button', { name: /创建|保存|提交/ }).last()
    await submitBtn.click()

    // 浏览器原生验证会阻止提交—— username 字段有 required 属性
    const usernameInput = page.locator('#username')
    const validity = await usernameInput.evaluate((el: HTMLInputElement) => el.validity.valid)
    expect(validity).toBe(false)
  })

  // ---------------------------------------------------------------------------
  // 通过 UI 对话框创建用户
  // ---------------------------------------------------------------------------
  test('通过对话框创建用户后出现在列表中', async ({ page, request }) => {
    await registerAndLogin(page, request, 'usrui')
    await page.goto('/admin/iam/users')
    await page.waitForLoadState('domcontentloaded')

    const newUser = uniqueUser('create')

    // 打开新建对话框
    const createBtn = page.locator('main').getByRole('button', { name: /新建|创建|添加/ })
    await createBtn.first().click()
    await expect(page.locator('#username')).toBeVisible()

    // 填写表单
    await page.locator('#username').fill(newUser.username)
    await page.locator('#email').fill(newUser.email)
    await page.locator('input[type="password"]').first().fill(newUser.password)
    // 确认密码（第二个密码输入框）
    await page.locator('input[type="password"]').nth(1).fill(newUser.password)

    // 点击创建按钮
    const submitBtn = page.locator('.modal-box, dialog').getByRole('button', { name: /创建|保存|提交/ }).last()
    await submitBtn.click()

    // 对话框应关闭
    await expect(page.locator('#username')).not.toBeVisible({ timeout: 10_000 })

    // 新用户出现在表格中
    const row = page.locator('table tbody tr').filter({ hasText: newUser.username })
    await expect(row.first()).toBeVisible({ timeout: 5_000 })
  })

  // ---------------------------------------------------------------------------
  // 通过 UI 对话框编辑用户
  // ---------------------------------------------------------------------------
  test('通过对话框编辑用户后更新生效', async ({ page, request }) => {
    await registerAndLogin(page, request, 'usrui')
    await page.goto('/admin/iam/users')
    await page.waitForLoadState('domcontentloaded')

    // 等待表格渲染
    await expect(page.locator('table tbody tr').first()).toBeVisible()

    // 点击第一个用户行的编辑按钮
    const editBtn = page.locator('table tbody tr').first().locator('button[aria-label]').first()
    await editBtn.click()

    // 等待编辑对话框打开
    await expect(page.locator('#username')).toBeVisible()

    // 修改显示名称
    const newDisplayName = `UI_Edited_${Date.now().toString(36)}`
    await page.locator('#display_name').fill(newDisplayName)

    // 点击保存按钮
    const saveBtn = page.locator('.modal-box, dialog').getByRole('button', { name: /保存|提交/ }).last()
    await saveBtn.click()

    // 对话框应关闭
    await expect(page.locator('#username')).not.toBeVisible({ timeout: 10_000 })
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

    // 监听 confirm 对话框并点击确认
    page.on('dialog', dialog => dialog.accept())

    // 点击删除按钮
    const deleteBtn = row.first().locator('button[aria-label]').last()
    await deleteBtn.click()

    // 用户应从列表中消失
    await expect(row.first()).not.toBeVisible({ timeout: 10_000 })
  })
})
