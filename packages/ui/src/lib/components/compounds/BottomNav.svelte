<!--
  @h-ai/ui — BottomNav（底部导航栏）

  用法：
  <BottomNav items={navItems} active="home" onchange={(id) => goto(`/${id}`)} />
-->
<script lang='ts'>
  import type { BottomNavItem } from './bottom-nav-types.js'
  import { cn } from '../../utils.js'

  // eslint-disable-next-line no-import-assign -- type re-export
  export type { BottomNavItem }

  interface Props {
    /** 导航项列表 */
    items: BottomNavItem[]
    /** 当前激活项 ID */
    active?: string
    /** 切换回调 */
    onchange?: (id: string) => void
    /** 是否适配底部安全区域 */
    safeArea?: boolean
    /** 额外 CSS 类 */
    class?: string
  }

  const {
    items,
    active,
    onchange,
    safeArea = true,
    class: className,
  }: Props = $props()
</script>

<nav
  class={cn(
    'fixed bottom-0 left-0 right-0 bg-base-100 border-t border-base-200 z-40',
    safeArea && 'hai-safe-bottom',
    className,
  )}
>
  <div class='flex items-center justify-around h-14'>
    {#each items as item (item.id)}
      <button
        type='button'
        class={cn(
          'flex flex-col items-center justify-center flex-1 h-full relative transition-colors',
          'hai-no-select',
          item.id === active ? 'text-primary' : 'text-base-content/60',
        )}
        onclick={() => onchange?.(item.id)}
      >
        <!-- 图标 -->
        <div class='relative w-6 h-6 mb-0.5'>
          {#if item.icon}
            {@render item.icon()}
          {:else if item.iconClass}
            <span class='{item.iconClass} w-6 h-6'></span>
          {/if}
          {#if item.badge && item.badge > 0}
            <span class='absolute -top-1 -right-2 badge badge-error badge-xs text-[10px] min-w-4 h-4'>
              {item.badge > 99 ? '99+' : item.badge}
            </span>
          {/if}
        </div>
        <!-- 文本 -->
        <span class='text-xs leading-tight'>{item.label}</span>
      </button>
    {/each}
  </div>
</nav>

<!-- 占位（避免内容被遮挡） -->
<div class={cn('h-14', safeArea && 'hai-safe-bottom')}></div>
