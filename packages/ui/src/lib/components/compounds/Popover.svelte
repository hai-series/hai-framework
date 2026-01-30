<!--
  =============================================================================
  @hai/ui - Popover 组件
  =============================================================================
  弹出层组件
  
  使用 Svelte 5 Runes ($props, $state, $effect)
  =============================================================================
-->
<script lang="ts">
  import type { PopoverProps } from '../../types.js'
  import { cn } from '../../utils.js'
  
  let {
    open = $bindable(false),
    position = 'bottom',
    trigger = 'click',
    offset = 8,
    class: className = '',
    onopen,
    onclose,
    triggerContent,
    children,
  }: PopoverProps = $props()
  
  let triggerElement: HTMLDivElement
  let popoverElement: HTMLDivElement
  
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
      } else {
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
      open &&
      triggerElement &&
      popoverElement &&
      !triggerElement.contains(e.target as Node) &&
      !popoverElement.contains(e.target as Node)
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
</script>

<div
  class={cn('relative inline-block', className)}
  onmouseenter={handleMouseEnter}
  onmouseleave={handleMouseLeave}
>
  <!-- 触发器 -->
  <div
    bind:this={triggerElement}
    class="inline-block"
    onclick={handleTriggerClick}
    role="button"
    tabindex="0"
    onkeydown={(e) => e.key === 'Enter' && handleTriggerClick()}
  >
    {#if triggerContent}
      {@render triggerContent()}
    {/if}
  </div>
  
  <!-- 弹出内容 -->
  {#if open}
    <div
      bind:this={popoverElement}
      class={cn(
        'absolute z-50 bg-base-100 rounded-box shadow-lg border border-base-200 p-4',
        positionClass,
      )}
      style="--offset: {offset}px"
      role="dialog"
    >
      <!-- 箭头 -->
      <div class={cn('absolute w-0 h-0 border-8', arrowClass)}></div>
      
      {#if children}
        {@render children()}
      {/if}
    </div>
  {/if}
</div>
