<!--
  =============================================================================
  @h-ai/ui - BareInput 组件
  =============================================================================
  无样式输入框组件，仅渲染原生 input

  使用 Svelte 5 Runes ($props, $bindable)
  =============================================================================
-->
<script lang='ts'>
  import type { BareInputProps } from '../../types.js'

  let {
    value = $bindable(''),
    type = 'text',
    placeholder,
    disabled = false,
    readonly = false,
    required = false,
    class: className = '',
    id,
    name,
    autocomplete,
    pattern,
    list,
    accept,
    multiple,
    minlength,
    maxlength,
    min,
    max,
    step,
    inputmode,
    inputRef = $bindable<HTMLInputElement | undefined>(),
    role,
    ariaExpanded,
    ariaControls,
    ariaAutocomplete,
    oninput,
    onchange,
    onkeydown,
    onblur,
    onfocus,
    oninvalid,
  }: BareInputProps = $props()

  function handleInput(e: Event & { currentTarget: HTMLInputElement }) {
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
</script>

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
  {accept}
  {multiple}
  {minlength}
  {min}
  {max}
  {maxlength}
  {step}
  inputmode={inputmode}
  autocomplete={autocomplete as HTMLInputElement['autocomplete']}
  role={role}
  aria-expanded={ariaExpanded}
  aria-controls={ariaControls}
  aria-autocomplete={ariaAutocomplete}
  class={className}
  bind:value
  oninput={handleInput}
  onchange={handleChange}
  onkeydown={handleKeydown}
  onblur={handleBlur}
  onfocus={handleFocus}
  oninvalid={oninvalid}
/>
