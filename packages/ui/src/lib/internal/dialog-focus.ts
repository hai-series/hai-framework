/** 弹窗和抽屉共享可见、可操作的焦点边界。 */
function focusable(panel: HTMLElement): HTMLElement[] {
  return [...panel.querySelectorAll<HTMLElement>('button, a[href], input:not([type="hidden"]), select, textarea, [tabindex]')]
    .filter(element => element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length > 0)
}

/**
 * 打开后优先聚焦可编辑字段，清理时取消首帧校准并恢复触发控件。
 * @example 模块内部上下文
 * ```ts
 * function example(panel: HTMLElement) {
 *   const restore = focusDialog(panel)
 *   return restore
 * }
 * ```
 */
export function focusDialog(panel: HTMLElement): () => void {
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
  function preferred() {
    const elements = focusable(panel)
    return elements.find(element => element.matches('input:not([readonly]), textarea, select, [role="combobox"]')) ?? elements[0] ?? panel
  }
  const initial = preferred()
  initial.focus({ preventScroll: true })
  function alignFocus() {
    const active = document.activeElement
    if (panel.isConnected && (active === previous || active === initial || active === panel || active === document.body))
      preferred().focus({ preventScroll: true })
  }
  function onTransition(event: TransitionEvent) {
    if (event.target === panel)
      alignFocus()
  }
  panel.addEventListener('transitionend', onTransition)
  const frame = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(alignFocus) : undefined
  return () => {
    panel.removeEventListener('transitionend', onTransition)
    if (frame !== undefined)
      cancelAnimationFrame(frame)
    if (previous?.isConnected && !previous.matches(':disabled'))
      previous.focus()
  }
}

/**
 * 原生 Tab 顺序只在边缘循环；嵌套弹层已处理的键盘事件不再拦截。
 * @example 模块内部上下文
 * ```ts
 * function example(event: KeyboardEvent, panel: HTMLElement) {
 *   handleDialogKeydown(event, panel, () => {})
 * }
 * ```
 */
export function handleDialogKeydown(event: KeyboardEvent, panel: HTMLElement, close?: () => void): void {
  if (event.defaultPrevented)
    return
  if (event.key === 'Escape' && close) {
    event.preventDefault()
    event.stopPropagation()
    close()
  }
  else if (event.key === 'Tab') {
    const elements = focusable(panel)
    const first = elements[0]
    const last = elements.at(-1)
    if (!first) {
      event.preventDefault()
      panel.focus()
    }
    else if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
      event.preventDefault()
      last?.focus()
    }
    else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }
}
