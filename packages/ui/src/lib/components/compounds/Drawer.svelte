<!--
  =============================================================================
  @h-ai/ui - Drawer 组件
  =============================================================================
  抽屉组件

  使用 Svelte 5 Runes ($props, $derived, $effect, $bindable)
  使用 primitives 组件：IconButton
  =============================================================================
-->
<script lang='ts'>
  import type { DataAttributes, DrawerProps } from '../../types.js'
  import { onDestroy, onMount } from 'svelte'
  import { readStoredValue, writeStoredValue } from '../../internal/browser-safety.js'
  import { uiM } from '../../messages.js'
  import { cn, generateId, getDataAttributes } from '../../utils.js'
  import IconButton from '../primitives/IconButton.svelte'
  import ToggleCheckbox from '../primitives/ToggleCheckbox.svelte'

  let {
    open = $bindable(false),
    title = '',
    position = 'right',
    size = 'md',
    width,
    resizable = false,
    widthStorageKey,
    closeOnBackdrop = true,
    showClose = true,
    class: className = '',
    onclose,
    children,
    ...restProps
  }: DrawerProps & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))
  const id = generateId('drawer')
  /** 用户拖动后的像素宽度；优先于 width 与 size。 */
  let resizedWidth = $state<number | null>(null)
  /** 与响应式渲染解耦的同步宽度，确保 mouseup 时持久化最后一次 mousemove 的值。 */
  let resizeWidthForStorage: number | null = null
  /** 当前拖动起点的指针横坐标。 */
  let resizeStartX = 0
  /** 当前拖动起点的抽屉宽度。 */
  let resizeStartWidth = 0
  /** 拖动期间临时保存页面原有的文本选择样式。 */
  let previousUserSelect = ''

  const sizeMap = {
    'xs': 'w-60',
    'sm': 'w-72',
    'md': 'w-80',
    'lg': 'w-96',
    'xl': 'w-[30rem]',
    '2xl': 'w-[34rem]',
    '3xl': 'w-[38rem]',
    '4xl': 'w-[42rem]',
  }

  // width 优先：传入自定义 CSS 宽度时通过 inline style 覆盖预设宽度类
  const hasCustomWidth = $derived(typeof width === 'string' && width.trim().length > 0)
  const widthStyle = $derived(
    resizedWidth !== null
      ? `width: ${resizedWidth}px; max-width: calc(100vw - 1rem)`
      : hasCustomWidth
      ? `width: ${width!.trim()}; max-width: 100vw`
      : undefined,
  )
  /** 纵向抽屉没有横向宽度拖动语义。 */
  const canResize = $derived(resizable && (position === 'left' || position === 'right'))

  const drawerClass = $derived(
    cn(
      'drawer',
      position === 'right' && 'drawer-end',
    ),
  )

  const sideClass = $derived(
    cn(
      'drawer-side z-50',
    ),
  )

  const contentClass = $derived(
    cn(
      'menu relative z-10 bg-base-200 text-base-content min-h-full p-4',
      !hasCustomWidth && sizeMap[size],
      className,
    ),
  )

  function handleClose() {
    open = false
    onclose?.()
  }

  function handleBackdropClick() {
    if (closeOnBackdrop) {
      handleClose()
    }
  }

  /** 将宽度限制在可视区域内，并保留移动端可关闭抽屉的边距。 */
  function clampWidth(nextWidth: number): number {
    const maximum = Math.max(0, globalThis.innerWidth - 16)
    const minimum = Math.min(280, maximum)
    return Math.round(Math.min(Math.max(nextWidth, minimum), maximum))
  }

  /** 根据抽屉方向计算拖动宽度。 */
  function handleResizeMove(event: MouseEvent) {
    const delta = position === 'right'
      ? resizeStartX - event.clientX
      : event.clientX - resizeStartX
    const nextWidth = clampWidth(resizeStartWidth + delta)
    resizeWidthForStorage = nextWidth
    resizedWidth = nextWidth
  }

  /** 结束拖动并在配置了 key 时记忆最终宽度。 */
  function finishResize() {
    if (typeof document === 'undefined')
      return

    globalThis.removeEventListener('mousemove', handleResizeMove)
    globalThis.removeEventListener('mouseup', finishResize)
    document.documentElement.style.userSelect = previousUserSelect
    if (widthStorageKey && resizeWidthForStorage !== null) {
      writeStoredValue(widthStorageKey, String(resizeWidthForStorage))
    }
  }

  /** 从抽屉可见边缘开始宽度拖动。 */
  function startResize(event: MouseEvent) {
    if (!canResize)
      return

    const drawer = event.currentTarget instanceof HTMLElement
      ? event.currentTarget.parentElement
      : null
    if (!drawer)
      return

    event.preventDefault()
    resizeStartX = event.clientX
    resizeStartWidth = drawer.getBoundingClientRect().width
    resizeWidthForStorage = resizeStartWidth
    previousUserSelect = document.documentElement.style.userSelect
    document.documentElement.style.userSelect = 'none'
    globalThis.addEventListener('mousemove', handleResizeMove)
    globalThis.addEventListener('mouseup', finishResize, { once: true })
  }

  /** 键盘左右键以固定步长调整宽度，并立即持久化。 */
  function handleResizeKeydown(event: KeyboardEvent) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')
      return

    const drawer = event.currentTarget instanceof HTMLElement
      ? event.currentTarget.parentElement
      : null
    if (!drawer)
      return

    event.preventDefault()
    const edgeDelta = event.key === 'ArrowLeft' ? -16 : 16
    const nextWidth = clampWidth(drawer.getBoundingClientRect().width + (position === 'right' ? -edgeDelta : edgeDelta))
    resizeWidthForStorage = nextWidth
    resizedWidth = nextWidth
    if (widthStorageKey) {
      writeStoredValue(widthStorageKey, String(nextWidth))
    }
  }

  onMount(() => {
    if (!canResize || !widthStorageKey)
      return

    const storedWidth = Number(readStoredValue(widthStorageKey))
    if (Number.isFinite(storedWidth) && storedWidth > 0) {
      const nextWidth = clampWidth(storedWidth)
      resizeWidthForStorage = nextWidth
      resizedWidth = nextWidth
    }
  })

  onDestroy(finishResize)
</script>

<div {...dataAttributes} class={drawerClass}>
  <ToggleCheckbox {id} class='drawer-toggle' bind:checked={open} />

  <div class={sideClass}>
    <div
      role='button'
      tabindex='0'
      aria-label={uiM('drawer_close')}
      class='drawer-overlay'
      onclick={handleBackdropClick}
      onkeydown={e => e.key === 'Enter' && handleBackdropClick()}
    ></div>

    <div class={contentClass} style={widthStyle}>
      {#if canResize}
        <button
          type='button'
          aria-label={uiM('drawer_resize')}
          data-drawer-resize-handle
          class='absolute inset-y-0 z-20 hidden w-2 cursor-col-resize touch-none border-0 bg-transparent p-0 md:block {position === 'right' ? 'left-0' : 'right-0'}'
          onmousedown={startResize}
          onkeydown={handleResizeKeydown}
        ></button>
      {/if}

      <div class='flex items-center justify-between mb-4'>
        {#if title}
          <h3 class='text-lg font-bold'>{title}</h3>
        {:else}
          <div></div>
        {/if}

        {#if showClose}
          <IconButton size='sm' variant='ghost' label={uiM('common_close')} onclick={handleClose}>
            <svg xmlns='http://www.w3.org/2000/svg' class='h-5 w-5' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
              <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M6 18L18 6M6 6l12 12' />
            </svg>
          </IconButton>
        {/if}
      </div>

      {#if children}
        {@render children()}
      {/if}
    </div>
  </div>
</div>
