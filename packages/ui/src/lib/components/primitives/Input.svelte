<!--
  =============================================================================
  @hai/ui - Input 组件
  =============================================================================
  文本输入框组件
  
  使用 Svelte 5 Runes ($props, $derived, $bindable)
  支持自定义验证消息（validationMessage）覆盖浏览器原生提示
  =============================================================================
-->
<script lang="ts">
  import type { InputProps } from '../../types.js'
  import { cn, getInputSizeClass } from '../../utils.js'
  
  let {
    value = $bindable(''),
    placeholder = '',
    type = 'text',
    size = 'md',
    disabled = false,
    readonly = false,
    required = false,
    error = '',
    validationMessage = '',
    class: className = '',
    id,
    name,
    autocomplete,
    pattern,
    list,
    minlength,
    maxlength,
    oninput,
    onchange,
    oninvalid,
  }: InputProps = $props()
  
  let inputRef: HTMLInputElement | undefined = $state()
  
  const inputClass = $derived(
    cn(
      'input input-bordered w-full',
      getInputSizeClass(size),
      error && 'input-error',
      className,
    )
  )
  
  // 当 validationMessage 变化时更新自定义验证消息
  $effect(() => {
    if (inputRef) {
      inputRef.setCustomValidity(validationMessage)
    }
  })
  
  function handleInput(e: Event & { currentTarget: HTMLInputElement }) {
    value = e.currentTarget.value
    // 输入时重置自定义验证，让浏览器重新验证
    if (validationMessage) {
      e.currentTarget.setCustomValidity(validationMessage)
    }
    oninput?.(e)
  }
  
  function handleChange(e: Event & { currentTarget: HTMLInputElement }) {
    onchange?.(e)
  }
  
  function handleInvalid(e: Event & { currentTarget: HTMLInputElement }) {
    // 当触发 invalid 事件时，设置自定义验证消息
    if (validationMessage) {
      e.currentTarget.setCustomValidity(validationMessage)
    }
    oninvalid?.(e)
  }
</script>

<div class="form-control w-full">
  <input
    bind:this={inputRef}
    {id}
    {name}
    {type}
    {placeholder}
    {disabled}
    {readonly}
    {required}
    {pattern}
    {list}
    {minlength}
    {maxlength}
    autocomplete={autocomplete as HTMLInputElement['autocomplete']}
    class={inputClass}
    bind:value
    oninput={handleInput}
    onchange={handleChange}
    oninvalid={handleInvalid}
  />
  {#if error}
    <div class="label">
      <span class="label-text-alt text-error">{error}</span>
    </div>
  {/if}
</div>
