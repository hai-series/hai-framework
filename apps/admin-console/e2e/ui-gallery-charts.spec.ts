/**
 * =============================================================================
 * E2E 测试 - UI Gallery / Charts
 * =============================================================================
 */

import { expect, test } from '@playwright/test'
import { registerAndLogin } from './helpers'

test.describe('UI Gallery Charts', () => {
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
