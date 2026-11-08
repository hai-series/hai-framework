<!--
  @component MetricCard
  指标卡不依赖图形引擎；可通过 children 按需补充迷你趋势图。
  @example
  ```ts
  import { mount, unmount } from 'svelte'
  import { MetricCard } from '@h-ai/ui'
  const component = mount(MetricCard, { target: document.body, props: { title: 'Revenue', value: '128,430', trend: 12.8, trendLabel: 'vs previous month', trendTone: 'success' } })
  await unmount(component)
  ```
-->
<script lang='ts'>
  import type { MetricCardProps } from './dashboard-types.js'
  import { getUILocale, uiM } from '../../../messages.js'
  import { cn, getDataAttributes } from '../../../utils.js'
  import Card from '../../compounds/Card.svelte'

  const { title, value, unit = '', trend, trendLabel = '', trendTone = 'neutral', description = '', loading = false, children, class: className = '', ...restProps }: MetricCardProps = $props()
  const hasValue = $derived(value != null && (typeof value !== 'number' || Number.isFinite(value)))
  const hasTrend = $derived(typeof trend === 'number' && Number.isFinite(trend))
  const direction = $derived((trend ?? 0) > 0
    ? 'up'
    : (trend ?? 0) < 0
    ? 'down'
    : 'flat')
  const trendText = $derived(new Intl.NumberFormat(getUILocale(), { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' }).format((trend ?? 0) / 100))
  const toneClass = {
    success: 'text-success',
    warning: 'text-warning',
    error: 'text-error',
    neutral: 'text-base-content',
  }
</script>

<Card {...getDataAttributes(restProps)} class={cn('hai-metric-card min-w-0', className)} shadow={false}>
  <div aria-busy={loading} class='flex min-w-0 flex-col gap-2'>
    <h2 class='text-sm font-medium text-base-content/80'>{title}</h2>
    {#if loading}
      <div role='status' aria-label={uiM('chart_loading')} class='skeleton h-9 w-32'></div>
    {:else}
      <div class='flex min-w-0 flex-wrap items-baseline gap-x-2'>
        <span class='break-words text-3xl font-semibold tracking-tight tabular-nums'>{hasValue ? value : '—'}</span>
        {#if unit && hasValue}<span class='text-sm text-base-content/80'>{unit}</span>{/if}
      </div>
      {#if hasTrend}
        <div class='flex flex-wrap items-center gap-x-2 gap-y-1 text-sm'>
          <span data-trend-direction={direction} class={cn('inline-flex items-center gap-1 font-medium tabular-nums', toneClass[trendTone])}>
            <svg aria-hidden='true' viewBox='0 0 20 20' class='size-4 shrink-0' fill='none' stroke='currentColor' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'>
              <path d={direction === 'up'
                ? 'M3 14 8 9 12 12 17 5 M12 5h5v5'
                : direction === 'down'
                ? 'M3 6 8 11 12 8 17 15 M12 15h5v-5'
                : 'M3 10h14 m-4 -4 4 4 -4 4'}></path>
            </svg>
            <span class='sr-only'>{uiM(direction === 'up'
              ? 'metric_increase'
              : direction === 'down'
              ? 'metric_decrease'
              : 'metric_unchanged')}</span>
            {trendText}
          </span>
          {#if trendLabel}<span class='text-base-content/80'>{trendLabel}</span>{/if}
        </div>
      {/if}
      {#if children}{@render children()}{/if}
    {/if}
    {#if description}<p class='break-words text-xs text-base-content/80'>{description}</p>{/if}
  </div>
</Card>
