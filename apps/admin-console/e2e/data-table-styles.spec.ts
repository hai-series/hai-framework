import { expect, test } from '@playwright/test'
import { registerAndLogin, waitForHydration } from './helpers'

test('DataTable默认斑马纹在明暗主题中保留奇偶底色，固定操作格与悬停同步', async ({ page, request }, testInfo) => {
  await registerAndLogin(page, request, 'stripes')
  await page.goto('/admin/ui-gallery/compounds')
  await waitForHydration(page)
  const card = page.getByRole('heading', { name: /^DataTable\s/ }).locator('..').locator('..').locator('..')
  const table = card.getByRole('table').first()
  const rows = table.locator('tbody tr')
  await expect(rows.nth(1)).toBeVisible()

  for (const theme of ['light', 'dark']) {
    // 样式用例直接设置真实主题条件；主题切换交互由compact-workspace单独验证。
    await page.locator('html').evaluate((element, theme) => element.setAttribute('data-theme', theme), theme)
    await page.mouse.move(0, 0)
    const firstCell = rows.first().locator('td').first()
    const secondCell = rows.nth(1).locator('td').first()
    const firstBackground = await firstCell.evaluate(cell => getComputedStyle(cell).backgroundColor)
    const secondBackground = await secondCell.evaluate(cell => getComputedStyle(cell).backgroundColor)
    expect(firstBackground, `${theme}: 第一行有不透明底色`).not.toBe('rgba(0, 0, 0, 0)')
    expect(secondBackground, `${theme}: 偶数行有独立底色`).not.toBe(firstBackground)
    await expect(rows.first().locator('td').last()).toHaveCSS('background-color', firstBackground)
    await expect(rows.nth(1).locator('td').last()).toHaveCSS('background-color', secondBackground)
    await expect(rows.first().locator('td').last()).toHaveCSS('position', 'sticky')

    for (const [index, background] of [firstBackground, secondBackground].entries()) {
      const row = rows.nth(index)
      await row.hover()
      const hovered = await row.locator('td').first().evaluate(cell => getComputedStyle(cell).backgroundColor)
      expect(hovered, `${theme}: 第${index + 1}行悬停有反馈`).not.toBe(background)
      await expect(row.locator('td').last()).toHaveCSS('background-color', hovered)
    }
    await page.mouse.move(0, 0)
    await expect(secondCell).toHaveCSS('background-color', secondBackground)
    await table.screenshot({ path: testInfo.outputPath(`data-table-striped-${theme}.png`) })
  }
})
