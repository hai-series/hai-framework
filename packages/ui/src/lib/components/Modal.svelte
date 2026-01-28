<!--
  =============================================================================
  @hai/ui - Modal 组件
  =============================================================================
  模态框组件
  
  使用 Svelte 5 Runes ($props, $derived, $effect)
  =============================================================================
-->
<script lang="ts">
  import type { ModalProps } from '../types.js'
  import { cn } from '../utils.js'
  
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
  })
</script>

<dialog class="modal" class:modal-open={open}>
  <div class={modalBoxClass}>
    {#if showClose}
      <button
        class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
        onclick={handleClose}
      >
        ✕
      </button>
    {/if}
    
    {#if header}
      <div class="font-bold text-lg">
        {@render header()}
      </div>
    {:else if title}
      <h3 class="font-bold text-lg">{title}</h3>
    {/if}
    
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
    <button onclick={handleBackdropClick}>close</button>
  </form>
</dialog>
