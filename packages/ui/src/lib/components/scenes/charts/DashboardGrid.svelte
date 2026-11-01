<!--
  @component DashboardGrid
  使用容器查询适配看板，不依赖视口宽度或图形引擎。
  @example
  ```ts
  import { mount, unmount } from 'svelte'
  import { DashboardGrid } from '@h-ai/ui'
  const component = mount(DashboardGrid, { target: document.body, props: { label: 'Reports', columns: 2 } })
  await unmount(component)
  ```
-->
<script lang='ts'>
  import type { DashboardGridProps } from './dashboard-types.js'
  import { cn, getDataAttributes } from '../../../utils.js'

  const { label, columns = 2, children, class: className = '', ...restProps }: DashboardGridProps = $props()
</script>

<div {...getDataAttributes(restProps)} role='group' aria-label={label} class={cn('hai-dashboard-grid min-w-0', className)} style={`--hai-dashboard-columns: ${columns}; --hai-dashboard-medium-columns: ${Math.min(columns, 2)};`}>
  <div class='hai-dashboard-grid__items'>
    {#if children}{@render children()}{/if}
  </div>
</div>

<style>
  .hai-dashboard-grid { container: hai-dashboard / inline-size; }
  .hai-dashboard-grid__items { display: grid; gap: 1rem; grid-template-columns: minmax(0, 1fr); }
  @container hai-dashboard (min-width: 40rem) {
    .hai-dashboard-grid__items { grid-template-columns: repeat(var(--hai-dashboard-medium-columns), minmax(0, 1fr)); }
  }
  @container hai-dashboard (min-width: 64rem) {
    .hai-dashboard-grid__items { grid-template-columns: repeat(var(--hai-dashboard-columns), minmax(0, 1fr)); }
  }
</style>
