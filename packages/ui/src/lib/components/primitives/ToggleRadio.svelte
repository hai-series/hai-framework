<!--
  @component ToggleRadio
  =============================================================================
  @h-ai/ui - ToggleRadio 组件
  =============================================================================
  仅渲染 radio input（用于 collapse/accordion 等结构要求）

  使用 Svelte 5 Runes ($props, $bindable)
  =============================================================================

  @example
  ```ts
  import { mount, unmount } from 'svelte'
  import type { ComponentProps } from 'svelte'
  import { ToggleRadio } from '@h-ai/ui'
  const props: ComponentProps<typeof ToggleRadio> = { name: 'section', checked: true }
  const component = mount(ToggleRadio, { target: document.body, props })
  await unmount(component)
  ```
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
