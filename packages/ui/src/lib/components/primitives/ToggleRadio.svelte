<!--
  =============================================================================
  @h-ai/ui - ToggleRadio 组件
  =============================================================================
  仅渲染 radio input（用于 collapse/accordion 等结构要求）

  使用 Svelte 5 Runes ($props, $bindable)
  =============================================================================
-->
<script lang='ts'>
  import type { DataAttributes, ToggleRadioProps } from '../../types.js'
  import { getDataAttributes } from '../../utils.js'

  let {
    checked = $bindable(false),
    name,
    id,
    disabled = false,
    class: className = '',
    onchange,
    ...restProps
  }: ToggleRadioProps & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))
  function handleChange(e: Event & { currentTarget: HTMLInputElement }) {
    checked = e.currentTarget.checked
    onchange?.(checked)
  }
</script>

<input {...dataAttributes}
       {id}
       {name}
       type='radio'
       class={className}
       {disabled}
       checked={checked}
       onchange={handleChange}
/>
