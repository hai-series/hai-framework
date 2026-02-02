<!--
  =============================================================================
  @hai/ui - Modal 组件
  =============================================================================
  模态框组件
  
  使用 Svelte 5 Runes ($props, $derived, $effect)
  使用 primitives 组件：IconButton
  =============================================================================
-->
<script lang="ts">
  import type { ModalProps } from '../../types.js'
  import { cn } from '../../utils.js'
  import IconButton from '../primitives/IconButton.svelte'
  import BareButton from '../primitives/BareButton.svelte'
  
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
  
  const sizeMap = {
    xs: 'max-w-xs',
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    full: 'max-w-full h-full',
  }
  
  const modalBoxClass = $derived(
    cn(
      'modal-box',
      sizeMap[size],
      className,
    )
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

<dialog class="modal" class:modal-open={open}>
  <div class={modalBoxClass}>
    <!-- 头部：标题 + 关闭按钮 -->
    <div class="flex items-start justify-between gap-4">
      {#if header}
        <div class="font-bold text-lg flex-1">
          {@render header()}
        </div>
      {:else if title}
        <h3 class="font-bold text-lg flex-1">{title}</h3>
      {:else}
        <div class="flex-1"></div>
      {/if}
      
      {#if showClose}
        <IconButton
          size="sm"
          variant="ghost"
          label="Close"
          onclick={handleClose}
          class="-mt-1 -mr-2"
        >
          {#snippet children()}
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          {/snippet}
        </IconButton>
      {/if}
    </div>
    
    <div class="py-4">
      {#if children}
        {@render children()}
      {/if}
    </div>
    
    {#if footer}
      <div class="modal-action">
        {@render footer()}
      </div>
    {/if}
  </div>
  
  <form method="dialog" class="modal-backdrop">
    <BareButton type="submit" onclick={handleBackdropClick}>close</BareButton>
  </form>
</dialog>
