import { expect, test } from '@playwright/test'
import { loginOnPage, waitForHydration } from './helpers'

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`列表分页在空数据、少量数据和滚动时保留在底部 (${viewport.width})`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport)
    await loginOnPage(page, 'admin', 'admin123456')

    for (const state of ['few', 'empty', 'overflow']) {
      const route = state === 'overflow'
        ? '/admin/iam/permissions?pageSize=100'
        : `/admin/iam/users${state === 'empty' ? '?search=pagination-no-matching-user' : '?search=admin'}`
      await page.goto(route)
      await waitForHydration(page)
      const navigation = page.locator('.hai-pagination__navigation')
      await expect(navigation).toBeVisible()
      const table = page.locator('main table')
      await expect(table).toBeVisible()
      if (state === 'empty')
        await expect(table.locator('tbody td[colspan]')).toBeVisible()
      else
        expect(await table.locator('tbody tr').count()).toBeGreaterThan(0)

      // 用实际几何位置验证可用高度传递，避免只验证样式类。
      const bounds = await navigation.evaluate((element) => {
        const main = element.closest('main')!
        const pagination = element.parentElement!.parentElement!.parentElement!
        return {
          paginationBottom: pagination.getBoundingClientRect().bottom,
          contentBottom: main.getBoundingClientRect().bottom - Number.parseFloat(getComputedStyle(main).paddingBottom),
          mainScrollHeight: main.scrollHeight,
          mainHeight: main.clientHeight,
          pageWidth: document.documentElement.scrollWidth,
        }
      })
      expect(Math.abs(bounds.contentBottom - bounds.paginationBottom)).toBeLessThanOrEqual(2)
      expect(bounds.mainScrollHeight).toBeLessThanOrEqual(bounds.mainHeight + 2)
      expect(bounds.pageWidth).toBeLessThanOrEqual(viewport.width)

      if (state === 'overflow') {
        const scroll = table.locator('..')
        const dimensions = await scroll.evaluate(element => ({ height: element.clientHeight, content: element.scrollHeight }))
        expect(dimensions.content).toBeGreaterThan(dimensions.height)
        const before = await navigation.boundingBox()
        await scroll.evaluate(element => element.scrollTo(0, element.scrollHeight))
        await expect(table.locator('tbody tr').last()).toBeVisible()
        expect((await navigation.boundingBox())!.y).toBe(before!.y)
      }
      await page.screenshot({ path: testInfo.outputPath(`pagination-${state}-${viewport.width}.png`), fullPage: true })
    }
  })
}
