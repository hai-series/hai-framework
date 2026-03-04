<!--
  @h-ai/ui — InfiniteScroll（无限滚动 / 上拉加载更多）

  用法：
  <InfiniteScroll onloadmore={async () => await loadNextPage()} hasMore={hasMoreData}>
    {#each items as item}
      <div>{item.name}</div>
    {/each}
  </InfiniteScroll>
-->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import { cn } from '../../utils.js'

  interface Props {
    /** 加载更多回调 */
    onloadmore?: () => Promise<void>
    /** 是否还有更多数据 */
    hasMore?: boolean
    /** 触发距离（距底部 px） */
    threshold?: number
    /** 是否禁用 */
    disabled?: boolean
    /** 加载中文本 */
    loadingText?: string
    /** 无更多数据文本 */
    noMoreText?: string
    /** 额外 CSS 类 */
    class?: string
    /** 列表内容 */
    children: Snippet
  }

  const {
    onloadmore,
    hasMore = true,
    threshold = 100,
    disabled = false,
    loadingText = 'Loading...',
    noMoreText = 'No more data',
    class: className,
    children,
  }: Props = $props()

  let loading = $state(false)
  let containerRef: HTMLDivElement | undefined = $state()

  async function checkAndLoad() {
    if (loading || disabled || !hasMore || !containerRef || !onloadmore) return

    const { scrollTop, scrollHeight, clientHeight } = containerRef
    if (scrollHeight - scrollTop - clientHeight < threshold) {
      loading = true
      try {
        await onloadmore()
      }
      finally {
        loading = false
      }
    }
  }
</script>

<div
  bind:this={containerRef}
  class={cn('overflow-y-auto', className)}
  onscroll={checkAndLoad}
  role="feed"
>
  {@render children()}

  <!-- 底部状态 -->
  <div class="flex items-center justify-center py-4 text-sm text-base-content/50">
    {#if loading}
      <span class="loading loading-spinner loading-sm mr-2"></span>
      {loadingText}
    {:else if !hasMore}
      {noMoreText}
    {/if}
  </div>
</div>
