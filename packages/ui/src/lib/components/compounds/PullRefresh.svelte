<!--
  @component PullRefresh
  @h-ai/ui — PullRefresh（下拉刷新）

  用法：
  <PullRefresh onrefresh={async () => await loadData()} >
    <div>列表内容</div>
  </PullRefresh>

  @example
  ```ts
  import { mount, unmount, createRawSnippet } from 'svelte'
  import type { ComponentProps } from 'svelte'
  import { PullRefresh } from '@h-ai/ui'
  const props: ComponentProps<typeof PullRefresh> = { threshold: 80, children: createRawSnippet(() => ({ render: () => "<p>可下拉更新的内容。</p>" })) }
  const component = mount(PullRefresh, { target: document.body, props })
  await unmount(component)
  ```
-->
<script lang='ts'>
  import type { Snippet } from 'svelte'
  import type { DataAttributes } from '../../types.js'
  import { uiM } from '../../messages.js'
  import { notifyError } from '../../toast.svelte.js'
  import { cn, getDataAttributes } from '../../utils.js'

  /**
   * PullRefresh 组件的属性契约；通过公开组件配置使用。
   *
   * @example
   * ```ts
   * import { mount, unmount, createRawSnippet } from 'svelte'
   * import type { ComponentProps } from 'svelte'
   * import { PullRefresh } from '@h-ai/ui'
   * const props: ComponentProps<typeof PullRefresh> = { threshold: 80, children: createRawSnippet(() => ({ render: () => "<p>可下拉更新的内容。</p>" })) }
   * const component = mount(PullRefresh, { target: document.body, props })
   * await unmount(component)
   * ```
   */
  interface Props {
    /** 刷新回调（需返回 Promise）；拒绝时提示失败并恢复下拉操作。 */
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
    ...restProps
  }: Props & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))
  let pulling = $state(false)
  let refreshing = $state(false)
  let pullDistance = $state(0)
  let startY = 0

  function handleTouchStart(e: TouchEvent) {
    const touch = e.touches[0]
    if (disabled || refreshing || !touch)
      return
    startY = touch.clientY
    pulling = true
  }

  function handleTouchMove(e: TouchEvent) {
    const touch = e.touches[0]
    if (!pulling || disabled || refreshing || !touch)
      return
    const diff = Math.max(0, touch.clientY - startY)
    pullDistance = Math.min(diff * 0.5, threshold * 1.5) // 阻尼
  }

  async function handleTouchEnd() {
    if (!pulling)
      return
    pulling = false

    try {
      if (!disabled && pullDistance >= threshold && onrefresh) {
        refreshing = true
        await onrefresh()
      }
    }
    catch (error) {
      notifyError(typeof error === 'string'
        ? new Error(error)
        : error, uiM('pull_refresh_failed'))
    }
    finally {
      refreshing = false
      pullDistance = 0
    }
  }

  function handleTouchCancel() {
    if (pulling) {
      pulling = false
      pullDistance = 0
    }
  }
</script>

<div {...dataAttributes}
     class={cn('relative overflow-hidden', className)}
     ontouchstart={handleTouchStart}
     ontouchmove={handleTouchMove}
     ontouchend={handleTouchEnd}
     ontouchcancel={handleTouchCancel}
     role='region'
>
  <!-- 刷新指示器 -->
  <div
    class='flex items-center justify-center text-sm text-base-content/60 overflow-hidden transition-all'
    style='height: {pullDistance}px'
  >
    {#if refreshing}
      <span class='loading loading-spinner loading-sm mr-2'></span>
      {uiM('pull_refresh_active')}
    {:else if pullDistance >= threshold}
      {uiM('pull_refresh_release')}
    {:else if pullDistance > 0}
      {uiM('pull_refresh_prompt')}
    {/if}
  </div>

  <!-- 内容区域 -->
  {@render children()}
</div>
