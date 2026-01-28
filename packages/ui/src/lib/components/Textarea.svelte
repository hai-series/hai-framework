<!--
  =============================================================================
  @hai/ui - Textarea 组件
  =============================================================================
  多行文本输入框组件
  
  使用 Svelte 5 Runes ($props, $derived, $bindable)
  =============================================================================
-->
<script lang="ts">
  import type { TextareaProps } from '../types.js'
  import { cn, getInputSizeClass } from '../utils.js'
  
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
    class: className = '',
    oninput,
  }: TextareaProps = $props()
  
  const textareaClass = $derived(
    cn(
      'textarea textarea-bordered w-full',
      getInputSizeClass(size),
      error && 'textarea-error',
      className,
    )
  )
  
  function handleInput(e: Event & { currentTarget: HTMLTextAreaElement }) {
    value = e.currentTarget.value
    
    // 自动调整高度
    if (autoResize) {
      e.currentTarget.style.height = 'auto'
      e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`
    }
    
    oninput?.(e)
  }
</script>

<div class="form-control w-full">
  <textarea
    {placeholder}
    {rows}
    {disabled}
    {readonly}
    {required}
    class={textareaClass}
    bind:value
    oninput={handleInput}
  ></textarea>
  {#if error}
    <label class="label">
      <span class="label-text-alt text-error">{error}</span>
    </label>
  {/if}
</div>
