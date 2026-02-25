<!--
  =============================================================================
  @h-ai/ui - Switch 组件
  =============================================================================
  开关组件
  
  使用 Svelte 5 Runes ($props, $derived, $bindable)
  =============================================================================
-->
<script lang="ts">
  import type { SwitchProps } from '../../types.js'
  import { cn, getSizeClass, generateId } from '../../utils.js'
  
  let {
    checked = $bindable(false),
    label = '',
    size = 'md',
    disabled = false,
    class: className = '',
    onchange,
  }: SwitchProps = $props()
  
  const id = generateId('switch')
  
  const toggleClass = $derived(
    cn(
      'toggle',
      getSizeClass(size, 'toggle'),
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
      class={toggleClass}
      {disabled}
      bind:checked
      onchange={handleChange}
    />
    {#if label}
      <span class="label-text">{label}</span>
    {/if}
  </label>
</div>
