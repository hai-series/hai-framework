<!--
  @h-ai/ui — AppBar（顶部应用栏，支持安全区域）

  用法：
  <AppBar title="首页">
    {#snippet leading()}<BackButton />{/snippet}
    {#snippet trailing()}<Avatar />{/snippet}
  </AppBar>
-->
<script lang='ts'>
  import type { Snippet } from 'svelte'
  import { cn } from '../../utils.js'

  interface Props {
    /** 标题文本 */
    title?: string
    /** 是否适配顶部安全区域 */
    safeArea?: boolean
    /** 是否固定在顶部 */
    fixed?: boolean
    /** 额外 CSS 类 */
    class?: string
    /** 左侧内容（返回按钮等） */
    leading?: Snippet
    /** 右侧内容（操作按钮等） */
    trailing?: Snippet
    /** 自定义标题区域 */
    children?: Snippet
  }

  const {
    title,
    safeArea = true,
    fixed = true,
    class: className,
    leading,
    trailing,
    children,
  }: Props = $props()
</script>

<header
  class={cn(
    'flex items-center h-14 px-4 bg-base-100 border-b border-base-200',
    safeArea && 'hai-safe-top',
    fixed && 'fixed top-0 left-0 right-0 z-40',
    className,
  )}
>
  <!-- 左侧 -->
  <div class='flex items-center min-w-[48px]'>
    {#if leading}
      {@render leading()}
    {/if}
  </div>

  <!-- 标题区域 -->
  <div class='flex-1 text-center font-semibold text-base truncate'>
    {#if children}
      {@render children()}
    {:else if title}
      {title}
    {/if}
  </div>

  <!-- 右侧 -->
  <div class='flex items-center min-w-[48px] justify-end'>
    {#if trailing}
      {@render trailing()}
    {/if}
  </div>
</header>

<!-- 占位区域（fixed 模式下避免内容被遮挡） -->
{#if fixed}
  <div class={cn('h-14', safeArea && 'hai-safe-top')}></div>
{/if}
