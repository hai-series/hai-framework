<!--
  @component Dropdown
  下拉菜单组件，支持 click/hover 触发。

  @example
  ```ts
  import { mount, unmount } from 'svelte'
  import type { ComponentProps } from 'svelte'
  import { Dropdown } from '@h-ai/ui'
  const props: ComponentProps<typeof Dropdown> = { items: [{ key: 'edit', label: '编辑' }], position: 'bottom' }
  const component = mount(Dropdown, { target: document.body, props })
  await unmount(component)
  ```
-->
<script lang='ts'>
  import type { DataAttributes, DropdownItem, DropdownProps } from '../../types.js'
  import { DropdownMenu } from 'bits-ui'
  import { onDestroy } from 'svelte'
  import { cn, getDataAttributes } from '../../utils.js'
  import BareButton from '../primitives/BareButton.svelte'

  const {
    items,
    trigger = 'click',
    position = 'bottom',
    align = 'start',
    class: className = '',
    triggerClass = '',
    onselect,
    children,
    ...restProps
  }: DropdownProps & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))
  const manualClass = $derived(cn(
    'dropdown',
    {
      top: 'dropdown-top',
      right: 'dropdown-right',
      bottom: 'dropdown-bottom',
      left: 'dropdown-left',
    }[position],
    { start: 'dropdown-start', center: '', end: 'dropdown-end' }[align],
  ))
  let open = $state(false)
  let openTimer: ReturnType<typeof setTimeout> | undefined
  let closeTimer: ReturnType<typeof setTimeout> | undefined

  function clearTimers() {
    clearTimeout(openTimer)
    clearTimeout(closeTimer)
  }

  function canHover() {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(hover: hover)').matches
  }

  function scheduleOpen() {
    if (trigger !== 'hover' || !canHover())
      return
    clearTimers()
    if (!open) {
      openTimer = setTimeout(() => {
        open = true
      }, 100)
    }
  }

  function scheduleClose() {
    if (trigger !== 'hover')
      return
    clearTimers()
    closeTimer = setTimeout(() => {
      open = false
    }, 140)
  }

  function handleWrapperLeave(event: PointerEvent) {
    if (trigger !== 'hover')
      return
    const rect = (event.currentTarget as HTMLElement | null)?.getBoundingClientRect()
    if (!rect)
      return
    const { clientX, clientY } = event
    if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom)
      return
    scheduleClose()
  }

  function handleOpenChange(next: boolean) {
    open = next
    if (!next)
      clearTimers()
  }

  function handleSelect(key: string) {
    open = false
    onselect?.(key)
  }

  onDestroy(clearTimers)
</script>

{#snippet itemContents(item: DropdownItem)}
  {#if item.icon}
    <span>{item.icon}</span>
  {/if}
  {item.label}
{/snippet}

<div
  {...dataAttributes}
  class={cn(trigger === 'manual'
    ? manualClass
    : 'relative inline-block', className)}
  onpointerenter={scheduleOpen}
  onpointerleave={handleWrapperLeave}
>
  {#if trigger === 'manual'}
    <!-- 调用方使用 dropdown-open 控制内联菜单。 -->
    <BareButton type='button' class={triggerClass}>
      {#if children}
        {@render children()}
      {/if}
    </BareButton>
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <ul tabindex='0' class='manual-menu dropdown-content menu bg-base-100 rounded-xl z-[var(--hai-z-dropdown,1000)] w-52 p-1.5 shadow-lg border border-base-content/6'>
      {#each items as item, index (item.key || `divider-${index}`)}
        {#if item.divider}
          <li class='divider'></li>
        {:else}
          <li>
            <BareButton type='button' class='w-full text-left text-[13px] rounded-lg' disabled={item.disabled} onclick={() => handleSelect(item.key)}>
              {@render itemContents(item)}
            </BareButton>
          </li>
        {/if}
      {/each}
    </ul>
  {:else}
    <DropdownMenu.Root {open} onOpenChange={handleOpenChange}>
      <DropdownMenu.Trigger type='button' class={triggerClass}>
        {#if children}
          {@render children()}
        {/if}
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side={position}
          {align}
          sideOffset={0}
          class='dropdown-content bg-base-100 rounded-xl z-[var(--hai-z-dropdown,1000)] w-52 p-1.5 shadow-lg border border-base-content/6 outline-none animate-[hai-scale-in_0.15s_cubic-bezier(0.16,1,0.3,1)]'
          onpointerenter={() => clearTimeout(closeTimer)}
          onpointerleave={scheduleClose}
        >
          {#each items as item, index (item.key || `divider-${index}`)}
            {#if item.divider}
              <DropdownMenu.Separator class='divider my-4' />
            {:else}
              <DropdownMenu.Item
                class='flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-left text-[13px] outline-none select-none data-[highlighted]:bg-base-content/10 data-[disabled]:pointer-events-none data-[disabled]:opacity-40'
                disabled={item.disabled}
                onSelect={() => handleSelect(item.key)}
              >
                {@render itemContents(item)}
              </DropdownMenu.Item>
            {/if}
          {/each}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  {/if}
</div>

<style>
  /* 手动菜单只响应调用方状态，避免 DaisyUI 在触发按钮聚焦时自动展开。 */
  :global(.dropdown:not(.dropdown-open)) > .manual-menu {
    display: none;
  }
</style>
