<!--
  @component Tabs
  标签页组件，支持 line/card/pills 三种样式。

  @example
  ```ts
  import { mount, unmount } from 'svelte'
  import type { ComponentProps } from 'svelte'
  import { Tabs } from '@h-ai/ui'
  const props: ComponentProps<typeof Tabs> = { items: [{ key: 'profile', label: '资料' }, { key: 'security', label: '安全' }], active: 'profile', lazy: true }
  const component = mount(Tabs, { target: document.body, props })
  await unmount(component)
  ```
-->
<script lang='ts'>
  import type { DataAttributes, TabsProps } from '../../types.js'
  import { SvelteSet } from 'svelte/reactivity'
  import { cn, getDataAttributes } from '../../utils.js'

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
  const tabsId = $props.id()
  let tablist = $state<HTMLDivElement>()
  // 已激活过的页签集合，用于惰性挂载（不预加载不可见页签）。
  const activatedKeys = new SvelteSet<string>()

  // 初始或选项变化后选中可用页签，避免激活禁用项或已删除项。
  $effect(() => {
    if (!items.some(item => item.key === active && !item.disabled)) {
      active = items.find(item => !item.disabled)?.key ?? ''
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
      'max-w-full flex-nowrap overflow-x-auto',
      typeMap[type],
      sizeMap[size],
      className,
    ),
  )

  function handleSelect(key: string) {
    if (active === key)
      return
    active = key
    onchange?.(key)
  }

  // 自动激活模式：方向键移动焦点并选择，跳过禁用项且支持首尾循环。
  function handleKeydown(event: KeyboardEvent, key: string) {
    const enabled = items.filter(item => !item.disabled)
    if (!enabled.length)
      return
    const index = enabled.findIndex(item => item.key === key)
    const rtl = getComputedStyle(event.currentTarget as HTMLElement).direction === 'rtl'
    let next: number
    switch (event.key) {
      case 'ArrowRight':
        next = index + (rtl ? -1 : 1)
        break
      case 'ArrowLeft':
        next = index + (rtl ? 1 : -1)
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = enabled.length - 1
        break
      default: return
    }
    event.preventDefault()
    const selected = enabled[(next + enabled.length) % enabled.length]
    handleSelect(selected.key)
    tablist?.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)')[(next + enabled.length) % enabled.length]?.focus()
  }
</script>

<div {...dataAttributes} bind:this={tablist} role='tablist' class={tabsClass}>
  {#each items as item (item.key)}
    <button
      type='button'
      id={`${tabsId}-${encodeURIComponent(item.key)}`}
      role='tab'
      aria-selected={active === item.key}
      aria-controls={children ? `${tabsId}-panel` : undefined}
      tabindex={active === item.key ? 0 : -1}
      class={cn('tab shrink-0', active === item.key && 'tab-active')}
      disabled={item.disabled}
      onclick={() => handleSelect(item.key)}
      onkeydown={event => handleKeydown(event, item.key)}
    >
      {#if item.icon}
        <span class='mr-1'>{item.icon}</span>
      {/if}
      {item.label}
    </button>
  {/each}
</div>

{#if children}
  <div id={`${tabsId}-panel`} role='tabpanel' aria-labelledby={active ? `${tabsId}-${encodeURIComponent(active)}` : undefined} tabindex='0' class='min-w-0 py-4'>
    {@render children({ active, isActivated })}
  </div>
{/if}
