import { expect, test } from '@playwright/test'
import { registerAndLogin, waitForHydration } from './helpers'

test.describe('IAM Roles UI', () => {
  const editPanelHeading = /编辑角色管理|编辑角色/

  function getPanelShell(target: import('@playwright/test').Locator) {
    return target.locator('xpath=ancestor::*[contains(@class, "hai-modal__panel") or contains(@class, "menu")]').first()
  }

  async function openCreatePanel(page: import('@playwright/test').Page) {
    await waitForHydration(page)
    const createBtn = page.locator('main').getByRole('button', { name: /新建|创建|添加/ })

    await expect(createBtn.first()).toBeVisible()
    await expect(createBtn.first()).toBeEnabled()

    for (let attempt = 0; attempt < 2; attempt++) {
      await createBtn.first().click({ force: true })
      try {
        const nameInput = page.locator('[name="name"]:visible').last()
        await expect(nameInput).toBeVisible({ timeout: 3_000 })
        return getPanelShell(nameInput)
      }
      catch (error) {
        if (attempt === 1) {
          throw error
        }
      }
    }

    return getPanelShell(page.locator('[name="name"]:visible').last())
  }

  async function openEditPanel(
    page: import('@playwright/test').Page,
    row: import('@playwright/test').Locator,
  ) {
    await waitForHydration(page)
    const heading = page.getByRole('heading', { name: editPanelHeading }).last()
    const editButton = row.getByRole('button', { name: /编辑|Edit/ })

    for (let attempt = 0; attempt < 2; attempt++) {
      await editButton.click()
      try {
        await expect(heading).toBeVisible({ timeout: 3_000 })
        return getPanelShell(heading)
      }
      catch (error) {
        if (attempt === 1) {
          throw error
        }
      }
    }

    return getPanelShell(heading)
  }

  test('通过面板创建角色后出现在表格列表中', async ({ page, request }) => {
    await registerAndLogin(page, request, 'roleui')
    const roleName = `role_${Date.now().toString(36)}`
    const roleDesc = 'E2E 测试创建的角色'
    await page.goto(`/admin/iam/roles?search=${encodeURIComponent(roleName)}`)

    // 打开新建面板
    const panel = await openCreatePanel(page)

    // 填写表单
    await panel.locator('[name="name"]').fill(roleName)
    await panel.locator('[name="description"]').fill(roleDesc)

    // 回车走与底部保存按钮一致的校验和提交路径。
    await panel.locator('[name="name"]').press('Enter')

    // 新角色出现在表格中
    const row = page.locator('tbody tr').filter({ hasText: roleName })
    await expect(row.first()).toBeVisible({ timeout: 10_000 })
  })

  test('通过面板编辑角色描述', async ({ page, request }) => {
    await registerAndLogin(page, request, 'roleui')

    // 先通过 API 创建一个角色
    const roleName = `edit_${Date.now().toString(36)}`
    await request.post('/api/iam/roles', {
      data: { name: roleName, description: 'original', permissions: [] },
    })

    await page.goto(`/admin/iam/roles?search=${encodeURIComponent(roleName)}`)
    await page.waitForLoadState('domcontentloaded')

    // 找到角色表格行并点击编辑
    const row = page.locator('tbody tr').filter({ hasText: roleName })
    await expect(row.first()).toBeVisible({ timeout: 5_000 })
    const panel = await openEditPanel(page, row.first())
    await expect(panel.locator('[name="description"]')).toBeVisible()

    // 修改描述
    const newDesc = 'UI 编辑后的描述'
    await panel.locator('[name="description"]').fill(newDesc)

    // 点击保存
    const saveBtn = panel.getByRole('button', { name: /保存|提交/ }).last()
    await saveBtn.click()

    // 面板应关闭
    await expect(page.getByRole('heading', { name: editPanelHeading })).toHaveCount(0, { timeout: 10_000 })
  })

  test('通过 UI 删除自定义角色', async ({ page, request }) => {
    await registerAndLogin(page, request, 'roleui')

    // 先通过 API 创建一个角色
    const roleName = `del_${Date.now().toString(36)}`
    await request.post('/api/iam/roles', {
      data: { name: roleName, description: 'to be deleted', permissions: [] },
    })

    await page.goto(`/admin/iam/roles?search=${encodeURIComponent(roleName)}`)
    await page.waitForLoadState('domcontentloaded')

    // 找到角色所在的表格行
    const row = page.locator('tbody tr').filter({ hasText: roleName })
    await expect(row.first()).toBeVisible({ timeout: 5_000 })
    await waitForHydration(page)

    // 点击删除
    const deleteBtn = row.first().getByRole('button', { name: /删除|Delete/ })
    await deleteBtn.click()

    // 确认删除
    await page.locator('dialog[open]').getByRole('button', { name: /删除|Delete/ }).click()

    // 角色应从列表中消失
    await expect(row.first()).not.toBeVisible({ timeout: 10_000 })
  })
})
