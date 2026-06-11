<!--
  @component Modal
  模态框组件，支持 backdrop-blur 和 scale-in 动画。
-->
<script lang='ts'>
  import type { ModalProps } from '../../types.js'
  import { uiM } from '../../messages.js'
  import { cn } from '../../utils.js'

  let {
    open = $bindable(false),
    title = '',
    size = 'md',
    closeOnBackdrop = true,
    closeOnEscape = true,
    showClose = true,
    width,
    height,
    bodyOverflow = 'auto',
    bodyClass = '',
    class: className = '',
    onclose,
    header,
    footer,
    children,
  }: ModalProps = $props()

  // modalElement 持有原生 dialog 引用；
  // 只有调用 `showModal()` 进入 top-layer 后，弹框才不会被父级布局和 overflow 裁剪。
  let modalElement: HTMLDialogElement | undefined = $state()

  // 只要存在标题、自定义 header 或关闭按钮，就渲染顶部栏位，保证弹框结构稳定。
  const hasHeader = $derived(Boolean(header || title || showClose))
  const sizeMap: Record<string, string> = {
    'xs': 'hai-modal__panel--xs',
    'sm': 'hai-modal__panel--sm',
    'md': 'hai-modal__panel--md',
    'lg': 'hai-modal__panel--lg',
    'xl': 'hai-modal__panel--xl',
    '2xl': 'hai-modal__panel--2xl',
    '3xl': 'hai-modal__panel--3xl',
    '4xl': 'hai-modal__panel--4xl',
    'full': 'hai-modal__panel--full',
  }

  // width / height 允许业务侧按需传入 CSS 值，覆盖尺寸预设。
  const panelStyle = $derived.by(() => {
    const styles: string[] = []

    if (typeof width === 'string' && width.trim().length > 0) {
      styles.push(`--hai-modal-width: ${width.trim()}`)
    }

    if (typeof height === 'string' && height.trim().length > 0) {
      styles.push(`--hai-modal-height: ${height.trim()}`)
    }

    return styles.length > 0 ? styles.join('; ') : undefined
  })

  const modalBoxClass = $derived(
    cn(
      'hai-modal__panel flex min-h-0 flex-col',
      'bg-base-100 p-0',
      sizeMap[size],
      className,
    ),
  )

  const bodyOverflowClass = $derived(
    bodyOverflow === 'visible'
      ? 'overflow-visible'
      : bodyOverflow === 'hidden'
      ? 'overflow-hidden'
      : 'overflow-y-auto',
  )

  function handleClose() {
    open = false
    onclose?.()
  }

  function handleDialogClick(event: MouseEvent) {
    if (event.target === event.currentTarget && closeOnBackdrop) {
      handleClose()
    }
  }

  function handleDialogCancel(event: Event) {
    // 原生 dialog 在按下 Escape 时会先触发 cancel；
    // 这里统一接管关闭逻辑，避免浏览器直接 close 后跳过组件自己的 onclose 回调。
    event.preventDefault()
    if (closeOnEscape) {
      handleClose()
    }
  }

  $effect(() => {
    if (!modalElement) {
      return
    }

    if (open) {
      if (!modalElement.open) {
        modalElement.showModal()
      }
      return
    }

    if (modalElement.open) {
      modalElement.close()
    }
  })
</script>

<dialog
  bind:this={modalElement}
  class='hai-modal'
  oncancel={handleDialogCancel}
  onclick={handleDialogClick}
>
  <div class={modalBoxClass} style={panelStyle}>
    {#if hasHeader}
      <!-- 顶部栏单独固定，保证滚动时标题和关闭操作始终可见。 -->
      <div class='hai-modal__header flex flex-none items-start justify-between gap-4 px-6 py-5 sm:px-7'>
        {#if header}
          <div class='flex-1 font-semibold text-[1.05rem] text-base-content/92'>
            {@render header()}
          </div>
        {:else if title}
          <h3 class='flex-1 font-semibold text-[1.05rem] tracking-tight text-base-content/92'>
            {title}
          </h3>
        {:else}
          <div class='flex-1'></div>
        {/if}

        {#if showClose}
          <button
            type='button'
            class='hai-modal__close'
            aria-label={uiM('common_close')}
            onclick={handleClose}
          >
            <svg viewBox='0 0 24 24' class='hai-modal__close-icon' aria-hidden='true'>
              <path
                d='M6 6l12 12M18 6L6 18'
                fill='none'
                stroke='currentColor'
                stroke-width='1.9'
                stroke-linecap='round'
              ></path>
            </svg>
          </button>
        {/if}
      </div>
    {/if}

    <!-- 主体区域独立滚动，避免长内容把头部和底部一起顶走。 -->
    <div class={cn('min-h-0 flex-1 px-6 py-5 sm:px-7', bodyOverflowClass, bodyClass)}>
      {#if children}
        {@render children()}
      {/if}
    </div>

    {#if footer}
      <!-- 底栏固定在面板底部，用于承接确认/取消或状态摘要。 -->
      <div class='hai-modal__footer flex flex-none items-center bg-base-100 px-6 py-4 sm:px-7'>
        <div class='flex w-full items-center justify-end gap-3'>
          {@render footer()}
        </div>
      </div>
    {/if}
  </div>
</dialog>

<style>
  dialog.hai-modal {
    inset: 0;
    width: 100vw;
    min-width: 0;
    max-width: none;
    height: 100vh;
    height: 100dvh;
    max-height: none;
    margin: 0;
    padding: clamp(1rem, 2.6vw, 2rem);
    border: 0;
    background: transparent;
    outline: none;
    overflow: visible;
    box-sizing: border-box;
  }

  dialog.hai-modal[open] {
    display: grid;
    place-items: center;
  }

  dialog.hai-modal::backdrop {
    background: rgb(15 23 42 / 0.26);
    background: color-mix(in srgb, var(--color-base-content) 22%, transparent);
    backdrop-filter: blur(2px);
  }

  .hai-modal__panel {
    width: var(--hai-modal-width, min(100%, 44rem));
    max-width: min(100%, calc(100vw - clamp(2rem, 5.2vw, 4rem)));
    height: var(--hai-modal-height, auto);
    max-height: calc(100vh - clamp(2rem, 5.2vw, 4rem));
    max-height: calc(100dvh - clamp(2rem, 5.2vw, 4rem));
    border-radius: 1.4rem;
    overflow: hidden;
    color: var(--color-base-content);
    outline: none;
    box-shadow:
      0 34px 84px -42px color-mix(in srgb, var(--color-base-content) 24%, transparent),
      0 14px 28px -22px color-mix(in srgb, var(--color-primary) 12%, transparent);
    animation: hai-modal-enter 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .hai-modal__header {
    box-shadow: inset 0 -1px 0 color-mix(in srgb, var(--color-base-content) 6%, transparent);
  }

  .hai-modal__footer {
    box-shadow: inset 0 1px 0 color-mix(in srgb, var(--color-base-content) 6%, transparent);
    border-radius: 0 0 1.4rem 1.4rem;
  }

  .hai-modal__close {
    display: inline-flex;
    width: 2.25rem;
    height: 2.25rem;
    flex: none;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 999px;
    background: color-mix(in srgb, var(--color-base-content) 4%, transparent);
    color: color-mix(in srgb, var(--color-base-content) 54%, transparent);
    cursor: pointer;
    transition:
      background-color 160ms ease,
      color 160ms ease,
      transform 160ms ease;
  }

  .hai-modal__close:hover {
    background: color-mix(in srgb, var(--color-primary) 10%, transparent);
    color: var(--color-primary);
    transform: translateY(-1px);
  }

  .hai-modal__close:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--color-primary) 22%, transparent);
    outline-offset: 2px;
  }

  .hai-modal__close-icon {
    width: 1rem;
    height: 1rem;
  }

  .hai-modal__panel--xs {
    --hai-modal-width: min(100%, 24rem);
  }

  .hai-modal__panel--sm {
    --hai-modal-width: min(100%, 32rem);
  }

  .hai-modal__panel--md {
    --hai-modal-width: min(100%, 40rem);
  }

  .hai-modal__panel--lg {
    --hai-modal-width: min(100%, 48rem);
  }

  .hai-modal__panel--xl {
    --hai-modal-width: min(100%, 64rem);
  }

  .hai-modal__panel--2xl {
    --hai-modal-width: min(100%, 72rem);
  }

  .hai-modal__panel--3xl {
    --hai-modal-width: min(100%, 80rem);
  }

  .hai-modal__panel--4xl {
    --hai-modal-width: min(100%, 88rem);
  }

  .hai-modal__panel--full {
    --hai-modal-width: min(96vw, 96rem);
    --hai-modal-height: min(92vh, 72rem);
  }

  @keyframes hai-modal-enter {
    from {
      opacity: 0;
      transform: translateY(10px) scale(0.985);
    }

    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @media (max-width: 768px) {
    dialog.hai-modal {
      padding: 0.85rem;
    }

    .hai-modal__panel {
      max-width: 100%;
      max-height: calc(100vh - 1.7rem);
      max-height: calc(100dvh - 1.7rem);
      border-radius: 1rem;
    }
  }
</style>
