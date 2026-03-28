<!--
  =============================================================================
  @h-ai/ui - FormField 组件
  =============================================================================
  表单字段包装器，统一 label/error/hint 展示

  使用 Svelte 5 Runes ($props, $derived)
  =============================================================================
-->
<script lang='ts'>
  import type { FormFieldProps } from '../../types.js'
  import { cn } from '../../utils.js'

  const {
    label = '',
    error = '',
    hint = '',
    required = false,
    class: className = '',
    children,
  }: FormFieldProps = $props()

  const fieldClass = $derived(
    cn(
      'fieldset w-full',
      className,
    ),
  )
</script>

<div class={fieldClass}>
  {#if label}
    <legend class='fieldset-legend'>
      {label}
      {#if required}
        <span class='text-error'>*</span>
      {/if}
    </legend>
  {/if}

  <div class='field-content'>
    {#if children}
      {@render children()}
    {/if}
  </div>

  {#if error || hint}
    <div>
      {#if error}
        <span class='fieldset-label text-error'>{error}</span>
      {:else if hint}
        <span class='fieldset-label text-base-content/60'>{hint}</span>
      {/if}
    </div>
  {/if}
</div>
