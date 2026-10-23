<!--
  @component ToggleInput
  =============================================================================
  @h-ai/ui - ToggleInput 组件
  =============================================================================
  仅渲染原生 checkbox/radio input，用于需要 input 作为直接子元素的场景

  使用 Svelte 5 Runes ($props, $bindable)
  =============================================================================

  @example
  ```ts
  import { mount, unmount } from 'svelte'
  import type { ComponentProps } from 'svelte'
  import { ToggleInput } from '@h-ai/ui'
  const props: ComponentProps<typeof ToggleInput> = { name: 'expanded', checked: true }
  const component = mount(ToggleInput, { target: document.body, props })
  await unmount(component)
  ```
-->
<script lang='ts'>
  import type { DataAttributes, ToggleCheckboxProps } from '../../types.js'
  import { getDataAttributes } from '../../utils.js'

  let {
    checked = $bindable(false),
    name,
    id,
    disabled = false,
    class: className = '',
    onchange,
    ...restProps
  }: ToggleCheckboxProps & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))
  function handleChange(e: Event & { currentTarget: HTMLInputElement }) {
    checked = e.currentTarget.checked
    onchange?.(checked)
  }
</script>

<input {...dataAttributes}
       {id}
       {name}
       type='checkbox'
       class={className}
       {disabled}
       checked={checked}
       onchange={handleChange}
/>
