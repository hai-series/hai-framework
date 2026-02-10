<!--
  =============================================================================
  @hai/ui - Breadcrumb 组件
  =============================================================================
  面包屑导航组件
  
  使用 Svelte 5 Runes ($props)
  =============================================================================
-->
<script lang="ts">
  import type { BreadcrumbProps } from '../../types.js'
  import { cn } from '../../utils.js'
  
  let {
    items,
    separator: _separator = '/',
    class: className = '',
  }: BreadcrumbProps = $props()
  
  const breadcrumbClass = $derived(
    cn(
      'breadcrumbs text-sm',
      className,
    )
  )
</script>

<div class={breadcrumbClass}>
  <ul>
    {#each items as item, index}
      <li>
        {#if item.href && index < items.length - 1}
          <a href={item.href}>
            {#if item.icon}
              <span class="mr-1">{item.icon}</span>
            {/if}
            {item.label}
          </a>
        {:else}
          <span>
            {#if item.icon}
              <span class="mr-1">{item.icon}</span>
            {/if}
            {item.label}
          </span>
        {/if}
      </li>
    {/each}
  </ul>
</div>
