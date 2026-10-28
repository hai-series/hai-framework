<!--
  @component Textarea
  =============================================================================
  @h-ai/ui - Textarea 组件
  =============================================================================
  多行文本输入框组件

  使用 Svelte 5 Runes ($props, $derived, $bindable)
  支持自定义验证消息（validationMessage）覆盖浏览器原生提示
  =============================================================================

  @example
  ```ts
  import { mount, unmount } from 'svelte'
  import type { ComponentProps } from 'svelte'
  import { Textarea } from '@h-ai/ui'
  const props: ComponentProps<typeof Textarea> = { name: 'description', rows: 4, maxlength: 500 }
  const component = mount(Textarea, { target: document.body, props })
  await unmount(component)
  ```
-->
<script lang='ts'>
  import type { DataAttributes, TextareaProps } from '../../types.js'
  import { getFormFieldContext } from '../../internal/form-context.js'
  import { createControlValidation, resolveFormText, useControlFeedback } from '../../internal/form-validation.svelte.js'
  import { cn, getDataAttributes, getInputSizeClass } from '../../utils.js'

  let {
    value = $bindable(''),
    placeholder = '',
    rows = 3,
    size = 'md',
    disabled = false,
    readonly = false,
    required = false,
    autoResize = false,
    error = '',
    validationMessage = '',
    minlength,
    maxlength,
    inputmode,
    textareaRef = $bindable<HTMLTextAreaElement | undefined>(),
    class: className = '',
    id,
    name,
    oninput,
    oninvalid,
    ...restProps
  }: TextareaProps & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))
  const field = getFormFieldContext()
  const validation = createControlValidation(() => validationMessage, () => [value, required, readonly, disabled, minlength, maxlength])
  const uniqueId = $props.id()
  const messageId = `${uniqueId}-error`
  const localError = $derived(resolveFormText(error) || validation.message)
  const effectiveError = $derived(field?.error || localError)
  useControlFeedback(() => resolveFormText(error) || validation.message)

  const wrapperClass = $derived(
    cn(
      'flex w-full rounded-lg border bg-base-100',
      effectiveError
        ? 'border-error/60 focus-within:ring-2 focus-within:ring-error/15'
        : 'border-base-content/15 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10',
      'transition-[border-color,box-shadow] duration-150',
      disabled && 'opacity-50 cursor-not-allowed',
    ),
  )

  const textareaClass = $derived(
    cn(
      'textarea w-full bg-transparent border-none outline-none',
      getInputSizeClass(size),
      effectiveError && 'textarea-error',
      className,
    ),
  )

  // 当 validationMessage 变化时更新自定义验证消息
  $effect(() => {
    if (textareaRef) {
      textareaRef.setCustomValidity(validation.message)
    }
  })

  function handleInput(e: Event & { currentTarget: HTMLTextAreaElement }) {
    value = e.currentTarget.value

    // 自动调整高度
    if (autoResize) {
      e.currentTarget.style.height = 'auto'
      e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`
    }

    // 输入时重置自定义验证
    validation.input(e.currentTarget)

    oninput?.(e)
  }

  function handleInvalid(e: Event & { currentTarget: HTMLTextAreaElement }) {
    e.preventDefault()
    validation.validate(e.currentTarget)
    if (!e.currentTarget.form || e.currentTarget.form.querySelector(':invalid') === e.currentTarget)
      e.currentTarget.focus()
    oninvalid?.(e)
  }
</script>

<div {...dataAttributes} class='fieldset w-full'>
  <div class={wrapperClass}>
    <textarea
      bind:this={textareaRef}
      id={id ?? field?.controlId}
      aria-invalid={effectiveError ? true : undefined}
      aria-describedby={[field?.messageId, localError && !field?.error ? messageId : ''].filter(Boolean).join(' ') || undefined}
      {name}
      {placeholder}
      {rows}
      {disabled}
      {readonly}
      {required}
      {minlength}
      {maxlength}
      {inputmode}
      class={textareaClass}
      bind:value
      oninput={handleInput}
      onblur={e => validation.blur(e.currentTarget)}
      oninvalid={handleInvalid}
    ></textarea>
  </div>
  {#if localError && !field?.error}
    <p id={messageId} class='sr-only'>{localError}</p>
  {/if}
</div>
