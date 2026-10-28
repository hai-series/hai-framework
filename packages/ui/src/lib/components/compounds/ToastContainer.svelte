<!--
  @component ToastContainer
  =============================================================================
  @h-ai/ui - ToastContainer 组件
  =============================================================================
  浮动操作提示容器，按先后顺序逐条显示，不占用页面布局。

  使用 Svelte 5 Runes ($derived / $effect)

  叠加策略（关键）：原生 <dialog>.showModal() 处于浏览器 top layer，且在 Chromium 中
  始终渲染在 Popover 之上。为保证 Toast 永远可见、不被弹窗遮挡：
    - 当存在已打开的 modal dialog 时，将 Toast 层寄宿到该 dialog 内部（同处 top layer，
      作为最后子节点渲染在其内容之上）；
    - 否则寄宿到 <body> 并以 Popover 进入 top layer，叠加在普通内容之上。
  =============================================================================

  @example
  ```ts
  import { mount, unmount } from 'svelte'
  import type { ComponentProps } from 'svelte'
  import { ToastContainer } from '@h-ai/ui'
  const props: ComponentProps<typeof ToastContainer> = { 'data-testid': 'toasts' }
  const component = mount(ToastContainer, { target: document.body, props })
  await unmount(component)
  ```
-->
<script lang='ts'>
  import type { DataAttributes } from '../../types.js'
  import { onMount } from 'svelte'
  import { uiM } from '../../messages.js'
  import { toast } from '../../toast.svelte.js'
  import { cn, getDataAttributes } from '../../utils.js'
  import IconButton from '../primitives/IconButton.svelte'

  const { ...restProps }: DataAttributes = $props()
  const dataAttributes = $derived(getDataAttributes(restProps))

  const iconMap = {
    info: 'icon-[tabler--info-circle] text-info',
    success: 'icon-[tabler--circle-check] text-success',
    warning: 'icon-[tabler--alert-triangle] text-warning',
    error: 'icon-[tabler--circle-x] text-error',
  }

  // 容器根元素引用。
  let layerElement: HTMLDivElement | undefined = $state()

  const hasItems = $derived(toast.items.length > 0)

  const currentItems = $derived(toast.items.slice(0, 1))

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

<div {...dataAttributes} bind:this={layerElement} popover='manual' class='hai-toast-layer'>
  {#each currentItems as item (item.id)}
    <div class='hai-toast-position' data-position={item.position ?? 'bottom-right'}>
      <div {...getDataAttributes(item)} class='hai-toast-item text-base-content' role={item.variant === 'error' ? 'alert' : 'status'} aria-live={item.variant === 'error' ? 'assertive' : 'polite'} aria-atomic='true' data-variant={item.variant ?? 'info'}>
        <span aria-hidden='true' class={cn('size-5 shrink-0', iconMap[item.variant as keyof typeof iconMap] ?? iconMap.info)}></span>
        <span class='hai-toast-message'>{item.message}</span>
        {#if item.dismissible}
          <IconButton
            variant='ghost'
            size='sm'
            class='shrink-0 text-base-content/45'
            onclick={() => toast.remove(item.id)}
            ariaLabel={uiM('toast_dismiss')}
          >
            ✕
          </IconButton>
        {/if}
      </div>
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
    z-index: var(--hai-z-toast, 1200);
  }

  /* 未支持 Popover API 的浏览器忽略 popover 属性，容器仍保持固定定位；
     此时无 toast 项则内部不渲染任何内容，容器透明且不拦截交互。 */

  .hai-toast-position {
    position: absolute;
    width: min(24rem, calc(100% - 2rem - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)));
    right: max(1rem, env(safe-area-inset-right, 0px));
    bottom: max(1rem, env(safe-area-inset-bottom, 0px));
  }

  .hai-toast-position[data-position^='top-'] {
    top: max(1rem, env(safe-area-inset-top, 0px));
    bottom: auto;
  }

  .hai-toast-position[data-position$='-left'] {
    left: max(1rem, env(safe-area-inset-left, 0px));
    right: auto;
  }

  .hai-toast-position[data-position$='-center'] {
    left: 50%;
    right: auto;
    transform: translateX(-50%);
  }

  .hai-toast-item {
    --hai-toast-accent: var(--color-info);
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    border-width: 1px;
    border-style: solid;
    border-color: color-mix(in oklab, var(--hai-toast-accent) 20%, var(--color-base-100));
    border-inline-start: 3px solid var(--hai-toast-accent);
    background: color-mix(in oklab, var(--hai-toast-accent) 5%, var(--color-base-100));
    border-radius: var(--hai-radius-md, 8px);
    box-shadow: 0 4px 18px oklch(0 0 0 / 0.08);
    pointer-events: auto;
    animation: hai-toast-enter 150ms ease-out;
  }

  .hai-toast-item[data-variant='success'] {
    --hai-toast-accent: var(--color-success);
  }

  .hai-toast-item[data-variant='warning'] {
    --hai-toast-accent: var(--color-warning);
  }

  .hai-toast-item[data-variant='error'] {
    --hai-toast-accent: var(--color-error);
  }

  .hai-toast-message {
    flex: 1;
    min-width: 0;
    max-height: min(20rem, 60dvh);
    overflow: auto;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
    font-size: 0.875rem;
    line-height: 1.5;
  }

  @keyframes hai-toast-enter {
    from { opacity: 0; transform: translateY(0.25rem); }
    to { opacity: 1; transform: translateY(0); }
  }

  @media (prefers-reduced-motion: reduce) {
    .hai-toast-item { animation: none; }
  }
</style>
