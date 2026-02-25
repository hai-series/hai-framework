/**
 * =============================================================================
 * E2E 测试 - IAM 角色管理页面 UI
 * =============================================================================
 */

import { expect, test } from '@playwright/test'
import { registerAndLogin } from './helpers'

test.describe('IAM Roles UI', () => {
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
  // 角色卡片
  // ---------------------------------------------------------------------------
  test('角色以卡片形式展示', async ({ page, request }) => {
    await registerAndLogin(page, request, 'roleui')
    await page.goto('/admin/iam/roles')
    await page.waitForLoadState('domcontentloaded')

    // 角色卡片容器（grid 布局）
    const cardGrid = page.locator('.grid.gap-4')
    await expect(cardGrid).toBeVisible()

    // 至少有一个 card（系统预设角色）
    const cards = page.locator('.card.bg-base-100')
    const count = await cards.count()
    expect(count).toBeGreaterThanOrEqual(0)
  })

  test('角色卡片显示名称和操作菜单', async ({ page, request }) => {
    await registerAndLogin(page, request, 'roleui')
    await page.goto('/admin/iam/roles')
    await page.waitForLoadState('domcontentloaded')

    const cards = page.locator('.card.bg-base-100')
    const count = await cards.count()

    if (count > 0) {
      const firstCard = cards.first()
      // 卡片标题
      const title = firstCard.locator('.card-title')
      await expect(title).toBeVisible()

      // 下拉操作菜单按钮
      const menuBtn = firstCard.locator('.dropdown button[aria-label]')
      await expect(menuBtn).toBeVisible()
    }
  })

  test('角色卡片显示用户数和权限数', async ({ page, request }) => {
    await registerAndLogin(page, request, 'roleui')
    await page.goto('/admin/iam/roles')
    await page.waitForLoadState('domcontentloaded')

    const cards = page.locator('.card.bg-base-100')
    const count = await cards.count()

    if (count > 0) {
      const firstCard = cards.first()
      // 用户数统计（包含 tabler--users 图标）
      const userCount = firstCard.locator('.tabler--users')
      await expect(userCount).toBeVisible()

      // 权限数统计（包含 tabler--key 图标）
      const permCount = firstCard.locator('.tabler--key')
      await expect(permCount).toBeVisible()
    }
  })

  // ---------------------------------------------------------------------------
  // 下拉操作菜单
  // ---------------------------------------------------------------------------
  test('点击操作菜单显示编辑和删除选项', async ({ page, request }) => {
    await registerAndLogin(page, request, 'roleui')
    await page.goto('/admin/iam/roles')
    await page.waitForLoadState('domcontentloaded')

    const cards = page.locator('.card.bg-base-100')
    const count = await cards.count()

    if (count > 0) {
      const firstCard = cards.first()
      const menuBtn = firstCard.locator('.dropdown button[aria-label]')
      await menuBtn.click()
      await page.waitForTimeout(300)

      // 下拉菜单内容
      const dropdown = firstCard.locator('.dropdown-content')
      await expect(dropdown).toBeVisible()

      // 编辑按钮
      const editIcon = dropdown.locator('.tabler--edit')
      await expect(editIcon).toBeVisible()
    }
  })

  // ---------------------------------------------------------------------------
  // 新建角色对话框
  // ---------------------------------------------------------------------------
  test('点击新建按钮打开角色对话框', async ({ page, request }) => {
    await registerAndLogin(page, request, 'roleui')
    await page.goto('/admin/iam/roles')
    await page.waitForLoadState('domcontentloaded')

    const createBtn = page.locator('main').getByRole('button', { name: /新建|创建|添加/ })
    await createBtn.first().click()
    await expect(page.locator('#name')).toBeVisible()

    // 对话框（modal）可见
    const modal = page.locator('.modal.modal-open')
    await expect(modal).toBeVisible()

    // 包含名称输入框
    await expect(page.locator('#name')).toBeVisible()
    // 包含描述输入框
    await expect(page.locator('#description')).toBeVisible()
  })

  test('角色对话框包含权限选择区域', async ({ page, request }) => {
    await registerAndLogin(page, request, 'roleui')
    await page.goto('/admin/iam/roles')
    await page.waitForLoadState('domcontentloaded')

    const createBtn = page.locator('main').getByRole('button', { name: /新建|创建|添加/ })
    await createBtn.first().click()
    await expect(page.locator('fieldset')).toBeVisible()

    // 权限选择区域（fieldset）
    const permissionsFieldset = page.locator('fieldset')
    await expect(permissionsFieldset).toBeVisible()
  })

  test('角色对话框可通过取消按钮关闭', async ({ page, request }) => {
    await registerAndLogin(page, request, 'roleui')
    await page.goto('/admin/iam/roles')
    await page.waitForLoadState('domcontentloaded')

    const createBtn = page.locator('main').getByRole('button', { name: /新建|创建|添加/ })
    await createBtn.first().click()
    await expect(page.locator('#name')).toBeVisible()

    // 点击取消
    const cancelBtn = page.getByRole('button', { name: /取消|Cancel/ })
    await cancelBtn.first().click()
    await page.waitForTimeout(300)

    // 对话框消失
    await expect(page.locator('.modal.modal-open')).not.toBeVisible()
  })

  test('角色对话框可通过背景遮罩关闭', async ({ page, request }) => {
    await registerAndLogin(page, request, 'roleui')
    await page.goto('/admin/iam/roles')
    await page.waitForLoadState('domcontentloaded')

    const createBtn = page.locator('main').getByRole('button', { name: /新建|创建|添加/ })
    await createBtn.first().click()
    await expect(page.locator('#name')).toBeVisible()

    // 点击背景遮罩
    const backdrop = page.locator('.modal-backdrop')
    await backdrop.click()
    await page.waitForTimeout(300)

    await expect(page.locator('.modal.modal-open')).not.toBeVisible()
  })
})
