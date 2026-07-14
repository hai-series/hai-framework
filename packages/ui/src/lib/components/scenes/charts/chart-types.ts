/**
 * @h-ai/ui — 图表组件类型定义
 *
 * 统一 Chart 只定义 @h-ai/ui 自身需要的轻量语义，其他字段通过索引签名透传给 LayerChart。
 * @module chart-types
 */

import type { DataAttributes } from '../../../types.js'

/** 图表数据单元允许的原子值，和 LayerChart 常见 accessor 输入保持一致。 */
export type ChartDataValue = string | number | Date

/** 图表数据项；每个字段都可被 x/y/key/value 等 accessor 引用。 */
export type ChartDataItem = Record<string, ChartDataValue>

/** LayerChart accessor 的常用子集，用于 series.value 等透传配置。 */
export type ChartAccessor = string | number | ((item: ChartDataItem) => unknown) | ChartAccessor[] | null | undefined

/** 统一 Chart 支持的高阶图表类型。 */
export type ChartType = 'bar' | 'line' | 'area' | 'pie' | 'scatter'

/** Chart 预设高度档位；具体像素值在 Chart.svelte 中固定映射。 */
export type ChartSize = 'sm' | 'md' | 'lg'

/** 折线图渲染变体；default 保持 LayerChart 原生渲染，segmented-point 提供分段线 + 圆点样式。 */
export type ChartLineVariant = 'default' | 'segmented-point'

/** 折线图 tooltip 触发方式；nearest 会在绘图区内吸附最近数据点。 */
export type ChartTooltipMode = 'default' | 'nearest'

export interface ChartSeries {
  /** 系列稳定标识；宽表数据通常对应数据项中的数值字段名。 */
  key: string
  /** 系列展示名称；不传时 LayerChart 会按 key 或 value accessor 回退。 */
  label?: string
  /** 系列颜色；不传时由 @h-ai/ui 按 DaisyUI 主题色顺序补齐。 */
  color?: string
  /** LayerChart 原生 value accessor，用于覆盖默认按 key 取值的行为。 */
  value?: ChartAccessor
  /** LayerChart 原生独立数据源，用于 long format 或每个系列不同数据的场景。 */
  data?: ChartDataItem[]
  /** 系列初始可见状态；透传给 LayerChart legend/series 状态管理。 */
  selected?: boolean
  /** 传给 LayerChart 内部 mark 组件的原生 props，例如 Bars/Spline/Arc/Points props。 */
  props?: Record<string, unknown>
  /** 单系列最大值；主要用于饼图等需要上限语义的 LayerChart 配置。 */
  maxValue?: number
  /** 保留 LayerChart 新增 series 字段的透传能力，避免薄包装层限制底层 API。 */
  [key: string]: unknown
}

export interface ChartProps extends DataAttributes {
  /** 选择内部 LayerChart 高阶组件；必填。 */
  type: ChartType
  /** 图表数据源；空数组会触发内置空态。 */
  data: ChartDataItem[]
  /** x 轴字段名；饼图中默认映射为 key 和 label。 */
  x: string
  /** y 轴字段名；传数组时会自动生成多系列配置。 */
  y: string | string[]
  /** 系列配置；未指定 color 的项会按 DaisyUI 主题色补齐。 */
  series?: ChartSeries[]
  /** LayerChart 原生 orientation；主要用于柱状图和折线图方向控制。 */
  orientation?: 'horizontal' | 'vertical'
  /** 折线图渲染变体；仅 type='line' 时生效，默认透传 LayerChart。 */
  lineVariant?: ChartLineVariant
  /** 折线图 tooltip 触发方式；nearest 会在整块绘图区内吸附最近点。 */
  tooltipMode?: ChartTooltipMode
  /** 折线图是否显示随 hover 变化的竖向参考线；仅 segmented-point 变体生效。 */
  showCrosshair?: boolean
  /** 折线图是否显示数据点圆点；仅 segmented-point 变体生效，默认显示。 */
  showPoints?: boolean
  /** @h-ai/ui 预设尺寸；未显式传 LayerChart height 时映射为固定高度。 */
  size?: ChartSize
  /** 图表标题；不传时不渲染标题区域。 */
  title?: string
  /** 图表说明；不传时不渲染说明文本。 */
  description?: string
  /** 加载状态；为 true 时仅显示 DaisyUI loading spinner。 */
  loading?: boolean
  /** 强制空态；为 true 或 data 为空时显示空数据提示。 */
  empty?: boolean
  /** 外层容器类名；用于布局，不会覆盖 LayerChart 内部配置。 */
  class?: string
  /** 其他所有字段会原样透传给当前 type 对应的 LayerChart 组件。 */
  [key: string]: unknown
}
