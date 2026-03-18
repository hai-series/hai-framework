<!--
  @component CrudEditDrawer
  CRUD 编辑/新建抽屉组件

  使用 Svelte 5 Runes ($props, $state, $derived)
  使用 compounds/primitives 组件：Drawer, FormField, Input, Select, Textarea, Checkbox, Button
-->
<script lang='ts'>
  import type { Snippet } from 'svelte'
  import type { Size } from '../../../types.js'
  import { uiM } from '../../../messages.js'
  import Drawer from '../../compounds/Drawer.svelte'
  import FormField from '../../compounds/FormField.svelte'
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
    title = '',
    size = '2xl' as Size,
    submitting = false,
    error = '',
    onsubmit,
    onclose,
    editFormExtra,
    editingItem = null,
  }: {
    open?: boolean
    mode?: 'create' | 'edit'
    fields?: FieldDef[]
    formData?: Record<string, unknown>
    title?: string
    size?: Size
    submitting?: boolean
    error?: string
    onsubmit?: (data: Record<string, unknown>) => Promise<void>
    onclose?: () => void
    editFormExtra?: Snippet<[Record<string, unknown> | null, 'create' | 'edit']>
    editingItem?: Record<string, unknown> | null
  } = $props()

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

  function handleClose() {
    open = false
    onclose?.()
  }

  async function handleSubmit(e: Event) {
    e.preventDefault()
    await onsubmit?.(formData)
  }

  function getInputType(fieldType: string): string {
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

<Drawer bind:open {title} position='right' {size} onclose={handleClose} closeOnBackdrop={false}>
  <form onsubmit={handleSubmit} class='space-y-4 pb-20'>
    {#if error}
      <div class='p-3 bg-error/10 border border-error/20 rounded-lg text-sm text-error flex items-center gap-2'>
        <span class='icon-[tabler--alert-circle] size-4 shrink-0'></span>
        <span>{error}</span>
      </div>
    {/if}

    {#each sortedFields as field}
      {@const isReadonly = field.readonly && mode === 'edit'}
      {@const isRequired = field.validation?.required}
      {@const fieldValue = formData[field.id]}
      {@const placeholder = field.placeholder ? resolveText(field.placeholder) : ''}

      {#if field.type === 'textarea'}
        <FormField label={resolveText(field.label)} required={isRequired}>
          <Textarea
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
            value={String(fieldValue ?? '')}
            disabled={submitting || isReadonly}
            onchange={e => updateField(field.id, (e.target as HTMLSelectElement).value)}
          >
            <option value="">{placeholder || uiM('crud_filter_all')}</option>
            {#each opts as opt}
              <option value={String(opt.value)}>{opt.label}</option>
            {/each}
          </Select>
        </FormField>

      {:else if field.type === 'multi-select'}
        {@const opts = resolveOptions(field.options)}
        {@const selectedValues = ((fieldValue ?? []) as Array<string | number | boolean>).map(String)}
        <FormField label={resolveText(field.label)} required={isRequired}>
          <div class='flex flex-wrap gap-3 p-3 bg-base-200 rounded-lg max-h-48 overflow-y-auto'>
            {#each opts as opt}
              <label class='inline-flex items-center gap-2 cursor-pointer'>
                <Checkbox
                  size='sm'
                  checked={selectedValues.includes(String(opt.value))}
                  onchange={() => toggleMultiSelect(field.id, opt.value)}
                  disabled={submitting || isReadonly}
                />
                <span class='text-sm text-base-content'>{opt.label}</span>
              </label>
            {/each}
            {#if opts.length === 0}
              <span class='text-sm text-base-content/60'>{uiM('crud_no_data')}</span>
            {/if}
          </div>
        </FormField>

      {:else if field.type === 'boolean' || field.type === 'checkbox'}
        <FormField label={resolveText(field.label)}>
          <Checkbox
            checked={Boolean(fieldValue)}
            onchange={checked => updateField(field.id, checked)}
            disabled={submitting || isReadonly}
          />
        </FormField>

      {:else}
        <FormField label={resolveText(field.label)} required={isRequired}>
          <Input
            type={getInputType(field.type)}
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
      <div class='border-t border-base-content/5 pt-4'>
        {@render editFormExtra(editingItem, mode)}
      </div>
    {/if}
  </form>

  <!-- 底部操作栏 -->
  <div class='absolute bottom-0 left-0 right-0 p-4 bg-base-200 border-t border-base-content/10 flex justify-end gap-2'>
    <Button variant='ghost' onclick={handleClose} disabled={submitting}>
      {uiM('crud_cancel')}
    </Button>
    <Button variant='primary' onclick={handleSubmit} disabled={submitting}>
      {#if submitting}
        <span class='loading loading-spinner loading-xs mr-2'></span>
      {/if}
      {mode === 'create' ? uiM('crud_create') : uiM('crud_save')}
    </Button>
  </div>
</Drawer>
