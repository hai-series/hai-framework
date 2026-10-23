<!--
  @component Switch
  =============================================================================
  @h-ai/ui - Switch 组件
  =============================================================================
  开关组件

  使用 Svelte 5 Runes ($props, $derived, $bindable)
  =============================================================================

  @example
  ```ts
  import { mount, unmount } from 'svelte'
  import type { ComponentProps } from 'svelte'
  import { Switch } from '@h-ai/ui'
  const props: ComponentProps<typeof Switch> = { label: '开启通知', checked: true }
  const component = mount(Switch, { target: document.body, props })
  await unmount(component)
  ```
-->
<script lang='ts'>
  import type { DataAttributes, SwitchProps } from '../../types.js'
  import { cn, generateId, getDataAttributes, getSizeClass } from '../../utils.js'

  let {
    checked = $bindable(false),
    label = '',
    size = 'md',
    disabled = false,
    class: className = '',
    onchange,
    ...restProps
  }: SwitchProps & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))
  const id = generateId('switch')

  const hasToggleColorVariant = $derived(
    /\btoggle-(?:primary|secondary|accent|neutral|success|warning|info|error)\b/.test(className),
  )

  const toggleClass = $derived(
    cn(
      'toggle',
      getSizeClass(size, 'toggle'),
      !hasToggleColorVariant && 'toggle-primary',
      className,
    ),
  )

  function handleChange(e: Event & { currentTarget: HTMLInputElement }) {
    checked = e.currentTarget.checked
    onchange?.(checked)
  }
</script>

<div {...dataAttributes} class='inline-flex'>
  <label class='label cursor-pointer gap-2' for={id}>
    <input
      {id}
      type='checkbox'
      class={toggleClass}
      {disabled}
      bind:checked
      onchange={handleChange}
    />
    {#if label}
      <span>{label}</span>
    {/if}
  </label>
</div>
