<!--
  =============================================================================
  @h-ai/ui - Result 组件
  =============================================================================
  结果页展示组件，用于操作反馈

  使用 Svelte 5 Runes ($props, $derived)
  =============================================================================
-->
<script lang='ts'>
  import type { ResultProps } from '../../types.js'
  import { cn } from '../../utils.js'

  const {
    status = 'info',
    title = '',
    description = '',
    class: className = '',
    icon,
    actions,
    children,
  }: ResultProps = $props()

  const containerClass = $derived(
    cn(
      'flex flex-col items-center justify-center py-12 text-center',
      className,
    ),
  )

  const iconColor = $derived({
    success: 'text-success',
    error: 'text-error',
    warning: 'text-warning',
    info: 'text-info',
  }[status])
</script>

<div class={containerClass}>
  <!-- 图标区域 -->
  <div class='w-20 h-20 mb-6 {iconColor}'>
    {#if icon}
      {@render icon()}
    {:else if status === 'success'}
      <svg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor' class='w-full h-full'>
        <path stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z' />
      </svg>
    {:else if status === 'error'}
      <svg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor' class='w-full h-full'>
        <path stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z' />
      </svg>
    {:else if status === 'warning'}
      <svg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor' class='w-full h-full'>
        <path stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z' />
      </svg>
    {:else}
      <svg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor' class='w-full h-full'>
        <path stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z' />
      </svg>
    {/if}
  </div>

  <!-- 标题 -->
  <h2 class='text-2xl font-semibold text-base-content'>{title}</h2>

  <!-- 描述 -->
  {#if description}
    <p class='mt-2 text-base-content/70 max-w-md'>{description}</p>
  {/if}

  <!-- 自定义内容 -->
  {#if children}
    <div class='mt-4'>
      {@render children()}
    </div>
  {/if}

  <!-- 操作按钮区域 -->
  {#if actions}
    <div class='mt-6 flex gap-3'>
      {@render actions()}
    </div>
  {/if}
</div>
