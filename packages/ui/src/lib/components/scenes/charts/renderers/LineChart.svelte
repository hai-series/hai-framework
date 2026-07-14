<!--
  =============================================================================
  @h-ai/ui - LineChart 内部渲染器
  =============================================================================
  对 LayerChart LineChart 的薄包装，仅做类型收窄和统一导入路径。
  不对外暴露；由 Chart.svelte 按 type='line' 内部路由调用。
  =============================================================================
-->
<script lang='ts'>
  import type { LineChartProps } from 'layerchart'
  import type {
    ChartAccessor,
    ChartDataItem,
    ChartLineVariant,
    ChartSeries,
    ChartTooltipMode,
  } from '../chart-types.js'
  import { LineChart as LayerLineChart } from 'layerchart'

  interface SegmentedLinePoint {
    /** 横轴展示标签，来源于 Chart 的 x accessor。 */
    label: string
    /** 当前系列在该横轴位置上的数值。 */
    value: number
  }

  interface SegmentedLineSeries {
    /** 系列稳定标识，优先来自 ChartSeries.key。 */
    key: string
    /** tooltip 和图例展示文案。 */
    label: string
    /** 折线、圆点和 tooltip 色标共用颜色。 */
    color: string
    /** 当前系列按 data 顺序解析后的点。 */
    points: SegmentedLinePoint[]
    /** 是否以虚线展示，适合辅助系列。 */
    dashed: boolean
  }

  interface SegmentedLineCoordinate extends SegmentedLinePoint {
    /** SVG viewBox 中的横向坐标。 */
    x: number
    /** SVG viewBox 中的纵向坐标。 */
    y: number
  }

  interface SegmentedLineTooltipItem {
    /** tooltip 中展示的系列名称。 */
    label: string
    /** tooltip 中展示的当前数值。 */
    value: number
    /** tooltip 色标，与系列颜色一致。 */
    color: string
  }

  interface SegmentedLineTooltip {
    /** 当前吸附数据点在 SVG 坐标系内的横向位置。 */
    x: number
    /** tooltip 横向定位百分比，适配响应式容器宽度。 */
    leftPercent: number
    /** tooltip 纵向定位百分比，来自首个系列当前点。 */
    topPercent: number
    /** 当前 hover 的横轴标签。 */
    label: string
    /** 当前横轴位置下每个系列的值。 */
    items: SegmentedLineTooltipItem[]
  }

  interface Props extends LineChartProps<ChartDataItem> {
    /** 折线图渲染变体；default 保持 LayerChart 原生渲染。 */
    lineVariant?: ChartLineVariant
    /** tooltip 触发方式；nearest 会在绘图区内吸附最近数据点。 */
    tooltipMode?: ChartTooltipMode
    /** segmented-point 变体是否显示竖向参考线。 */
    showCrosshair?: boolean
    /** segmented-point 变体是否显示圆点。 */
    showPoints?: boolean
    /** LayerChart 原生 legend 配置；segmented-point 中 true 会渲染轻量图例。 */
    legend?: boolean | Record<string, unknown>
    /** LayerChart 原生 grid 配置；segmented-point 中 truthy 会渲染水平网格。 */
    grid?: boolean | Record<string, unknown>
  }

  const {
    lineVariant = 'default',
    tooltipMode = 'default',
    showCrosshair = false,
    showPoints = true,
    legend = false,
    grid = false,
    data = [],
    x,
    y,
    series,
    height = 300,
    ...props
  }: Props = $props()

  /** segmented-point 使用固定 viewBox 保持点、线和 tooltip 命中区在不同高度下比例一致。 */
  const segmentedViewBox = {
    width: 420,
    height: 132,
    plotLeft: 36,
    plotRight: 390,
    plotTop: 14,
    plotBottom: 98,
    labelY: 124,
  }

  let activeTooltip = $state<SegmentedLineTooltip | null>(null)

  /** 当前渲染分支是否启用 @h-ai/ui 的分段折线变体。 */
  const useSegmentedLine = $derived(lineVariant === 'segmented-point')

  /** 解析后的可绘制系列；默认 LayerChart 分支不会读取该派生值。 */
  const segmentedSeries = $derived(resolveSegmentedSeries(data, x, y, series))

  /** Y 轴最大值兜底为 1，避免全零或空数据时除零。 */
  const segmentedMax = $derived(getSegmentedLineMax(segmentedSeries))

  /** 第一条系列的坐标用于横轴标签和 hover 命中基准，多系列共用同一 x 轴。 */
  const primaryCoordinates = $derived(getSegmentedLineCoordinates(segmentedSeries[0]?.points ?? [], segmentedMax))

  /**
   * 从数据项中读取指定 accessor 的值。
   * 支持函数、字符串键和数字键三种 accessor 形式。
   * @param item - 原始数据对象
   * @param accessor - 字段访问器（函数 / 字符串 / 数字）
   * @returns 读取到的原始值，无法识别时返回 undefined
   */
  function readAccessorValue(item: ChartDataItem, accessor: ChartAccessor): unknown {
    if (typeof accessor === 'function')
      return accessor(item)

    if (typeof accessor === 'string' || typeof accessor === 'number')
      return item[String(accessor)]

    return undefined
  }

  /**
   * 将 accessor 读取到的值格式化为用于展示的字符串标签。
   * Date 类型转为 ISO 字符串，字符串/数字直接转字符串，其余返回 fallback。
   * @param value - 原始值
   * @param fallback - 无法识别时的回退文案
   * @returns 格式化后的标签字符串
   */
  function formatAccessorLabel(value: unknown, fallback: string): string {
    if (value instanceof Date)
      return value.toISOString()

    if (typeof value === 'string' || typeof value === 'number')
      return `${value}`

    return fallback
  }

  /**
   * 将任意值安全转换为有限数字。
   * 非数字或 Infinity/NaN 均兜底为 0，避免后续除法或坐标计算出错。
   * @param value - 待转换的原始值
   * @returns 有限数字，无法转换时返回 0
   */
  function toFiniteNumber(value: unknown): number {
    const numberValue = typeof value === 'number' ? value : Number(value)

    return Number.isFinite(numberValue) ? numberValue : 0
  }

  /**
   * 获取系列配置中的值访问器，优先使用 value，回退到 key。
   * @param item - 系列配置对象
   * @returns 适用于 readAccessorValue 的 accessor
   */
  function getSeriesAccessor(item: ChartSeries): ChartAccessor {
    return item.value ?? item.key
  }

  /**
   * 获取系列的展示标签，未配置时回退到 fallback。
   * @param item - 系列配置对象
   * @param fallback - 未配置 label 时使用的默认文案
   * @returns tooltip / 图例中显示的文案
   */
  function getSeriesLabel(item: ChartSeries, fallback: string): string {
    return item.label ?? fallback
  }

  /**
   * 获取系列的渲染颜色。
   * 优先使用 series 配置中的 color，未配置时按索引循环分配主题色变量。
   * @param item - 系列配置对象
   * @param index - 系列在列表中的索引，用于循环选色
   * @returns CSS 颜色值或变量
   */
  function getSeriesColor(item: ChartSeries, index: number): string {
    return item.color ?? `var(--color-${['primary', 'secondary', 'accent', 'success', 'warning', 'error', 'info'][index % 7]})`
  }

  /**
   * 判断系列是否应以虚线渲染。
   * 支持 ChartSeries.dashed 顶层布尔值和 props.dashed 两种配置方式。
   * @param item - 系列配置对象
   * @returns true 表示该系列使用虚线
   */
  function getSeriesDashed(item: ChartSeries): boolean {
    return item.dashed === true || (typeof item.props === 'object' && item.props !== null && item.props.dashed === true)
  }

  /**
   * 将 y 轴配置和可选的 series 数组统一为标准 ChartSeries 列表。
   * 若已提供 chartSeries 则直接返回其副本；
   * 否则根据 yAccessor 自动推导单系列或多系列配置。
   * @param yAccessor - y 轴字段配置（字符串 / 数组 / 函数）
   * @param chartSeries - 可选的显式系列配置
   * @returns 标准化的 ChartSeries 数组
   */
  function normalizeSeries(yAccessor: Props['y'], chartSeries?: readonly ChartSeries[]): ChartSeries[] {
    if (chartSeries && chartSeries.length > 0)
      return [...chartSeries]

    if (Array.isArray(yAccessor)) {
      return yAccessor.map((accessor, index) => ({
        key: typeof accessor === 'string' ? accessor : `series-${index}`,
        label: typeof accessor === 'string' ? accessor : `series-${index + 1}`,
        value: accessor,
      }))
    }

    return [{
      key: typeof yAccessor === 'string' ? yAccessor : 'value',
      label: typeof yAccessor === 'string' ? yAccessor : 'value',
      value: yAccessor,
    }]
  }

  /**
   * 将原始数据和系列配置解析为 segmented-point 变体所需的 SegmentedLineSeries 数组。
   * 每个系列包含 key、label、color、dashed 以及按 x 轴顺序排列的 points。
   * @param items - 原始数据数组
   * @param xAccessor - x 轴字段访问器
   * @param yAccessor - y 轴字段配置
   * @param chartSeries - 可选的显式系列配置
   * @returns 解析后的 SegmentedLineSeries 列表
   */
  function resolveSegmentedSeries(items: readonly ChartDataItem[], xAccessor: Props['x'], yAccessor: Props['y'], chartSeries?: readonly ChartSeries[]): SegmentedLineSeries[] {
    return normalizeSeries(yAccessor, chartSeries).map((item, seriesIndex) => {
      const accessor = getSeriesAccessor(item)

      return {
        key: item.key,
        label: getSeriesLabel(item, item.key),
        color: getSeriesColor(item, seriesIndex),
        dashed: getSeriesDashed(item),
        points: items.map((datum, dataIndex) => ({
          label: formatAccessorLabel(readAccessorValue(datum, xAccessor), `${dataIndex + 1}`),
          value: toFiniteNumber(readAccessorValue(datum, accessor)),
        })),
      }
    })
  }

  /**
   * 计算所有系列中的最大数据值，作为 Y 轴上限。
   * 全零或空数据时兜底为 1，避免后续坐标计算中出现除零。
   * @param items - SegmentedLineSeries 列表
   * @returns Y 轴最大值（至少为 1）
   */
  function getSegmentedLineMax(items: SegmentedLineSeries[]): number {
    const maxValue = Math.max(...items.flatMap(item => item.points.map(point => point.value)))

    return maxValue > 0 ? maxValue : 1
  }

  /**
   * 将数据点从逻辑值映射为 SVG viewBox 坐标。
   * x 方向按点在序列中的位置均匀分布，y 方向按 maxValue 做线性缩放。
   * @param points - 一个系列的数据点列表
   * @param maxValue - Y 轴最大值，用于归一化
   * @returns 带有 SVG 坐标的 SegmentedLineCoordinate 数组
   */
  function getSegmentedLineCoordinates(points: SegmentedLinePoint[], maxValue: number): SegmentedLineCoordinate[] {
    const width = segmentedViewBox.plotRight - segmentedViewBox.plotLeft
    const height = segmentedViewBox.plotBottom - segmentedViewBox.plotTop
    const lastIndex = Math.max(points.length - 1, 1)

    return points.map((point, index) => ({
      ...point,
      x: segmentedViewBox.plotLeft + (width * index) / lastIndex,
      y: segmentedViewBox.plotTop + height - (point.value / maxValue) * height,
    }))
  }

  /**
   * 将有序坐标点转换为 SVG path 的 d 属性段（M ... L ... 格式）。
   * 相邻两点生成一条线段，用于渲染折线。
   * @param points - 已计算坐标的点序列
   * @returns SVG path d 属性字符串数组，每项对应一段线段
   */
  function getSegmentedLineSegments(points: SegmentedLineCoordinate[]): string[] {
    return points.slice(1).map((point, index) => {
      const previous = points[index]
      if (!previous)
        return ''

      return `M ${previous.x} ${previous.y} L ${point.x} ${point.y}`
    }).filter(Boolean)
  }

  /**
   * 显示 segmented-point 变体的 tooltip。
   * 计算 tooltip 的定位百分比并收集所有系列在该横轴位置的数值。
   * @param point - 当前吸附的坐标点
   * @param pointIndex - 该点在坐标数组中的索引，用于从各系列取值
   */
  function showSegmentedTooltip(point: SegmentedLineCoordinate, pointIndex: number): void {
    activeTooltip = {
      x: point.x,
      leftPercent: (point.x / segmentedViewBox.width) * 100,
      topPercent: (Math.max(segmentedViewBox.plotTop, point.y - 10) / segmentedViewBox.height) * 100,
      label: point.label,
      items: segmentedSeries.map(item => ({
        label: item.label,
        value: item.points[pointIndex]?.value ?? 0,
        color: item.color,
      })),
    }
  }

  /**
   * 处理指针在命中区域上的移动事件。
   * 仅在 tooltipMode === 'nearest' 时生效，计算指针在 SVG 中的等效坐标，
   * 找到最近的横轴数据点并触发 tooltip 显示。
   * @param event - 原生 PointerEvent
   */
  function handleSegmentedPointerMove(event: PointerEvent): void {
    if (tooltipMode !== 'nearest')
      return

    if (primaryCoordinates.length === 0)
      return

    const bounds = event.currentTarget instanceof SVGRectElement
      ? event.currentTarget.getBoundingClientRect()
      : null
    if (!bounds || bounds.width === 0)
      return

    const plotWidth = segmentedViewBox.plotRight - segmentedViewBox.plotLeft
    const pointerX = ((event.clientX - bounds.left) / bounds.width) * plotWidth + segmentedViewBox.plotLeft
    const nearestIndex = primaryCoordinates.reduce((bestIndex, point, index) => {
      const currentDistance = Math.abs(point.x - pointerX)
      const bestDistance = Math.abs((primaryCoordinates[bestIndex]?.x ?? point.x) - pointerX)

      return currentDistance < bestDistance ? index : bestIndex
    }, 0)
    const nearestPoint = primaryCoordinates[nearestIndex]
    if (nearestPoint)
      showSegmentedTooltip(nearestPoint, nearestIndex)
  }

  /**
   * 隐藏 segmented-point 变体的 tooltip。
   * 在指针离开命中区域时调用，将 activeTooltip 置为 null。
   */
  function hideSegmentedTooltip(): void {
    activeTooltip = null
  }
</script>

{#if useSegmentedLine}
  <div class='hai-segmented-line-chart' style={`height: ${height}px;`}>
    <svg viewBox={`0 0 ${segmentedViewBox.width} ${segmentedViewBox.height}`} role='img'>
      {#if grid}
        {#each [18, 58, 98] as gridY (gridY)}
          <line class='hai-segmented-line-chart__grid' x1={segmentedViewBox.plotLeft} x2={segmentedViewBox.plotRight} y1={gridY} y2={gridY}></line>
        {/each}
      {/if}

      {#if showCrosshair && activeTooltip}
        <line class='hai-segmented-line-chart__crosshair' x1={activeTooltip.x} x2={activeTooltip.x} y1={segmentedViewBox.plotTop} y2='108'></line>
      {/if}

      {#each segmentedSeries as item (item.key)}
        {@const coordinates = getSegmentedLineCoordinates(item.points, segmentedMax)}
        {#each getSegmentedLineSegments(coordinates) as segment (segment)}
          <path
            class='hai-segmented-line-chart__segment'
            d={segment}
            stroke={item.color}
            stroke-dasharray={item.dashed ? '6 5' : undefined}
          ></path>
        {/each}
        {#if showPoints}
          {#each coordinates as point (point.label)}
            <circle
              class='hai-segmented-line-chart__point'
              cx={point.x}
              cy={point.y}
              r='3.8'
              fill={item.color}
            ></circle>
          {/each}
        {/if}
      {/each}

      {#each primaryCoordinates as point (point.label)}
        <text class='hai-segmented-line-chart__label' x={point.x} y={segmentedViewBox.labelY}>{point.label}</text>
      {/each}

      <rect
        class='hai-segmented-line-chart__hit-area'
        x={segmentedViewBox.plotLeft}
        y='10'
        width={segmentedViewBox.plotRight - segmentedViewBox.plotLeft}
        height='104'
        role='presentation'
        onpointerenter={handleSegmentedPointerMove}
        onpointermove={handleSegmentedPointerMove}
        onpointerleave={hideSegmentedTooltip}
      ></rect>
    </svg>

    {#if legend}
      <div class='hai-segmented-line-chart__legend'>
        {#each segmentedSeries as item (item.key)}
          <span>
            <i style={`background: ${item.color};`}></i>
            {item.label}
          </span>
        {/each}
      </div>
    {/if}

    {#if activeTooltip}
      <div
        class='hai-segmented-line-chart__tooltip'
        style={`left: ${activeTooltip.leftPercent}%; top: ${activeTooltip.topPercent}%;`}
      >
        <strong>{activeTooltip.label}</strong>
        {#each activeTooltip.items as item (`${item.label}-${item.color}`)}
          <span>
            <i style={`background: ${item.color};`}></i>
            {item.label}: {item.value}
          </span>
        {/each}
      </div>
    {/if}
  </div>
{:else}
  <LayerLineChart {...props} {data} {x} {y} {series} {height} {legend} {grid} />
{/if}

<style>
  .hai-segmented-line-chart {
    position: relative;
    min-width: 0;
    overflow: visible;
  }

  .hai-segmented-line-chart svg {
    display: block;
    width: 100%;
    height: 100%;
  }

  .hai-segmented-line-chart__grid {
    stroke: color-mix(in oklab, var(--color-base-content) 16%, transparent);
    stroke-width: 1;
  }

  .hai-segmented-line-chart__crosshair {
    stroke: color-mix(in oklab, var(--color-primary) 54%, transparent);
    stroke-dasharray: 4 4;
    stroke-width: 1.25;
  }

  .hai-segmented-line-chart__segment {
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 3;
  }

  .hai-segmented-line-chart__point {
    cursor: pointer;
    stroke: var(--color-base-100);
    stroke-width: 2.4;
  }

  .hai-segmented-line-chart__point:hover {
    stroke-width: 3.2;
  }

  .hai-segmented-line-chart__label {
    fill: color-mix(in oklab, var(--color-base-content) 62%, transparent);
    font-size: 0.72rem;
    font-weight: 700;
    text-anchor: middle;
  }

  .hai-segmented-line-chart__hit-area {
    fill: transparent;
    cursor: crosshair;
    pointer-events: all;
  }

  .hai-segmented-line-chart__legend {
    position: absolute;
    right: 0.4rem;
    bottom: 1.8rem;
    display: inline-flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.65rem;
    color: color-mix(in oklab, var(--color-base-content) 62%, transparent);
    font-size: 0.72rem;
    font-weight: 750;
    pointer-events: none;
  }

  .hai-segmented-line-chart__legend span {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }

  .hai-segmented-line-chart__legend i {
    width: 0.85rem;
    height: 0.18rem;
    border-radius: 999px;
  }

  .hai-segmented-line-chart__tooltip {
    position: absolute;
    z-index: 3;
    display: grid;
    min-width: 7rem;
    gap: 0.28rem;
    border: 1px solid color-mix(in oklab, var(--color-base-content) 14%, transparent);
    border-radius: 0.35rem;
    padding: 0.48rem 0.58rem;
    color: var(--color-base-content);
    background: color-mix(in oklab, var(--color-base-100) 96%, var(--color-base-200) 4%);
    box-shadow: 0 0.7rem 1.8rem color-mix(in oklab, #0f172a 14%, transparent);
    font-size: 0.74rem;
    line-height: 1.2;
    pointer-events: none;
    transform: translate(-50%, -100%);
  }

  .hai-segmented-line-chart__tooltip strong {
    font-size: 0.72rem;
    font-weight: 850;
  }

  .hai-segmented-line-chart__tooltip span {
    display: inline-flex;
    align-items: center;
    gap: 0.32rem;
    white-space: nowrap;
    color: color-mix(in oklab, var(--color-base-content) 62%, transparent);
    font-weight: 750;
  }

  .hai-segmented-line-chart__tooltip i {
    width: 0.62rem;
    height: 0.62rem;
    border-radius: 999px;
  }
</style>
