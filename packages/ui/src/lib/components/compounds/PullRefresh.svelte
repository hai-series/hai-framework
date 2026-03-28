<!--
  @h-ai/ui — PullRefresh（下拉刷新）

  用法：
  <PullRefresh onrefresh={async () => await loadData()} >
    <div>列表内容</div>
  </PullRefresh>
-->
<script lang='ts'>
  import type { Snippet } from 'svelte'
  import { cn } from '../../utils.js'

  interface Props {
    /** 刷新回调（需返回 Promise） */
    onrefresh?: () => Promise<void>
    /** 下拉触发距离（px） */
    threshold?: number
    /** 是否禁用 */
    disabled?: boolean
    /** 额外 CSS 类 */
    class?: string
    /** 内容 */
    children: Snippet
  }

  const {
    onrefresh,
    threshold = 80,
    disabled = false,
    class: className,
    children,
  }: Props = $props()

  let pulling = $state(false)
  let refreshing = $state(false)
  let pullDistance = $state(0)
  let startY = 0

  function handleTouchStart(e: TouchEvent) {
    if (disabled || refreshing)
      return
    startY = e.touches[0].clientY
    pulling = true
  }

  function handleTouchMove(e: TouchEvent) {
    if (!pulling || disabled || refreshing)
      return
    const diff = e.touches[0].clientY - startY
    if (diff > 0) {
      pullDistance = Math.min(diff * 0.5, threshold * 1.5) // 阻尼
    }
  }

  async function handleTouchEnd() {
    if (!pulling || disabled)
      return
    pulling = false

    if (pullDistance >= threshold && onrefresh) {
      refreshing = true
      try {
        await onrefresh()
      }
      finally {
        refreshing = false
      }
    }

    pullDistance = 0
  }
</script>

<div
  class={cn('relative overflow-hidden', className)}
  ontouchstart={handleTouchStart}
  ontouchmove={handleTouchMove}
  ontouchend={handleTouchEnd}
  role='region'
>
  <!-- 刷新指示器 -->
  <div
    class='flex items-center justify-center text-sm text-base-content/60 overflow-hidden transition-all'
    style='height: {pullDistance}px'
  >
    {#if refreshing}
      <span class='loading loading-spinner loading-sm mr-2'></span>
      Refreshing...
    {:else if pullDistance >= threshold}
      Release to refresh
    {:else if pullDistance > 0}
      Pull to refresh
    {/if}
  </div>

  <!-- 内容区域 -->
  {@render children()}
</div>
