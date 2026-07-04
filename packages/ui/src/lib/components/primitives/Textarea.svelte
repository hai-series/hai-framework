<!--
  =============================================================================
  @h-ai/ui - Textarea 组件
  =============================================================================
  多行文本输入框组件

  使用 Svelte 5 Runes ($props, $derived, $bindable)
  支持自定义验证消息（validationMessage）覆盖浏览器原生提示
  =============================================================================
-->
<script lang='ts'>
  import type { DataAttributes, TextareaProps } from '../../types.js'
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
    class: className = '',
    id,
    name,
    oninput,
    ...restProps
  }: TextareaProps & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))
  let textareaRef: HTMLTextAreaElement | undefined = $state()

  const wrapperClass = $derived(
    cn(
      'flex w-full rounded-lg border bg-base-100',
      error
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
      error && 'textarea-error',
      className,
    ),
  )

  // 当 validationMessage 变化时更新自定义验证消息
  $effect(() => {
    if (textareaRef) {
      textareaRef.setCustomValidity(validationMessage)
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
    if (validationMessage) {
      e.currentTarget.setCustomValidity(validationMessage)
    }

    oninput?.(e)
  }

  function handleInvalid(e: Event & { currentTarget: HTMLTextAreaElement }) {
    if (validationMessage) {
      e.currentTarget.setCustomValidity(validationMessage)
    }
  }
</script>

<div {...dataAttributes} class='fieldset w-full'>
  <div class={wrapperClass}>
    <textarea
      bind:this={textareaRef}
      {id}
      {name}
      {placeholder}
      {rows}
      {disabled}
      {readonly}
      {required}
      class={textareaClass}
      bind:value
      oninput={handleInput}
      oninvalid={handleInvalid}
    ></textarea>
  </div>
  {#if error}
    <span class='fieldset-label text-error'>{error}</span>
  {/if}
</div>
