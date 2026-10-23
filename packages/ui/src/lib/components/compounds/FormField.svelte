<!--
  @component FormField
  =============================================================================
  @h-ai/ui - FormField 组件
  =============================================================================
  表单字段包装器，统一 label/error/hint 展示

  使用 Svelte 5 Runes ($props, $derived)
  =============================================================================

  @example
  ```ts
  import { mount, unmount, createRawSnippet } from 'svelte'
  import type { ComponentProps } from 'svelte'
  import { FormField } from '@h-ai/ui'
  const props: ComponentProps<typeof FormField> = { label: '邮箱', name: 'email', required: true, children: createRawSnippet(() => ({ render: () => "<input name=\"email\" type=\"email\" />" })) }
  const component = mount(FormField, { target: document.body, props })
  await unmount(component)
  ```
-->
<script lang='ts'>
  import type { DataAttributes, FormFieldProps } from '../../types.js'
  import { setContext } from 'svelte'
  import { FORM_FIELD_CONTEXT, getFormLayoutContext } from '../../internal/form-context.js'
  import { resolveFormText } from '../../internal/form-validation.svelte.js'
  import { cn, getDataAttributes } from '../../utils.js'

  const {
    label = '',
    error = '',
    hint = '',
    required = false,
    for: providedControlId,
    labelPosition,
    labelWidth,
    colSpan = 'auto',
    class: className = '',
    children,
    ...restProps
  }: FormFieldProps & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))
  const layout = getFormLayoutContext()
  const uniqueId = $props.id()
  const controlId = $derived(providedControlId ?? `${uniqueId}-control`)
  const messageId = `${uniqueId}-message`
  const labelId = `${uniqueId}-label`
  const resolvedLabel = $derived(resolveFormText(label))
  const resolvedError = $derived(resolveFormText(error))
  const resolvedHint = $derived(resolveFormText(hint))
  const position = $derived(labelPosition ?? layout?.labelPosition ?? 'top')
  const width = $derived(labelWidth ?? layout?.labelWidth ?? '8rem')
  setContext(FORM_FIELD_CONTEXT, {
    get controlId() { return controlId },
    get labelId() { return labelId },
    get messageId() { return resolvedError || resolvedHint ? messageId : undefined },
    get error() { return resolvedError },
  })
  const fieldClass = $derived(
    cn(
      'hai-form-field w-full min-w-0',
      className,
    ),
  )
</script>

<div {...dataAttributes} class={fieldClass} data-col-span={colSpan} data-label-position={position} style:--hai-form-label-width={width}>
  {#if resolvedLabel}
    <label id={labelId} for={controlId} class='field-label text-sm font-medium text-base-content/70'>
      {resolvedLabel}
      {#if required}
        <span class='text-error'>*</span>
      {/if}
    </label>
  {/if}

  <div class='field-content min-w-0'>
    {#if children}
      {@render children()}
    {/if}
  </div>

  {#if resolvedError || resolvedHint}
    <div id={messageId} class='field-message text-xs leading-relaxed break-words' aria-live='polite'>
      {#if resolvedError}
        <span class='text-error'>{resolvedError}</span>
      {:else if resolvedHint}
        <span class='text-base-content/60'>{resolvedHint}</span>
      {/if}
    </div>
  {/if}
</div>

<style>
  .hai-form-field {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.375rem 1rem;
  }

  .field-label {
    overflow-wrap: anywhere;
  }

  .field-content > :global(.fieldset) {
    padding-block: 0;
  }

  .hai-form-field[data-label-position='left']:has(.field-label) {
    grid-template-columns: minmax(0, var(--hai-form-label-width)) minmax(0, 1fr);
  }

  .hai-form-field[data-label-position='left'] .field-label {
    padding-top: 0.5rem;
  }

  .hai-form-field[data-label-position='left']:has(.field-label) .field-message {
    grid-column: 2;
  }

  @container hai-form (max-width: 27.99rem) {
    .hai-form-field[data-label-position='left']:has(.field-label) {
      grid-template-columns: minmax(0, 1fr);
    }

    .hai-form-field[data-label-position='left'] .field-label {
      padding-top: 0;
    }

    .hai-form-field[data-label-position='left']:has(.field-label) .field-message {
      grid-column: 1;
    }
  }
</style>
