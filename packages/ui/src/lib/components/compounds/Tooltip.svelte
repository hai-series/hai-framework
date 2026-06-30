<!--
  =============================================================================
  @h-ai/ui - Tooltip 组件
  =============================================================================
  提示框组件

  使用 Svelte 5 Runes ($props, $derived)
  =============================================================================
-->
<script lang='ts'>
  import type { DataAttributes, TooltipProps } from '../../types.js'
  import { cn, getDataAttributes } from '../../utils.js'

  const {
    content,
    position = 'top',
    class: className = '',
    children,
    ...restProps
  }: TooltipProps & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))
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
    ),
  )
</script>

<div {...dataAttributes} class={tooltipClass} data-tip={content}>
  {#if children}
    {@render children()}
  {/if}
</div>
