<!--
  @h-ai/ui — ActionSheet（底部操作菜单）

  用法：
  <ActionSheet
    open={showActions}
    items={[
      { id: 'edit', label: '编辑' },
      { id: 'delete', label: '删除', destructive: true },
    ]}
    onselect={(id) => handleAction(id)}
    onclose={() => showActions = false}
  />
-->
<script lang="ts">
  import type { ActionSheetItem } from './action-sheet-types.js'
  import { cn } from '../../utils.js'

  export type { ActionSheetItem }

  interface Props {
    /** 是否显示 */
    open?: boolean
    /** 操作列表 */
    items: ActionSheetItem[]
    /** 标题 */
    title?: string
    /** 取消按钮文字 */
    cancelText?: string
    /** 选择回调 */
    onselect?: (id: string) => void
    /** 关闭回调 */
    onclose?: () => void
    /** 额外 CSS 类 */
    class?: string
  }

  const {
    open = false,
    items,
    title,
    cancelText = 'Cancel',
    onselect,
    onclose,
    class: className,
  }: Props = $props()

  function handleSelect(id: string) {
    onselect?.(id)
    onclose?.()
  }
</script>

{#if open}
  <!-- 遮罩层 -->
  <div
    class="fixed inset-0 bg-black/50 z-50 transition-opacity"
    role="button"
    tabindex="-1"
    onclick={onclose}
    onkeydown={(e) => e.key === 'Escape' && onclose?.()}
  ></div>

  <!-- 操作面板 -->
  <div
    class={cn(
      'fixed bottom-0 left-0 right-0 z-50 bg-base-100 rounded-t-2xl hai-safe-bottom',
      'animate-[slideUp_0.25s_ease-out]',
      className,
    )}
  >
    {#if title}
      <div class="text-center text-sm text-base-content/60 py-3 border-b border-base-200">
        {title}
      </div>
    {/if}

    <div class="py-1">
      {#each items as item (item.id)}
        <button
          type="button"
          class={cn(
            'w-full py-3.5 text-center text-base transition-colors',
            'active:bg-base-200',
            item.destructive && 'text-error',
            item.disabled && 'opacity-50 cursor-not-allowed',
            !item.destructive && !item.disabled && 'text-base-content',
          )}
          disabled={item.disabled}
          onclick={() => handleSelect(item.id)}
        >
          {item.label}
        </button>
      {/each}
    </div>

    <!-- 取消按钮 -->
    <div class="border-t-4 border-base-200">
      <button
        type="button"
        class="w-full py-3.5 text-center text-base font-medium text-base-content active:bg-base-200"
        onclick={onclose}
      >
        {cancelText}
      </button>
    </div>
  </div>
{/if}

<style>
  @keyframes slideUp {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
  }
</style>
