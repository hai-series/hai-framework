<!--
  @component ToggleCheckbox
  =============================================================================
  @h-ai/ui - ToggleCheckbox 组件
  =============================================================================
  仅渲染 checkbox input（用于 collapse/drawer 等结构要求）

  使用 Svelte 5 Runes ($props, $bindable)
  =============================================================================

  @example
  ```ts
  import { mount, unmount } from 'svelte'
  import type { ComponentProps } from 'svelte'
  import { ToggleCheckbox } from '@h-ai/ui'
  const props: ComponentProps<typeof ToggleCheckbox> = { name: 'expanded', checked: true }
  const component = mount(ToggleCheckbox, { target: document.body, props })
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
