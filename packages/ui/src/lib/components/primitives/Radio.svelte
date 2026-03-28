<!--
  =============================================================================
  @h-ai/ui - Radio 组件
  =============================================================================
  单选框组件，支持组模式

  使用 Svelte 5 Runes ($props, $derived, $bindable)
  =============================================================================
-->
<script lang='ts' generics="T = string">
  import type { RadioProps, SelectOption } from '../../types.js'
  import { cn, getSizeClass } from '../../utils.js'

  let {
    value = $bindable() as T,
    options = [] as SelectOption<T>[],
    name = '',
    size = 'md',
    disabled = false,
    direction = 'vertical',
    class: className = '',
    onchange,
  }: RadioProps<T> = $props()

  const containerClass = $derived(
    cn(
      'flex gap-2',
      direction === 'horizontal' ? 'flex-row flex-wrap' : 'flex-col',
      className,
    ),
  )

  const radioClass = $derived(
    cn(
      'radio',
      getSizeClass(size, 'radio'),
    ),
  )

  function handleChange(optionValue: T) {
    value = optionValue
    onchange?.(optionValue)
  }
</script>

<div class={containerClass} role='radiogroup'>
  {#each options as option (option.value)}
    <label class='label cursor-pointer gap-2 justify-start'>
      <input
        type='radio'
        {name}
        class={radioClass}
        checked={value === option.value}
        disabled={disabled || option.disabled}
        onchange={() => handleChange(option.value)}
      />
      <span>{option.label}</span>
    </label>
  {/each}
</div>
