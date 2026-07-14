<!--
  @component Modal
  模态框组件，支持 backdrop-blur 和 scale-in 动画。
-->
<script lang='ts'>
  import type { DataAttributes, ModalProps } from '../../types.js'
  import { uiM } from '../../messages.js'
  import { cn, getDataAttributes } from '../../utils.js'

  let {
    open = $bindable(false),
    title = '',
    size = 'md',
    radius = '1rem',
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
    ...restProps
  }: ModalProps & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))

  // 标题区仅在显式提供标题或自定义 header 时出现；
  // 仅需关闭按钮的场景改为右上角悬浮按钮，避免业务侧额外占一整行头部。
  const hasHeader = $derived(Boolean(header || title))
  const hasFloatingClose = $derived(showClose && !hasHeader)
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

    if (typeof radius === 'string' && radius.trim().length > 0) {
      styles.push(`--hai-modal-radius: ${radius.trim()}`)
    }

    if (bodyOverflow === 'visible') {
      styles.push('--hai-modal-panel-overflow: visible')
    }

    return styles.length > 0 ? styles.join('; ') : undefined
  })

  const modalBoxClass = $derived(
    cn(
      'hai-modal__panel flex min-h-0 flex-col',
      'relative',
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

</script>

<div {...dataAttributes}
     class='hai-modal'
     style:display={open ? '' : 'none'}
     aria-hidden={open ? undefined : 'true'}
     onkeydown={(e) => {
       if (closeOnEscape && e.key === 'Escape')
         handleClose()
     }}
>
  <div
    class='hai-modal__viewport'
  >
    {#if closeOnBackdrop}
      <button
        type='button'
        class='hai-modal__backdrop'
        aria-label={uiM('common_close')}
        tabindex='-1'
        onclick={handleClose}
      ></button>
    {:else}
      <div class='hai-modal__backdrop' aria-hidden='true'></div>
    {/if}

    <div class={modalBoxClass} style={panelStyle}>
      {#if hasFloatingClose}
        <button
          type='button'
          class='hai-modal__close hai-modal__close--floating'
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
        <div class='hai-modal__footer flex flex-none items-center px-6 py-4 sm:px-7'>
          <div class='flex w-full items-center justify-end gap-3'>
            {@render footer()}
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .hai-modal {
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    outline: none;
    overflow: visible;
    box-sizing: border-box;
  }

  .hai-modal {
    position: fixed;
    inset: 0;
    z-index: var(--hai-z-modal, 1100);
    display: block;
    pointer-events: none;
  }

  .hai-modal__viewport {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    padding: clamp(1rem, 2.6vw, 2rem);
    pointer-events: auto;
  }

  .hai-modal__backdrop {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    background: rgb(15 23 42 / 0.26);
    background: color-mix(in srgb, var(--color-base-content) 15%, transparent);
    backdrop-filter: blur(2px);
  }

  .hai-modal__panel {
    z-index: 1;
    width: var(--hai-modal-width, min(100%, 44rem));
    max-width: min(100%, calc(100vw - clamp(2rem, 5.2vw, 4rem)));
    height: var(--hai-modal-height, auto);
    max-height: calc(100vh - clamp(2rem, 5.2vw, 4rem));
    max-height: calc(100dvh - clamp(2rem, 5.2vw, 4rem));
    border-radius: var(--hai-modal-radius, 1rem);
    overflow: var(--hai-modal-panel-overflow, hidden);
    color: var(--color-base-content);
    outline: none;
    box-shadow:
      0 34px 84px -42px color-mix(in srgb, var(--color-base-content) 24%, transparent),
      0 14px 28px -22px color-mix(in srgb, var(--color-primary) 12%, transparent);
    animation: hai-modal-enter 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .hai-modal__header {
    /* 头部单独承接面板圆角，避免滚动主体或主题背景把顶部边缘切成直角。 */
    border-top-left-radius: inherit;
    border-top-right-radius: inherit;
    box-shadow: inset 0 -1px 0 color-mix(in srgb, var(--color-base-content) 6%, transparent);
  }

  .hai-modal__footer {
    /* 底栏去掉独立背景后，继续继承圆角，保证底部阴影和面板外轮廓保持一致。 */
    border-bottom-right-radius: inherit;
    border-bottom-left-radius: inherit;
    box-shadow: inset 0 1px 0 color-mix(in srgb, var(--color-base-content) 6%, transparent);
    border-radius: 0 0 var(--hai-modal-radius, 1rem) var(--hai-modal-radius, 1rem);
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

  .hai-modal__close--floating {
    position: absolute;
    top: 1rem;
    right: 1rem;
    z-index: 1;
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
    .hai-modal {
      padding: 0.85rem;
    }

    .hai-modal__panel {
      max-width: 100%;
      max-height: calc(100vh - 1.7rem);
      max-height: calc(100dvh - 1.7rem);
      border-radius: min(var(--hai-modal-radius, 1rem), 1rem);
    }
  }
</style>
