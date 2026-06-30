<!--
  单个 MessageBox 弹框，由 MessageBoxContainer 渲染。
  内部使用原生 <dialog>.showModal() 进入浏览器 top layer。
  行为对标 ElementUI MessageBox：
    - 始终显示标题（默认"提示"）和右上角关闭按钮；
    - 遮罩层点击可通过 closeOnClickModal 配置。
-->
<script lang='ts'>
  import type { MessageBoxItem } from '../../messagebox.svelte.js'
  import type { DataAttributes } from '../../types.js'
  import { messageBox } from '../../messagebox.svelte.js'
  import { uiM } from '../../messages.js'
  import { cn, getDataAttributes } from '../../utils.js'
  import Button from '../primitives/Button.svelte'

  const { item, ...restProps }: { item: MessageBoxItem } & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))
  /** 图标类型到 tabler icon 的映射 */
  const iconMap: Record<string, string> = {
    info: 'icon-[tabler--info-circle]',
    success: 'icon-[tabler--circle-check]',
    warning: 'icon-[tabler--alert-triangle]',
    error: 'icon-[tabler--circle-x]',
  }

  /** 图标背景色映射 */
  const iconBgMap: Record<string, string> = {
    info: 'bg-info/15 text-info',
    success: 'bg-success/15 text-success',
    warning: 'bg-warning/15 text-warning',
    error: 'bg-error/15 text-error',
  }

  let dialogEl: HTMLDialogElement | undefined = $state()

  $effect(() => {
    if (dialogEl && !dialogEl.open) {
      dialogEl.showModal()
    }
  })

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget && item.closeOnClickModal) {
      messageBox.handleClose(item)
    }
  }
</script>

<!-- 使用 hai-messagebox 而非 DaisyUI .modal，避免 ::backdrop 被隐藏 -->
<dialog {...dataAttributes}
        bind:this={dialogEl}
        class='hai-messagebox'
        oncancel={e => e.preventDefault()}
        onclick={handleBackdropClick}
>
  <div class='hai-messagebox__panel'>
    <!-- 标题栏：始终显示，右侧关闭按钮 -->
    <div class='hai-messagebox__header'>
      <h3 class='font-bold text-lg'>{item.title}</h3>
      <button
        type='button'
        class='hai-messagebox__close'
        aria-label={uiM('common_close')}
        onclick={() => messageBox.handleClose(item)}
      >
        <span class='icon-[tabler--x] size-5'></span>
      </button>
    </div>

    <!-- 图标 + 消息内容同行 -->
    <div class='hai-messagebox__body flex items-center gap-3'>
      {#if item.iconType}
        <span class={cn(
          'inline-flex items-center justify-center rounded-full w-10 h-10 shrink-0',
          iconBgMap[item.iconType] ?? iconBgMap.info,
        )}>
          <span class={cn(iconMap[item.iconType] ?? iconMap.info, 'size-5')}></span>
        </span>
      {/if}
      <p class='flex-1 min-w-0 text-base-content/80 text-sm leading-relaxed'>{item.message}</p>
    </div>

    <!-- 操作按钮 -->
    <div class='hai-messagebox__footer'>
      {#if item.showCancel}
        <Button
          variant='ghost'
          disabled={item.loading}
          onclick={() => messageBox.handleCancel(item)}
        >
          {item.cancelText || uiM('confirm_cancel')}
        </Button>
      {/if}
      <Button
        variant={item.confirmVariant || 'primary'}
        loading={item.loading}
        disabled={item.loading}
        onclick={() => messageBox.handleConfirm(item)}
      >
        {item.confirmText || uiM('confirm_ok')}
      </Button>
    </div>
  </div>
</dialog>

<style>
  dialog.hai-messagebox {
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    outline: none;
    overflow: visible;
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    display: grid;
    place-items: center;
    z-index: 999;
  }

  dialog.hai-messagebox::backdrop {
    background: color-mix(in srgb, var(--color-base-content) 25%, transparent);
    backdrop-filter: blur(2px);
  }

  .hai-messagebox__panel {
    position: relative;
    width: min(100%, 28rem);
    max-width: calc(100vw - 2rem);
    max-height: calc(100vh - 4rem);
    background: var(--color-base-100);
    border-radius: 1rem;
    padding: 1.5rem;
    box-shadow: 0 25px 50px -12px oklch(0% 0 0 / 0.25);
    animation: hai-msgbox-enter 0.22s cubic-bezier(0.16, 1, 0.3, 1);
    overflow-y: auto;
  }

  .hai-messagebox__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.75rem;
  }

  .hai-messagebox__close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    color: color-mix(in srgb, var(--color-base-content) 45%, transparent);
    cursor: pointer;
    border: none;
    background: none;
    padding: 0;
    outline: none;
    transition: color 160ms ease;
  }

  .hai-messagebox__close:hover {
    color: var(--color-base-content);
  }

  .hai-messagebox__close:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--color-primary) 40%, transparent);
    outline-offset: 2px;
    border-radius: 2px;
  }

  .hai-messagebox__body {
    margin-bottom: 1rem;
  }

  .hai-messagebox__footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  @keyframes hai-msgbox-enter {
    from {
      opacity: 0;
      transform: translateY(10px) scale(0.985);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
</style>
