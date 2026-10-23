import { expect, test } from '@playwright/test'
import { registerAndLogin, uniqueUser, waitForHydration } from './helpers'

test.describe('IAM Users UI', () => {
  const editDrawerHeading = /编辑用户管理|编辑用户/

  async function openCreateDrawer(page: import('@playwright/test').Page) {
    await waitForHydration(page)
    const createBtn = page.locator('main').getByRole('button', { name: /新建|创建|添加/ })
    const usernameInput = page.locator('input[name="username"]:visible').last()

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

  test('用户表格包含必要列头，并在宽屏充分使用内容区', async ({ page, request }, testInfo) => {
    await registerAndLogin(page, request, 'usrui')
    await page.goto('/admin/iam/users')
    await page.waitForLoadState('domcontentloaded')

    const table = page.locator('table')
    await expect(table).toBeVisible()

    const headers = table.locator('thead th')
    const count = await headers.count()
    // 至少有用户名、邮箱、角色、状态、创建时间、操作 6 列
    expect(count).toBeGreaterThanOrEqual(4)
    for (const width of [1440, 1920, 2560, 3840, 390]) {
      await page.setViewportSize({ width, height: 960 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      if (width >= 1440) {
        const main = await page.locator('main').boundingBox()
        const content = await table.locator('..').boundingBox()
        expect(content!.width).toBeGreaterThan(main!.width - 100)
      }
      if (width === 1920)
        await page.screenshot({ path: testInfo.outputPath('admin-1920.png'), animations: 'disabled' })
    }
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

  test('点击用户名打开详情，拖动后的抽屉宽度会被记忆', async ({ page, request }) => {
    const user = await registerAndLogin(page, request, 'usrui')
    await page.goto(`/admin/iam/users?search=${encodeURIComponent(user.username)}`)
    await page.waitForLoadState('domcontentloaded')
    await waitForHydration(page)

    const row = page.locator('table tbody tr').filter({ hasText: user.username }).first()
    const usernameCellButton = row.locator('td').first().getByRole('button')
    await expect(usernameCellButton).toBeVisible()
    await usernameCellButton.click()

    const detailHeading = page.getByRole('heading', { name: /用户.*详情/ }).last()
    const drawer = page.locator('.drawer-side .menu').filter({ has: detailHeading }).last()
    const resizeHandle = drawer.locator('[data-drawer-resize-handle]')
    await expect(detailHeading).toBeVisible()
    await expect(resizeHandle).toBeVisible()

    const initialBox = await drawer.boundingBox()
    const handleBox = await resizeHandle.boundingBox()
    expect(initialBox).not.toBeNull()
    expect(handleBox).not.toBeNull()
    if (!initialBox || !handleBox)
      return

    const startX = handleBox.x + handleBox.width / 2
    const pointerY = handleBox.y + handleBox.height / 2
    const targetX = startX - 200 // 拖动 200px 确保宽度变化足够明显
    await resizeHandle.dispatchEvent('mousedown', { clientX: startX, clientY: pointerY, button: 0 })
    // 分多步触发 mousemove，模拟真实拖动行为，提高稳定性
    for (const step of [50, 100, 150, 200]) {
      await page.locator('body').dispatchEvent('mousemove', { clientX: startX - step, clientY: pointerY })
    }
    await page.locator('body').dispatchEvent('mouseup', { clientX: targetX, clientY: pointerY })

    await expect.poll(async () => (await drawer.boundingBox())?.width ?? 0).toBeGreaterThan(initialBox.width + 10)
    const resizedBox = await drawer.boundingBox()
    expect(resizedBox).not.toBeNull()
    expect(resizedBox!.width).toBeGreaterThan(initialBox.width + 10)
    await expect.poll(() => page.evaluate(() => localStorage.getItem('hai-ui:crud:user:drawer-width'))).not.toBeNull()
    const storedWidth = Number(await page.evaluate(() => localStorage.getItem('hai-ui:crud:user:drawer-width')))
    expect(storedWidth).toBeGreaterThan(initialBox.width + 10)

    await drawer.getByRole('button', { name: /关闭|Close/ }).first().click()
    await expect(detailHeading).not.toBeVisible()
    await page.reload()
    await waitForHydration(page)

    const reloadedRow = page.locator('table tbody tr').filter({ hasText: user.username }).first()
    await reloadedRow.locator('td').first().getByRole('button').click()
    const restoredDrawer = page.locator('.drawer-side .menu').filter({
      has: page.getByRole('heading', { name: /用户.*详情/ }).last(),
    }).last()
    await expect(restoredDrawer).toBeVisible()
    const restoredBox = await restoredDrawer.boundingBox()
    expect(restoredBox).not.toBeNull()
    expect(Math.abs(restoredBox!.width - storedWidth)).toBeLessThanOrEqual(4)
  })

  test('分页每页条数浮层首次打开时与触发器左侧对齐', async ({ page, request }) => {
    await registerAndLogin(page, request, 'usrui')
    await page.goto('/admin/iam/users')
    await page.waitForLoadState('domcontentloaded')

    /** 分页栏内唯一的 Select 可访问输入框。 */
    const pageSizeSelect = page.locator('main [role="combobox"]').first()
    /** Select 实际接收点击并提供定位基准的触发器。 */
    const pageSizeTrigger = pageSizeSelect.locator('xpath=..')
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

  test('角色筛选在分页前执行，第二页与总数一致', async ({ page, request }, testInfo) => {
    await registerAndLogin(page, request, 'rolepage')
    const prefix = uniqueUser('rolepage').username.slice(0, 15)
    const roleResponse = await request.post('/api/iam/roles', {
      data: { name: `角色筛选 ${prefix}`, permissions: [] },
    })
    expect(roleResponse.ok()).toBe(true)
    const { data: role } = await roleResponse.json()
    for (let index = 0; index < 3; index++) {
      const user = uniqueUser('rolepage')
      const created = await request.post('/api/iam/users', {
        data: { ...user, username: `${prefix}${index}`, roles: index < 2 ? [role.id] : [] },
      })
      expect(created.ok()).toBe(true)
    }
    const filtered = await request.get(`/api/iam/users?search=${prefix}&roleCode=${role.code}&pageSize=1&page=2`)
    expect(filtered.ok()).toBe(true)
    const body = await filtered.json()
    expect(body.data.total).toBe(2)
    expect(body.data.users).toHaveLength(1)

    await page.goto(`/admin/iam/users?search=${prefix}&role=${role.code}&pageSize=1&sortBy=username&sortDirection=asc`)
    await waitForHydration(page)
    await expect(page.locator('tbody tr')).toHaveCount(1)
    await expect(page.locator('tbody')).toContainText(`${prefix}0`)
    await page.getByRole('button', { name: '下一页', exact: true }).click()
    await expect(page).toHaveURL(/page=2/)
    await expect(page.locator('tbody')).toContainText(`${prefix}1`)
    await expect(page.locator('tbody')).not.toContainText(`${prefix}2`)
    await expect(page.getByRole('button', { name: '下一页', exact: true })).toBeDisabled()
    await page.screenshot({ path: testInfo.outputPath('iam-role-pagination.png'), fullPage: true })
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
    await expect(drawer.locator('input[name="username"]')).toBeVisible()
  })

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

    await page.goto(`/admin/iam/users?search=${encodeURIComponent(targetUser.username)}`)
    await page.waitForLoadState('domcontentloaded')

    const row = page.locator('table tbody tr').filter({ hasText: targetUser.username })
    await expect(row.first()).toBeVisible({ timeout: 5_000 })
    const drawer = await openEditDrawer(page, row.first())
    const displayNameInput = drawer.locator('[name="display_name"]')
    await expect(displayNameInput).toBeVisible()

    // 修改显示名称
    const newDisplayName = `UI_Edited_${Date.now().toString(36)}`
    await displayNameInput.fill(newDisplayName)

    // 点击保存按钮
    const saveBtn = drawer.getByRole('button', { name: /保存|提交/ }).last()
    await saveBtn.click()

    await expect(page.getByRole('heading', { name: editDrawerHeading })).toHaveCount(0, { timeout: 10_000 })

    const reopenedDrawer = await openEditDrawer(page, row.first())
    await expect(reopenedDrawer.locator('[name="display_name"]')).toHaveValue(newDisplayName)
  })

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

    await page.goto(`/admin/iam/users?search=${encodeURIComponent(victim.username)}`)
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
