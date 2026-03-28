<!--
  @component Modal
  模态框组件，支持 backdrop-blur 和 scale-in 动画。
-->
<script lang='ts'>
  import type { ModalProps } from '../../types.js'
  import { uiM } from '../../messages.js'
  import { cn } from '../../utils.js'
  import IconButton from '../primitives/IconButton.svelte'

  let {
    open = $bindable(false),
    title = '',
    size = 'md',
    closeOnBackdrop = true,
    closeOnEscape = true,
    showClose = true,
    class: className = '',
    onclose,
    header,
    footer,
    children,
  }: ModalProps = $props()

  const sizeMap: Record<string, string> = {
    'xs': 'max-w-xs',
    'sm': 'max-w-sm',
    'md': 'max-w-md',
    'lg': 'max-w-lg',
    'xl': 'max-w-xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-3xl',
    '4xl': 'max-w-4xl',
    'full': 'max-w-full h-full',
  }

  const modalBoxClass = $derived(
    cn(
      'modal-box border border-base-content/6 shadow-xl',
      'animate-[hai-scale-in_0.2s_cubic-bezier(0.16,1,0.3,1)]',
      sizeMap[size],
      className,
    ),
  )

  function handleClose() {
    open = false
    onclose?.()
  }

  function handleBackdropClick() {
    if (closeOnBackdrop) {
      handleClose()
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (closeOnEscape && e.key === 'Escape') {
      handleClose()
    }
  }

  // ESC 键处理
  $effect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeydown)
      return () => document.removeEventListener('keydown', handleKeydown)
    }
    return undefined
  })
</script>

<dialog class='modal backdrop-blur-xs' class:modal-open={open}>
  <div class={modalBoxClass}>
    <!-- 头部：标题 + 关闭按钮 -->
    <div class='flex items-start justify-between gap-4'>
      {#if header}
        <div class='font-semibold text-base flex-1'>
          {@render header()}
        </div>
      {:else if title}
        <h3 class='font-semibold text-base flex-1'>{title}</h3>
      {:else}
        <div class='flex-1'></div>
      {/if}

      {#if showClose}
        <IconButton
          size='sm'
          variant='ghost'
          label={uiM('common_close')}
          onclick={handleClose}
          class='-mt-1 -mr-2'
        >
          {#snippet children()}
            <span class='icon-[tabler--x] size-4.5'></span>
          {/snippet}
        </IconButton>
      {/if}
    </div>

    <div class='py-4'>
      {#if children}
        {@render children()}
      {/if}
    </div>

    {#if footer}
      <div class='modal-action'>
        {@render footer()}
      </div>
    {/if}
  </div>

  <button
    type='button'
    class='modal-backdrop'
    aria-label={uiM('modal_close')}
    onclick={handleBackdropClick}
  >
    {uiM('common_close')}
  </button>
</dialog>
