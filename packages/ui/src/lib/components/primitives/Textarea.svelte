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
  import type { TextareaProps } from '../../types.js'
  import { cn, getInputSizeClass } from '../../utils.js'

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
  }: TextareaProps = $props()

  let textareaRef: HTMLTextAreaElement | undefined = $state()

  const textareaClass = $derived(
    cn(
      'textarea w-full',
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

<div class='fieldset w-full'>
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
  {#if error}
    <span class='fieldset-label text-error'>{error}</span>
  {/if}
</div>
