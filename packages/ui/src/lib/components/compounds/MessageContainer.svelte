<!--
  =============================================================================
  @h-ai/ui - MessageContainer 组件
  =============================================================================
  轻量消息提示容器，渲染 message store 中的消息条目。
  视觉风格：顶部居中、带类型图标、自动滑入滑出。

  叠加策略与 ToastContainer 一致：
    - 有打开的 modal dialog 时，寄宿到 dialog 内部（top layer）；
    - 否则寄宿到 <body> 以 popover 进入 top layer。
  =============================================================================
-->
<script lang='ts'>
  import { onMount } from 'svelte'
  import { message } from '../../message.svelte.js'
  import { cn } from '../../utils.js'
  import IconButton from '../primitives/IconButton.svelte'

  /** 图标类型到 tabler icon 的映射 */
  const iconMap: Record<string, string> = {
    info: 'icon-[tabler--info-circle]',
    success: 'icon-[tabler--circle-check]',
    warning: 'icon-[tabler--alert-triangle]',
    error: 'icon-[tabler--circle-x]',
  }

  /** 图标颜色映射 */
  const iconColorMap: Record<string, string> = {
    info: 'text-info',
    success: 'text-success',
    warning: 'text-warning',
    error: 'text-error',
  }

  /** 背景/边框映射 */
  const bgMap: Record<string, string> = {
    info: 'border-info/20 bg-info/5',
    success: 'border-success/20 bg-success/5',
    warning: 'border-warning/20 bg-warning/5',
    error: 'border-error/20 bg-error/5',
  }

  let layerElement: HTMLDivElement | undefined = $state()

  const hasItems = $derived(message.items.length > 0)

  /** 找到最顶层处于打开状态的原生 modal dialog。 */
  function findTopModalDialog(): HTMLDialogElement | null {
    if (typeof document === 'undefined')
      return null
    const dialogs = document.querySelectorAll<HTMLDialogElement>('dialog')
    let top: HTMLDialogElement | null = null
    for (const dialog of dialogs) {
      if (dialog.open && typeof dialog.matches === 'function' && dialog.matches(':modal')) {
        top = dialog
      }
    }
    return top
  }

  function safeShowPopover(el: HTMLElement) {
    try {
      if (typeof el.showPopover === 'function' && el.isConnected && !el.matches(':popover-open')) {
        el.showPopover()
      }
    }
    catch { /* 忽略异常 */ }
  }

  function safeHidePopover(el: HTMLElement) {
    try {
      if (typeof el.hidePopover === 'function' && el.matches(':popover-open')) {
        el.hidePopover()
      }
    }
    catch { /* 忽略异常 */ }
  }

  function relocate() {
    const el = layerElement
    if (!el)
      return

    const modal = hasItems ? findTopModalDialog() : null

    if (modal) {
      safeHidePopover(el)
      if (el.hasAttribute('popover'))
        el.removeAttribute('popover')
      if (el.parentElement !== modal)
        modal.appendChild(el)
      return
    }

    if (el.parentElement !== document.body)
      document.body.appendChild(el)
    if (!el.hasAttribute('popover'))
      el.setAttribute('popover', 'manual')
    if (hasItems) {
      safeShowPopover(el)
    }
    else {
      safeHidePopover(el)
    }
  }

  onMount(() => {
    relocate()
    const observer = new MutationObserver(() => relocate())
    observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] })
    return () => {
      observer.disconnect()
      const el = layerElement
      if (el) {
        safeHidePopover(el)
        el.remove()
      }
    }
  })

  $effect(() => {
    void hasItems
    relocate()
  })
</script>

<div bind:this={layerElement} popover='manual' class='hai-message-layer'>
  <div class='hai-message-stack'>
    {#each message.items as item (item.id)}
      <div
        class={cn(
          'hai-message-item alert shadow-lg border',
          bgMap[item.type] ?? bgMap.info,
        )}
        role='alert'
      >
        <span class={cn(iconMap[item.type] ?? iconMap.info, 'size-5 shrink-0', iconColorMap[item.type] ?? iconColorMap.info)}></span>
        <span class='text-sm'>{item.message}</span>
        {#if item.closable}
          <IconButton
            variant='ghost'
            size='sm'
            onclick={() => message.remove(item.id)}
            ariaLabel='close'
          >
            ✕
          </IconButton>
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .hai-message-layer {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    max-width: none;
    max-height: none;
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    overflow: visible;
    pointer-events: none;
    z-index: 9999;
  }

  .hai-message-stack {
    position: absolute;
    top: 1rem;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    pointer-events: auto;
  }

  .hai-message-item {
    animation: hai-message-enter 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    min-width: 16rem;
    max-width: 32rem;
    white-space: nowrap;
  }

  @keyframes hai-message-enter {
    from {
      opacity: 0;
      transform: translateY(-1rem);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
