<!--
  =============================================================================
  @h-ai/ui - ToggleCheckbox 组件
  =============================================================================
  仅渲染 checkbox input（用于 collapse/drawer 等结构要求）

  使用 Svelte 5 Runes ($props, $bindable)
  =============================================================================
-->
<script lang='ts'>
  import type { ToggleCheckboxProps } from '../../types.js'

  let {
    checked = $bindable(false),
    name,
    id,
    disabled = false,
    class: className = '',
    onchange,
  }: ToggleCheckboxProps = $props()

  function handleChange(e: Event & { currentTarget: HTMLInputElement }) {
    checked = e.currentTarget.checked
    onchange?.(checked)
  }
</script>

<input
  {id}
  {name}
  type='checkbox'
  class={className}
  {disabled}
  checked={checked}
  onchange={handleChange}
/>
