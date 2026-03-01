<!--
  @component Badge
  徽章组件，支持多种变体与尺寸
-->
<script lang="ts">
  import type { BadgeProps } from '../../types.js'
  import { cn, getBadgeVariantClass, getBadgeSizeClass } from '../../utils.js'
  
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
      'font-medium tracking-tight',
      className,
    )
  )
</script>

<span class={badgeClass}>
  {#if children}
    {@render children()}
  {/if}
</span>
