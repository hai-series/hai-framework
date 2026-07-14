/**
 * @h-ai/ui — 图表主题色单元测试
 *
 * 验证 resolveChartColors 在各种输入下的行为：显式颜色保留、
 * 缺失颜色自动补齐、以及 DaisyUI 5 CSS 变量引用的正确性。
 */

import { describe, expect, it } from 'vitest'
import { DAISYUI_CHART_COLORS, resolveChartColors } from '../src/lib/components/scenes/charts/chart-theme.js'

/** 图表主题色测试套件 */
describe('chart-theme', () => {
  /** 只有缺少 color 的系列才被补齐，已指定颜色的系列保持原样。 */
  it('assigns DaisyUI colors only to series without explicit colors', () => {
    const result = resolveChartColors([
      { key: 'revenue' },
      { key: 'cost', color: '#123456' },
      { key: 'profit' },
    ])

    expect(result).toEqual([
      { key: 'revenue', color: DAISYUI_CHART_COLORS[0] },
      { key: 'cost', color: '#123456' },
      { key: 'profit', color: DAISYUI_CHART_COLORS[2] },
    ])
  })

  /** 传入 undefined 时返回 undefined，让 LayerChart 自行使用默认颜色。 */
  it('keeps undefined series absent so LayerChart defaults remain available', () => {
    expect(resolveChartColors()).toBeUndefined()
  })

  /** 颜色值使用 CSS 变量引用，确保 DaisyUI 主题切换时图表自动跟随。 */
  it('uses DaisyUI 5 color variables so theme switching updates charts', () => {
    expect(DAISYUI_CHART_COLORS[0]).toBe('var(--color-primary)')
    expect(DAISYUI_CHART_COLORS[1]).toBe('var(--color-secondary)')
  })
})
