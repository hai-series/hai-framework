<!--
  =============================================================================
  @hai/ui - Tabs 组件
  =============================================================================
  标签页组件
  
  使用 Svelte 5 Runes ($props, $derived, $bindable)
  =============================================================================
-->
<script lang="ts">
  import type { TabsProps } from '../../types.js'
  import { cn } from '../../utils.js'
  import BareButton from '../primitives/BareButton.svelte'
  
  let {
    items,
    active = $bindable(''),
    size = 'md',
    type = 'line',
    class: className = '',
    onchange,
    children,
  }: TabsProps = $props()
  
  // 默认选中第一个
  $effect(() => {
    if (!active && items.length > 0) {
      active = items[0].key
    }
  })
  
  const typeMap = {
    line: 'tabs-bordered',
    card: 'tabs-boxed',
    pills: 'tabs-boxed',
  }
  
  const sizeMap = {
    xs: 'tabs-xs',
    sm: 'tabs-sm',
    md: '',
    lg: 'tabs-lg',
    xl: 'tabs-lg',
  }
  
  const tabsClass = $derived(
    cn(
      'tabs',
      typeMap[type],
      sizeMap[size],
      className,
    )
  )
  
  function handleSelect(key: string) {
    active = key
    onchange?.(key)
  }
</script>

<div role="tablist" class={tabsClass}>
  {#each items as item}
    <BareButton
      role="tab"
      class={cn('tab', active === item.key && 'tab-active')}
      disabled={item.disabled}
      onclick={() => handleSelect(item.key)}
    >
      {#if item.icon}
        <span class="mr-1">{item.icon}</span>
      {/if}
      {item.label}
    </BareButton>
  {/each}
</div>

{#if children}
  <div class="py-4">
    {@render children()}
  </div>
{/if}
