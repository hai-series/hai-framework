/**
 * @h-ai/ui — 图表场景组件
 *
 * 导出统一 Chart、轻量看板组件和公共类型；内部 renderer 不对外暴露。
 * @module index
 */

export type { ChartDataItem, ChartLineVariant, ChartPreset, ChartProps, ChartSeries, ChartSize, ChartTooltipMode, ChartType } from './chart-types.js'
export { default as Chart } from './Chart.svelte'
export type { DashboardGridProps, MetricCardProps, ReportCardProps } from './dashboard-types.js'
export { default as DashboardGrid } from './DashboardGrid.svelte'
export { default as MetricCard } from './MetricCard.svelte'
export { default as ReportCard } from './ReportCard.svelte'
