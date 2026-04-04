<script lang='ts'>
  import type {
    MarkdownSourceKind,
    MarkdownToolbarDownloadAction,
  } from './document-types.js'
  import { uiM } from '../../../messages.js'
  import { cn } from '../../../utils.js'
  import {
    downloadAiDocument,
    resolveDocumentDownloadActions,
  } from './document-download.js'

  interface AiDocumentDownloadMenuProps {
    /** 触发下载时导出的原始内容。 */
    content?: string
    /** 导出时使用的标题；未传时会回退到文件名或默认名。 */
    title?: string
    /** 显式文件名；适合左侧卡片直接复用 artifact filename。 */
    filename?: string
    /** 内容来源类型；`code` 会先转换成 fenced markdown。 */
    sourceKind?: MarkdownSourceKind
    /** code 导出时的语言标记。 */
    codeLanguage?: string
    /** 自定义下载动作；为空时展示组件内置的三种格式。 */
    actions?: MarkdownToolbarDownloadAction[]
    /** 自定义下载处理器；传入时由外层接管动作执行。 */
    ondownload?: (actionId: string) => void | Promise<void>
    /** 触发按钮上的文本标签。 */
    triggerLabel?: string
    /** 触发按钮的 title / aria-label。 */
    triggerTitle?: string
    /** 是否显示触发按钮文字。 */
    showLabel?: boolean
    /** 是否显示触发按钮的下拉箭头。 */
    showChevron?: boolean
    /** 是否按 icon-only 样式渲染触发按钮。 */
    iconOnly?: boolean
    /** 根节点自定义类名。 */
    class?: string
    /** 触发按钮自定义类名。 */
    triggerClass?: string
    /** 下拉菜单自定义类名。 */
    menuClass?: string
    /** 菜单项自定义类名。 */
    itemClass?: string
  }

  const {
    content = '',
    title = '',
    filename,
    sourceKind = 'markdown',
    codeLanguage,
    actions = [],
    ondownload,
    triggerLabel = uiM('markdown_download'),
    triggerTitle = triggerLabel,
    showLabel = false,
    showChevron = false,
    iconOnly = true,
    class: className = '',
    triggerClass = '',
    menuClass = '',
    itemClass = '',
  }: AiDocumentDownloadMenuProps = $props()

  // menuWrapEl 只负责识别外部点击，以便菜单展开后能自然收起。
  let menuWrapEl: HTMLDivElement | undefined = $state()
  // open 由组件内部维护，左右两侧可以直接复用，不需要额外再托管弹层状态。
  let open = $state(false)

  const resolvedActions = $derived(resolveDocumentDownloadActions(actions))

  $effect(() => {
    if (!open || typeof window === 'undefined') {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!target || menuWrapEl?.contains(target)) {
        return
      }

      open = false
    }

    window.addEventListener('pointerdown', handlePointerDown)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
    }
  })

  async function handleAction(actionId: string): Promise<void> {
    open = false

    if (ondownload) {
      await ondownload(actionId)
      return
    }

    await downloadAiDocument({
      actionId,
      content,
      title,
      filename,
      sourceKind,
      codeLanguage,
    })
  }

  function getActionIconClass(actionId: string): string {
    return {
      word: 'hai-ai-download-menu__item-icon--word',
      pdf: 'hai-ai-download-menu__item-icon--pdf',
      markdown: 'hai-ai-download-menu__item-icon--markdown',
    }[actionId] ?? ''
  }
</script>

<div
  bind:this={menuWrapEl}
  class={cn('hai-ai-download-menu', className)}
>
  <button
    type='button'
    class={cn(
      'hai-ai-download-menu__trigger',
      iconOnly ? 'hai-ai-download-menu__trigger--icon' : '',
      triggerClass,
    )}
    aria-label={triggerTitle}
    aria-expanded={open}
    title={triggerTitle}
    onclick={(event) => {
      event.stopPropagation()
      open = !open
    }}
  >
    <svg
      viewBox='0 0 24 24'
      class='hai-ai-download-menu__trigger-icon'
      aria-hidden='true'
    >
      <path
        d='M12 3.25a.75.75 0 0 1 .75.75v8.14l2.72-2.72a.75.75 0 1 1 1.06 1.06l-4 4a.75.75 0 0 1-1.06 0l-4-4a.75.75 0 1 1 1.06-1.06l2.72 2.72V4a.75.75 0 0 1 .75-.75Zm-6.75 13a.75.75 0 0 1 .75.75v1.25c0 .41.34.75.75.75h10.5a.75.75 0 0 0 .75-.75V17a.75.75 0 0 1 1.5 0v1.25a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 18.25V17a.75.75 0 0 1 .75-.75Z'
      ></path>
    </svg>

    {#if showLabel}
      <span>{triggerLabel}</span>
    {/if}

    {#if showChevron}
      <svg
        viewBox='0 0 24 24'
        class={cn(
          'hai-ai-download-menu__chevron',
          open ? 'hai-ai-download-menu__chevron--open' : '',
        )}
        aria-hidden='true'
      >
        <path d='M12 15.5 5 8.5l1.4-1.4 5.6 5.6 5.6-5.6L19 8.5z'></path>
      </svg>
    {/if}
  </button>

  {#if open && resolvedActions.length > 0}
    <div
      class={cn('hai-ai-download-menu__panel', menuClass)}
      role='menu'
      tabindex='-1'
      onmousedown={event => event.preventDefault()}
      onclick={event => event.stopPropagation()}
    >
      {#each resolvedActions as action}
        <button
          type='button'
          class={cn('hai-ai-download-menu__item', itemClass)}
          onclick={() => void handleAction(action.id)}
        >
          <span class='hai-ai-download-menu__item-main'>
            <span
              class={cn(
                'hai-ai-download-menu__item-icon',
                getActionIconClass(action.id),
              )}
              aria-hidden='true'
            >
              <svg viewBox='0 0 24 24' class='hai-ai-download-menu__item-svg'>
                <path
                  d='M6 3.75A2.25 2.25 0 0 0 3.75 6v12A2.25 2.25 0 0 0 6 20.25h12A2.25 2.25 0 0 0 20.25 18V9.56a2.25 2.25 0 0 0-.66-1.59l-3.56-3.56a2.25 2.25 0 0 0-1.59-.66H6Zm7 .75 4.5 4.5H14a1 1 0 0 1-1-1V4.5Zm-4.25 8a.75.75 0 0 1 .75-.75h5a.75.75 0 0 1 0 1.5h-5a.75.75 0 0 1-.75-.75Zm0 3a.75.75 0 0 1 .75-.75h4a.75.75 0 0 1 0 1.5h-4a.75.75 0 0 1-.75-.75Z'
                ></path>
              </svg>
            </span>
            <span class='hai-ai-download-menu__item-label'>{action.label}</span>
          </span>
          {#if action.badgeLabel}
            <span class='hai-ai-download-menu__item-badge'>
              {action.badgeLabel}
            </span>
          {/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .hai-ai-download-menu {
    position: relative;
    display: inline-flex;
  }

  .hai-ai-download-menu__trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.45rem;
    flex-shrink: 0;
    min-height: 2.35rem;
    padding: 0 0.9rem;
    border: 1px solid oklch(var(--bc) / 0.1);
    border-radius: 9999px;
    background: color-mix(in srgb, white 82%, oklch(var(--b1)) 18%);
    color: oklch(var(--bc) / 0.8);
    transition:
      background-color 160ms ease,
      border-color 160ms ease,
      color 160ms ease,
      box-shadow 160ms ease,
      transform 160ms ease;
    white-space: nowrap;
    cursor: pointer;
  }

  .hai-ai-download-menu__trigger:hover {
    color: oklch(var(--bc));
    border-color: oklch(var(--bc) / 0.18);
    background: color-mix(in srgb, white 68%, oklch(var(--b2)) 32%);
    box-shadow: 0 14px 28px -24px oklch(var(--bc) / 0.44);
  }

  .hai-ai-download-menu__trigger:focus-visible {
    outline: 2px solid oklch(var(--p) / 0.26);
    outline-offset: 2px;
  }

  .hai-ai-download-menu__trigger--icon {
    width: 2.5rem;
    padding: 0;
    border-radius: 1rem;
  }

  .hai-ai-download-menu__trigger :global(span) {
    font-size: 0.96rem;
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  .hai-ai-download-menu__trigger-icon,
  .hai-ai-download-menu__chevron,
  .hai-ai-download-menu__item-svg {
    width: 1.05rem;
    height: 1.05rem;
    fill: currentColor;
  }

  .hai-ai-download-menu__chevron {
    opacity: 0.72;
    transition: transform 160ms ease;
  }

  .hai-ai-download-menu__chevron--open {
    transform: rotate(180deg);
  }

  .hai-ai-download-menu__panel {
    position: absolute;
    top: calc(100% + 0.6rem);
    right: 0;
    z-index: 40;
    min-width: 16rem;
    display: grid;
    gap: 0.22rem;
    padding: 0.55rem;
    border: 1px solid color-mix(in srgb, oklch(var(--bc)) 9%, white 91%);
    border-radius: 1.4rem;
    background: #fff;
    box-shadow:
      0 28px 56px -30px rgb(15 23 42 / 0.28),
      0 16px 28px -18px rgb(15 23 42 / 0.16),
      0 0 0 1px rgb(255 255 255 / 0.92) inset;
    backdrop-filter: none;
    isolation: isolate;
  }

  .hai-ai-download-menu__item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    width: 100%;
    padding: 0.9rem 0.92rem;
    border: 1px solid transparent;
    border-radius: 1rem;
    background: transparent;
    color: inherit;
    text-align: left;
    transition:
      background-color 140ms ease,
      border-color 140ms ease,
      transform 140ms ease;
    cursor: pointer;
  }

  .hai-ai-download-menu__item:hover {
    border-color: color-mix(in srgb, oklch(var(--bc)) 8%, white 92%);
    background: color-mix(in srgb, oklch(var(--bc)) 4%, white 96%);
    transform: translateX(1px);
  }

  .hai-ai-download-menu__item-main {
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: 0.65rem;
    white-space: nowrap;
  }

  .hai-ai-download-menu__item-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.9rem;
    height: 1.9rem;
    border-radius: 0.75rem;
    background: linear-gradient(180deg, #eef3ff 0%, #dde8ff 100%);
    color: #2f63d8;
    flex-shrink: 0;
  }

  .hai-ai-download-menu__item-icon--word {
    background: linear-gradient(180deg, #dbe8ff 0%, #b8d0ff 100%);
    color: #2d6be8;
  }

  .hai-ai-download-menu__item-icon--pdf {
    background: linear-gradient(180deg, #ffe1da 0%, #ffc2b5 100%);
    color: #ef5539;
  }

  .hai-ai-download-menu__item-icon--markdown {
    background: linear-gradient(180deg, #ebf1ff 0%, #d4e2ff 100%);
    color: #466de5;
  }

  .hai-ai-download-menu__item-label {
    min-width: 0;
    font-size: 0.98rem;
    font-weight: 600;
    color: #28313d;
    white-space: nowrap;
  }

  .hai-ai-download-menu__item-badge {
    flex-shrink: 0;
    min-width: 2.9rem;
    padding: 0.34rem 0.56rem;
    border-radius: 9999px;
    background: color-mix(in srgb, #eef3ff 72%, white 28%);
    border: 1px solid color-mix(in srgb, #c8d7ff 68%, white 32%);
    color: #5371b9;
    font-size: 0.72rem;
    font-weight: 700;
    line-height: 1;
    letter-spacing: 0.04em;
    text-align: center;
    white-space: nowrap;
  }

  @media (max-width: 640px) {
    .hai-ai-download-menu__panel {
      min-width: 13.5rem;
    }
  }
</style>
