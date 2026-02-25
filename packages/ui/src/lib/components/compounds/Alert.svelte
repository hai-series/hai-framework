<!--
  =============================================================================
  @h-ai/ui - Alert 组件
  =============================================================================
  警告框组件
  
  使用 Svelte 5 Runes ($props, $derived)
  使用 primitives 组件：IconButton
  =============================================================================
-->
<script lang="ts">
  import type { AlertProps } from '../../types.js'
  import { cn, getAlertVariantClass } from '../../utils.js'
  import IconButton from '../primitives/IconButton.svelte'
  
  let {
    variant = 'info',
    title = '',
    dismissible = false,
    class: className = '',
    onclose,
    children,
  }: AlertProps = $props()
  
  let visible = $state(true)
  
  const alertClass = $derived(
    cn(
      'alert',
      getAlertVariantClass(variant),
      className,
    )
  )
  
  // 图标映射
  const icons: Record<string, string> = {
    info: 'ℹ️',
    success: '✅',
    warning: '⚠️',
    error: '❌',
  }
  
  function handleClose() {
    visible = false
    onclose?.()
  }
</script>

{#if visible}
  <div class={alertClass} role="alert">
    <span class="text-lg">{icons[variant] ?? icons.info}</span>
    
    <div>
      {#if title}
        <h3 class="font-bold">{title}</h3>
      {/if}
      {#if children}
        <div class="text-sm">
          {@render children()}
        </div>
      {/if}
    </div>
    
    {#if dismissible}
      <IconButton size="sm" variant="ghost" label="Close" onclick={handleClose}>
        {#snippet children()}
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        {/snippet}
      </IconButton>
    {/if}
  </div>
{/if}
