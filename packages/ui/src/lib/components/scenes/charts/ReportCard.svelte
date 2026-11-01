<!--
  @component ReportCard
  复用 Card 的报表容器，内容插槽不限制 LayerChart 图形能力。
  @example
  ```ts
  import { mount, unmount } from 'svelte'
  import { ReportCard } from '@h-ai/ui'
  const component = mount(ReportCard, { target: document.body, props: { title: 'Revenue', empty: true } })
  await unmount(component)
  ```
-->
<script lang='ts'>
  import type { ReportCardProps } from './dashboard-types.js'
  import { uiM } from '../../../messages.js'
  import { cn, getDataAttributes } from '../../../utils.js'
  import Card from '../../compounds/Card.svelte'

  const { title, description = '', actions, children, footer, loading = false, empty = false, minHeight = 240, class: className = '', ...restProps }: ReportCardProps = $props()
  const titleId = $props.id()
</script>

<Card {...getDataAttributes(restProps)} class={cn('hai-report-card min-w-0', className)} shadow={false}>
  {#snippet header()}
    <div class='flex w-full min-w-0 flex-wrap items-start justify-between gap-3'>
      <div class='min-w-0'>
        <h2 id={titleId} class='break-words text-sm font-semibold'>{title}</h2>
        {#if description}<p class='mt-1 break-words text-xs font-normal text-base-content/80'>{description}</p>{/if}
      </div>
      {#if actions}<div class='flex shrink-0 flex-wrap gap-2 font-normal'>{@render actions()}</div>{/if}
    </div>
  {/snippet}
  <section aria-labelledby={titleId} aria-busy={loading} class='min-w-0' style={`min-height: ${Math.max(0, minHeight)}px;`}>
    {#if loading || empty}
      <div class='flex items-center justify-center' style={`min-height: ${Math.max(0, minHeight)}px;`}>
        {#if loading}
          <span role='status' class='loading loading-spinner loading-md text-primary' aria-label={uiM('chart_loading')}></span>
        {:else}
          <p class='text-sm text-base-content/80'>{uiM('chart_empty')}</p>
        {/if}
      </div>
    {:else if children}
      {@render children()}
    {/if}
  </section>
  {#if footer}
    <div class='min-w-0 border-t border-base-300 pt-3 text-xs text-base-content/80'>{@render footer()}</div>
  {/if}
</Card>
