<!--
  =============================================================================
  @hai/ui - Checkbox 组件
  =============================================================================
  复选框组件
  
  使用 Svelte 5 Runes ($props, $derived, $bindable)
  =============================================================================
-->
<script lang="ts">
  import type { CheckboxProps } from '../../types.js'
  import { cn, getSizeClass, generateId } from '../../utils.js'
  
  let {
    checked = $bindable(false),
    label = '',
    size = 'md',
    disabled = false,
    indeterminate = false,
    class: className = '',
    onchange,
  }: CheckboxProps = $props()
  
  const id = generateId('checkbox')
  
  const checkboxClass = $derived(
    cn(
      'checkbox',
      getSizeClass(size, 'checkbox'),
      className,
    )
  )
  
  function handleChange(e: Event & { currentTarget: HTMLInputElement }) {
    checked = e.currentTarget.checked
    onchange?.(checked)
  }
</script>

<div class="form-control">
  <label class="label cursor-pointer gap-2" for={id}>
    <input
      {id}
      type="checkbox"
      class={checkboxClass}
      {disabled}
      bind:checked
      bind:indeterminate
      onchange={handleChange}
    />
    {#if label}
      <span class="label-text">{label}</span>
    {/if}
  </label>
</div>
