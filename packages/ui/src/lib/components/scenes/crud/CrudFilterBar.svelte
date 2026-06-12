<!--
  @component CrudFilterBar
  CRUD 搜索 + 过滤栏组件

  使用 Svelte 5 Runes ($props, $state)
-->
<script lang='ts'>
  import { uiM } from '../../../messages.js'
  import Input from '../../primitives/Input.svelte'
  import Select from '../../primitives/Select.svelte'

  type FilterFieldDef = {
    id: string
    label: string | (() => string)
    type: string
    options?: Array<{ label: string, value: string | number | boolean }> | (() => Array<{ label: string, value: string | number | boolean }>)
  }

  let {
    searchable = true,
    searchPlaceholder = '',
    searchValue = $bindable(''),
    filterFields = [],
    filterValues = $bindable<Record<string, unknown>>({}),
    total = 0,
    onsearch,
    onfilterchange,
  }: {
    searchable?: boolean
    searchPlaceholder?: string
    searchValue?: string
    filterFields?: FilterFieldDef[]
    filterValues?: Record<string, unknown>
    total?: number
    onsearch?: (search: string) => void
    onfilterchange?: (filters: Record<string, unknown>) => void
  } = $props()

  let searchTimer: ReturnType<typeof setTimeout> | undefined

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
</script>

<div class='grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center'>
  <div class='flex min-w-0 flex-wrap items-center gap-3 [&_.fieldset]:m-0 [&_.fieldset]:min-w-0'>
    {#if searchable}
      <div class='relative min-w-[15rem] flex-[1_1_20rem]'>
        <span class='icon-[tabler--search] pointer-events-none absolute left-3.5 top-1/2 z-10 size-4 -translate-y-1/2 text-base-content/35'></span>
        <Input
          type='text'
          size='sm'
          placeholder={searchPlaceholder || uiM('crud_search_placeholder')}
          class='pl-10 shadow-none'
          bind:value={searchValue}
          oninput={handleSearchInput}
          autocomplete='off'
        />
      </div>
    {/if}

    {#each filterFields as field (field.id)}
      {@const opts = resolveOptions(field.options)}
      {#if opts.length > 0}
        <div class='w-full sm:w-[11rem] sm:flex-none'>
          <Select
            size='sm'
            class='border-base-content/10 bg-base-100 shadow-none'
            value={String(filterValues[field.id] ?? '')}
            onchange={value => handleFilterChange(field.id, value)}
          >
            <option value="">{uiM('crud_filter_all')}</option>
            {#each opts as opt (String(opt.value))}
              <option value={String(opt.value)}>{opt.label}</option>
            {/each}
          </Select>
        </div>
      {/if}
    {/each}
  </div>

  <div class='inline-flex items-center justify-self-start rounded-full border border-base-content/8 bg-base-200/60 px-3 py-1 text-xs font-medium text-base-content/60 md:justify-self-end'>
    {uiM('crud_total', { count: total })}
  </div>
</div>
