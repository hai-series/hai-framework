<!--
  =============================================================================
  @hai/ui - ToggleRadio 组件
  =============================================================================
  仅渲染 radio input（用于 collapse/accordion 等结构要求）
  
  使用 Svelte 5 Runes ($props, $bindable)
  =============================================================================
-->
<script lang="ts">
  import type { ToggleRadioProps } from '../../types.js'

  let {
    checked = $bindable(false),
    name,
    id,
    disabled = false,
    class: className = '',
    onchange,
  }: ToggleRadioProps = $props()

  function handleChange(e: Event & { currentTarget: HTMLInputElement }) {
    checked = e.currentTarget.checked
    onchange?.(checked)
  }
</script>

<input
  {id}
  {name}
  type="radio"
  class={className}
  {disabled}
  checked={checked}
  onchange={handleChange}
/>
