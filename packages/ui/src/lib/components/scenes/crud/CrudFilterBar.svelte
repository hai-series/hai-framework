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

<div class='p-4'>
  <div class='flex flex-col sm:flex-row gap-3'>
    {#if searchable}
      <div class='flex-1 relative'>
        <span class='icon-[tabler--search] size-4.5 absolute left-3 top-1/2 -translate-y-1/2 text-base-content/35 z-10'></span>
        <Input
          type='text'
          placeholder={searchPlaceholder || uiM('crud_search_placeholder')}
          class='pl-10'
          bind:value={searchValue}
          oninput={handleSearchInput}
          autocomplete='off'
        />
      </div>
    {/if}

    {#each filterFields as field}
      {@const opts = resolveOptions(field.options)}
      {#if opts.length > 0}
        <Select
          class='min-w-32'
          value={String(filterValues[field.id] ?? '')}
          onchange={e => handleFilterChange(field.id, (e.target as HTMLSelectElement).value)}
        >
          <option value="">{uiM('crud_filter_all')}</option>
          {#each opts as opt}
            <option value={String(opt.value)}>{opt.label}</option>
          {/each}
        </Select>
      {/if}
    {/each}

    <div class='text-sm text-base-content/50 self-center whitespace-nowrap'>
      {uiM('crud_total', { count: total })}
    </div>
  </div>
</div>
