<!--
  @h-ai/ui — SwipeCell（滑动操作 — 列表项左滑删除等）

  用法：
  <SwipeCell
    actions={[
      { id: 'delete', label: '删除', variant: 'error' },
    ]}
    onaction={(id) => handleAction(id)}
  >
    <div class="p-4">列表项内容</div>
  </SwipeCell>
-->
<script lang='ts'>
  import type { Snippet } from 'svelte'
  import type { SwipeCellAction } from './swipe-cell-types.js'
  import { cn } from '../../utils.js'

  // eslint-disable-next-line no-import-assign -- type re-export
  export type { SwipeCellAction }

  interface Props {
    /** 右侧操作列表 */
    actions: SwipeCellAction[]
    /** 操作回调 */
    onaction?: (id: string) => void
    /** 是否禁用 */
    disabled?: boolean
    /** 额外 CSS 类 */
    class?: string
    /** 内容 */
    children: Snippet
  }

  const {
    actions,
    onaction,
    disabled = false,
    class: className,
    children,
  }: Props = $props()

  let offsetX = $state(0)
  let startX = 0
  let swiping = false

  const totalActionWidth = $derived(actions.reduce((sum, a) => sum + (a.width ?? 72), 0))

  function handleTouchStart(e: TouchEvent) {
    if (disabled)
      return
    startX = e.touches[0].clientX
    swiping = true
  }

  function handleTouchMove(e: TouchEvent) {
    if (!swiping || disabled)
      return
    const diff = startX - e.touches[0].clientX
    // 只允许左滑
    offsetX = Math.max(0, Math.min(diff, totalActionWidth))
  }

  function handleTouchEnd() {
    if (!swiping)
      return
    swiping = false
    // 超过一半则展开，否则收回
    offsetX = offsetX > totalActionWidth / 2 ? totalActionWidth : 0
  }

  function handleAction(id: string) {
    onaction?.(id)
    offsetX = 0
  }

  const variantBg: Record<string, string> = {
    primary: 'bg-primary text-primary-content',
    error: 'bg-error text-error-content',
    warning: 'bg-warning text-warning-content',
    info: 'bg-info text-info-content',
  }
</script>

<div class={cn('relative overflow-hidden', className)}>
  <!-- 内容层 -->
  <div
    class='relative transition-transform'
    style='transform: translateX(-{offsetX}px)'
    ontouchstart={handleTouchStart}
    ontouchmove={handleTouchMove}
    ontouchend={handleTouchEnd}
    role='row'
    tabindex='0'
  >
    {@render children()}
  </div>

  <!-- 操作按钮层 -->
  <div class='absolute top-0 right-0 h-full flex' style='transform: translateX({totalActionWidth - offsetX}px)'>
    {#each actions as action (action.id)}
      <button
        type='button'
        class={cn(
          'flex items-center justify-center h-full text-sm font-medium',
          variantBg[action.variant ?? 'primary'],
        )}
        style='width: {action.width ?? 72}px'
        onclick={() => handleAction(action.id)}
      >
        {action.label}
      </button>
    {/each}
  </div>
</div>
