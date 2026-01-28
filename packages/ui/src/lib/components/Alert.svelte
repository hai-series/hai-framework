<!--
  =============================================================================
  @hai/ui - Alert 组件
  =============================================================================
  警告框组件
  
  使用 Svelte 5 Runes ($props, $derived)
  =============================================================================
-->
<script lang="ts">
  import type { AlertProps } from '../types.js'
  import { cn, getAlertVariantClass } from '../utils.js'
  
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
      <button class="btn btn-sm btn-ghost" onclick={handleClose}>
        ✕
      </button>
    {/if}
  </div>
{/if}
