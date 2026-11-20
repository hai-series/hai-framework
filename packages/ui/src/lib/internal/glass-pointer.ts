const THEME_ATTRIBUTE = 'data-theme'
const POINTER_ATTRIBUTE = 'data-hai-glass-pointer'
const POINTER_X = '--hai-glass-pointer-x'
const POINTER_Y = '--hai-glass-pointer-y'

const GLASS_SURFACES = [
  '.btn:not(.btn-link)',
  '.hai-control-surface',
  '.card.bg-base-100:not(.card .card, :has(table))',
  '[data-hai-glass-surface]',
  '.hai-modal__panel',
  '.hai-floating-surface',
  '.drawer-side > [role="dialog"].bg-base-200',
  '.dropdown-content.bg-base-100',
  '[role="listbox"].bg-base-100',
].join(', ')

const DISABLED_SURFACES = ':disabled, .btn-disabled, .cursor-not-allowed, [aria-disabled="true"], [data-disabled], [inert]'

interface DocumentTracker {
  references: number
  clearWithin: (node: HTMLElement) => void
  stop: () => void
}

const trackers = new WeakMap<Document, DocumentTracker>()

function createTracker(document: Document, view: Window & typeof globalThis): DocumentTracker {
  const reducedMotion = view.matchMedia('(prefers-reduced-motion: reduce)')
  let active: HTMLElement | undefined
  let pending: PointerEvent | undefined
  let frame: number | undefined

  function clearSurface() {
    if (!active)
      return
    active.removeAttribute(POINTER_ATTRIBUTE)
    active.style.removeProperty(POINTER_X)
    active.style.removeProperty(POINTER_Y)
    active = undefined
  }

  function reset() {
    if (frame !== undefined)
      view.cancelAnimationFrame(frame)
    frame = undefined
    pending = undefined
    clearSurface()
  }

  function update() {
    frame = undefined
    const event = pending
    pending = undefined
    const origin = event?.target
    if (!event || !(origin instanceof view.Element) || !origin.isConnected)
      return clearSurface()

    const surface = origin.closest(GLASS_SURFACES)
    if (!(surface instanceof view.HTMLElement) || origin.closest(DISABLED_SURFACES))
      return clearSurface()

    const theme = surface.closest(`[${THEME_ATTRIBUTE}]`)
    if (reducedMotion.matches || theme?.getAttribute(THEME_ATTRIBUTE) !== 'liquid-glass')
      return clearSurface()

    if (active !== surface)
      clearSurface()
    const { left, top } = surface.getBoundingClientRect()
    surface.style.setProperty(POINTER_X, `${event.clientX - left}px`)
    surface.style.setProperty(POINTER_Y, `${event.clientY - top}px`)
    if (active !== surface) {
      surface.setAttribute(POINTER_ATTRIBUTE, '')
      active = surface
    }
  }

  function move(event: PointerEvent) {
    const origin = event.target
    if (event.pointerType !== 'mouse' || reducedMotion.matches || !(origin instanceof view.Element)
      || origin.closest(`[${THEME_ATTRIBUTE}]`)?.getAttribute(THEME_ATTRIBUTE) !== 'liquid-glass') {
      if (pending || active)
        reset()
      return
    }
    pending = event
    frame ??= view.requestAnimationFrame(update)
  }

  function leave(event: PointerEvent) {
    if (event.relatedTarget === null)
      reset()
  }

  document.addEventListener('pointermove', move, { passive: true })
  document.addEventListener('pointerout', leave, { passive: true })
  document.addEventListener('pointercancel', reset, { passive: true })
  view.addEventListener('blur', reset)
  reducedMotion.addEventListener?.('change', reset)
  const themeObserver = new view.MutationObserver(reset)
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: [THEME_ATTRIBUTE],
  })

  return {
    references: 0,
    clearWithin(node) {
      if (active && node.contains(active))
        reset()
    },
    stop() {
      reset()
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerout', leave)
      document.removeEventListener('pointercancel', reset)
      view.removeEventListener('blur', reset)
      reducedMotion.removeEventListener?.('change', reset)
      themeObserver.disconnect()
    },
  }
}

/**
 * 为当前文档共用鼠标跟踪，最后一个参与组件卸载后释放监听。
 * @param node - 液态玻璃控件的宿主节点。
 * @returns Svelte 卸载回调，或在无浏览器媒体查询时返回 undefined。
 * @example 模块内部上下文
 * ```ts
 * const cleanup = attachGlassPointer(document.createElement('button'))
 * cleanup?.destroy()
 * ```
 */
export function attachGlassPointer(node: HTMLElement): { destroy: () => void } | undefined {
  const { ownerDocument } = node
  const view = ownerDocument.defaultView
  if (!view?.matchMedia || !view.requestAnimationFrame)
    return

  const tracker = trackers.get(ownerDocument) ?? createTracker(ownerDocument, view)
  trackers.set(ownerDocument, tracker)
  tracker.references++

  return {
    destroy() {
      tracker.clearWithin(node)
      if (--tracker.references === 0) {
        tracker.stop()
        trackers.delete(ownerDocument)
      }
    },
  }
}
