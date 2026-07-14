<!--
  =============================================================================
  @h-ai/ui - Chart 组件
  =============================================================================
  基于 LayerChart 的统一图表入口，仅处理 type 路由、主题色默认值和基础状态。

  使用 Svelte 5 Runes ($props, $derived)
  =============================================================================
-->
<script lang='ts'>
  import type { ChartProps, ChartSeries, ChartType } from './chart-types.js'
  import { uiM } from '../../../messages.js'
  import { cn, getDataAttributes } from '../../../utils.js'
  import { DAISYUI_CHART_COLORS, resolveChartColors } from './chart-theme.js'
  import AreaChart from './renderers/AreaChart.svelte'
  import BarChart from './renderers/BarChart.svelte'
  import LineChart from './renderers/LineChart.svelte'
  import PieChart from './renderers/PieChart.svelte'
  import ScatterChart from './renderers/ScatterChart.svelte'
  import 'layerchart/daisyui-5.css'

  const {
    type,
    data = [],
    x,
    y,
    series,
    orientation,
    size = 'md',
    title = '',
    description = '',
    loading = false,
    empty = false,
    class: className = '',
    ...restProps
  }: ChartProps = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))

  const chartSizeHeights: Record<NonNullable<ChartProps['size']>, number> = {
    sm: 200,
    md: 300,
    lg: 400,
  }

  const cartesianChartTypes = new Set<ChartType>(['bar', 'line', 'area'])

  /** 图表可视高度优先尊重 LayerChart 原生 height，未传时使用 @h-ai/ui 的 size 预设。 */
  const chartHeight = $derived(
    typeof restProps.height === 'number' ? restProps.height : chartSizeHeights[size],
  )

  const isEmpty = $derived(empty || data.length === 0)
  const hasHeader = $derived(Boolean(title || description))

  const rootClass = $derived(
    cn(
      'hai-chart flex flex-col gap-3',
      className,
    ),
  )

  const viewportClass = $derived(
    cn(
      'hai-chart-viewport min-w-0',
      (loading || isEmpty) && 'flex items-center justify-center rounded-lg border border-dashed border-base-300 bg-base-200/30',
    ),
  )

  /**
   * 当调用方只传 y 数组时，为常见笛卡尔图自动补 series。
   * 这让 `<Chart y={['a','b']}>` 仍然得到多系列和主题色，同时不影响显式传入的 LayerChart series。
   */
  const normalizedSeries = $derived.by<ChartSeries[] | undefined>(() => {
    if (series) {
      if (!cartesianChartTypes.has(type))
        return series

      return series.map(item => ({
        ...item,
        value: item.value ?? item.key,
      }))
    }

    if (!cartesianChartTypes.has(type) || !Array.isArray(y))
      return undefined

    return y.map(key => ({
      key,
      label: key,
      value: key,
    }))
  })

  const resolvedSeries = $derived(resolveChartColors(normalizedSeries))

  /** 饼图使用统一 x/y API 时，将 x 映射为 key/label，y 的第一项映射为 value。 */
  const pieValue = $derived(Array.isArray(y) ? y[0] : y)

  const cartesianLayerProps = $derived({
    data,
    height: chartHeight,
    cRange: DAISYUI_CHART_COLORS,
    ...restProps,
    orientation,
    series: resolvedSeries,
    x,
    y,
  })

  const pieLayerProps = $derived({
    data,
    height: chartHeight,
    key: x,
    label: x,
    value: pieValue,
    cRange: DAISYUI_CHART_COLORS,
    ...restProps,
    series: resolvedSeries,
  })
</script>

<div {...dataAttributes} class={rootClass}>
  {#if hasHeader}
    <div class='space-y-1'>
      {#if title}
        <h3 class='text-sm font-semibold text-base-content'>{title}</h3>
      {/if}
      {#if description}
        <p class='text-xs leading-relaxed text-base-content/60'>{description}</p>
      {/if}
    </div>
  {/if}

  <div class={viewportClass} style={`height: ${chartHeight}px;`}>
    {#if loading}
      <span class='loading loading-spinner loading-md text-primary' aria-label={uiM('chart_loading')}></span>
    {:else if isEmpty}
      <p class='text-sm text-base-content/50'>{uiM('chart_empty')}</p>
    {:else if type === 'bar'}
      <BarChart {...cartesianLayerProps} />
    {:else if type === 'line'}
      <LineChart {...cartesianLayerProps} />
    {:else if type === 'area'}
      <AreaChart {...cartesianLayerProps} />
    {:else if type === 'pie'}
      <PieChart {...pieLayerProps} />
    {:else if type === 'scatter'}
      <ScatterChart {...cartesianLayerProps} />
    {/if}
  </div>
</div>
