import { expect, test } from '@playwright/test'
import { registerAndLogin, waitForHydration } from './helpers'

test.describe('IAM Permissions UI', () => {
  async function openCreatePanel(page: import('@playwright/test').Page) {
    await waitForHydration(page)
    const createBtn = page.locator('main').getByRole('button', { name: /新建|创建|添加/ })
    const resourceInput = page.locator('[name="resource"]:visible').last()

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

  test('通过抽屉创建权限后出现在列表中', async ({ page, request }) => {
    await registerAndLogin(page, request, 'permui')
    const ts = Date.now().toString(36)
    const resource = `res_${ts}`
    const action = 'read'
    const permissionName = `${resource}:${action}`
    await page.goto(`/admin/iam/permissions?search=${encodeURIComponent(permissionName)}`)

    // 打开新建抽屉
    const panel = await openCreatePanel(page)

    // 填写资源和操作
    await panel.locator('[name="resource"]').fill(resource)
    await panel.locator('[name="action"]').fill(action)
    // 名称保持空值，提交时按 resource:action 生成，客户端必填校验不应拦截。
    await expect(panel.locator('[name="name"]')).toHaveValue('')

    // 点击创建
    const submitBtn = panel.getByRole('button', { name: /创建|提交|新建/ }).last()
    const [createResponse] = await Promise.all([
      page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/api/iam/permissions')),
      submitBtn.click(),
    ])
    expect(createResponse.ok()).toBe(true)

    // 抽屉应关闭
    await expect(panel.locator('[name="resource"]')).not.toBeVisible({ timeout: 10_000 })

    // 新权限应出现在页面中（列表展示 name/code，不展示 resource 单列）
    const permRow = page.locator('tbody tr').filter({ hasText: permissionName })
    await expect(permRow.first()).toBeVisible({ timeout: 5_000 })
  })

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

    await page.goto(`/admin/iam/permissions?search=${encodeURIComponent(permName)}`)
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
