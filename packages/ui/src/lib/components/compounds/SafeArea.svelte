<!--
  @h-ai/ui — SafeArea（安全区域包裹组件）

  用法：
  <SafeArea position="top">
    <AppBar />
  </SafeArea>
-->
<script lang='ts'>
  import type { Snippet } from 'svelte'
  import type { DataAttributes } from '../../types.js'
  import { cn, getDataAttributes } from '../../utils.js'

  interface Props {
    /** 安全区域位置 */
    position?: 'top' | 'bottom' | 'all'
    /** 额外 CSS 类 */
    class?: string
    /** 内容 */
    children: Snippet
  }

  const {
    position = 'all',
    class: className,
    children,
    ...restProps
  }: Props & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))
  const positionClasses = $derived({
    top: 'hai-safe-top',
    bottom: 'hai-safe-bottom',
    all: 'hai-safe-all',
  }[position])
</script>

<div {...dataAttributes} class={cn(positionClasses, className)}>
  {@render children()}
</div>
