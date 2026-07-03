<!--
  @component CrudFilterBar
  CRUD 搜索 + 过滤栏组件

  使用 Svelte 5 Runes ($props, $state)
-->
<script lang='ts'>
  import type { DataAttributes } from '../../../types.js'
  import { uiM } from '../../../messages.js'
  import { cn, getDataAttributes } from '../../../utils.js'
  import BareButton from '../../primitives/BareButton.svelte'
  import Input from '../../primitives/Input.svelte'
  import Select from '../../primitives/Select.svelte'

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
    onsearch,
    onfilterchange,
    onreset,
    class: className = '',
    ...restProps
  }: {
    searchable?: boolean
    searchPlaceholder?: string
    searchValue?: string
    filterFields?: FilterFieldDef[]
    filterValues?: Record<string, unknown>
    onsearch?: (search: string) => void
    onfilterchange?: (filters: Record<string, unknown>) => void
    onreset?: () => void
    class?: string
  } & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))
  let searchTimer: ReturnType<typeof setTimeout> | undefined

  // 是否存在已激活的搜索/过滤条件（用于显示重置按钮）
  const hasFilterValue = $derived(Object.values(filterValues).some(v => v !== undefined && v !== '' && v !== null))
  const hasActiveFilters = $derived(searchValue.trim() !== '' || hasFilterValue)

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

  function isTextField(field: FilterFieldDef): boolean {
    const t = normalizeType(field.type)
    return t === 'text' || t === 'search' || t === 'keyword'
  }

  function resolveOptions(options?: FilterFieldDef['options']): Array<{ label: string, value: string | number | boolean }> {
    if (!options)
      return []
    return typeof options === 'function' ? options() : options
  }

  function handleSearchInput() {
    clearTimeout(searchTimer)
    searchTimer = setTimeout(() => {
      onsearch?.(searchValue)
    }, 400)
  }

  function handleFilterChange(fieldId: string, value: unknown) {
    filterValues = { ...filterValues, [fieldId]: value }
    onfilterchange?.(filterValues)
  }

  function handleFilterPatch(partial: Record<string, unknown>) {
    filterValues = { ...filterValues, ...partial }
    onfilterchange?.(filterValues)
  }

  function handleReset() {
    clearTimeout(searchTimer)
    searchValue = ''
    filterValues = {}
    onreset?.()
  }
</script>

<div {...dataAttributes} class={cn('flex flex-wrap items-center gap-2 [&_.fieldset]:m-0 [&_.fieldset]:min-w-0', className)}>
  {#if searchable}
    <div class='relative w-full sm:w-64 md:w-72'>
      <span class='icon-[tabler--search] pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-base-content/35'></span>
      <Input
        type='text'
        size='sm'
        placeholder={searchPlaceholder || uiM('crud_search_placeholder')}
        class='h-8 pl-9 shadow-none'
        bind:value={searchValue}
        oninput={handleSearchInput}
        autocomplete='off'
      />
    </div>
  {/if}

  {#each filterFields as field (field.id)}
    {@const fieldPlaceholder = resolveText(field.placeholder)}
    {@const opts = resolveOptions(field.options)}

    {#if isDateRangeField(field)}
      {@const startKey = field.startKey ?? `${field.id}Start`}
      {@const endKey = field.endKey ?? `${field.id}End`}
      <div class='flex items-center gap-1.5'>
        <div class='w-32 shrink-0'>
          <input
            type='date'
            class='h-8 w-full rounded-lg border border-base-content/15 bg-base-100 px-2.5 text-sm outline-none transition-[border-color,box-shadow] duration-150 focus:border-primary/50 focus:ring-2 focus:ring-primary/10'
            aria-label={fieldPlaceholder || uiM('crud_filter_from')}
            value={String(filterValues[startKey] ?? '')}
            onchange={(e: Event & { currentTarget: HTMLInputElement }) => handleFilterPatch({ [startKey]: e.currentTarget.value })}
          />
        </div>
        <span class='text-sm text-base-content/40'>~</span>
        <div class='w-32 shrink-0'>
          <input
            type='date'
            class='h-8 w-full rounded-lg border border-base-content/15 bg-base-100 px-2.5 text-sm outline-none transition-[border-color,box-shadow] duration-150 focus:border-primary/50 focus:ring-2 focus:ring-primary/10'
            aria-label={uiM('crud_filter_to')}
            value={String(filterValues[endKey] ?? '')}
            onchange={(e: Event & { currentTarget: HTMLInputElement }) => handleFilterPatch({ [endKey]: e.currentTarget.value })}
          />
        </div>
      </div>
    {:else if isBooleanField(field)}
      <div class='w-30 shrink-0'>
        <Select
          size='sm'
          class='h-8 border-base-content/20 bg-base-100 shadow-none'
          value={String(filterValues[field.id] ?? '')}
          options={[
            { value: '', label: uiM('crud_filter_all') },
            { value: 'true', label: uiM('crud_filter_yes') },
            { value: 'false', label: uiM('crud_filter_no') },
          ]}
          onchange={(value: string) => handleFilterChange(field.id, value)}
        />
      </div>
    {:else if isDateField(field)}
      <div class='w-36 shrink-0'>
        <input
          type='date'
          class='h-8 w-full rounded-lg border border-base-content/15 bg-base-100 px-2.5 text-sm outline-none transition-[border-color,box-shadow] duration-150 focus:border-primary/50 focus:ring-2 focus:ring-primary/10'
          aria-label={fieldPlaceholder || resolveText(field.label)}
          value={String(filterValues[field.id] ?? '')}
          onchange={(e: Event & { currentTarget: HTMLInputElement }) => handleFilterChange(field.id, e.currentTarget.value)}
        />
      </div>
    {:else if isNumberField(field)}
      <div class='w-28 shrink-0'>
        <Input
          type='number'
          size='sm'
          min={field.min}
          max={field.max}
          step={field.step}
          class='h-8 shadow-none'
          placeholder={fieldPlaceholder || resolveText(field.label)}
          value={String(filterValues[field.id] ?? '')}
          onchange={(e: Event & { currentTarget: HTMLInputElement }) => handleFilterChange(field.id, e.currentTarget.value)}
        />
      </div>
    {:else if opts.length > 0}
      <div class='w-34 shrink-0'>
        <Select
          size='sm'
          class='h-8 border-base-content/20 bg-base-100 shadow-none'
          value={String(filterValues[field.id] ?? '')}
          options={[
            { value: '', label: uiM('crud_filter_all') },
            ...opts.map(opt => ({ value: String(opt.value), label: opt.label })),
          ]}
          onchange={(value: string) => handleFilterChange(field.id, value)}
        />
      </div>
    {:else if isTextField(field)}
      <div class='w-44 shrink-0'>
        <Input
          type='text'
          size='sm'
          class='h-8 shadow-none'
          placeholder={fieldPlaceholder || resolveText(field.label)}
          value={String(filterValues[field.id] ?? '')}
          onchange={(e: Event & { currentTarget: HTMLInputElement }) => handleFilterChange(field.id, e.currentTarget.value)}
        />
      </div>
    {/if}
  {/each}

  {#if hasActiveFilters}
    <BareButton
      type='button'
      class='inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-sm font-medium text-base-content/60 transition-colors hover:bg-base-content/5 hover:text-base-content'
      onclick={handleReset}
    >
      {uiM('crud_reset')}
      <span class='icon-[tabler--x] size-3.5'></span>
    </BareButton>
  {/if}
</div>
