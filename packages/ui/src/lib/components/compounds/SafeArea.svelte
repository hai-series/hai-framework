<!--
  @h-ai/ui — SafeArea（安全区域包裹组件）

  用法：
  <SafeArea position="top">
    <AppBar />
  </SafeArea>
-->
<script lang='ts'>
  import type { Snippet } from 'svelte'
  import { cn } from '../../utils.js'

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
  }: Props = $props()

  const positionClasses = $derived({
    top: 'hai-safe-top',
    bottom: 'hai-safe-bottom',
    all: 'hai-safe-all',
  }[position])
</script>

<div class={cn(positionClasses, className)}>
  {@render children()}
</div>
