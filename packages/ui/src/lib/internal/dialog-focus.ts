/** 弹窗拥有的 portal 分支及其原始触发位置，不改变浏览器的全局焦点。 */
const portalBranches = new WeakMap<HTMLElement, Map<HTMLElement, HTMLElement>>()
const portalOwners = new WeakMap<HTMLElement, HTMLElement>()

/**
 * 从触发位置找到所属模态框；嵌套 portal 沿已登记的所属关系查找。
 * @example 模块内部上下文
 * ```ts
 * function owner(anchor: HTMLElement) { return findDialogOwner(anchor) }
 * ```
 */
export function findDialogOwner(anchor: HTMLElement): HTMLElement | undefined {
  const direct = anchor.closest<HTMLElement>('[role="dialog"][aria-modal="true"]')
  if (direct)
    return direct
  for (let node: HTMLElement | null = anchor; node; node = node.parentElement) {
    const owner = portalOwners.get(node)
    if (owner)
      return owner
  }
  return undefined
}

/**
 * 将 portal 纳入所属弹窗的 Tab 顺序，关闭或卸载时撤销登记。
 * @example 模块内部上下文
 * ```ts
 * function connect(anchor: HTMLElement, popup: HTMLElement) {
 *   const unregister = registerDialogPortal(anchor, popup)
 *   unregister()
 * }
 * ```
 */
export function registerDialogPortal(anchor: HTMLElement, portal: HTMLElement): () => void {
  const owner = findDialogOwner(anchor)
  if (!owner)
    return () => {}
  const branches = portalBranches.get(owner) ?? new Map<HTMLElement, HTMLElement>()
  portalBranches.set(owner, branches)
  branches.set(portal, anchor)
  portalOwners.set(portal, owner)
  return () => {
    branches.delete(portal)
    portalOwners.delete(portal)
    if (!branches.size)
      portalBranches.delete(owner)
  }
}

/** 弹窗和抽屉共享可见、可操作的焦点边界。 */
function localFocusable(panel: HTMLElement): HTMLElement[] {
  return [
    ...panel.querySelectorAll<HTMLElement>('button, a[href], input:not([type="hidden"]), select, textarea, [tabindex]'),
  ]
    .filter(element => element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length > 0)
}

/** 从虚拟焦点序列尾部查找触发器，兼容组件库的 ES2022 目标。 */
function lastAnchorIndex(elements: HTMLElement[], anchor: HTMLElement): number {
  for (let index = elements.length - 1; index >= 0; index--) {
    const element = elements[index]
    if (element === anchor || anchor.contains(element))
      return index
  }
  return -1
}

/** portal 的控件在触发器之后参与阅读顺序，不把它们放到整个文档末尾。 */
function focusable(panel: HTMLElement): HTMLElement[] {
  const elements = localFocusable(panel)
  for (const [portal, anchor] of portalBranches.get(panel) ?? []) {
    if (!portal.isConnected)
      continue
    const index = lastAnchorIndex(elements, anchor)
    if (index >= 0)
      elements.splice(index + 1, 0, ...localFocusable(portal))
  }
  return elements
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
  const previous = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null
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
  const frame = typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame(alignFocus)
    : undefined
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
    const active = document.activeElement
    let index = elements.findIndex(element => element === active)
    const registrations = [
      ...(portalBranches.get(panel)?.entries() ?? []),
    ]
    const focusedBranch = registrations.find(([branch]) => branch.contains(active))
    if (index < 0 && focusedBranch) {
      const [branch, anchor] = focusedBranch
      const children = localFocusable(branch)
      const anchorIndex = lastAnchorIndex(elements, anchor)
      index = event.shiftKey
        ? children.length
          ? elements.indexOf(children[0])
          : anchorIndex + 1
        : anchorIndex
    }
    const next = index >= 0
      ? elements[(index + (event.shiftKey
        ? -1
        : 1) + elements.length) % elements.length]
      : undefined
    const branches = registrations.map(([branch]) => branch)
    const crossesPortal = next && branches.some(branch => branch.contains(active) || branch.contains(next))
    if (!first) {
      event.preventDefault()
      panel.focus()
    }
    else if (next && crossesPortal) {
      event.preventDefault()
      next.focus()
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
