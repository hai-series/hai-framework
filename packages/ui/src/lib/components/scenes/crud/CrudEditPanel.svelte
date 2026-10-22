<!--
  @component CrudEditPanel
  CRUD 编辑/新建表单组件，支持抽屉（drawer）与弹窗（modal）两种展示形式

  使用 Svelte 5 Runes ($props, $state, $derived)
  使用 compounds/primitives 组件：Drawer, Modal, FormField, Input, Select, Textarea, Checkbox, Button

  @example
  ```ts
  import { mount, unmount } from 'svelte'
  import type { ComponentProps } from 'svelte'
  import { CrudEditPanel } from '@h-ai/ui'
  const props: ComponentProps<typeof CrudEditPanel> = { open: true, mode: 'edit', title: '编辑用户', fields: [{ id: 'email', label: '邮箱', type: 'email' }], formData: { email: 'ada@example.com' } }
  const component = mount(CrudEditPanel, { target: document.body, props })
  await unmount(component)
  ```
-->
<script lang='ts'>
  import type { Snippet } from 'svelte'
  import type { DataAttributes, FormLayoutOptions, Size } from '../../../types.js'
  import type { CrudFieldDef } from './crud-controller.svelte.js'
  import type { CrudDensity, CrudFormVariant } from './crud-types.js'
  import { tick } from 'svelte'
  import { resolveFormText as resolveText } from '../../../internal/form-validation.svelte.js'
  import { uiM } from '../../../messages.js'
  import { getDataAttributes } from '../../../utils.js'
  import Drawer from '../../compounds/Drawer.svelte'
  import FormField from '../../compounds/FormField.svelte'
  import FormLayout from '../../compounds/FormLayout.svelte'
  import Modal from '../../compounds/Modal.svelte'
  import Button from '../../primitives/Button.svelte'
  import Checkbox from '../../primitives/Checkbox.svelte'
  import Input from '../../primitives/Input.svelte'
  import Select from '../../primitives/Select.svelte'
  import Textarea from '../../primitives/Textarea.svelte'
  import { getCrudValidationIssue } from './crud-form-validation.js'

  let {
    open = $bindable(false),
    mode = 'create' as 'create' | 'edit',
    fields = [],
    formData = $bindable<Record<string, unknown>>({}),
    density = 'normal' as CrudDensity,
    title = '',
    variant = 'drawer' as CrudFormVariant,
    size = '2xl' as Size,
    drawerWidth,
    drawerResizable = true,
    drawerWidthStorageKey,
    modalSize = '2xl' as Size | 'full',
    modalWidth,
    modalHeight,
    submitting = false,
    columns = 1,
    labelPosition = 'top',
    labelWidth = '8rem',
    error = '',
    onsubmit,
    onclose,
    editFormExtra,
    editingItem = null,
    class: className = '',
    ...restProps
  }: {
    open?: boolean
    mode?: 'create' | 'edit'
    fields?: CrudFieldDef[]
    formData?: Record<string, unknown>
    density?: CrudDensity
    title?: string
    variant?: CrudFormVariant
    size?: Size
    drawerWidth?: string
    drawerResizable?: boolean
    drawerWidthStorageKey?: string
    modalSize?: Size | 'full'
    modalWidth?: string
    modalHeight?: string
    submitting?: boolean
    error?: string
    onsubmit?: (data: Record<string, unknown>) => Promise<void>
    onclose?: () => void
    editFormExtra?: Snippet<[Record<string, unknown> | null, 'create' | 'edit']>
    editingItem?: Record<string, unknown> | null
    class?: string
  } & FormLayoutOptions & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))
  const panelId = $props.id()
  let formElement: HTMLFormElement | undefined = $state()
  let attempted = $state(false)
  let touched = $state<Record<string, boolean>>({})
  $effect(() => {
    if (!open) {
      attempted = false
      touched = {}
    }
  })
  function resolveOptions(options?: CrudFieldDef['options']): Array<{ label: string, value: string | number | boolean }> {
    if (!options)
      return []
    return typeof options === 'function' ? options() : options
  }

  const sortedFields = $derived(
    [...fields].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
  )
  const fieldErrors = $derived.by(() => {
    const errors: Record<string, string> = {}
    for (const field of sortedFields) {
      if ((!attempted && !touched[field.id]) || (mode === 'edit' && field.readonly))
        continue
      const issue = getCrudValidationIssue(field, formData[field.id])
      if (issue)
        errors[field.id] = field.validation?.message ? resolveText(field.validation.message) : uiM(issue.key, issue.params)
    }
    return errors
  })

  const isCompact = $derived(density === 'compact')
  const controlSize = $derived(isCompact ? 'xs' : 'sm')
  const extraClass = $derived(isCompact ? 'border-t border-base-content/5 pt-3' : 'border-t border-base-content/5 pt-4')
  const multiSelectWrapClass = $derived(isCompact ? 'flex flex-wrap gap-2 p-2.5 bg-base-200 rounded-lg max-h-48 overflow-y-auto' : 'flex flex-wrap gap-3 p-3 bg-base-200 rounded-lg max-h-48 overflow-y-auto')
  const multiSelectLabelClass = $derived(isCompact ? 'inline-flex items-center gap-1.5 cursor-pointer' : 'inline-flex items-center gap-2 cursor-pointer')
  const multiSelectTextClass = $derived(isCompact ? 'text-xs text-base-content' : 'text-sm text-base-content')
  const drawerFormClass = $derived(isCompact ? 'pb-16' : 'pb-20')
  const drawerFooterClass = $derived(isCompact ? 'absolute bottom-0 left-0 right-0 p-3 bg-base-200 border-t border-base-content/10 flex justify-end gap-2' : 'absolute bottom-0 left-0 right-0 p-4 bg-base-200 border-t border-base-content/10 flex justify-end gap-2')

  function handleClose() {
    open = false
    onclose?.()
  }

  async function handleSubmit(e: Event) {
    e.preventDefault()
    if (submitting)
      return
    attempted = true
    if (Object.keys(fieldErrors).length) {
      await tick()
      formElement?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
      return
    }
    await onsubmit?.(formData)
  }

  function getInputType(fieldType: string): 'email' | 'url' | 'tel' | 'password' | 'number' | 'text' {
    switch (fieldType) {
      case 'email': return 'email'
      case 'url': return 'url'
      case 'tel': return 'tel'
      case 'password': return 'password'
      case 'number': return 'number'
      default: return 'text'
    }
  }

  function updateField(fieldId: string, value: unknown) {
    formData = { ...formData, [fieldId]: value }
  }

  function handleFieldBlur(event: FocusEvent) {
    if (!(event.target instanceof HTMLElement))
      return
    const field = event.target.closest<HTMLElement>('[data-field]')
    if (!field?.dataset.field || (event.relatedTarget instanceof Node && field.contains(event.relatedTarget)))
      return
    touched = { ...touched, [field.dataset.field]: true }
  }

  function toggleMultiSelect(fieldId: string, optValue: string | number | boolean) {
    const current = (formData[fieldId] as Array<string | number | boolean>) ?? []
    const strVal = String(optValue)
    if (current.map(String).includes(strVal)) {
      formData = { ...formData, [fieldId]: current.filter(v => String(v) !== strVal) }
    }
    else {
      formData = { ...formData, [fieldId]: [...current, optValue] }
    }
  }
</script>

{#snippet formFields()}
  <FormLayout {columns} {labelPosition} {labelWidth} class={isCompact ? '[--hai-form-gap:0.75rem]' : ''}>
    {#if error}
      <div {...dataAttributes} role='alert' class='p-3 bg-error/10 border border-error/20 rounded-lg text-sm text-error flex items-center gap-2'>
        <span class='icon-[tabler--alert-circle] size-4 shrink-0'></span>
        <span>{error}</span>
      </div>
    {/if}

    {#each sortedFields as field (field.id)}
      {@const isReadonly = field.readonly && mode === 'edit'}
      {@const isRequired = field.validation?.required}
      {@const fieldValue = formData[field.id]}
      {@const placeholder = field.placeholder ? resolveText(field.placeholder) : ''}
      {@const controlId = `${panelId}-${field.id}`}
      <FormField
        for={controlId}
        label={resolveText(field.label)}
        required={isRequired}
        error={fieldErrors[field.id]}
        colSpan={field.colSpan ?? (['textarea', 'multi-select', 'date-range', 'custom'].includes(field.type) ? 2 : 'auto')}
        data-field={field.id}
      >

        {#if field.type === 'textarea'}
          <Textarea
            id={controlId}
            name={field.id}
            size={controlSize}
            value={String(fieldValue ?? '')}
            {placeholder}
            disabled={submitting || isReadonly}
            required={isRequired}
            minlength={field.validation?.min}
            maxlength={field.validation?.max}
            oninput={e => updateField(field.id, (e.target as HTMLTextAreaElement).value)}
          />

        {:else if field.type === 'select' || field.type === 'radio'}
          {@const opts = resolveOptions(field.options)}
          <Select
            id={controlId}
            name={field.id}
            required={isRequired}
            size={controlSize}
            value={String(fieldValue ?? '')}
            disabled={submitting || isReadonly}
            options={[
              { value: '', label: placeholder || uiM('crud_filter_all') },
              ...opts.map(opt => ({ value: String(opt.value), label: opt.label })),
            ]}
            onchange={value => updateField(field.id, opts.find(opt => String(opt.value) === value)?.value ?? value)}
          />

        {:else if field.type === 'multi-select'}
          {@const opts = resolveOptions(field.options)}
          {@const selectedValues = ((fieldValue ?? []) as Array<string | number | boolean>).map(String)}
          <div id={controlId} role='group' tabindex='-1' aria-label={resolveText(field.label)} class={multiSelectWrapClass} data-form-wide>
            {#each opts as opt (String(opt.value))}
              <div class={multiSelectLabelClass}>
                <Checkbox
                  label={opt.label}
                  size={controlSize}
                  checked={selectedValues.includes(String(opt.value))}
                  onchange={() => toggleMultiSelect(field.id, opt.value)}
                  disabled={submitting || isReadonly}
                />
              </div>
            {/each}
            {#if opts.length === 0}
              <span class={multiSelectTextClass}>{uiM('crud_no_data')}</span>
            {/if}
          </div>

        {:else if field.type === 'boolean' || field.type === 'checkbox'}
          <Checkbox
            id={controlId}
            size={controlSize}
            checked={Boolean(fieldValue)}
            onchange={(checked: boolean) => updateField(field.id, checked)}
            disabled={submitting || isReadonly}
          />

        {:else}
          <Input
            id={controlId}
            name={field.id}
            type={getInputType(field.type)}
            size={controlSize}
            value={String(fieldValue ?? '')}
            {placeholder}
            disabled={submitting || isReadonly}
            required={isRequired}
            pattern={field.validation?.pattern}
            minlength={field.type !== 'number' ? field.validation?.min : undefined}
            maxlength={field.type !== 'number' ? field.validation?.max : undefined}
            min={field.type === 'number' ? field.validation?.min : undefined}
            max={field.type === 'number' ? field.validation?.max : undefined}
            oninput={e => updateField(field.id, field.type === 'number' && e.currentTarget.value !== '' ? Number(e.currentTarget.value) : e.currentTarget.value)}
          />
        {/if}
      </FormField>
    {/each}

    {#if editFormExtra}
      <div class={extraClass}>
        {@render editFormExtra(editingItem, mode)}
      </div>
    {/if}
  </FormLayout>
{/snippet}

{#snippet footerActions()}
  <Button variant='ghost' size='sm' onclick={handleClose} disabled={submitting}>
    {uiM('crud_cancel')}
  </Button>
  <Button variant='primary' size='sm' onclick={() => formElement?.requestSubmit()} disabled={submitting}>
    {#if submitting}
      <span class='loading loading-spinner loading-xs mr-2'></span>
    {/if}
    {mode === 'create' ? uiM('crud_create') : uiM('crud_save')}
  </Button>
{/snippet}

{#if variant === 'modal'}
  <Modal
    bind:open
    class={className}
    {title}
    size={modalSize}
    width={modalWidth}
    height={modalHeight}
    closeOnBackdrop={false}
    onclose={handleClose}
  >
    <form bind:this={formElement} novalidate onsubmit={handleSubmit} onfocusout={handleFieldBlur}>
      <!-- 底部按钮在表单外；保留原生提交控件，使多字段表单支持回车提交。 -->
      <input type='submit' class='hidden' tabindex='-1' aria-hidden='true' value={uiM('crud_save')} />
      {@render formFields()}
    </form>

    {#snippet footer()}
      {@render footerActions()}
    {/snippet}
  </Modal>
{:else}
  <Drawer
    bind:open
    {title}
    class={className}
    position='right'
    {size}
    width={drawerWidth}
    resizable={drawerResizable}
    widthStorageKey={drawerWidthStorageKey}
    onclose={handleClose}
    closeOnBackdrop={false}
  >
    <form bind:this={formElement} novalidate onsubmit={handleSubmit} onfocusout={handleFieldBlur} class={drawerFormClass}>
      <input type='submit' class='hidden' tabindex='-1' aria-hidden='true' value={uiM('crud_save')} />
      {@render formFields()}
    </form>

    <!-- 底部操作栏 -->
    <div class={drawerFooterClass}>
      {@render footerActions()}
    </div>
  </Drawer>
{/if}
