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
    min,
    max,
    maxlength,
    oninput,
    onchange,
    oninvalid,
  }: InputProps = $props()
  
  let inputRef: HTMLInputElement | undefined = $state()
  
  // 统一风格：自定义容器+input，圆角、边框、padding、focus 态与 PasswordInput 一致
  const containerHeight = $derived(
    size === 'xs' ? 'h-8' :
    size === 'sm' ? 'h-10' :
    size === 'lg' ? 'h-14' :
    'h-12'
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
  <div class={cn(
    'flex items-center w-full rounded-box border bg-base-100',
    containerHeight,
    error ? 'border-error' : 'border-base-content/20',
    'focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-base-content/20',
    className
  )}>
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
        {min}
        {max}
      {maxlength}
      autocomplete={autocomplete as HTMLInputElement['autocomplete']}
      class="flex-1 h-full px-4 bg-transparent border-none outline-none"
      bind:value
      oninput={handleInput}
      onchange={handleChange}
      oninvalid={handleInvalid}
    />
  </div>
  {#if error}
    <div class="label">
      <span class="label-text-alt text-error">{error}</span>
    </div>
  {/if}
</div>
