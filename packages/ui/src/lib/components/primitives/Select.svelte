<!--
  =============================================================================
  @h-ai/ui - Select 组件
  =============================================================================
  下拉选择框组件

  使用 Svelte 5 Runes ($props, $derived, $bindable)
  支持自定义验证消息（validationMessage）覆盖浏览器原生提示
  =============================================================================
-->
<script lang='ts' generics="T = string">
  import type { SelectProps } from '../../types.js'
  import { cn, getInputSizeClass } from '../../utils.js'

  let {
    value = $bindable<T>(),
    options,
    placeholder = '',
    size = 'md',
    disabled = false,
    required = false,
    error = '',
    validationMessage = '',
    class: className = '',
    id,
    onchange,
    children,
  }: SelectProps<T> = $props()

  let selectRef: HTMLSelectElement | undefined = $state()

  const selectClass = $derived(
    cn(
      'select w-full',
      getInputSizeClass(size),
      error && 'select-error',
      className,
    ),
  )

  // 当 validationMessage 变化时更新自定义验证消息
  $effect(() => {
    if (selectRef) {
      selectRef.setCustomValidity(validationMessage)
    }
  })

  function handleChange(e: Event & { currentTarget: HTMLSelectElement }) {
    const selectedValue = e.currentTarget.value as T
    value = selectedValue
    // 选择后重置自定义验证
    if (validationMessage) {
      e.currentTarget.setCustomValidity(validationMessage)
    }
    onchange?.(selectedValue)
  }

  function handleInvalid(e: Event & { currentTarget: HTMLSelectElement }) {
    if (validationMessage) {
      e.currentTarget.setCustomValidity(validationMessage)
    }
  }
</script>

<div class='fieldset w-full'>
  <select
    bind:this={selectRef}
    {id}
    class={selectClass}
    {disabled}
    {required}
    onchange={handleChange}
    oninvalid={handleInvalid}
  >
    {#if placeholder}
      <option value="" disabled selected={!value}>{placeholder}</option>
    {/if}
    {#if children}
      {@render children()}
    {:else if options}
      {#each options as option}
        <option
          value={option.value as string}
          disabled={option.disabled}
          selected={value === option.value}
        >
          {option.label}
        </option>
      {/each}
    {/if}
  </select>
  {#if error}
    <span class='fieldset-label text-error'>{error}</span>
  {/if}
</div>
