<!--
  =============================================================================
  @h-ai/ui - Empty 组件
  =============================================================================
  空状态展示组件

  使用 Svelte 5 Runes ($props, $derived)
  =============================================================================
-->
<script lang='ts'>
  import type { EmptyProps } from '../../types.js'
  import { uiM } from '../../messages.js'
  import { cn } from '../../utils.js'

  const {
    title,
    description = '',
    icon = 'inbox',
    size = 'md',
    class: className = '',
    action,
    children,
  }: EmptyProps = $props()

  const displayTitle = $derived(title ?? uiM('empty_title'))

  const containerClass = $derived(
    cn(
      'flex flex-col items-center justify-center py-8 text-center',
      size === 'sm' && 'py-4',
      size === 'lg' && 'py-12',
      className,
    ),
  )

  const iconSize = $derived(
    size === 'sm' ? 'w-12 h-12' : size === 'lg' ? 'w-24 h-24' : 'w-16 h-16',
  )

  const titleSize = $derived(
    size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-xl' : 'text-base',
  )
</script>

<div class={containerClass}>
  <!-- 图标区域 -->
  <div class='text-base-content/30 mb-4 {iconSize}'>
    {#if children}
      {@render children()}
    {:else if icon === 'inbox'}
      <svg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor' class='w-full h-full'>
        <path stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4' />
      </svg>
    {:else if icon === 'search'}
      <svg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor' class='w-full h-full'>
        <path stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z' />
      </svg>
    {:else if icon === 'file'}
      <svg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor' class='w-full h-full'>
        <path stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z' />
      </svg>
    {:else if icon === 'error'}
      <svg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor' class='w-full h-full'>
        <path stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z' />
      </svg>
    {/if}
  </div>

  <!-- 标题 -->
  <h3 class='font-medium text-base-content/70 {titleSize}'>{displayTitle}</h3>

  <!-- 描述 -->
  {#if description}
    <p class='mt-1 text-sm text-base-content/50 max-w-sm'>{description}</p>
  {/if}

  <!-- 操作按钮插槽 -->
  {#if action}
    <div class='mt-4'>
      {@render action()}
    </div>
  {/if}
</div>
