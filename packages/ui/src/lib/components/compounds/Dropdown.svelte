<!--
  @component Dropdown
  下拉菜单组件，支持 click/hover 触发。
-->
<script lang="ts">
  import type { DropdownProps } from '../../types.js'
  import { cn } from '../../utils.js'
  import BareButton from '../primitives/BareButton.svelte'
  
  let {
    items,
    trigger = 'click',
    position = 'bottom',
    align = 'start',
    class: className = '',
    onselect,
    children,
  }: DropdownProps = $props()
  
  let isOpen = $state(false)
  
  const positionMap = {
    top: 'dropdown-top',
    right: 'dropdown-right',
    bottom: 'dropdown-bottom',
    left: 'dropdown-left',
  }
  
  const alignMap = {
    start: 'dropdown-start',
    center: '',
    end: 'dropdown-end',
  }
  
  const dropdownClass = $derived(
    cn(
      'dropdown',
      positionMap[position],
      alignMap[align],
      trigger === 'hover' && 'dropdown-hover',
      isOpen && 'dropdown-open',
      className,
    )
  )
  
  function handleSelect(key: string) {
    isOpen = false
    onselect?.(key)
  }
  
  function toggleDropdown() {
    if (trigger === 'click') {
      isOpen = !isOpen
    }
  }
</script>

<div class={dropdownClass}>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <BareButton
    tabindex={0}
    role="button"
    onclick={toggleDropdown}
    onkeydown={(e) => e.key === 'Enter' && toggleDropdown()}
  >
    {#if children}
      {@render children()}
    {/if}
  </BareButton>
  
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <ul tabindex="0" class="dropdown-content menu bg-base-100 rounded-xl z-[1] w-52 p-1.5 shadow-lg border border-base-content/6 animate-[hai-scale-in_0.15s_cubic-bezier(0.16,1,0.3,1)]">
    {#each items as item}
      {#if item.divider}
        <li class="divider"></li>
      {:else}
        <li>
          <BareButton
            class={cn('w-full text-left text-[13px] rounded-lg', item.disabled && 'disabled')}
            disabled={item.disabled}
            onclick={() => handleSelect(item.key)}
          >
            {#if item.icon}
              <span>{item.icon}</span>
            {/if}
            {item.label}
          </BareButton>
        </li>
      {/if}
    {/each}
  </ul>
</div>
