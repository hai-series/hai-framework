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
  import type { DataAttributes, DropdownProps } from '../../types.js'
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

<div
  {...dataAttributes}
  class={cn('relative inline-block', className)}
  onpointerenter={scheduleOpen}
  onpointerleave={handleWrapperLeave}
>
  {#if trigger === 'manual'}
    <!-- manual 模式由外部控制；这里不挂 bits-ui 触发器，避免默认点击行为。 -->
    <BareButton type='button' class={triggerClass}>
      {#if children}
        {@render children()}
      {/if}
    </BareButton>
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
                {#if item.icon}
                  <span>{item.icon}</span>
                {/if}
                {item.label}
              </DropdownMenu.Item>
            {/if}
          {/each}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  {/if}
</div>
