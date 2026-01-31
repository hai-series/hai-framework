<!--
  =============================================================================
  @hai/ui - Tag 组件
  =============================================================================
  标签组件
  
  使用 Svelte 5 Runes ($props, $derived)
  =============================================================================
-->
<script lang="ts">
  import type { TagProps } from '../../types.js'
  import { cn, getVariantClass, getSizeClass } from '../../utils.js'
  
  let {
    text = '',
    variant = 'default',
    size = 'md',
    closable = false,
    outline = false,
    /** 移除按钮的 aria-label */
    removeLabel = 'Remove tag',
    class: className = '',
    onclose,
    children,
  }: TagProps = $props()
  
  const tagClass = $derived(
    cn(
      'badge gap-1',
      getVariantClass(variant, 'badge'),
      getSizeClass(size, 'badge'),
      outline && 'badge-outline',
      className,
    )
  )
  
  function handleClose(e: MouseEvent) {
    e.stopPropagation()
    onclose?.()
  }
</script>

<span class={tagClass}>
  {#if children}
    {@render children()}
  {:else}
    {text}
  {/if}
  
  {#if closable}
    <button
      type="button"
      class="btn btn-ghost btn-xs btn-circle -mr-1"
      onclick={handleClose}
      aria-label={removeLabel}
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
      </svg>
    </button>
  {/if}
</span>
