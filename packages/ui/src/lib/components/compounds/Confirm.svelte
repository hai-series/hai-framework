<!--
  @component Confirm
  =============================================================================
  @h-ai/ui - Confirm 组件
  =============================================================================
  确认对话框组件

  使用 Svelte 5 Runes ($props, $state)
  使用 primitives 组件：Button
  =============================================================================

  @example
  ```ts
  import { mount, unmount } from 'svelte'
  import type { ComponentProps } from 'svelte'
  import { Confirm } from '@h-ai/ui'
  const props: ComponentProps<typeof Confirm> = { open: true, title: '删除记录', message: '确定删除这条记录？', variant: 'warning' }
  const component = mount(Confirm, { target: document.body, props })
  await unmount(component)
  ```
-->
<script lang='ts'>
  import type { ConfirmProps, DataAttributes } from '../../types.js'
  import { uiM } from '../../messages.js'
  import { cn, getDataAttributes } from '../../utils.js'
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
    ...restProps
  }: ConfirmProps & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))
  const titleId = $props.id()
  const messageId = `${titleId}-message`
  /** 响应式 i18n 显示值 */
  const displayTitle = $derived(title ?? uiM('confirm_title'))
  const displayMessage = $derived(message ?? uiM('confirm_message'))
  const displayConfirmText = $derived(confirmText ?? uiM('confirm_ok'))
  const displayCancelText = $derived(cancelText ?? uiM('confirm_cancel'))

  let modalElement: HTMLDialogElement

  $effect(() => {
    if (open) {
      modalElement?.showModal()
    }
    else {
      modalElement?.close()
    }
  })

  async function handleConfirm() {
    await onconfirm?.()
    open = false
  }

  function handleCancel() {
    if (loading)
      return
    oncancel?.()
    open = false
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === modalElement) {
      handleCancel()
    }
  }
</script>

<dialog {...dataAttributes}
        bind:this={modalElement}
        class={cn('modal', className)}
        onclick={handleBackdropClick}
        aria-labelledby={titleId}
        aria-describedby={messageId}
        oncancel={(event) => {
          event.preventDefault()
          handleCancel()
        }}
>
  <div class='modal-box'>
    <h3 id={titleId} class='font-bold text-lg'>{displayTitle}</h3>
    <p id={messageId} class='py-4'>{displayMessage}</p>
    <div class='modal-action'>
      <Button
        variant='ghost'
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
