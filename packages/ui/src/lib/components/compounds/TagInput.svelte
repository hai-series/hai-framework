<!--
  =============================================================================
  @hai/ui - TagInput 组件
  =============================================================================
  标签输入框组件
  
  使用 Svelte 5 Runes ($props, $state, $bindable)
  =============================================================================
-->
<script lang="ts">
  import type { TagInputProps } from '../../types.js'
  import { cn, getInputSizeClass } from '../../utils.js'
  import Tag from '../primitives/Tag.svelte'
  
  // 默认占位符
  const defaultPlaceholder = 'Press Enter to add'
  
  let {
    tags = $bindable([]),
    placeholder = defaultPlaceholder,
    maxTags = 0,
    allowDuplicates = false,
    disabled = false,
    size = 'md',
    class: className = '',
    onchange,
  }: TagInputProps = $props()
  
  let inputValue = $state('')
  let inputElement = $state<HTMLInputElement | null>(null)
  
  const containerClass = $derived(
    cn(
      'input input-bordered flex flex-wrap items-center gap-1 min-h-[2.5rem] h-auto py-1',
      getInputSizeClass(size),
      disabled && 'input-disabled',
      className,
    )
  )
  
  const canAddMore = $derived(maxTags === 0 || tags.length < maxTags)
  
  function addTag(value: string) {
    const trimmed = value.trim()
    if (!trimmed) return
    if (!allowDuplicates && tags.includes(trimmed)) return
    if (!canAddMore) return
    
    tags = [...tags, trimmed]
    inputValue = ''
    onchange?.(tags)
  }
  
  function removeTag(index: number) {
    tags = tags.filter((_, i) => i !== index)
    onchange?.(tags)
  }
  
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      addTag(inputValue)
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      removeTag(tags.length - 1)
    }
  }
  
  function handleBlur() {
    if (inputValue.trim()) {
      addTag(inputValue)
    }
  }
</script>

<div
  class={containerClass}
  onclick={() => inputElement?.focus()}
  onkeydown={(e) => e.key === 'Enter' && inputElement?.focus()}
  role="textbox"
  tabindex="-1"
>
  {#each tags as tag, index (index)}
    <Tag
      text={tag}
      size="sm"
      closable={!disabled}
      onclose={() => removeTag(index)}
    />
  {/each}
  
  {#if canAddMore && !disabled}
    <input
      bind:this={inputElement}
      bind:value={inputValue}
      type="text"
      {placeholder}
      {disabled}
      class="flex-1 min-w-[100px] bg-transparent border-none outline-none text-sm"
      onkeydown={handleKeydown}
      onblur={handleBlur}
    />
  {/if}
</div>
