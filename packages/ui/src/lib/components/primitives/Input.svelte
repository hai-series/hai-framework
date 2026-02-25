<!--
  =============================================================================
  @h-ai/ui - Input 组件
  =============================================================================
  文本输入框组件
  
  使用 Svelte 5 Runes ($props, $derived, $bindable)
  支持自定义验证消息（validationMessage）覆盖浏览器原生提示
  =============================================================================
-->
<script lang="ts">
  import type { InputProps } from '../../types.js'
  import { cn } from '../../utils.js'
  
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
    inputmode,
    step,
    minlength,
    min,
    max,
    maxlength,
    inputRef = $bindable<HTMLInputElement | undefined>(),
    oninput,
    onchange,
    onkeydown,
    onblur,
    onfocus,
    oninvalid,
  }: InputProps = $props()

  const containerHeight = $derived(
    size === 'xs' ? 'h-8' :
    size === 'sm' ? 'h-10' :
    size === 'lg' ? 'h-14' :
    size === 'xl' ? 'h-16' :
    'h-12'
  )

  const containerClass = $derived(
    cn(
      'flex items-center w-full rounded-box border bg-base-100',
      containerHeight,
      error ? 'border-error' : 'border-base-content/20',
      'focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-base-content/20',
      className,
    )
  )

  function handleInput(e: Event & { currentTarget: HTMLInputElement }) {
    if (validationMessage) {
      e.currentTarget.setCustomValidity('')
    }
    value = e.currentTarget.value
    oninput?.(e)
  }

  function handleChange(e: Event & { currentTarget: HTMLInputElement }) {
    onchange?.(e)
  }

  function handleKeydown(e: KeyboardEvent & { currentTarget: HTMLInputElement }) {
    onkeydown?.(e)
  }

  function handleBlur(e: FocusEvent & { currentTarget: HTMLInputElement }) {
    onblur?.(e)
  }

  function handleFocus(e: FocusEvent & { currentTarget: HTMLInputElement }) {
    onfocus?.(e)
  }

  function handleInvalid(e: Event & { currentTarget: HTMLInputElement }) {
    if (validationMessage) {
      e.currentTarget.setCustomValidity(validationMessage)
    }
    oninvalid?.(e)
  }
</script>

<div class="form-control w-full">
  <div class={containerClass}>
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
      {step}
      inputmode={inputmode}
      autocomplete={autocomplete as HTMLInputElement['autocomplete']}
      class="flex-1 h-full px-4 bg-transparent border-none outline-none"
      bind:value
      oninput={handleInput}
      onchange={handleChange}
      onkeydown={handleKeydown}
      onblur={handleBlur}
      onfocus={handleFocus}
      oninvalid={handleInvalid}
    />
  </div>
  {#if error}
    <div class="label">
      <span class="label-text-alt text-error">{error}</span>
    </div>
  {/if}
</div>
