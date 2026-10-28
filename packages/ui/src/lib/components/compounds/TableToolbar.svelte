<!--
  @component TableToolbar
  统一列表搜索与筛选；条件由查询按钮或原生 Enter 提交，排序由 DataTable 列头承接。

  使用 Svelte 5 Runes ($props, $state)

  @example
  ```ts
  import { mount, unmount } from 'svelte'
  import type { ComponentProps } from 'svelte'
  import { TableToolbar } from '@h-ai/ui'
  const props: ComponentProps<typeof TableToolbar> = { searchable: true, filterFields: [{ id: 'active', label: '状态', type: 'boolean' }], filterValues: { active: true } }
  const component = mount(TableToolbar, { target: document.body, props })
  await unmount(component)
  ```
-->
<script lang='ts'>
  import type { Snippet } from 'svelte'
  import type { DataAttributes } from '../../types.js'
  import { uiM } from '../../messages.js'
  import { getDataAttributes } from '../../utils.js'
  import { getFormControlSizeClasses } from '../control-size.js'
  import Button from '../primitives/Button.svelte'
  import Input from '../primitives/Input.svelte'
  import FilterBar from './FilterBar.svelte'
  import FormField from './FormField.svelte'
  import FormLayout from './FormLayout.svelte'

  /**
   * 工具栏过滤字段的局部视图；值由宿主条件查询消费。
   *
   * @example 模块内部上下文
   * ```ts
   * const example: FilterFieldDef = { id: 'active', label: '状态', type: 'boolean' }
   * ```
   */
  type FilterFieldDef = {
    id: string
    label: string | (() => string)
    type: string
    placeholder?: string | (() => string)
    startKey?: string
    endKey?: string
    min?: number
    max?: number
    step?: number
    options?: Array<{ label: string, value: string | number | boolean }> | (() => Array<{ label: string, value: string | number | boolean }>)
  }

  let {
    searchable = true,
    searchPlaceholder = '',
    searchValue = $bindable(''),
    filterFields = [],
    filterValues = $bindable<Record<string, unknown>>({}),
    expanded = $bindable(false),
    leading,
    children,
    searchLabel = '',
    viewMode = $bindable('table'),
    showViewSwitch = false,
    primaryActionLabel = '',
    onPrimaryAction,
    onviewmodechange,
    onsearch,
    onfilterchange,
    onclearfilters,
    class: className = '',
    ...restProps
  }: {
    searchable?: boolean
    searchPlaceholder?: string
    searchValue?: string
    filterFields?: FilterFieldDef[]
    filterValues?: Record<string, unknown>
    expanded?: boolean
    leading?: Snippet
    children?: Snippet
    searchLabel?: string
    viewMode?: 'table' | 'card'
    showViewSwitch?: boolean
    primaryActionLabel?: string
    onPrimaryAction?: () => void
    onviewmodechange?: (mode: 'table' | 'card') => void
    /** 点击查询或原生 Enter 提交；读取当前 searchValue/filterValues 一次查询。 */
    onsearch?: (search: string) => void
    /** 草稿字段变化通知；此时不应发起业务查询。 */
    onfilterchange?: (filters: Record<string, unknown>) => void
    onclearfilters?: () => void
    class?: string
  } & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))
  const toolbarId = $props.id()
  const filterControl = getFormControlSizeClasses('sm')

  // 条件数量保持可感知，false 和 0 同样是有效草稿值。
  const activeFilterCount = $derived(Object.values(filterValues).filter(v => v !== undefined && v !== '' && v !== null).length)

  const dateLikeTypes = new Set(['date', 'datetime-local', 'datetime', 'month', 'week'])
  const numberLikeTypes = new Set(['number', 'integer'])

  function resolveText(text: string | (() => string) | undefined): string {
    if (!text)
      return ''
    return typeof text === 'function' ? text() : text
  }

  function normalizeType(type: string): string {
    return type.trim().toLowerCase()
  }

  function isBooleanField(field: FilterFieldDef): boolean {
    const t = normalizeType(field.type)
    return t === 'boolean' || t === 'switch' || t === 'toggle'
  }

  function isDateRangeField(field: FilterFieldDef): boolean {
    const t = normalizeType(field.type)
    return t === 'date-range' || t === 'daterange'
  }

  function isDateField(field: FilterFieldDef): boolean {
    return dateLikeTypes.has(normalizeType(field.type))
  }

  function isNumberField(field: FilterFieldDef): boolean {
    return numberLikeTypes.has(normalizeType(field.type))
  }

  function resolveOptions(options?: FilterFieldDef['options']): Array<{ label: string, value: string | number | boolean }> {
    if (!options)
      return []
    return typeof options === 'function' ? options() : options
  }

  function handleFilterChange(fieldId: string, value: unknown) {
    filterValues = { ...filterValues, [fieldId]: value }
    onfilterchange?.(filterValues)
  }

  function handleFilterPatch(partial: Record<string, unknown>) {
    filterValues = { ...filterValues, ...partial }
    onfilterchange?.(filterValues)
  }

  /** 输入法候选确认不触发原生隐式查询。 */
  function preventComposingSubmit(event: KeyboardEvent) {
    if (event.key === 'Enter' && event.isComposing)
      event.preventDefault()
  }

  function handleReset() {
    searchValue = ''
    filterValues = {}
    onclearfilters?.()
  }
</script>

{#snippet search()}
  <div class='min-w-0 w-full'>
    <FormField label={searchLabel || searchPlaceholder || uiM('toolbar_search')} class='w-full [&>label]:sr-only'>
      <Input
        type='search'
        size='sm'
        placeholder={searchPlaceholder || uiM('crud_search_placeholder')}
        class='min-w-0 shadow-none'
        bind:value={searchValue}
        onkeydown={preventComposingSubmit}
        autocomplete='off'
      />
    </FormField>
  </div>
{/snippet}

{#snippet fields()}
  <FormLayout columns={2} class='hai-table-toolbar__filters'>
    {#each filterFields as field (field.id)}
      {@const fieldPlaceholder = resolveText(field.placeholder)}
      {@const opts = resolveOptions(field.options)}
      {@const controlId = `${toolbarId}-${field.id}`}
      <FormField label={resolveText(field.label)} for={controlId} colSpan={isDateRangeField(field) ? 2 : 1}>
        {#if isDateRangeField(field)}
          {@const startKey = field.startKey ?? `${field.id}Start`}
          {@const endKey = field.endKey ?? `${field.id}End`}
          <div class='grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2'>
            <input id={controlId} type='date' class='{filterControl.control} min-w-0 w-full rounded-lg border border-base-content/15 bg-base-100 outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10' aria-label={fieldPlaceholder || uiM('crud_filter_from')} max={String(filterValues[endKey] ?? '') || undefined} value={String(filterValues[startKey] ?? '')} onchange={event => handleFilterPatch({ [startKey]: event.currentTarget.value })} />
            <span class='text-sm text-base-content/40' aria-hidden='true'>–</span>
            <input type='date' class='{filterControl.control} min-w-0 w-full rounded-lg border border-base-content/15 bg-base-100 outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10' aria-label={uiM('crud_filter_to')} min={String(filterValues[startKey] ?? '') || undefined} value={String(filterValues[endKey] ?? '')} onchange={event => handleFilterPatch({ [endKey]: event.currentTarget.value })} />
          </div>
        {:else if isBooleanField(field)}
          <select id={controlId} class='select select-sm {filterControl.control} min-w-0 w-full border-base-content/20 bg-base-100 shadow-none' value={String(filterValues[field.id] ?? '')} onchange={event => handleFilterChange(field.id, event.currentTarget.value)}>
            <option value=''>{uiM('crud_filter_all')}</option>
            <option value='true'>{uiM('crud_filter_yes')}</option>
            <option value='false'>{uiM('crud_filter_no')}</option>
          </select>
        {:else if isDateField(field)}
          <input id={controlId} onkeydown={preventComposingSubmit} type='date' class='{filterControl.control} min-w-0 w-full rounded-lg border border-base-content/15 bg-base-100 outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10' aria-label={fieldPlaceholder || resolveText(field.label)} value={String(filterValues[field.id] ?? '')} oninput={event => handleFilterChange(field.id, event.currentTarget.value)} />
        {:else if isNumberField(field)}
          <Input id={controlId} onkeydown={preventComposingSubmit} type='number' size='sm' min={field.min} max={field.max} step={field.step} class='min-w-0 shadow-none' placeholder={fieldPlaceholder || resolveText(field.label)} value={String(filterValues[field.id] ?? '')} oninput={event => handleFilterChange(field.id, event.currentTarget.value)} />
        {:else if opts.length > 0}
          <select id={controlId} class='select select-sm {filterControl.control} min-w-0 w-full border-base-content/20 bg-base-100 shadow-none' value={String(filterValues[field.id] ?? '')} onchange={event => handleFilterChange(field.id, event.currentTarget.value)}>
            <option value=''>{uiM('crud_filter_all')}</option>
            {#each opts as option (String(option.value))}<option value={String(option.value)}>{option.label}</option>{/each}
          </select>
        {:else}
          <Input id={controlId} onkeydown={preventComposingSubmit} type='text' size='sm' class='min-w-0 shadow-none' placeholder={fieldPlaceholder || resolveText(field.label)} value={String(filterValues[field.id] ?? '')} oninput={event => handleFilterChange(field.id, event.currentTarget.value)} />
        {/if}
      </FormField>
    {/each}
  </FormLayout>
{/snippet}

{#snippet buttons()}
  <Button type='submit' variant='outline' size='sm' submitHint>{uiM('crud_query')}</Button>
{/snippet}

<div {...dataAttributes} class={`hai-table-toolbar min-w-0 ${className}`}>
  {#if leading || children || showViewSwitch || (primaryActionLabel && onPrimaryAction)}
    <div class='mb-3 flex min-w-0 flex-wrap items-center justify-between gap-2'>
      <div class='min-w-0 flex-1'>{#if leading}{@render leading()}{/if}</div>
      <div class='flex max-w-full flex-wrap items-center gap-2'>
        {#if showViewSwitch}
          <div class='join' role='group' aria-label={uiM('toolbar_view_switch')}>
            {#each ['table', 'card'] as mode (mode)}
              <button type='button' class='btn btn-sm join-item' class:text-primary={viewMode === mode} aria-label={uiM(mode === 'table' ? 'toolbar_view_table' : 'toolbar_view_card')} aria-pressed={viewMode === mode} onclick={() => {
                viewMode = mode === 'table' ? 'table' : 'card'
                onviewmodechange?.(viewMode)
              }}><span class={mode === 'table' ? 'icon-[tabler--table] size-4' : 'icon-[tabler--layout-grid] size-4'} aria-hidden='true'></span></button>
            {/each}
          </div>
        {/if}
        {#if children}{@render children()}{/if}
        {#if primaryActionLabel && onPrimaryAction}<Button size='sm' variant='primary' onclick={onPrimaryAction}><span class='icon-[tabler--plus] size-4' aria-hidden='true'></span>{primaryActionLabel}</Button>{/if}
      </div>
    </div>
  {/if}
  <form oninvalidcapture={() => { expanded = true }} onsubmit={(event) => {
    event.preventDefault()
    onsearch?.(searchValue)
  }}>
    <FilterBar bind:expanded activeCount={activeFilterCount} leading={searchable ? search : undefined} actions={buttons} onreset={handleReset} children={filterFields.length > 0 ? fields : undefined} />
  </form>
</div>

<style>
  .hai-table-toolbar {
    container: hai-list-query / inline-size;
  }

  .hai-table-toolbar :global(.hai-table-toolbar__filters) {
    --hai-form-gap: 1rem 1.25rem;
  }

  .hai-table-toolbar :global(.hai-table-toolbar__filters .hai-form-grid[data-columns]) {
    grid-template-columns: minmax(0, 1fr);
  }

  .hai-table-toolbar :global(.hai-table-toolbar__filters .hai-form-grid[data-columns] > .hai-form-field[data-col-span='2']) {
    grid-column: auto;
  }

  .hai-table-toolbar :global(.hai-table-toolbar__filters .field-content) {
    display: flex;
    flex-direction: column;
  }

  @container hai-list-query (min-width: 28rem) {
    .hai-table-toolbar :global(.hai-table-toolbar__filters .hai-form-grid[data-columns]) {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .hai-table-toolbar :global(.hai-table-toolbar__filters .hai-form-grid[data-columns] > .hai-form-field[data-col-span='2']) {
      grid-column: span 2;
    }
  }

  @container hai-list-query (min-width: 44rem) {
    .hai-table-toolbar :global(.hai-table-toolbar__filters .hai-form-grid[data-columns]) {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }

  @container hai-list-query (min-width: 64rem) {
    .hai-table-toolbar :global(.hai-table-toolbar__filters .hai-form-grid[data-columns]) {
      grid-template-columns: repeat(6, minmax(0, 1fr));
    }
  }
</style>
