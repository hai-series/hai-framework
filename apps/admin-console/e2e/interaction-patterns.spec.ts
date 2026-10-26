import { expect, test } from '@playwright/test'
import { dutyAccounts, loginOnPage, registerAndLogin, waitForHydration } from './helpers'

test('列表示例的键盘、排序、分页、筛选和错误恢复可连续操作', async ({ page, request }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 1440, height: 1000 })
  await registerAndLogin(page, request, 'interaction')
  await page.goto('/admin/ui-gallery/compounds')
  await waitForHydration(page)
  const demo = page.getByTestId('interaction-patterns')
  const ready = demo.getByRole('tab', { name: '正常', exact: true })
  await ready.focus()
  await ready.press('ArrowRight')
  await expect(demo.getByRole('tab', { name: '加载', exact: true })).toBeFocused()
  await expect(demo.getByRole('table')).toHaveAttribute('aria-busy', 'true')
  await expect(demo.getByRole('status')).toContainText('正在加载')
  await demo.getByRole('tab', { name: '加载', exact: true }).press('End')
  await expect(demo.getByRole('alert')).toContainText('记录暂时无法加载')
  await demo.getByRole('button', { name: '重试', exact: true }).click()
  const nameHeader = demo.getByRole('columnheader', { name: '名称' })
  await expect(nameHeader).toHaveAttribute('aria-sort', 'ascending')
  await nameHeader.getByRole('button').press('Enter')
  await expect(nameHeader).toHaveAttribute('aria-sort', 'descending')
  await demo.getByRole('button', { name: '下一页', exact: true }).click()
  await expect(demo.getByLabel('跳转到页')).toHaveValue('2')
  const filter = demo.getByRole('button', { name: '筛选', exact: true })
  await filter.click()
  await expect(demo.getByRole('dialog').locator('select')).toBeFocused()
  await demo.getByRole('dialog').locator('select').press('Escape')
  await expect(filter).toBeFocused()
  await expect(demo.getByRole('dialog')).toHaveCount(0)
  await demo.getByRole('button', { name: '卡片视图', exact: true }).click()
  await expect(demo.getByRole('button', { name: '卡片视图', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(demo.getByRole('table')).toHaveCount(0)
  await demo.getByRole('button', { name: '表格视图', exact: true }).click()
  await demo.getByRole('tab', { name: '空态', exact: true }).click()
  await expect(demo.getByRole('heading', { name: '没有匹配的记录' })).toBeVisible()
  await expect(demo.getByLabel('跳转到页')).toHaveValue('1')
  await demo.getByRole('button', { name: '清除筛选', exact: true }).click()
  await expect(demo.getByRole('table').locator('tbody tr')).toHaveCount(10)
  await demo.screenshot({ path: testInfo.outputPath('interaction-desktop.png'), animations: 'disabled' })
  expect(errors).toEqual([])
})

test.describe('触摸、主题、语言和减少动态效果', () => {
  test.use({ hasTouch: true })

  for (const locale of [
    { id: 'zh', choice: '', ready: '正常', empty: '空态', filter: '筛选', next: '下一页' },
    { id: 'en', choice: 'English', ready: 'Ready', empty: 'Empty', filter: 'Filter', next: 'Next page' },
    { id: 'ja', choice: '日本語', ready: '通常', empty: '空の結果', filter: '絞り込み', next: '次のページ' },
  ]) {
    // 主题各自保留完整宽度矩阵，避免全部高分辨率截图挤在一个用例的总时限内。
    for (const theme of ['light', 'dark']) {
      test(`实际布局与焦点：${locale.id} / ${theme}`, async ({ page }, testInfo) => {
        await loginOnPage(page, dutyAccounts.config.username, dutyAccounts.config.password)
        if (locale.choice) {
          await page.goto('/admin/settings')
          await waitForHydration(page)
          await page.getByRole('button', { name: /区域|Region/ }).click()
          await page.getByRole('button', { name: /切换语言|Switch language/ }).last().click()
          await page.locator('.dropdown-content').getByRole('button', { name: new RegExp(locale.choice) }).click()
        }
        await page.goto('/admin/ui-gallery/compounds')
        await waitForHydration(page)
        await page.emulateMedia({ reducedMotion: 'reduce' })
        const demo = page.getByTestId('interaction-patterns')
        for (const width of locale.id === 'zh' ? [390, 1440, 1920, 2560, 3840] : [390, 1440]) {
          await page.setViewportSize({ width, height: 1000 })
          await page.evaluate(themeName => document.documentElement.setAttribute('data-theme', themeName), theme)
          await demo.getByRole('tab', { name: locale.empty, exact: true }).click()
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
          if (width >= 1920)
            expect((await demo.boundingBox())!.width).toBeGreaterThan(width - 400)
          await demo.screenshot({ path: testInfo.outputPath(`interaction-${locale.id}-${theme}-${width}.png`), animations: 'disabled' })
          await demo.getByRole('tab', { name: locale.ready, exact: true }).click()
          await demo.getByRole('button', { name: locale.filter, exact: true }).click()
          const select = demo.getByRole('dialog').locator('select')
          await expect(select).toBeFocused()
          const focus = await select.evaluate(element => ({ width: getComputedStyle(element).outlineWidth, style: getComputedStyle(element).outlineStyle, color: getComputedStyle(element).outlineColor }))
          expect(Number.parseFloat(focus.width)).toBeGreaterThanOrEqual(2)
          expect(focus.style).toBe('solid')
          expect(focus.color).not.toBe('rgba(0, 0, 0, 0)')
          const panel = await demo.getByRole('dialog').boundingBox()
          expect(panel!.x).toBeGreaterThanOrEqual(0)
          expect(panel!.x + panel!.width).toBeLessThanOrEqual(width)
          await demo.screenshot({ path: testInfo.outputPath(`interaction-filter-${locale.id}-${theme}-${width}.png`), animations: 'disabled' })
          await select.press('Escape')
          const next = demo.getByRole('button', { name: locale.next, exact: true })
          const box = await next.boundingBox()
          expect(box!.height).toBeGreaterThanOrEqual(44)
          expect(box!.width).toBeGreaterThanOrEqual(44)
        }
        expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe('auto')
        const duration = await demo.evaluate((element) => {
          element.classList.add('hai-fade-in')
          return Number.parseFloat(getComputedStyle(element).animationDuration)
        })
        expect(duration).toBeLessThan(0.001)
      })
    }
  }
})
