<!--
  @component Chart
  =============================================================================
  @h-ai/ui - Chart 组件
  =============================================================================
  基于 LayerChart 的统一图表入口，仅处理 type 路由、主题色默认值和基础状态。

  使用 Svelte 5 Runes ($props, $derived)
  =============================================================================

  @example
  ```ts
  import { mount, unmount } from 'svelte'
  import type { ComponentProps } from 'svelte'
  import { Chart } from '@h-ai/ui'
  const props: ComponentProps<typeof Chart> = { type: 'line', data: [{ month: 'Jan', sales: 42 }], x: 'month', y: 'sales', lineVariant: 'segmented-point', tooltipMode: 'nearest' }
  const component = mount(Chart, { target: document.body, props })
  await unmount(component)
  ```
-->
<script lang='ts'>
  import type { ChartProps, ChartSeries, ChartType } from './chart-types.js'
  import { onMount } from 'svelte'
  import { uiM } from '../../../messages.js'
  import { cn, getDataAttributes } from '../../../utils.js'
  import { resolveChartPreset } from './chart-presets.js'
  import { DAISYUI_CHART_COLORS, resolveChartColors } from './chart-theme.js'
  import ChartLoadError from './ChartLoadError.svelte'

  const {
    type: requestedType,
    preset,
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

  const presetConfig = $derived(resolveChartPreset(preset))
  const type = $derived(requestedType ?? presetConfig.type ?? 'line')
  const nativeProps = $derived({ ...presetConfig.props, ...restProps })
  const dataAttributes = $derived(getDataAttributes(restProps))

  // 仅浏览器挂载且确有数据时加载对应图形；Svelte await 自动丢弃过期 Promise 的结果。
  const renderers = {
    bar: () => import('./renderers/BarChart.svelte'),
    line: () => import('./renderers/LineChart.svelte'),
    area: () => import('./renderers/AreaChart.svelte'),
    pie: () => import('./renderers/PieChart.svelte'),
    scatter: () => import('./renderers/ScatterChart.svelte'),
  }
  let mounted = $state(false)
  onMount(() => {
    mounted = true
  })

  const chartSizeHeights: Record<NonNullable<ChartProps['size']>, number> = {
    sm: 200,
    md: 300,
    lg: 400,
  }

  const cartesianChartTypes = new Set<ChartType>(['bar', 'line', 'area'])

  /** 图表可视高度优先尊重 LayerChart 原生 height，未传时使用 @h-ai/ui 的 size 预设。 */
  const chartHeight = $derived(
    typeof nativeProps.height === 'number' ? nativeProps.height : chartSizeHeights[size],
  )

  const isEmpty = $derived(empty || data.length === 0)
  const rendererPromise = $derived(mounted && !loading && !isEmpty ? renderers[type]() : undefined)
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
    ...nativeProps,
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
    ...nativeProps,
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
    {:else if !mounted}
      <div class='flex h-full items-center justify-center' role='status' aria-label={uiM('chart_loading')}>
        <span class='loading loading-spinner loading-md text-primary'></span>
      </div>
    {:else}
      {#await rendererPromise}
        <div class='flex h-full items-center justify-center' role='status' aria-label={uiM('chart_loading')}>
          <span class='loading loading-spinner loading-md text-primary'></span>
        </div>
      {:then renderer}
        {#if renderer}
          {@const Renderer = renderer.default}
          <Renderer {...(type === 'pie' ? pieLayerProps : cartesianLayerProps)} />
        {/if}
      {:catch}
        <!-- 浏览器可能缓存失败的模块请求；刷新文档后才能可靠重试同一资源。 -->
        <ChartLoadError onretry={() => window.location.reload()} />
      {/await}
    {/if}
  </div>
</div>
