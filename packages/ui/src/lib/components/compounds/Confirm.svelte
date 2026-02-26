<!--
  =============================================================================
  @h-ai/ui - Confirm 组件
  =============================================================================
  确认对话框组件
  
  使用 Svelte 5 Runes ($props, $state)
  使用 primitives 组件：Button
  =============================================================================
-->
<script lang="ts">
  import type { ConfirmProps } from '../../types.js'
  import { cn } from '../../utils.js'
  import { m } from '../../messages.js'
  import Button from '../primitives/Button.svelte'
  
  let {
    open = $bindable(false),
    title,
    message,
    confirmText,
    cancelText,
    variant = 'warning',
    loading = false,
    class: className = '',
    onconfirm,
    oncancel,
  }: ConfirmProps = $props()

  /** 响应式 i18n 显示值 */
  const displayTitle = $derived(title ?? m('confirm_title'))
  const displayMessage = $derived(message ?? m('confirm_message'))
  const displayConfirmText = $derived(confirmText ?? m('confirm_ok'))
  const displayCancelText = $derived(cancelText ?? m('confirm_cancel'))
  
  let modalElement: HTMLDialogElement
  
  $effect(() => {
    if (open) {
      modalElement?.showModal()
    } else {
      modalElement?.close()
    }
  })
  
  async function handleConfirm() {
    await onconfirm?.()
    open = false
  }
  
  function handleCancel() {
    oncancel?.()
    open = false
  }
  
  function handleBackdropClick(e: MouseEvent) {
    if (e.target === modalElement) {
      handleCancel()
    }
  }
</script>

<dialog
  bind:this={modalElement}
  class={cn('modal', className)}
  onclick={handleBackdropClick}
>
  <div class="modal-box">
    <h3 class="font-bold text-lg">{displayTitle}</h3>
    <p class="py-4">{displayMessage}</p>
    <div class="modal-action">
      <Button
        variant="ghost"
        onclick={handleCancel}
        disabled={loading}
      >
        {displayCancelText}
      </Button>
      <Button
        variant={variant}
        onclick={handleConfirm}
        {loading}
        disabled={loading}
      >
        {displayConfirmText}
      </Button>
    </div>
  </div>
</dialog>
