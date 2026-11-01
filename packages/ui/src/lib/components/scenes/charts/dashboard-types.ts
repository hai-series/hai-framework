/** @h-ai/ui — 轻量看板组件契约。 @module dashboard-types */
import type { Snippet } from 'svelte'
import type { DataAttributes } from '../../../types.js'

/**
 * 指标卡展示数据；百分比变化由业务计算，正负方向与业务好坏分别表达。
 * @example
 * ```ts
 * import type { MetricCardProps } from '@h-ai/ui'
 * const metric: MetricCardProps = { title: 'Revenue', value: '128,430', unit: 'CNY', trend: 12.8, trendLabel: 'vs previous month', trendTone: 'success' }
 * ```
 */
export interface MetricCardProps extends DataAttributes {
  /** 指标名称，由应用提供翻译。 */
  title: string
  /** 已格式化文本或数值；缺失和非有限数显示占位符，零值正常显示。 */
  value?: string | number | null
  /** 单位文本。 */
  unit?: string
  /** 变化百分数，例如 12.8 表示 +12.8%，不是 0.128。 */
  trend?: number
  /** 比较基准，例如“较上月”。 */
  trendLabel?: string
  /** 业务语义色；默认 neutral，下降也可以是 success。 */
  trendTone?: 'success' | 'warning' | 'error' | 'neutral'
  /** 辅助说明。 */
  description?: string
  /** 加载时隐藏旧数值及趋势内容。 */
  loading?: boolean
  /** 可选趋势图或其他补充内容；未提供时不加载图形引擎。 */
  children?: Snippet
  /** 外层样式。 */
  class?: string
}

/**
 * 报表卡片负责布局和状态，children 可放统一 Chart 或任意 LayerChart 原生组件。
 * @example
 * ```ts
 * import type { ReportCardProps } from '@h-ai/ui'
 * const report: ReportCardProps = { title: 'Revenue trend', description: 'Monthly totals', loading: false }
 * ```
 */
export interface ReportCardProps extends DataAttributes {
  /** 卡片标题。 */
  title: string
  /** 标题下的说明。 */
  description?: string
  /** 标题旁的操作区域。 */
  actions?: Snippet
  /** 报表或原生图形内容。 */
  children?: Snippet
  /** 可选页脚。 */
  footer?: Snippet
  /** 加载状态；保留卡片高度，不挂载图形。 */
  loading?: boolean
  /** 空态；不挂载图形。 */
  empty?: boolean
  /** 状态区域的最小高度，默认 240 像素。 */
  minHeight?: number
  /** 外层样式。 */
  class?: string
}

/**
 * 看板的响应式网格，按容器宽度收拢，children 保持 DOM 阅读顺序。
 * @example
 * ```ts
 * import type { DashboardGridProps } from '@h-ai/ui'
 * const grid: DashboardGridProps = { label: 'Key metrics', columns: 4 }
 * ```
 */
export interface DashboardGridProps extends DataAttributes {
  /** 网格的无障碍名称。 */
  label: string
  /** 宽容器列数；窄容器一列，中等容器最多两列。 */
  columns?: 1 | 2 | 3 | 4
  /** 指标卡或报表卡。 */
  children?: Snippet
  /** 外层样式。 */
  class?: string
}
