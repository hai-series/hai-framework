<!--
  =============================================================================
  @h-ai/ui - MessageContainer 组件
  =============================================================================
  轻量消息提示容器，渲染 message store 中的消息条目。
  视觉风格：顶部居中、带类型图标、自动滑入滑出。

  叠加策略：消息层始终挂载到 `document.body`，使用 fixed overlay + 超高 z-index（高于 Modal 的 `--hai-z-modal`），保证不被任何弹层遮挡；空消息时隐藏容器避免拦截交互。
  =============================================================================
-->
<script lang='ts'>
  import type { DataAttributes } from '../../types.js'
  import { onMount } from 'svelte'
  import { message } from '../../message.svelte.js'
  import { cn, getDataAttributes } from '../../utils.js'
  import IconButton from '../primitives/IconButton.svelte'

  const { ...restProps }: DataAttributes = $props()
  const dataAttributes = $derived(getDataAttributes(restProps))

  /** 图标类型到 tabler icon 的映射 */
  const iconMap: Record<string, string> = {
    info: 'icon-[tabler--info-circle]',
    success: 'icon-[tabler--circle-check]',
    warning: 'icon-[tabler--alert-triangle]',
    error: 'icon-[tabler--circle-x]',
  }

  /** 图标颜色映射 */
  const iconColorMap: Record<string, string> = {
    info: 'text-info',
    success: 'text-success',
    warning: 'text-warning',
    error: 'text-error',
  }

  /** 文案颜色映射 */
  const textColorMap: Record<string, string> = {
    info: 'text-info',
    success: 'text-success',
    warning: 'text-warning',
    error: 'text-error',
  }

  /** 背景/边框映射 */
  const bgMap: Record<string, string> = {
    info: 'border-info/30 bg-info/15',
    success: 'border-success/30 bg-success/15',
    warning: 'border-warning/30 bg-warning/15',
    error: 'border-error/30 bg-error/15',
  }

  let layerElement: HTMLDivElement | undefined = $state()
  const hasItems = $derived(message.items.length > 0)

  function safeShowPopover(el: HTMLElement) {
    try {
      if (typeof el.showPopover === 'function' && el.isConnected && !el.matches(':popover-open'))
        el.showPopover()
    }
    catch {
    // 元素未连接或重复调用时忽略。
    }
  }

  function safeHidePopover(el: HTMLElement) {
    try {
      if (typeof el.hidePopover === 'function' && el.matches(':popover-open'))
        el.hidePopover()
    }
    catch {
    // 同上，忽略异常。
    }
  }

  $effect(() => {
    const el = layerElement
    if (!el)
      return
    if (hasItems)
      safeShowPopover(el)
    else
      safeHidePopover(el)
  })

  onMount(() => {
    const el = layerElement
    if (el && document.body && el.parentElement !== document.body)
      document.body.appendChild(el)

    return () => {
      const el = layerElement
      if (el) {
        safeHidePopover(el)
        el.remove()
      }
    }
  })
</script>

<div {...dataAttributes} bind:this={layerElement} popover='manual' class='hai-message-layer'>
  <div class='hai-message-stack'>
    {#each message.items as item (item.id)}
      <div
        class={cn(
          'hai-message-item alert shadow-lg border',
          bgMap[item.type] ?? bgMap.info,
          textColorMap[item.type] ?? textColorMap.info,
        )}
        role='alert'
      >
        <span class={cn(iconMap[item.type] ?? iconMap.info, 'size-5 shrink-0', iconColorMap[item.type] ?? iconColorMap.info)}></span>
        <span class='text-sm'>{item.message}</span>
        {#if item.closable}
          <IconButton
            variant='ghost'
            size='sm'
            onclick={() => message.remove(item.id)}
            ariaLabel='close'
          >
            ✕
          </IconButton>
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .hai-message-layer {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    overflow: visible;
    pointer-events: none;
    z-index: 2147483647;
  }

  .hai-message-stack {
    position: absolute;
    top: 1rem;
    left: 0;
    right: 0;
    margin-left: auto;
    margin-right: auto;
    width: max-content;
    max-width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    pointer-events: auto;
  }

  .hai-message-item {
    animation: hai-message-enter 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    min-width: 16rem;
    max-width: 32rem;
    white-space: nowrap;
  }

  @keyframes hai-message-enter {
    from {
      opacity: 0;
      transform: translateY(-1rem);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
