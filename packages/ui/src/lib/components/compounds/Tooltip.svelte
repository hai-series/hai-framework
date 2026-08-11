<!--
  =============================================================================
  @h-ai/ui - Tooltip 组件
  =============================================================================
  提示框组件，支持两种渲染模式：
  - 默认：DaisyUI CSS 伪元素（::before），轻量无 JS 开销
  - portal：通过 document.body 渲染，不受父容器 overflow 裁剪

  使用 Svelte 5 Runes ($props, $derived)
  =============================================================================
-->
<script lang='ts'>
  import type { DataAttributes, TooltipProps } from '../../types.js'
  import { cn, getDataAttributes } from '../../utils.js'

  const {
    content,
    position = 'top',
    delay,
    class: className = '',
    children,
    portal = false,
    ...restProps
  }: TooltipProps & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))

  // ─── CSS 模式（默认） ───

  const positionMap = {
    top: 'tooltip-top',
    right: 'tooltip-right',
    bottom: 'tooltip-bottom',
    left: 'tooltip-left',
  }

  const tooltipClass = $derived(
    cn(
      'tooltip',
      positionMap[position],
      className,
    ),
  )

  // ─── Portal 模式 ───

  let triggerEl = $state<HTMLDivElement>()
  let portalEl: HTMLDivElement | null = null

  function getClass(opacity: string): string {
    return cn(
      'pointer-events-none fixed z-[9999] rounded-md bg-base-content px-2 py-1 text-xs text-base-100 shadow-md',
      className,
      opacity,
    )
  }

  function ensurePortal(): HTMLDivElement {
    if (!portalEl && typeof document !== 'undefined') {
      portalEl = document.createElement('div')
      portalEl.setAttribute('role', 'tooltip')
      portalEl.className = getClass('opacity-0')
      document.body.appendChild(portalEl)
    }
    return portalEl!
  }

  function updatePosition(): string {
    if (!triggerEl)
      return ''

    const rect = triggerEl.getBoundingClientRect()
    const gap = 6
    let top: number
    let left: number
    let transform: string

    switch (position) {
      case 'top':
        top = rect.top - gap
        left = rect.left + rect.width / 2
        transform = 'translate(-50%,-100%)'
        break
      case 'bottom':
        top = rect.bottom + gap
        left = rect.left + rect.width / 2
        transform = 'translateX(-50%)'
        break
      case 'left':
        top = rect.top + rect.height / 2
        left = rect.left - gap
        transform = 'translate(-100%,-50%)'
        break
      case 'right':
        top = rect.top + rect.height / 2
        left = rect.right + gap
        transform = 'translateY(-50%)'
        break
    }

    return `top:${top}px;left:${left}px;transform:${transform};`
  }

  let showTimer: ReturnType<typeof setTimeout> | undefined

  function show() {
    if (delay) {
      showTimer = setTimeout(doShow, delay)
    }
    else {
      doShow()
    }
  }

  function doShow() {
    const el = ensurePortal()
    el.className = getClass('opacity-100')
    el.style.cssText = updatePosition()
    el.textContent = content
  }

  function hide() {
    if (showTimer) {
      clearTimeout(showTimer)
      showTimer = undefined
    }
    if (portalEl) {
      portalEl.className = getClass('opacity-0')
    }
  }

  $effect(() => {
    return () => {
      if (showTimer)
        clearTimeout(showTimer)
      if (portalEl?.parentNode) {
        portalEl.parentNode.removeChild(portalEl)
        portalEl = null
      }
    }
  })
</script>

{#if portal}
  <div
    {...dataAttributes}
    bind:this={triggerEl}
    class='inline-flex'
    onmouseenter={show}
    onmouseleave={hide}
    onfocusin={show}
    onfocusout={hide}
  >
    {#if children}
      {@render children()}
    {/if}
  </div>
{:else}
  <div {...dataAttributes} class={tooltipClass} data-tip={content}>
    {#if children}
      {@render children()}
    {/if}
  </div>
{/if}
