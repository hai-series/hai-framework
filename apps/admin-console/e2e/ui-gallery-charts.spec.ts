/**
 * =============================================================================
 * E2E 测试 - UI Gallery / Charts
 * =============================================================================
 */

import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { registerAndLogin } from './helpers'

test.describe('UI Gallery Charts', () => {
  test('看板周期、五种预设、状态和原生图形按需加载可用', async ({ page, request }) => {
    await registerAndLogin(page, request, 'dashui')
    // 生产分块文件名含构建 hash，按本轮产物解析，不假定保留组件名。
    const manifest = JSON.parse(readFileSync(new URL('../.svelte-kit/output/client/.vite/manifest.json', import.meta.url), 'utf8')) as Record<string, { file: string }>
    const nativeChunk = manifest['src/lib/components/gallery/NativeGauge.svelte']?.file
    expect(nativeChunk).toBeTruthy()
    const scripts: string[] = []
    page.on('request', (req) => {
      if (req.resourceType() === 'script')
        scripts.push(req.url())
    })
    await page.goto('/admin/ui-gallery/charts')
    await expect(page.getByTestId('dashboard-reports').getByRole('figure').first()).toBeVisible()
    const original = await page.getByTestId('revenue-metric').textContent()
    await page.getByTestId('dashboard-period').getByRole('combobox').click()
    await page.getByRole('option', { name: '本季度', exact: true }).click()
    await expect(page.getByTestId('revenue-metric')).not.toHaveText(original ?? '')
    for (const label of ['堆叠柱状', '堆叠面积', '环形占比', '迷你趋势', '分组柱状']) {
      await page.getByTestId('chart-preset').getByRole('combobox').click()
      await page.getByRole('option', { name: label, exact: true }).click()
      await expect(page.getByTestId('preset-report').getByRole('figure').first()).toBeVisible()
    }
    await page.getByTestId('report-state').getByRole('combobox').click()
    await page.getByRole('option', { name: '无数据', exact: true }).click()
    await expect(page.getByTestId('report-state-preview').getByText('暂无数据', { exact: true })).toBeVisible()
    await expect(page.getByTestId('report-state-preview').locator('.hai-chart')).toHaveCount(0)
    await page.getByTestId('report-state').getByRole('combobox').click()
    await page.getByRole('option', { name: '加载中', exact: true }).click()
    await expect(page.getByTestId('report-state-preview').getByRole('status')).toBeVisible()
    await page.getByTestId('report-state').getByRole('combobox').click()
    await page.getByRole('option', { name: '正常', exact: true }).click()
    await expect(page.getByTestId('report-state-preview').getByRole('figure').first()).toBeVisible()
    expect(scripts.some(url => url.includes(nativeChunk!))).toBe(false)
    await page.getByTestId('load-native-chart').click()
    await expect(page.getByTestId('native-gauge').getByRole('figure')).toBeVisible()
    expect(scripts.some(url => url.includes(nativeChunk!))).toBe(true)
  })

  test('看板的响应式、三语与主题截图验收', async ({ page, request }, testInfo) => {
    test.setTimeout(60_000)
    await registerAndLogin(page, request, 'dashshot')
    await page.goto('/admin/ui-gallery/charts')
    const charts = page.getByTestId('dashboard-reports').locator('.hai-chart')
    await expect(charts).toHaveCount(4)
    for (const chart of await charts.all())
      await expect(chart.getByRole('figure').first()).toBeVisible()
    for (const width of [390, 1440, 1920, 2560, 3840]) {
      await page.setViewportSize({ width, height: 1100 })
      // 等待侧栏断点动画结束，并复位实际滚动容器，避免把中间帧当作截图验收。
      await expect.poll(() => page.locator('aside').evaluate(element => element.getBoundingClientRect().right)).toBe(width === 390 ? 0 : 240)
      await page.getByRole('main').evaluate((element) => {
        element.scrollTop = 0
      })
      await expect(page.getByTestId('revenue-metric')).toBeInViewport()
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      const columns = await page.getByTestId('dashboard-metrics').locator('.hai-dashboard-grid__items').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length)
      expect(columns).toBe(width === 390 ? 1 : 4)
      const cardBounds = await page.locator('.hai-metric-card, .hai-report-card').evaluateAll(elements => elements.map((element) => {
        const rect = element.getBoundingClientRect()
        return { left: rect.left, right: rect.right }
      }))
      expect(cardBounds.every(bounds => bounds.left >= 0 && bounds.right <= width + 1)).toBe(true)
      await page.screenshot({ path: testInfo.outputPath(`dashboard-light-${width}.png`), animations: 'disabled' })
      if (width === 390) {
        await page.getByTestId('dashboard-reports').locator('.hai-report-card').nth(0).screenshot({ path: testInfo.outputPath('dashboard-mobile-bars.png'), animations: 'disabled' })
        await page.getByTestId('dashboard-reports').locator('.hai-report-card').nth(1).screenshot({ path: testInfo.outputPath('dashboard-mobile-donut.png'), animations: 'disabled' })
      }
    }
    await page.setViewportSize({ width: 1440, height: 1100 })
    for (const [locale, title] of [['en-US', 'Business overview'], ['ja-JP', '経営概況'], ['zh-CN', '经营概览']]) {
      await page.context().addCookies([{ name: 'PARAGLIDE_LOCALE', value: locale!, url: new URL(page.url()).origin }])
      await page.reload()
      await page.getByRole('main').evaluate((element) => {
        element.scrollTop = 0
      })
      await expect(page.getByRole('heading', { name: title!, exact: true })).toBeVisible()
      await expect(page.getByTestId('dashboard-reports').getByRole('figure').first()).toBeVisible()
      await page.locator('[data-guide="admin-theme"] button').first().click()
      await page.locator('[data-theme-option="dark"]').click()
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
      await page.screenshot({ path: testInfo.outputPath(`dashboard-dark-${locale}.png`), animations: 'disabled' })
    }
    await page.getByTestId('load-native-chart').click()
    await expect(page.getByTestId('native-gauge').getByRole('figure')).toBeVisible()
    await page.getByTestId('native-gauge').screenshot({ path: testInfo.outputPath('native-layerchart-gauge.png'), animations: 'disabled' })
  })

  test('分段折线图首次移入点间区域时显示最近点 tooltip 和竖线', async ({ page, request }) => {
    await registerAndLogin(page, request, 'chartui')
    await page.goto('/admin/ui-gallery/charts')
    await page.waitForLoadState('domcontentloaded')

    const chart = page.locator('.hai-segmented-line-chart').first()
    const hitArea = chart.locator('.hai-segmented-line-chart__hit-area')
    await expect(hitArea).toBeVisible()
    await hitArea.scrollIntoViewIfNeeded()

    const bounds = await hitArea.boundingBox()
    expect(bounds).not.toBeNull()
    if (!bounds)
      return

    // 从图外直接进入点间区域，覆盖只有 pointermove、首次进入不显示的回归场景。
    await page.mouse.move(0, 0)
    await page.mouse.move(bounds.x + bounds.width * 0.36, bounds.y + bounds.height * 0.5)

    const tooltip = chart.locator('.hai-segmented-line-chart__tooltip')
    const crosshair = chart.locator('.hai-segmented-line-chart__crosshair')
    await expect(tooltip).toBeVisible()
    await expect(crosshair).toHaveCount(1)

    const crosshairStyle = await crosshair.evaluate((element) => {
      const line = element as SVGLineElement
      const style = window.getComputedStyle(line)

      return {
        stroke: style.stroke,
        y1: line.y1.baseVal.value,
        y2: line.y2.baseVal.value,
      }
    })
    expect(crosshairStyle.stroke).not.toBe('none')
    expect(crosshairStyle.stroke).not.toBe('transparent')
    expect(crosshairStyle.y2).toBeGreaterThan(crosshairStyle.y1)

    const initialTooltip = await tooltip.textContent()
    const initialCrosshairX = await crosshair.getAttribute('x1')
    await page.mouse.move(bounds.x + bounds.width * 0.68, bounds.y + bounds.height * 0.5)

    await expect(tooltip).not.toHaveText(initialTooltip)
    await expect(crosshair).not.toHaveAttribute('x1', initialCrosshairX ?? '')
  })
})
