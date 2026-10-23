/**
 * @h-ai/ui — 图表主题色
 *
 * 颜色保持 CSS 变量引用，避免在 JS 中读取主题并让 DaisyUI 主题切换自然生效。
 * @module chart-theme
 */

import type { ChartSeries } from './chart-types.js'

/**
 * 图表使用的 DaisyUI 语义 CSS 变量映射；切换主题时无需重新取色。
 *
 * @example 模块内部上下文
 * ```ts
 * const series = [{ key: 'sales', color: DAISYUI_CHART_THEME_COLORS.primary }]
 * ```
 */
export const DAISYUI_CHART_THEME_COLORS = {
  // primary 用作第一条主数据系列，跟随当前 DaisyUI 5 主题主色。
  primary: 'var(--color-primary)',
  // secondary 用作第二条系列，和 primary 拉开视觉层级。
  secondary: 'var(--color-secondary)',
  // accent 用作第三条系列，补充主题中的强调色。
  accent: 'var(--color-accent)',
  // success 用作正向或增长类系列，也作为常规调色板的一员。
  success: 'var(--color-success)',
  // warning 用作需要注意的系列，维持 DaisyUI 语义一致性。
  warning: 'var(--color-warning)',
  // error 用作异常或下降类系列，也可作为高对比补充色。
  error: 'var(--color-error)',
  // info 用作信息类系列，补足多系列图表的第七种主题色。
  info: 'var(--color-info)',
} as const

/**
 * DaisyUI 图表主题色按系列分配的稳定顺序。
 *
 * @example 模块内部上下文
 * ```ts
 * const firstColor = DAISYUI_CHART_COLORS[0]
 * const series = [{ key: 'sales', color: firstColor }]
 * ```
 */
export const DAISYUI_CHART_COLORS = [
  DAISYUI_CHART_THEME_COLORS.primary,
  DAISYUI_CHART_THEME_COLORS.secondary,
  DAISYUI_CHART_THEME_COLORS.accent,
  DAISYUI_CHART_THEME_COLORS.success,
  DAISYUI_CHART_THEME_COLORS.warning,
  DAISYUI_CHART_THEME_COLORS.error,
  DAISYUI_CHART_THEME_COLORS.info,
] as const

/**
 * 为缺少 color 的系列补齐 DaisyUI 主题色。
 * 返回新数组，避免修改调用方传入的 series 对象。
 * @param series - 系列配置；缺失颜色按主题顺序补齐。
 * @returns 补齐主题色的新系列数组；不修改输入，未提供系列时返回 undefined。
 * @typeParam TSeries - 字段值或资源条目的数据类型。
 *
 * @example 模块内部上下文
 * ```ts
 * const series = resolveChartColors([{ key: 'sales', label: '销量' }, { key: 'cost', label: '成本', color: '#ef4444' }])
 * ```
 */
export function resolveChartColors<TSeries extends ChartSeries>(series?: readonly TSeries[]): TSeries[] | undefined {
  if (!series)
    return undefined

  return series.map((item, index) => ({
    ...item,
    color: item.color ?? DAISYUI_CHART_COLORS[index % DAISYUI_CHART_COLORS.length],
  }))
}
