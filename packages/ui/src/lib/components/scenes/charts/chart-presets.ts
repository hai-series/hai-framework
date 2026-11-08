/** @h-ai/ui — 常用图表预设，仅定义默认值，调用方原生配置优先。 @module chart-presets */
import type { ChartPreset, ChartType } from './chart-types.js'

/**
 * 解析预设，不读取或转换业务数据。
 * @param preset - 可选预设名称。
 * @returns 图形类型及可被调用方覆盖的默认属性。
 * @example 模块内部上下文
 * ```ts
 * const preset = resolveChartPreset('donut')
 * ```
 */
export function resolveChartPreset(preset?: ChartPreset): { type?: ChartType, props: Record<string, unknown> } {
  switch (preset) {
    case 'grouped-bar': return {
      type: 'bar',
      props: {
        seriesLayout: 'group',
        axis: true,
        grid: true,
        legend: true,
      },
    }
    case 'stacked-bar': return {
      type: 'bar',
      props: {
        seriesLayout: 'stack',
        axis: true,
        grid: true,
        legend: true,
      },
    }
    case 'stacked-area': return {
      type: 'area',
      props: {
        seriesLayout: 'stack',
        axis: true,
        grid: true,
        legend: true,
      },
    }
    case 'donut': return {
      type: 'pie',
      props: { innerRadius: 0.65, legend: true },
    }
    case 'sparkline': return {
      type: 'line',
      props: {
        axis: false,
        grid: false,
        legend: false,
        points: false,
        padding: { top: 4, right: 0, bottom: 4, left: 0 },
        height: 64,
      },
    }
    default: return { props: {} }
  }
}
