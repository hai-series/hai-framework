/**
 * @h-ai/ui — 图表场景组件
 *
 * 仅导出统一 Chart 入口和公共类型；内部 renderer 不对外暴露。
 * @module index
 */

export type { ChartDataItem, ChartLineVariant, ChartProps, ChartSeries, ChartSize, ChartTooltipMode, ChartType } from './chart-types.js'
export { default as Chart } from './Chart.svelte'
