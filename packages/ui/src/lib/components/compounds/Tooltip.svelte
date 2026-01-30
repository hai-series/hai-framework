<!--
  =============================================================================
  @hai/ui - Tooltip 组件
  =============================================================================
  提示框组件
  
  使用 Svelte 5 Runes ($props, $derived)
  =============================================================================
-->
<script lang="ts">
  import type { TooltipProps } from '../../types.js'
  import { cn } from '../../utils.js'
  
  let {
    content,
    position = 'top',
    delay = 0,
    class: className = '',
    children,
  }: TooltipProps = $props()
  
  const positionMap = {
    top: 'tooltip-top',
    right: 'tooltip-right',
    bottom: 'tooltip-bottom',
    left: 'tooltip-left',
  }
  
  const tooltipClass = $derived(
    cn(
      'tooltip',
      positionMap[position],
      className,
    )
  )
</script>

<div class={tooltipClass} data-tip={content}>
  {#if children}
    {@render children()}
  {/if}
</div>
