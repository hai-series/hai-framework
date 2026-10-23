<!--
  @component Checkbox
  =============================================================================
  @h-ai/ui - Checkbox 组件
  =============================================================================
  复选框组件

  使用 Svelte 5 Runes ($props, $derived, $bindable)
  =============================================================================

  @example
  ```ts
  import { mount, unmount } from 'svelte'
  import type { ComponentProps } from 'svelte'
  import { Checkbox } from '@h-ai/ui'
  const props: ComponentProps<typeof Checkbox> = { label: '同意条款', checked: true }
  const component = mount(Checkbox, { target: document.body, props })
  await unmount(component)
  ```
-->
<script lang='ts'>
  import type { CheckboxProps, DataAttributes } from '../../types.js'
  import { getFormFieldContext } from '../../internal/form-context.js'
  import { cn, getDataAttributes, getSizeClass } from '../../utils.js'

  let {
    checked = $bindable(false),
    id: providedId,
    label = '',
    size = 'md',
    disabled = false,
    readonly = false,
    indeterminate = false,
    class: className = '',
    onchange,
    ...restProps
  }: CheckboxProps & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))
  const field = getFormFieldContext()
  const uniqueId = $props.id()
  const id = $derived(providedId ?? uniqueId)

  const checkboxClass = $derived(
    cn(
      'checkbox',
      getSizeClass(size, 'checkbox'),
      className,
    ),
  )

  function handleChange(e: Event & { currentTarget: HTMLInputElement }) {
    if (readonly)
      return
    checked = e.currentTarget.checked
    onchange?.(checked)
  }
</script>

<div {...dataAttributes} class='inline-flex'>
  <label class='label cursor-pointer gap-2' for={id}>
    <input
      {id}
      aria-invalid={field?.error ? true : undefined}
      aria-describedby={field?.messageId}
      type='checkbox'
      class={checkboxClass}
      disabled={disabled || readonly}
      bind:checked
      bind:indeterminate
      onchange={handleChange}
    />
    {#if label}
      <span>{label}</span>
    {/if}
  </label>
</div>
