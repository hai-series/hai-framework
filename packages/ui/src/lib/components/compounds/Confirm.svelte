<!--
  =============================================================================
  @hai/ui - Confirm 组件
  =============================================================================
  确认对话框组件
  
  使用 Svelte 5 Runes ($props, $state)
  =============================================================================
-->
<script lang="ts">
  import type { ConfirmProps } from '../../types.js'
  import { cn } from '../../utils.js'
  
  let {
    open = $bindable(false),
    title = '确认操作',
    message = '确定要执行此操作吗？',
    confirmText = '确定',
    cancelText = '取消',
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
  
  const variantClass = $derived({
    default: 'btn-neutral',
    primary: 'btn-primary',
    warning: 'btn-warning',
    error: 'btn-error',
  }[variant] || 'btn-warning')
  
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
      <button
        type="button"
        class="btn btn-ghost"
        onclick={handleCancel}
        disabled={loading}
      >
        {cancelText}
      </button>
      <button
        type="button"
        class="btn {variantClass}"
        onclick={handleConfirm}
        disabled={loading}
      >
        {#if loading}
          <span class="loading loading-spinner loading-sm"></span>
        {/if}
        {confirmText}
      </button>
    </div>
  </div>
</dialog>
