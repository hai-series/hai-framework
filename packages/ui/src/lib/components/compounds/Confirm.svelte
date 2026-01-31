<!--
  =============================================================================
  @hai/ui - Confirm 组件
  =============================================================================
  确认对话框组件
  
  使用 Svelte 5 Runes ($props, $state)
  使用 primitives 组件：Button
  =============================================================================
-->
<script lang="ts">
  import type { ConfirmProps } from '../../types.js'
  import { cn } from '../../utils.js'
  import Button from '../primitives/Button.svelte'
  
  let {
    open = $bindable(false),
    title = 'Confirm',
    message = 'Are you sure you want to proceed?',
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    variant = 'warning',
    loading = false,
    class: className = '',
    onconfirm,
    oncancel,
  }: ConfirmProps = $props()
  
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
    <h3 class="font-bold text-lg">{title}</h3>
    <p class="py-4">{message}</p>
    <div class="modal-action">
      <Button
        variant="ghost"
        onclick={handleCancel}
        disabled={loading}
      >
        {cancelText}
      </Button>
      <Button
        variant={variant}
        onclick={handleConfirm}
        {loading}
        disabled={loading}
      >
        {confirmText}
      </Button>
    </div>
  </div>
</dialog>
