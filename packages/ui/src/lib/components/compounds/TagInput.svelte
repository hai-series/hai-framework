<!--
  =============================================================================
  @h-ai/ui - TagInput 组件
  =============================================================================
  标签输入框组件

  使用 Svelte 5 Runes ($props, $state, $bindable)
  =============================================================================
-->
<script lang='ts'>
  import type { DataAttributes, TagInputProps } from '../../types.js'
  import { uiM } from '../../messages.js'
  import { cn, getDataAttributes } from '../../utils.js'
  import { getFormControlSizeClasses } from '../control-size.js'
  import BareInput from '../primitives/BareInput.svelte'
  import Tag from '../primitives/Tag.svelte'

  let {
    tags = $bindable([]),
    placeholder,
    maxTags = 0,
    allowDuplicates = false,
    disabled = false,
    size = 'md',
    class: className = '',
    onchange,
    ...restProps
  }: TagInputProps & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))
  const sizeClasses = $derived(getFormControlSizeClasses(size))
  let inputValue = $state('')
  let inputElement = $state<HTMLInputElement | undefined>(undefined)

  const displayPlaceholder = $derived(placeholder ?? uiM('tag_input_placeholder'))

  const containerClass = $derived(
    cn(
      'flex h-auto w-full flex-wrap items-center gap-1 rounded-lg border border-base-content/15 bg-base-100 py-1 transition-[border-color,box-shadow] duration-150 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10',
      sizeClasses.minHeight,
      sizeClasses.spacing,
      disabled && 'cursor-not-allowed opacity-50',
      className,
    ),
  )

  const canAddMore = $derived(maxTags === 0 || tags.length < maxTags)

  function addTag(value: string) {
    const trimmed = value.trim()
    if (!trimmed)
      return
    if (!allowDuplicates && tags.includes(trimmed))
      return
    if (!canAddMore)
      return

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
    }
    else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      removeTag(tags.length - 1)
    }
  }

  function handleBlur() {
    if (inputValue.trim()) {
      addTag(inputValue)
    }
  }
</script>

<div {...dataAttributes} class='fieldset w-full'>
  <div
    class={containerClass}
    onclick={() => inputElement?.focus()}
    onkeydown={e => e.key === 'Enter' && inputElement?.focus()}
    role='textbox'
    tabindex='-1'
  >
    {#each tags as tag, index (index)}
      <Tag
        text={tag}
        size='sm'
        closable={!disabled}
        onclose={() => removeTag(index)}
      />
    {/each}

    {#if canAddMore && !disabled}
      <BareInput
        type='text'
        class='flex-1 min-w-[100px] bg-transparent border-none outline-none'
        bind:value={inputValue}
        bind:inputRef={inputElement}
        placeholder={displayPlaceholder}
        {disabled}
        onkeydown={handleKeydown}
        onblur={handleBlur}
      />
    {/if}
  </div>
</div>
