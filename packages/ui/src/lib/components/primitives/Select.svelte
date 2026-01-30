<!--
  =============================================================================
  @hai/ui - Select 组件
  =============================================================================
  下拉选择框组件
  
  使用 Svelte 5 Runes ($props, $derived, $bindable)
  =============================================================================
-->
<script lang="ts" generics="T = string">
  import type { SelectProps } from '../../types.js'
  import { cn, getInputSizeClass } from '../../utils.js'
  
  let {
    value = $bindable<T>(),
    options,
    placeholder = '请选择...',
    size = 'md',
    disabled = false,
    required = false,
    error = '',
    class: className = '',
    onchange,
  }: SelectProps<T> = $props()
  
  const selectClass = $derived(
    cn(
      'select select-bordered w-full',
      getInputSizeClass(size),
      error && 'select-error',
      className,
    )
  )
  
  function handleChange(e: Event & { currentTarget: HTMLSelectElement }) {
    const selectedValue = e.currentTarget.value as T
    value = selectedValue
    onchange?.(selectedValue)
  }
</script>

<div class="form-control w-full">
  <select
    class={selectClass}
    {disabled}
    {required}
    onchange={handleChange}
  >
    {#if placeholder}
      <option value="" disabled selected={!value}>{placeholder}</option>
    {/if}
    {#each options as option}
      <option
        value={option.value as string}
        disabled={option.disabled}
        selected={value === option.value}
      >
        {option.label}
      </option>
    {/each}
  </select>
  {#if error}
    <label class="label">
      <span class="label-text-alt text-error">{error}</span>
    </label>
  {/if}
</div>
