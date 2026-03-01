<!--
  @component Button
  通用按钮组件，支持多种变体和尺寸。
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
    children,
  }: ButtonProps = $props()
  
  const buttonClass = $derived(
    cn(
      'btn no-animation',
      getVariantClass(variant),
      getSizeClass(size),
      outline && 'btn-outline',
      circle && 'btn-circle',
      loading && 'opacity-70 pointer-events-none',
      'font-medium tracking-[-0.01em]',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-base-100',
      'active:scale-[0.97]',
      className,
    )
  )
  
  function handleClick(e: MouseEvent) {
    if (disabled || loading) {
      e.preventDefault()
      return
    }
    onclick?.(e)
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
    <span class="loading loading-spinner loading-xs"></span>
  {/if}
  {#if children}
    {@render children()}
  {/if}
</button>
