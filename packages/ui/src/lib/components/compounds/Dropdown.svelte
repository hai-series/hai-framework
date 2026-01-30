<!--
  =============================================================================
  @hai/ui - Dropdown 组件
  =============================================================================
  下拉菜单组件
  
  使用 Svelte 5 Runes ($props, $derived, $state)
  =============================================================================
-->
<script lang="ts">
  import type { DropdownProps } from '../../types.js'
  import { cn } from '../../utils.js'
  
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
  <div tabindex="0" role="button" onclick={toggleDropdown}>
    {#if children}
      {@render children()}
    {/if}
  </div>
  
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <ul tabindex="0" class="dropdown-content menu bg-base-100 rounded-box z-[1] w-52 p-2 shadow">
    {#each items as item}
      {#if item.divider}
        <li class="divider"></li>
      {:else}
        <li>
          <button
            class="w-full text-left"
            class:disabled={item.disabled}
            disabled={item.disabled}
            onclick={() => handleSelect(item.key)}
          >
            {#if item.icon}
              <span>{item.icon}</span>
            {/if}
            {item.label}
          </button>
        </li>
      {/if}
    {/each}
  </ul>
</div>
