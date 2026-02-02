<!--
  =============================================================================
  @hai/ui - Drawer 组件
  =============================================================================
  抽屉组件
  
  使用 Svelte 5 Runes ($props, $derived, $effect, $bindable)
  使用 primitives 组件：IconButton
  =============================================================================
-->
<script lang="ts">
  import type { DrawerProps } from '../../types.js'
  import { cn, generateId } from '../../utils.js'
  import IconButton from '../primitives/IconButton.svelte'
  import ToggleCheckbox from '../primitives/ToggleCheckbox.svelte'
  
  let {
    open = $bindable(false),
    title = '',
    position = 'right',
    size = 'md',
    closeOnBackdrop = true,
    showClose = true,
    class: className = '',
    onclose,
    children,
  }: DrawerProps = $props()
  
  const id = generateId('drawer')
  
  const sizeMap = {
    xs: 'w-60',
    sm: 'w-72',
    md: 'w-80',
    lg: 'w-96',
    xl: 'w-[30rem]',
  }
  
  const drawerClass = $derived(
    cn(
      'drawer',
      position === 'right' && 'drawer-end',
    )
  )
  
  const sideClass = $derived(
    cn(
      'drawer-side z-50',
    )
  )
  
  const contentClass = $derived(
    cn(
      'menu bg-base-200 text-base-content min-h-full p-4',
      sizeMap[size],
      className,
    )
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
</script>

<div class={drawerClass}>
  <ToggleCheckbox {id} class="drawer-toggle" bind:checked={open} />
  
  <div class={sideClass}>
    <div
      role="button"
      tabindex="0"
      aria-label="close sidebar"
      class="drawer-overlay"
      onclick={handleBackdropClick}
      onkeydown={(e) => e.key === 'Enter' && handleBackdropClick()}
    ></div>
    
    <div class={contentClass}>
      <div class="flex items-center justify-between mb-4">
        {#if title}
          <h3 class="text-lg font-bold">{title}</h3>
        {:else}
          <div></div>
        {/if}
        
        {#if showClose}
          <IconButton size="sm" variant="ghost" label="Close" onclick={handleClose}>
            {#snippet children()}
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            {/snippet}
          </IconButton>
        {/if}
      </div>
      
      {#if children}
        {@render children()}
      {/if}
    </div>
  </div>
</div>
