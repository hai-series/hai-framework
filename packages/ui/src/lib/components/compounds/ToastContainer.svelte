<!--
  @component
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
  import { onMount, untrack } from 'svelte'
  import { writeTextToClipboard } from '../../internal/browser-safety.js'
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
  let expandedId = $state<string>()
  let hoveredId = $state<string>()
  let focusedId = $state<string>()
  let copyResult = $state<{ id: string, success: boolean }>()

  // 阅读、选择编号或键盘操作期间不自动关闭；交互结束后使用剩余时间继续计时。
  $effect(() => {
    const id = currentItems[0]?.id
    if (!id)
      return
    const paused = expandedId === id || hoveredId === id || focusedId === id
    untrack(() => paused ? toast.pause(id) : toast.resume(id))
    return () => untrack(() => toast.resume(id))
  })

  async function copyTrace(id: string, traceId: string) {
    const active = document.activeElement
    const success = await writeTextToClipboard(traceId)
    if (currentItems[0]?.id === id) {
      copyResult = { id, success }
      // execCommand 回退可能临时移动焦点，复制后继续留在当前操作。
      if (active instanceof HTMLElement && active.isConnected)
        active.focus({ preventScroll: true })
    }
  }

  // Toast 可位于 Modal 的焦点循环之外；F8 提供统一入口，关闭后返回原操作。
  let previousFocus: HTMLElement | null = null

  function restoreFocus() {
    if (previousFocus?.isConnected && !previousFocus.matches(':disabled'))
      previousFocus.focus({ preventScroll: true })
    previousFocus = null
  }

  function dismiss(id: string) {
    if (layerElement?.contains(document.activeElement))
      restoreFocus()
    toast.remove(id)
  }

  function handleShortcut(event: KeyboardEvent) {
    if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.altKey || event.metaKey || !hasItems)
      return
    const inside = layerElement?.contains(document.activeElement)
    if (event.key === 'F8') {
      event.preventDefault()
      if (inside) {
        restoreFocus()
      }
      else {
        previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
        const target = layerElement?.querySelector<HTMLElement>('button, .hai-toast-item')
        // 优先聚焦排查或关闭按钮；没有按钮的提示仍可聚焦阅读，再按 F8 返回。
        const button = layerElement?.querySelector<HTMLButtonElement>('button')
        ;(button ?? target)?.focus({ preventScroll: true })
      }
    }
    else if (event.key === 'Escape' && inside) {
      event.preventDefault()
      event.stopPropagation()
      const item = currentItems[0]
      if (item?.dismissible)
        dismiss(item.id)
      else
        restoreFocus()
    }
  }

  // 在当前 DOM 被移除前恢复焦点，涵盖自动关闭、外部 clear/remove 及卸载。
  $effect.pre(() => {
    void currentItems[0]?.id
    return () => {
      if (layerElement?.contains(document.activeElement))
        restoreFocus()
    }
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
    // 部分宿主仅实现 popover 的隐藏样式；移除属性才能保持回退层可见、可聚焦。
    if (typeof el.showPopover !== 'function') {
      el.removeAttribute('popover')
      return
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

<svelte:window onkeydown={handleShortcut} />

<div {...dataAttributes} bind:this={layerElement} popover='manual' class='hai-toast-layer'>
  {#each currentItems as item (item.id)}
    <div class='hai-toast-position' data-position={item.position ?? 'bottom-right'}>
      <div {...getDataAttributes(item)} class='hai-toast-item text-base-content' role={item.variant === 'error' ? 'alert' : 'status'} aria-live={item.variant === 'error' ? 'assertive' : 'polite'} aria-atomic='true' aria-keyshortcuts='F8' tabindex='-1' data-variant={item.variant ?? 'info'}
           onpointerenter={(event) => {
             if (event.pointerType !== 'touch')
               hoveredId = item.id
           }}
           onpointerleave={() => { hoveredId = undefined }}
           onfocusin={() => { focusedId = item.id }}
           onfocusout={(event) => {
             if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget))
               focusedId = undefined
           }}
      >
        <span aria-hidden='true' class={cn('size-5 shrink-0', iconMap[item.variant as keyof typeof iconMap] ?? iconMap.info)}></span>
        <div class='hai-toast-content'>
          <div class='hai-toast-message'>{item.message}</div>
          {#if item.traceId && expandedId === item.id}
            <div id={`toast-details-${item.id}`} class='hai-toast-details'>
              <div class='font-medium'>{uiM('toast_traceId')}</div>
              <code class='hai-toast-trace'>{item.traceId}</code>
              <p>{uiM('toast_traceHelp')}</p>
              <button type='button' class='btn btn-ghost btn-sm mt-1' onclick={() => copyTrace(item.id, item.traceId!)}>
                <span aria-hidden='true' class='icon-[tabler--copy] size-4'></span>
                {uiM('toast_copyTraceId')}
              </button>
              {#if copyResult?.id === item.id}
                <p class='mt-1' role='status'>{copyResult.success ? uiM('toast_traceCopied') : uiM('toast_traceCopyFailed')}</p>
              {/if}
            </div>
          {/if}
        </div>
        <span class='sr-only'>{uiM('toast_keyboardHint')}</span>
        {#if item.traceId}
          <button type='button' class='btn btn-ghost btn-sm btn-square hai-toast-details-toggle'
                  aria-label={uiM('toast_diagnostics')} title={uiM('toast_diagnostics')}
                  aria-expanded={expandedId === item.id} aria-controls={`toast-details-${item.id}`}
                  onclick={() => { expandedId = expandedId === item.id ? undefined : item.id }}
          ><span aria-hidden='true' class='icon-[tabler--info-circle] size-4'></span></button>
        {/if}
        {#if item.dismissible}
          <IconButton
            variant='ghost'
            size='sm'
            class='shrink-0 text-base-content/45'
            onclick={() => dismiss(item.id)}
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

  .hai-toast-position:has([aria-expanded='true']) {
    width: min(30rem, calc(100% - 2rem - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)));
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
    padding: 0.5rem 0.75rem;
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

  .hai-toast-content {
    flex: 1;
    min-width: 0;
    max-height: min(30rem, 75dvh);
    overflow: auto;
  }

  .hai-toast-details-toggle {
    flex-shrink: 0;
  }

  /* 展开排查信息后，图标和操作仍与正文首行对齐。 */
  .hai-toast-item:has(.hai-toast-details) {
    align-items: flex-start;
  }

  .hai-toast-item:has(.hai-toast-details) > span[aria-hidden='true'] {
    margin-top: 0.375rem;
  }

  .hai-toast-details {
    margin-top: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px solid color-mix(in oklab, var(--hai-toast-accent) 20%, transparent);
    font-size: 0.75rem;
    line-height: 1.6;
  }

  .hai-toast-trace {
    display: block;
    margin-block: 0.25rem;
    overflow-wrap: anywhere;
    user-select: text;
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
    display: flex;
    align-items: safe center;
    min-height: 2rem;
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
