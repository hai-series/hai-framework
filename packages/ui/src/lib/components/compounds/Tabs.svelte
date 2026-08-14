<!--
  @component Tabs
  标签页组件，支持 line/card/pills 三种样式。
-->
<script lang='ts'>
  import type { DataAttributes, TabsProps } from '../../types.js'
  import { SvelteSet } from 'svelte/reactivity'
  import { cn, getDataAttributes } from '../../utils.js'
  import BareButton from '../primitives/BareButton.svelte'

  let {
    items,
    active = $bindable(''),
    size = 'md',
    type = 'line',
    class: className = '',
    onchange,
    onactivate,
    lazy = false,
    children,
    ...restProps
  }: TabsProps & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))
  // 已激活过的页签集合，用于惰性挂载（不预加载不可见页签）。
  const activatedKeys = new SvelteSet<string>()

  // 默认选中第一个
  $effect(() => {
    if (!active && items.length > 0) {
      active = items[0].key
    }
  })

  // 记录激活过的页签，并在首次激活时回调一次，供惰性加载对应内容。
  $effect(() => {
    if (active && !activatedKeys.has(active)) {
      activatedKeys.add(active)
      onactivate?.(active)
    }
  })

  /** 指定页签是否已激活过；非惰性模式下恒为 true（内容全部预挂载）。 */
  function isActivated(key: string): boolean {
    return !lazy || activatedKeys.has(key)
  }

  const typeMap = {
    line: 'tabs-border',
    card: 'tabs-box',
    pills: 'tabs-box',
  }

  const sizeMap = {
    'xs': 'tabs-xs',
    'sm': 'tabs-sm',
    'md': '',
    'lg': 'tabs-lg',
    'xl': 'tabs-lg',
    '2xl': 'tabs-lg',
    '3xl': 'tabs-lg',
    '4xl': 'tabs-lg',
  }

  const tabsClass = $derived(
    cn(
      'tabs',
      typeMap[type],
      sizeMap[size],
      className,
    ),
  )

  function handleSelect(key: string) {
    active = key
    onchange?.(key)
  }
</script>

<div {...dataAttributes} role='tablist' class={tabsClass}>
  {#each items as item (item.key)}
    <BareButton
      role='tab'
      ariaSelected={active === item.key}
      class={cn('tab', active === item.key && 'tab-active')}
      disabled={item.disabled}
      onclick={() => handleSelect(item.key)}
    >
      {#if item.icon}
        <span class='mr-1'>{item.icon}</span>
      {/if}
      {item.label}
    </BareButton>
  {/each}
</div>

{#if children}
  <div class='py-4'>
    {@render children({ active, isActivated })}
  </div>
{/if}
