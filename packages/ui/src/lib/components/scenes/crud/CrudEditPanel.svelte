<!--
  @component CrudEditPanel
  CRUD 编辑/新建表单组件，支持抽屉（drawer）与弹窗（modal）两种展示形式

  使用 Svelte 5 Runes ($props, $state, $derived)
  使用 compounds/primitives 组件：Drawer, Modal, FormField, Input, Select, Textarea, Checkbox, Button
-->
<script lang='ts'>
  import type { Snippet } from 'svelte'
  import type { DataAttributes, Size } from '../../../types.js'
  import type { CrudDensity, CrudFormVariant } from './crud-types.js'
  import { uiM } from '../../../messages.js'
  import { getDataAttributes } from '../../../utils.js'
  import Drawer from '../../compounds/Drawer.svelte'
  import FormField from '../../compounds/FormField.svelte'
  import Modal from '../../compounds/Modal.svelte'
  import Button from '../../primitives/Button.svelte'
  import Checkbox from '../../primitives/Checkbox.svelte'
  import Input from '../../primitives/Input.svelte'
  import Select from '../../primitives/Select.svelte'
  import Textarea from '../../primitives/Textarea.svelte'

  type FieldDef = {
    id: string
    label: string | (() => string)
    type: string
    readonly?: boolean
    options?: Array<{ label: string, value: string | number | boolean }> | (() => Array<{ label: string, value: string | number | boolean }>)
    validation?: { required?: boolean, min?: number, max?: number, pattern?: string, message?: string }
    placeholder?: string | (() => string)
    order?: number
  }

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
    modalSize = '2xl' as Size | 'full',
    modalWidth,
    modalHeight,
    submitting = false,
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
    fields?: FieldDef[]
    formData?: Record<string, unknown>
    density?: CrudDensity
    title?: string
    variant?: CrudFormVariant
    size?: Size
    drawerWidth?: string
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
  } & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))
  function resolveText(text: string | (() => string)): string {
    return typeof text === 'function' ? text() : text
  }

  function resolveOptions(options?: FieldDef['options']): Array<{ label: string, value: string | number | boolean }> {
    if (!options)
      return []
    return typeof options === 'function' ? options() : options
  }

  const sortedFields = $derived(
    [...fields].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
  )

  const isCompact = $derived(density === 'compact')
  const controlSize = $derived(isCompact ? 'xs' : 'sm')
  const formClass = $derived(isCompact ? 'space-y-3' : 'space-y-4')
  const extraClass = $derived(isCompact ? 'border-t border-base-content/5 pt-3' : 'border-t border-base-content/5 pt-4')
  const multiSelectWrapClass = $derived(isCompact ? 'flex flex-wrap gap-2 p-2.5 bg-base-200 rounded-lg max-h-48 overflow-y-auto' : 'flex flex-wrap gap-3 p-3 bg-base-200 rounded-lg max-h-48 overflow-y-auto')
  const multiSelectLabelClass = $derived(isCompact ? 'inline-flex items-center gap-1.5 cursor-pointer' : 'inline-flex items-center gap-2 cursor-pointer')
  const multiSelectTextClass = $derived(isCompact ? 'text-xs text-base-content' : 'text-sm text-base-content')
  const drawerFormClass = $derived(isCompact ? 'space-y-3 pb-16' : 'space-y-4 pb-20')
  const drawerFooterClass = $derived(isCompact ? 'absolute bottom-0 left-0 right-0 p-3 bg-base-200 border-t border-base-content/10 flex justify-end gap-2' : 'absolute bottom-0 left-0 right-0 p-4 bg-base-200 border-t border-base-content/10 flex justify-end gap-2')

  function handleClose() {
    open = false
    onclose?.()
  }

  async function handleSubmit(e: Event) {
    e.preventDefault()
    await onsubmit?.(formData)
  }

  function getInputType(fieldType: string): 'email' | 'url' | 'tel' | 'password' | 'number' | 'text' {
    switch (fieldType) {
      case 'email': return 'email'
      case 'url': return 'url'
      case 'tel': return 'tel'
      case 'password': return 'password'
      case 'number': return 'number'
      case 'date': return 'text'
      case 'datetime': return 'text'
      default: return 'text'
    }
  }

  function updateField(fieldId: string, value: unknown) {
    formData = { ...formData, [fieldId]: value }
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
  {#if error}
    <div {...dataAttributes} class='p-3 bg-error/10 border border-error/20 rounded-lg text-sm text-error flex items-center gap-2'>
      <span class='icon-[tabler--alert-circle] size-4 shrink-0'></span>
      <span>{error}</span>
    </div>
  {/if}

  {#each sortedFields as field (field.id)}
    {@const isReadonly = field.readonly && mode === 'edit'}
    {@const isRequired = field.validation?.required}
    {@const fieldValue = formData[field.id]}
    {@const placeholder = field.placeholder ? resolveText(field.placeholder) : ''}

    {#if field.type === 'textarea'}
      <FormField label={resolveText(field.label)} required={isRequired}>
        <Textarea
          id={field.id}
          size={controlSize}
          value={String(fieldValue ?? '')}
          {placeholder}
          disabled={submitting || isReadonly}
          required={isRequired}
          oninput={e => updateField(field.id, (e.target as HTMLTextAreaElement).value)}
        />
      </FormField>

    {:else if field.type === 'select' || field.type === 'radio'}
      {@const opts = resolveOptions(field.options)}
      <FormField label={resolveText(field.label)} required={isRequired}>
        <Select
          id={field.id}
          size={controlSize}
          value={String(fieldValue ?? '')}
          disabled={submitting || isReadonly}
          options={[
            { value: '', label: placeholder || uiM('crud_filter_all') },
            ...opts.map(opt => ({ value: String(opt.value), label: opt.label })),
          ]}
          onchange={value => updateField(field.id, value)}
        />
      </FormField>

    {:else if field.type === 'multi-select'}
      {@const opts = resolveOptions(field.options)}
      {@const selectedValues = ((fieldValue ?? []) as Array<string | number | boolean>).map(String)}
      <FormField label={resolveText(field.label)} required={isRequired}>
        <div class={multiSelectWrapClass}>
          {#each opts as opt (String(opt.value))}
            <label class={multiSelectLabelClass}>
              <Checkbox
                size={controlSize}
                checked={selectedValues.includes(String(opt.value))}
                onchange={() => toggleMultiSelect(field.id, opt.value)}
                disabled={submitting || isReadonly}
              />
              <span class={multiSelectTextClass}>{opt.label}</span>
            </label>
          {/each}
          {#if opts.length === 0}
            <span class={multiSelectTextClass}>{uiM('crud_no_data')}</span>
          {/if}
        </div>
      </FormField>

    {:else if field.type === 'boolean' || field.type === 'checkbox'}
      <FormField label={resolveText(field.label)}>
        <Checkbox
          size={controlSize}
          checked={Boolean(fieldValue)}
          onchange={(checked: boolean) => updateField(field.id, checked)}
          disabled={submitting || isReadonly}
        />
      </FormField>

    {:else}
      <FormField label={resolveText(field.label)} required={isRequired}>
        <Input
          id={field.id}
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
          oninput={e => updateField(field.id, field.type === 'number' ? Number((e.currentTarget as HTMLInputElement).value) : (e.currentTarget as HTMLInputElement).value)}
        />
      </FormField>
    {/if}
  {/each}

  {#if editFormExtra}
    <div class={extraClass}>
      {@render editFormExtra(editingItem, mode)}
    </div>
  {/if}
{/snippet}

{#snippet footerActions()}
  <Button variant='ghost' size='sm' onclick={handleClose} disabled={submitting}>
    {uiM('crud_cancel')}
  </Button>
  <Button variant='primary' size='sm' onclick={handleSubmit} disabled={submitting}>
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
    <form onsubmit={handleSubmit} class={formClass}>
      {@render formFields()}
    </form>

    {#snippet footer()}
      {@render footerActions()}
    {/snippet}
  </Modal>
{:else}
  <Drawer bind:open {title} class={className} position='right' {size} width={drawerWidth} onclose={handleClose} closeOnBackdrop={false}>
    <form onsubmit={handleSubmit} class={drawerFormClass}>
      {@render formFields()}
    </form>

    <!-- 底部操作栏 -->
    <div class={drawerFooterClass}>
      {@render footerActions()}
    </div>
  </Drawer>
{/if}
