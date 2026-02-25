<!--
  =============================================================================
  @hai/ui - IconButton 组件
  =============================================================================
  图标按钮组件
  
  使用 Svelte 5 Runes ($props, $derived)
  =============================================================================
-->
<script lang="ts">
  import type { IconButtonProps } from '../../types.js'
  import { cn, getVariantClass, getSizeClass } from '../../utils.js'
  
  let {
    icon,
    label = '',
    ariaLabel = '',
    tooltip = '',
    variant = 'default',
    size = 'md',
    disabled = false,
    loading = false,
    class: className = '',
    onclick,
    children,
  }: IconButtonProps = $props()
  
  /** 计算最终的 aria-label */
  const computedAriaLabel = $derived(ariaLabel || label || tooltip)
  
  const buttonClass = $derived(
    cn(
      'btn btn-circle',
      getVariantClass(variant),
      getSizeClass(size),
      loading && 'btn-loading',
      className,
    )
  )
  
  const iconSize = $derived({
    xs: 'w-3 h-3',
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
    xl: 'w-7 h-7',
  }[size])
  
  function handleClick(e: MouseEvent) {
    if (disabled || loading) {
      e.preventDefault()
      return
    }
    onclick?.(e)
  }
</script>

{#if tooltip}
  <div class="tooltip" data-tip={tooltip}>
    <button
      type="button"
      class={buttonClass}
      {disabled}
      aria-label={computedAriaLabel}
      onclick={handleClick}
    >
      {#if loading}
        <span class="loading loading-spinner"></span>
      {:else if children}
        {@render children()}
      {:else if typeof icon === 'function'}
        {@render icon()}
      {:else if icon}
        <span class={iconSize}>
          {@html icon}
        </span>
      {/if}
    </button>
  </div>
{:else}
  <button
    type="button"
    class={buttonClass}
    {disabled}
    aria-label={computedAriaLabel}
    onclick={handleClick}
  >
    {#if loading}
      <span class="loading loading-spinner"></span>
    {:else if children}
      {@render children()}
    {:else if typeof icon === 'function'}
      {@render icon()}
    {:else if icon}
      <span class={iconSize}>
        {@html icon}
      </span>
    {/if}
  </button>
{/if}
