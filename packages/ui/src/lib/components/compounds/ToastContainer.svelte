<!--
  =============================================================================
  @h-ai/ui - ToastContainer 组件
  =============================================================================
  Toast 容器组件，显示所有 Toast 通知

  使用 Svelte 5 Runes ($derived / $effect)

  叠加策略（关键）：原生 <dialog>.showModal() 处于浏览器 top layer，且在 Chromium 中
  始终渲染在 Popover 之上。为保证 Toast 永远可见、不被弹窗遮挡：
    - 当存在已打开的 modal dialog 时，将 Toast 层寄宿到该 dialog 内部（同处 top layer，
      作为最后子节点渲染在其内容之上）；
    - 否则寄宿到 <body> 并以 Popover 进入 top layer，叠加在普通内容之上。
  =============================================================================
-->
<script lang='ts'>
  import { onMount } from 'svelte'
  import { uiM } from '../../messages.js'
  import { toast } from '../../toast.svelte.js'
  import { cn, getAlertVariantClass } from '../../utils.js'
  import IconButton from '../primitives/IconButton.svelte'

  const positionMap = {
    'top-right': 'toast-top toast-end',
    'top-left': 'toast-top toast-start',
    'bottom-right': 'toast-bottom toast-end',
    'bottom-left': 'toast-bottom toast-start',
    'top-center': 'toast-top toast-center',
    'bottom-center': 'toast-bottom toast-center',
  }

  // 容器根元素引用。
  let layerElement: HTMLDivElement | undefined = $state()

  const hasItems = $derived(toast.items.length > 0)

  // 按位置分组
  const groupedItems = $derived(() => {
    const groups: Record<string, typeof toast.items> = {}

    for (const item of toast.items) {
      const position = item.position ?? 'top-right'
      if (!groups[position]) {
        groups[position] = []
      }
      groups[position].push(item)
    }

    return groups
  })

  /** 找到最顶层处于打开状态的原生 modal dialog（位于浏览器 top layer）。 */
  function findTopModalDialog(): HTMLDialogElement | null {
    if (typeof document === 'undefined') {
      return null
    }

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
    catch {
    // 元素未连接或重复调用时忽略。
    }
  }

  function safeHidePopover(el: HTMLElement) {
    try {
      if (typeof el.hidePopover === 'function' && el.matches(':popover-open')) {
        el.hidePopover()
      }
    }
    catch {
    // 同上，忽略异常。
    }
  }

  /**
   * 将 Toast 层寄宿到正确的容器：
   * - 有打开的 modal dialog 时，去掉 popover 属性并寄宿到该 dialog 内部，渲染在其内容之上；
   * - 否则寄宿到 <body>，恢复 popover 属性并按需进入 / 退出 top layer。
   */
  function relocate() {
    const el = layerElement
    if (!el) {
      return
    }

    const modal = hasItems ? findTopModalDialog() : null

    if (modal) {
      // 寄宿到 dialog：popover 元素未显示时会 display:none，故先移除 popover 属性。
      safeHidePopover(el)
      if (el.hasAttribute('popover')) {
        el.removeAttribute('popover')
      }
      if (el.parentElement !== modal) {
        modal.appendChild(el)
      }
      return
    }

    if (el.parentElement !== document.body) {
      document.body.appendChild(el)
    }
    if (!el.hasAttribute('popover')) {
      el.setAttribute('popover', 'manual')
    }
    if (hasItems) {
      safeShowPopover(el)
    }
    else {
      safeHidePopover(el)
    }
  }

  onMount(() => {
    relocate()

    // dialog 通过 showModal()/close() 切换 `open` 属性；据此重新寄宿 Toast 层。
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

  // Toast 数量变化时重新寄宿（出现 / 消失、以及在 dialog 与 body 之间切换）。
  $effect(() => {
    void hasItems
    relocate()
  })
</script>

<div bind:this={layerElement} popover='manual' class='hai-toast-layer'>
  {#each Object.entries(groupedItems()) as [position, items] (position)}
    <div class={cn('toast', positionMap[position as keyof typeof positionMap])}>
      {#each items as item (item.id)}
        <div class={cn('alert', getAlertVariantClass(item.variant ?? 'info'))}>
          <span>{item.message}</span>
          {#if item.dismissible}
            <IconButton
              variant='ghost'
              size='sm'
              onclick={() => toast.remove(item.id)}
              ariaLabel={uiM('toast_dismiss')}
            >
              ✕
            </IconButton>
          {/if}
        </div>
      {/each}
    </div>
  {/each}
</div>

<style>
  /* 容器铺满视口但不拦截交互；仅 toast 本体接收指针事件。 */
  .hai-toast-layer {
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
  }

  /* 未支持 Popover API 的浏览器忽略 popover 属性，容器常驻文档流；
     此时无 toast 项则内部不渲染任何内容，容器透明且不拦截交互。 */

  .hai-toast-layer :global(.toast) {
    pointer-events: auto;
  }
</style>
