<!--
  =============================================================================
  @hai/ui - Input 组件
  =============================================================================
  文本输入框组件
  
  使用 Svelte 5 Runes ($props, $derived, $bindable)
  =============================================================================
-->
<script lang="ts">
  import type { InputProps } from '../types.js'
  import { cn, getInputSizeClass } from '../utils.js'
  
  let {
    value = $bindable(''),
    placeholder = '',
    type = 'text',
    size = 'md',
    disabled = false,
    readonly = false,
    required = false,
    error = '',
    class: className = '',
    oninput,
    onchange,
  }: InputProps = $props()
  
  const inputClass = $derived(
    cn(
      'input input-bordered w-full',
      getInputSizeClass(size),
      error && 'input-error',
      className,
    )
  )
  
  function handleInput(e: Event & { currentTarget: HTMLInputElement }) {
    value = e.currentTarget.value
    oninput?.(e)
  }
  
  function handleChange(e: Event & { currentTarget: HTMLInputElement }) {
    onchange?.(e)
  }
</script>

<div class="form-control w-full">
  <input
    {type}
    {placeholder}
    {disabled}
    {readonly}
    {required}
    class={inputClass}
    bind:value
    oninput={handleInput}
    onchange={handleChange}
  />
  {#if error}
    <label class="label">
      <span class="label-text-alt text-error">{error}</span>
    </label>
  {/if}
</div>
