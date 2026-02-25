<!--
  =============================================================================
  @hai/ui - Button 组件
  =============================================================================
  通用按钮组件，支持多种变体和尺寸
  
  使用 Svelte 5 Runes ($props, $derived)
  =============================================================================
-->
<script lang="ts">
  import type { ButtonProps } from '../../types.js'
  import { cn, getVariantClass, getSizeClass } from '../../utils.js'
  
  let {
    variant = 'default',
    size = 'md',
    ariaLabel = '',
    disabled = false,
    loading = false,
    outline = false,
    circle = false,
    class: className = '',
    type = 'button',
    onclick,
    onClick,
    children,
  }: ButtonProps = $props()
  
  const buttonClass = $derived(
    cn(
      'btn',
      getVariantClass(variant),
      getSizeClass(size),
      outline && 'btn-outline',
      circle && 'btn-circle',
      loading && 'btn-loading',
      className,
    )
  )
  
  function handleClick(e: MouseEvent) {
    if (disabled || loading) {
      e.preventDefault()
      return
    }
    onclick?.(e)
    onClick?.(e)
  }
</script>

<button
  {type}
  class={buttonClass}
  disabled={disabled || loading}
  aria-label={ariaLabel || undefined}
  onclick={handleClick}
>
  {#if loading}
    <span class="loading loading-spinner"></span>
  {/if}
  {#if children}
    {@render children()}
  {/if}
</button>
