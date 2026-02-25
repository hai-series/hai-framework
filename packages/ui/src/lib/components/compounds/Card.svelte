<!--
  =============================================================================
  @h-ai/ui - Card 组件
  =============================================================================
  卡片组件
  
  使用 Svelte 5 Runes ($props, $derived)
  =============================================================================
-->
<script lang="ts">
  import type { CardProps } from '../../types.js'
  import { cn } from '../../utils.js'
  
  let {
    title = '',
    bordered = false,
    shadow = 'sm',
    padding = 'md',
    class: className = '',
    header,
    footer,
    children,
  }: CardProps = $props()
  
  const paddingMap = {
    none: '',
    xs: 'p-2',
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6',
    xl: 'p-8',
  }
  
  const shadowMap = {
    true: 'shadow-md',
    false: '',
    sm: 'shadow-sm',
    md: 'shadow-md',
    lg: 'shadow-lg',
  }
  
  const cardClass = $derived(
    cn(
      'card bg-base-100 rounded-xl',
      bordered && 'border border-base-300',
      typeof shadow === 'boolean' ? shadowMap[String(shadow) as 'true' | 'false'] : shadowMap[shadow],
      className,
    )
  )
  
  const bodyClass = $derived(
    cn(
      'card-body',
      paddingMap[padding],
    )
  )
</script>

<div class={cardClass}>
  <div class={bodyClass}>
    {#if header}
      <div class="card-title">
        {@render header()}
      </div>
    {:else if title}
      <h2 class="card-title">{title}</h2>
    {/if}
    
    {#if children}
      {@render children()}
    {/if}
    
    {#if footer}
      <div class="card-actions justify-end mt-4">
        {@render footer()}
      </div>
    {/if}
  </div>
</div>
