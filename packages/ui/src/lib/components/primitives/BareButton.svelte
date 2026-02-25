<!--
  =============================================================================
  @h-ai/ui - BareButton 组件
  =============================================================================
  无样式按钮组件（不注入 btn 类），用于自定义布局场景
  
  使用 Svelte 5 Runes ($props)
  =============================================================================
-->
<script lang="ts">
  import type { BareButtonProps } from '../../types.js'

  let {
    type = 'button',
    disabled = false,
    class: className = '',
    ariaLabel = '',
    role = undefined,
    ariaSelected = undefined,
    tabindex = undefined,
    onclick,
    onkeydown,
    children,
  }: BareButtonProps = $props()

  function handleClick(e: MouseEvent) {
    onclick?.(e)
  }
</script>

<button
  {type}
  class={className}
  disabled={disabled}
  aria-label={ariaLabel || undefined}
  role={role}
  aria-selected={ariaSelected}
  tabindex={tabindex}
  onclick={handleClick}
  onkeydown={onkeydown}
>
  {#if children}
    {@render children()}
  {/if}
</button>
