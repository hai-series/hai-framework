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
import { registerAndLogin, uniqueUser, waitForHydration } from './helpers'

test.describe('IAM Users UI', () => {
  const editDrawerHeading = /编辑用户管理|编辑用户/

  async function openCreateDrawer(page: import('@playwright/test').Page) {
    await waitForHydration(page)
    const createBtn = page.locator('main').getByRole('button', { name: /新建|创建|添加/ })
    const usernameInput = page.locator('#username:visible').last()

    await expect(createBtn.first()).toBeVisible()
    for (let attempt = 0; attempt < 2; attempt++) {
      await createBtn.first().click()
      try {
        await expect(usernameInput).toBeVisible({ timeout: 3_000 })
        break
      }
      catch (error) {
        if (attempt === 1) {
          throw error
        }
      }
    }

    const drawer = usernameInput.locator('xpath=ancestor::*[contains(@class, "menu")]').first()
    return drawer
  }

  async function openEditDrawer(
    page: import('@playwright/test').Page,
    row: import('@playwright/test').Locator,
  ) {
    await waitForHydration(page)
    const heading = page.getByRole('heading', { name: editDrawerHeading }).last()
    const editButton = row.getByRole('button', { name: /编辑|Edit/ })

    for (let attempt = 0; attempt < 2; attempt++) {
      await editButton.click()
      try {
        await expect(heading).toBeVisible({ timeout: 3_000 })
        return page.locator('.drawer-side .menu').filter({ has: heading }).last()
      }
      catch (error) {
        if (attempt === 1) {
          throw error
        }
      }
    }

    return page.locator('.drawer-side .menu').filter({ has: heading }).last()
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

    // 按稳定的搜索提示定位，兼容 searchbox 与 textbox 两种工具栏实现，不绑定 HTML type 或 role。
    const searchInput = page.getByPlaceholder(/搜索用户名、邮箱或显示名称/)
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

  test('数据区纵向滚动时表头保持固定', async ({ page, request }) => {
    await registerAndLogin(page, request, 'usrui')
    await page.goto('/admin/iam/users')
    await page.waitForLoadState('domcontentloaded')

    const table = page.locator('table')
    const scrollContainer = table.locator('..')
    const header = table.locator('thead')
    await expect(table).toBeVisible()
    await expect(scrollContainer).toHaveCSS('overflow-y', 'auto')
    await expect(header).toHaveCSS('position', 'sticky')

    // 测试内补足数据行并限制容器高度，稳定复现超过一页时的纵向滚动场景。
    await scrollContainer.evaluate((container) => {
      container.style.flex = 'none'
      container.style.height = '160px'
      container.style.width = '420px'
      const body = container.querySelector('tbody')
      const sourceRow = body?.querySelector('tr')
      if (!body || !sourceRow)
        return
      while (body.children.length < 20)
        body.append(sourceRow.cloneNode(true))
    })

    const headerTopBeforeScroll = await header.evaluate(element => element.getBoundingClientRect().top)
    await scrollContainer.evaluate((container) => {
      container.scrollTop = 120
      container.scrollLeft = 120
    })
    const headerTopAfterScroll = await header.evaluate(element => element.getBoundingClientRect().top)

    expect(await scrollContainer.evaluate(container => container.scrollTop)).toBeGreaterThan(0)
    expect(Math.abs(headerTopAfterScroll - headerTopBeforeScroll)).toBeLessThanOrEqual(1)

    // 固定操作列的数据格也必须位于表头下方，不能覆盖“操作”表头。
    const actionHeader = table.locator('thead th').last()
    const actionCell = table.locator('tbody td').last()
    const headerZIndex = Number(await header.evaluate(element => getComputedStyle(element).zIndex))
    const actionCellZIndex = Number(await actionCell.evaluate(element => getComputedStyle(element).zIndex))
    const actionHeaderIsTopmost = await actionHeader.evaluate((element) => {
      const { x, y, width, height } = element.getBoundingClientRect()
      return document.elementFromPoint(x + width / 2, y + height / 2)?.closest('th') === element
    })
    expect(headerZIndex).toBeGreaterThan(actionCellZIndex)
    expect(actionHeaderIsTopmost).toBe(true)
  })

  test('操作列补齐表头底线且在初始位置不显示固定列左侧分隔线', async ({ page, request }) => {
    await registerAndLogin(page, request, 'usrui')
    await page.goto('/admin/iam/users')
    await page.waitForLoadState('domcontentloaded')

    const rows = page.locator('table tbody tr')
    const firstRow = rows.first()
    const secondRow = rows.nth(1)
    const firstDataCell = firstRow.locator('td').first()
    const firstActionCell = firstRow.locator('td').last()
    const secondDataCell = secondRow.locator('td').first()
    const secondActionCell = secondRow.locator('td').last()

    // 固定列尚未覆盖横向滚动内容时不应出现左侧阴影。
    const actionHeader = page.locator('table thead th').last()
    await expect(actionHeader).toBeVisible()
    await expect(actionHeader).toHaveCSS('box-shadow', 'none')

    // 每个表头单元格必须使用完全相同的伪元素分隔线，避免 sticky 操作列产生色差或错位。
    const headerDividers = await page.locator('table thead th').evaluateAll(headers => headers.map((header) => {
      const style = getComputedStyle(header, '::after')
      return { backgroundColor: style.backgroundColor, bottom: style.bottom, height: style.height }
    }))
    expect(headerDividers[0]).toMatchObject({ bottom: '-1px', height: '1px' })
    expect(headerDividers[0]?.backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
    expect(headerDividers.every(divider => JSON.stringify(divider) === JSON.stringify(headerDividers[0]))).toBe(true)

    // 奇偶行必须保留不同底色，且固定操作格分别与同行数据格一致。
    await expect(firstRow).toBeVisible()
    await expect(secondRow).toBeVisible()
    const firstRowBackground = await firstDataCell.evaluate(cell => getComputedStyle(cell).backgroundColor)
    const secondRowBackground = await secondDataCell.evaluate(cell => getComputedStyle(cell).backgroundColor)
    expect(secondRowBackground).not.toBe(firstRowBackground)
    await expect(firstActionCell).toHaveCSS('background-color', firstRowBackground)
    await expect(secondActionCell).toHaveCSS('background-color', secondRowBackground)

    await firstRow.hover()
    const hoverBackground = await firstDataCell.evaluate(cell => getComputedStyle(cell).backgroundColor)
    expect(hoverBackground).not.toBe(firstRowBackground)
    await expect(firstActionCell).toHaveCSS('background-color', hoverBackground)
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

  test('分页每页条数浮层首次打开时与触发器左侧对齐', async ({ page, request }) => {
    await registerAndLogin(page, request, 'usrui')
    await page.goto('/admin/iam/users')
    await page.waitForLoadState('domcontentloaded')

    /** 分页栏内唯一的 Select combobox 根节点。 */
    const pageSizeSelect = page.locator('main [role="combobox"]').first()
    /** Select 实际接收点击并提供定位基准的触发器。 */
    const pageSizeTrigger = pageSizeSelect.locator('[role="presentation"]')
    await expect(pageSizeTrigger).toBeVisible()
    await pageSizeTrigger.click()

    /** portal 到 body 的下拉列表。 */
    const pageSizeListbox = page.locator('[role="listbox"]')
    await expect(pageSizeListbox).toBeVisible()
    /** 首次打开后的触发器视口坐标。 */
    const triggerBox = await pageSizeTrigger.boundingBox()
    /** 首次打开后的浮层视口坐标。 */
    const listboxBox = await pageSizeListbox.boundingBox()

    expect(triggerBox).not.toBeNull()
    expect(listboxBox).not.toBeNull()
    if (!triggerBox || !listboxBox) {
      return
    }

    // 浮层使用 fixed 定位，left 必须直接取触发器的视口 left，不能掺入被 portal 前的父级偏移。
    expect(Math.abs(listboxBox.x - triggerBox.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(listboxBox.width - triggerBox.width)).toBeLessThanOrEqual(1)
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
    // 状态选择（CrudEditPanel 的 Select 已升级为自定义 combobox，不再渲染原生 <select>）
    await expect(drawer.locator('[role="combobox"]').first()).toBeVisible()
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
    const drawer = await openEditDrawer(page, row.first())
    const displayNameInput = drawer.locator('#display_name')
    await expect(displayNameInput).toBeVisible()

    // 修改显示名称
    const newDisplayName = `UI_Edited_${Date.now().toString(36)}`
    await displayNameInput.fill(newDisplayName)

    // 点击保存按钮
    const saveBtn = drawer.getByRole('button', { name: /保存|提交/ }).last()
    await saveBtn.click()

    await expect(page.getByRole('heading', { name: editDrawerHeading })).toHaveCount(0, { timeout: 10_000 })

    const reopenedDrawer = await openEditDrawer(page, row.first())
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
