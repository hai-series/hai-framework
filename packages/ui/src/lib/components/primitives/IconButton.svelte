<!--
  =============================================================================
  @h-ai/ui - IconButton 组件
  =============================================================================
  图标按钮组件

  使用 Svelte 5 Runes ($props, $derived)
  =============================================================================
-->
<script lang='ts'>
  import type { IconButtonProps } from '../../types.js'
  import { cn, getSizeClass, getVariantClass } from '../../utils.js'

  const {
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
    ),
  )

  const iconSize = $derived({
    'xs': 'w-3 h-3',
    'sm': 'w-4 h-4',
    'md': 'w-5 h-5',
    'lg': 'w-6 h-6',
    'xl': 'w-7 h-7',
    '2xl': 'w-8 h-8',
    '3xl': 'w-9 h-9',
    '4xl': 'w-10 h-10',
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
  <div class='tooltip' data-tip={tooltip}>
    <button
      type='button'
      class={buttonClass}
      {disabled}
      aria-label={computedAriaLabel}
      onclick={handleClick}
    >
      {#if loading}
        <span class='loading loading-spinner'></span>
      {:else if children}
        {@render children()}
      {:else if typeof icon === 'function'}
        {@render icon()}
      {:else if icon}
        <span class={iconSize}>
          <!-- eslint-disable-next-line svelte/no-at-html-tags -- 受控 SVG 图标渲染 -->
          {@html icon}
        </span>
      {/if}
    </button>
  </div>
{:else}
  <button
    type='button'
    class={buttonClass}
    {disabled}
    aria-label={computedAriaLabel}
    onclick={handleClick}
  >
    {#if loading}
      <span class='loading loading-spinner'></span>
    {:else if children}
      {@render children()}
    {:else if typeof icon === 'function'}
      {@render icon()}
    {:else if icon}
      <span class={iconSize}>
        <!-- eslint-disable-next-line svelte/no-at-html-tags -- 受控 SVG 图标渲染 -->
        {@html icon}
      </span>
    {/if}
  </button>
{/if}
