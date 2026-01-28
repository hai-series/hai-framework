<!--
  =============================================================================
  @hai/ui - Badge 组件
  =============================================================================
  徽章组件
  
  使用 Svelte 5 Runes ($props, $derived)
  =============================================================================
-->
<script lang="ts">
  import type { BadgeProps } from '../types.js'
  import { cn, getBadgeVariantClass, getBadgeSizeClass } from '../utils.js'
  
  let {
    variant = 'default',
    size = 'md',
    outline = false,
    class: className = '',
    children,
  }: BadgeProps = $props()
  
  const badgeClass = $derived(
    cn(
      'badge',
      getBadgeVariantClass(variant),
      getBadgeSizeClass(size),
      outline && 'badge-outline',
      className,
    )
  )
</script>

<span class={badgeClass}>
  {#if children}
    {@render children()}
  {/if}
</span>
