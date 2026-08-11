<!--
  =============================================================================
  @h-ai/ui - Popover 组件
  =============================================================================
  弹出层组件

  使用 Svelte 5 Runes ($props, $state, $effect)
  =============================================================================
-->
<script lang='ts'>
  import type { DataAttributes, PopoverProps } from '../../types.js'
  import { tick } from 'svelte'
  import { cn, getDataAttributes, portal as portalAction } from '../../utils.js'

  let {
    open = $bindable(false),
    position = 'bottom',
    trigger = 'click',
    offset = 8,
    portal = false,
    class: className = '',
    onopen,
    onclose,
    triggerContent,
    children,
    ...restProps
  }: PopoverProps & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))
  let triggerElement = $state<HTMLDivElement | null>(null)
  let popoverElement = $state<HTMLDivElement | null>(null)
  /** portal 模式下的 fixed 坐标；每次滚动或缩放后重新计算。 */
  let portalStyle = $state('')
  /** 首帧布局收敛后的二次定位帧，关闭时必须取消避免过期写入。 */
  let portalPositionFrame: number | undefined = $state()

  const positionClass = $derived({
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  }[position])

  const arrowClass = $derived({
    top: 'top-full left-1/2 -translate-x-1/2 border-t-base-100 border-l-transparent border-r-transparent border-b-transparent',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-base-100 border-l-transparent border-r-transparent border-t-transparent',
    left: 'left-full top-1/2 -translate-y-1/2 border-l-base-100 border-t-transparent border-r-transparent border-b-transparent',
    right: 'right-full top-1/2 -translate-y-1/2 border-r-base-100 border-t-transparent border-l-transparent border-b-transparent',
  }[position])

  /** portal 模式下不再依赖相对容器，改用视口坐标并在边缘自动收敛。 */
  function updatePortalPosition(): void {
    if (!triggerElement || !popoverElement) {
      return
    }

    const triggerRect = triggerElement.getBoundingClientRect()
    const popoverRect = popoverElement.getBoundingClientRect()
    const viewportPadding = 8
    const gap = offset
    const maxLeft = Math.max(viewportPadding, window.innerWidth - popoverRect.width - viewportPadding)
    const maxTop = Math.max(viewportPadding, window.innerHeight - popoverRect.height - viewportPadding)
    let left = triggerRect.left + (triggerRect.width - popoverRect.width) / 2
    let top = triggerRect.bottom + gap

    if (position === 'top') {
      top = triggerRect.top - popoverRect.height - gap
    }
    else if (position === 'left') {
      left = triggerRect.left - popoverRect.width - gap
      top = triggerRect.top + (triggerRect.height - popoverRect.height) / 2
    }
    else if (position === 'right') {
      left = triggerRect.right + gap
      top = triggerRect.top + (triggerRect.height - popoverRect.height) / 2
    }

    portalStyle = `position:fixed;left:${Math.round(Math.min(Math.max(viewportPadding, left), maxLeft))}px;top:${Math.round(Math.min(Math.max(viewportPadding, top), maxTop))}px;z-index:1200;`
  }

  /** 等 portal 挂载完成后复测，避免首帧按未完成内容高度定位。 */
  async function scheduleSettledPortalPosition(): Promise<void> {
    await tick()
    if (!open || !portal) {
      return
    }

    portalPositionFrame = window.requestAnimationFrame(() => {
      portalPositionFrame = undefined
      if (open && portal) {
        updatePortalPosition()
      }
    })
  }

  function handleOpen() {
    open = true
    onopen?.()
  }

  function handleClose() {
    open = false
    onclose?.()
  }

  function handleTriggerClick() {
    if (trigger === 'click') {
      if (open) {
        handleClose()
      }
      else {
        handleOpen()
      }
    }
  }

  function handleMouseEnter() {
    if (trigger === 'hover') {
      handleOpen()
    }
  }

  function handleMouseLeave() {
    if (trigger === 'hover') {
      handleClose()
    }
  }

  function handleClickOutside(e: MouseEvent) {
    if (
      open
      && triggerElement
      && popoverElement
      && !triggerElement.contains(e.target as Node)
      && !popoverElement.contains(e.target as Node)
    ) {
      handleClose()
    }
  }

  $effect(() => {
    if (open) {
      document.addEventListener('click', handleClickOutside)
    }
    return () => {
      document.removeEventListener('click', handleClickOutside)
    }
  })

  // portal 内容脱离原始相对定位容器后，以 fixed 坐标跟随触发器滚动和缩放。
  $effect(() => {
    if (!open || !portal) {
      return
    }

    updatePortalPosition()
    void scheduleSettledPortalPosition()
    const listenerOptions = { passive: true, capture: true } as const
    window.addEventListener('scroll', updatePortalPosition, listenerOptions)
    window.addEventListener('resize', updatePortalPosition)
    return () => {
      if (portalPositionFrame !== undefined) {
        window.cancelAnimationFrame(portalPositionFrame)
        portalPositionFrame = undefined
      }
      window.removeEventListener('scroll', updatePortalPosition, listenerOptions)
      window.removeEventListener('resize', updatePortalPosition)
    }
  })
</script>

<div {...dataAttributes}
     class={cn('relative inline-block', className)}
     role='group'
     onmouseenter={handleMouseEnter}
     onmouseleave={handleMouseLeave}
>
  <!-- 触发器 -->
  <div
    bind:this={triggerElement}
    class='inline-block'
    onclick={handleTriggerClick}
    role='button'
    tabindex='0'
    onkeydown={e => e.key === 'Enter' && handleTriggerClick()}
  >
    {#if triggerContent}
      {@render triggerContent()}
    {/if}
  </div>

  <!-- 弹出内容；portal 模式用于逃逸滚动容器的 overflow 裁剪。 -->
  {#if open}
    {#if portal}
      <div
        bind:this={popoverElement}
        use:portalAction
        class='fixed z-50 rounded-box border border-base-200 bg-base-100 p-4 shadow-lg'
        style={portalStyle}
        role='dialog'
      >
        {#if children}
          {@render children()}
        {/if}
      </div>
    {:else}
      <div
        bind:this={popoverElement}
        class={cn(
          'absolute z-50 bg-base-100 rounded-box shadow-lg border border-base-200 p-4',
          positionClass,
        )}
        style='--offset: {offset}px'
        role='dialog'
      >
        <!-- 箭头 -->
        <div class={cn('absolute w-0 h-0 border-8', arrowClass)}></div>

        {#if children}
          {@render children()}
        {/if}
      </div>
    {/if}
  {/if}
</div>
