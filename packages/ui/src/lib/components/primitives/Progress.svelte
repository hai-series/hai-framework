<!--
  =============================================================================
  @h-ai/ui - Progress 组件
  =============================================================================
  进度条组件
  
  使用 Svelte 5 Runes ($props, $derived)
  =============================================================================
-->
<script lang="ts">
  import type { ProgressProps } from '../../types.js'
  import { cn, getProgressVariantClass } from '../../utils.js'
  
  let {
    value,
    max = 100,
    size = 'md',
    variant = 'primary',
    showLabel = false,
    striped: _striped = false,
    animated: _animated = false,
    class: className = '',
  }: ProgressProps = $props()
  
  const sizeMap = {
    xs: 'h-1',
    sm: 'h-2',
    md: 'h-3',
    lg: 'h-4',
    xl: 'h-5',
    '2xl': 'h-6',
    '3xl': 'h-7',
    '4xl': 'h-8',
  }
  
  const percentage = $derived(Math.min(100, Math.max(0, (value / max) * 100)))
  
  const progressClass = $derived(
    cn(
      'progress w-full',
      getProgressVariantClass(variant),
      sizeMap[size],
      className,
    )
  )
</script>

<div class="w-full">
  <progress
    class={progressClass}
    {value}
    {max}
  ></progress>
  
  {#if showLabel}
    <div class="text-xs text-center mt-1">
      {percentage.toFixed(0)}%
    </div>
  {/if}
</div>
