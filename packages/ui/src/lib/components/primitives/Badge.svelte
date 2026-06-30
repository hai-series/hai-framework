<!--
  @component Badge
  徽章组件，支持多种变体与尺寸
-->
<script lang='ts'>
  import type { BadgeProps, DataAttributes } from '../../types.js'
  import { cn, getBadgeSizeClass, getBadgeVariantClass, getDataAttributes } from '../../utils.js'

  const {
    variant = 'default',
    size = 'md',
    outline = false,
    class: className = '',
    children,
    ...restProps
  }: BadgeProps & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))
  const badgeClass = $derived(
    cn(
      'badge',
      getBadgeVariantClass(variant),
      getBadgeSizeClass(size),
      outline && 'badge-outline',
      'font-medium tracking-tight',
      className,
    ),
  )
</script>

<span {...dataAttributes} class={badgeClass}>
  {#if children}
    {@render children()}
  {/if}
</span>
