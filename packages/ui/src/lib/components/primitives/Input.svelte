<!--
  @component Input
  文本输入框组件，支持自定义验证消息
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
    size === 'sm' ? 'h-9' :
    size === 'lg' ? 'h-12' :
    size === 'xl' ? 'h-14' :
    'h-10'
  )

  const containerClass = $derived(
    cn(
      'flex items-center w-full rounded-lg border bg-base-100',
      containerHeight,
      error
        ? 'border-error/60 focus-within:ring-2 focus-within:ring-error/15'
        : 'border-base-content/15 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10',
      'transition-[border-color,box-shadow] duration-150',
      disabled && 'opacity-50 cursor-not-allowed',
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

<div class="fieldset w-full">
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
      class="flex-1 h-full px-3 bg-transparent border-none outline-none text-sm placeholder:text-base-content/35"
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
    <p class="mt-1.5 text-xs text-error/80 leading-tight">{error}</p>
  {/if}
</div>
