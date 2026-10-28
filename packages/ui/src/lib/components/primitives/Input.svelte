<!--
  @component Input
  文本输入框组件，支持自定义验证消息

  @example
  ```ts
  import { mount, unmount } from 'svelte'
  import type { ComponentProps } from 'svelte'
  import { Input } from '@h-ai/ui'
  const props: ComponentProps<typeof Input> = { name: 'email', type: 'email', required: true }
  const component = mount(Input, { target: document.body, props })
  await unmount(component)
  ```
-->
<script lang='ts'>
  import type { DataAttributes, InputProps } from '../../types.js'
  import { getFormFieldContext } from '../../internal/form-context.js'
  import { createControlValidation, resolveFormText, useControlFeedback } from '../../internal/form-validation.svelte.js'
  import { cn, getDataAttributes } from '../../utils.js'
  import { getFormControlSizeClasses } from '../control-size.js'

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
    ...restProps
  }: InputProps & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))
  const field = getFormFieldContext()
  const validation = createControlValidation(() => validationMessage, () => [value, required, readonly, disabled, pattern, min, max, minlength, maxlength, step])
  const uniqueId = $props.id()
  const messageId = `${uniqueId}-error`
  const localError = $derived(resolveFormText(error) || validation.message)
  const effectiveError = $derived(field?.error || localError)
  // 直接订阅每次校验结果；文案相同的再次提交也应重新提示。
  useControlFeedback(() => resolveFormText(error) || validation.message)
  $effect(() => {
    // 修正输入后清除旧的 customError，切换语言时同步原生提示。
    if (inputRef)
      inputRef.setCustomValidity(validation.message)
  })
  const sizeClasses = $derived(getFormControlSizeClasses(size))

  const inputTypeClass = $derived(
    type === 'number'
      ? '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
      : '',
  )

  const containerClass = $derived(
    cn(
      'flex items-center w-full rounded-lg border bg-base-100',
      sizeClasses.height,
      effectiveError
        ? 'border-error/60 focus-within:ring-2 focus-within:ring-error/15'
        : 'border-base-content/15 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10',
      'transition-[border-color,box-shadow] duration-150',
      disabled && 'opacity-50 cursor-not-allowed',
      className,
    ),
  )

  function handleInput(e: Event & { currentTarget: HTMLInputElement }) {
    validation.input(e.currentTarget)
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
    validation.blur(e.currentTarget)
    onblur?.(e)
  }

  function handleFocus(e: FocusEvent & { currentTarget: HTMLInputElement }) {
    onfocus?.(e)
  }

  function handleInvalid(e: Event & { currentTarget: HTMLInputElement }) {
    e.preventDefault()
    validation.validate(e.currentTarget)
    if (!e.currentTarget.form || e.currentTarget.form.querySelector(':invalid') === e.currentTarget)
      e.currentTarget.focus()
    oninvalid?.(e)
  }
</script>

<div {...dataAttributes} class='fieldset w-full'>
  <div class={containerClass}>
    <input
      bind:this={inputRef}
      id={id ?? field?.controlId}
      aria-invalid={effectiveError ? true : undefined}
      aria-describedby={[field?.messageId, localError && !field?.error ? messageId : ''].filter(Boolean).join(' ') || undefined}
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
      class={cn(
        'flex-1 min-w-0 h-full bg-transparent border-none outline-none placeholder:text-base-content/35',
        sizeClasses.spacing,
        inputTypeClass,
      )}
      bind:value
      oninput={handleInput}
      onchange={handleChange}
      onkeydown={handleKeydown}
      onblur={handleBlur}
      onfocus={handleFocus}
      oninvalid={handleInvalid}
    />
  </div>
  {#if localError && !field?.error}
    <p id={messageId} class='sr-only'>{localError}</p>
  {/if}
</div>
