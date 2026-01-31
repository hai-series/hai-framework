<!--
  =============================================================================
  @hai/ui - FormField 组件
  =============================================================================
  表单字段包装器，统一 label/error/hint 展示
  
  使用 Svelte 5 Runes ($props, $derived)
  =============================================================================
-->
<script lang="ts">
  import type { FormFieldProps } from '../../types.js'
  import { cn, generateId } from '../../utils.js'
  
  let {
    label = '',
    error = '',
    hint = '',
    required = false,
    class: className = '',
    children,
  }: FormFieldProps = $props()
  
  const fieldId = generateId('field')
  
  const fieldClass = $derived(
    cn(
      'form-control w-full',
      className,
    )
  )
</script>

<div class={fieldClass}>
  {#if label}
    <label class="label" for={fieldId}>
      <span class="label-text">
        {label}
        {#if required}
          <span class="text-error">*</span>
        {/if}
      </span>
    </label>
  {/if}
  
  <div class="field-content">
    {#if children}
      {@render children()}
    {/if}
  </div>
  
  {#if error || hint}
    <div class="label">
      {#if error}
        <span class="label-text-alt text-error">{error}</span>
      {:else if hint}
        <span class="label-text-alt text-base-content/60">{hint}</span>
      {/if}
    </div>
  {/if}
</div>
