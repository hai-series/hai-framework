<!--
  =============================================================================
  @hai/ui - Accordion 组件
  =============================================================================
  手风琴/折叠面板组件，支持单选/多选模式、多种样式变体
  
  使用 Svelte 5 Runes ($props, $state, $derived)
  使用 DaisyUI collapse 类
  =============================================================================
-->

<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { AccordionItem } from './accordion-types.js'
  import { cn } from '../../utils.js'
  import ToggleCheckbox from '../primitives/ToggleCheckbox.svelte'
  import ToggleRadio from '../primitives/ToggleRadio.svelte'
  
  interface Props {
    /** 折叠项数据 */
    items: AccordionItem[]
    /** 当前展开的项（单选模式为 string，多选模式为 string[]） */
    value?: string | string[]
    /** 是否允许多选 */
    multiple?: boolean
    /** 样式变体 */
    variant?: 'default' | 'bordered' | 'shadow' | 'joined'
    /** 图标样式 */
    icon?: 'arrow' | 'plus' | 'none'
    /** 是否有分隔线 */
    divider?: boolean
    /** 变化事件 */
    onchange?: (value: string | string[]) => void
    /** 自定义类名 */
    class?: string
    /** 自定义内容渲染 */
    children?: Snippet<[AccordionItem]>
  }
  
  let {
    items,
    value = $bindable(undefined),
    multiple = false,
    variant = 'default',
    icon = 'arrow',
    divider = false,
    onchange,
    class: className = '',
    children,
  }: Props = $props()
  
  const groupName = `accordion-${Math.random().toString(36).slice(2, 9)}`
  
  function isExpanded(itemId: string): boolean {
    if (value === undefined) return false
    if (multiple) {
      return Array.isArray(value) && value.includes(itemId)
    }
    return value === itemId
  }
  
  function toggleItem(itemId: string) {
    if (multiple) {
      const current = Array.isArray(value) ? value : []
      const newValue = current.includes(itemId)
        ? current.filter(id => id !== itemId)
        : [...current, itemId]
      value = newValue
      onchange?.(newValue)
    } else {
      const newValue = value === itemId ? undefined : itemId
      value = newValue as string
      onchange?.(newValue as string)
    }
  }
  
  const iconClass = $derived({
    arrow: 'collapse-arrow',
    plus: 'collapse-plus',
    none: '',
  }[icon] || 'collapse-arrow')
  
  const containerClass = $derived(
    cn(
      variant === 'joined' && 'join join-vertical w-full',
      className,
    )
  )
  
  function getItemClass(item: AccordionItem): string {
    return cn(
      'collapse',
      iconClass,
      variant === 'bordered' && 'collapse-bordered border border-base-300',
      variant === 'shadow' && 'shadow-md',
      variant === 'joined' && 'join-item border border-base-300',
      variant === 'default' && 'bg-base-100',
      divider && variant !== 'joined' && 'border-b border-base-300',
      item.disabled && 'opacity-50 pointer-events-none',
    )
  }
</script>

<div class={containerClass}>
  {#each items as item (item.id)}
    <div class={getItemClass(item)}>
      {#if multiple}
        <!-- 多选模式 - 使用 checkbox -->
        <ToggleCheckbox
          checked={isExpanded(item.id)}
          disabled={item.disabled}
          onchange={() => toggleItem(item.id)}
        />
      {:else}
        <!-- 单选模式 - 使用 radio -->
        <ToggleRadio
          name={groupName}
          checked={isExpanded(item.id)}
          disabled={item.disabled}
          onchange={() => toggleItem(item.id)}
        />
      {/if}
      
      <div class="collapse-title font-semibold flex items-center gap-2">
        {#if item.icon}
          <span class="text-lg">{item.icon}</span>
        {/if}
        {item.title}
      </div>
      
      <div class="collapse-content text-sm">
        {#if children}
          {@render children(item)}
        {:else if item.content}
          <p>{item.content}</p>
        {/if}
      </div>
    </div>
  {/each}
</div>
