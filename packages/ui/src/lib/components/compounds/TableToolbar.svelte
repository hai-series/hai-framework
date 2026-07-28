<!--
  @component TableToolbar
  通用表格工具栏，支持搜索、筛选弹层、排序弹层、视图切换、主操作按钮和自定义按钮插槽。

  @prop {boolean} searchable - 是否显示搜索框
  @prop {string} searchPlaceholder - 搜索框占位文案
  @prop {string} searchValue - 搜索框当前值（bindable）
  @prop {string} searchLabel - 搜索框 aria-label
  @prop {FilterFieldDef[]} filterFields - 筛选字段配置
  @prop {Record<string, unknown>} filterValues - 当前筛选值（bindable）
  @prop {Array<{key: string, label: string}>} sortableColumns - 可排序列
  @prop {string} sortBy - 当前排序字段
  @prop {'asc' | 'desc'} sortDirection - 当前排序方向
  @prop {'table' | 'card'} viewMode - 当前视图模式
  @prop {boolean} showViewSwitch - 是否显示视图切换
  @prop {string} primaryActionLabel - 主操作按钮文案
  @prop {Snippet} leading - 工具栏左侧内容插槽，可用于页面标题或说明标签
  @prop {Snippet} children - 自定义按钮插槽
  @prop {Function} onsearch - 搜索回调
  @prop {Function} onfilterchange - 筛选变化回调
  @prop {Function} onclearfilters - 清空筛选回调
  @prop {Function} onsort - 排序回调
  @prop {Function} onclearsort - 清空排序回调
  @prop {Function} onviewmodechange - 视图切换回调
  @prop {Function} onPrimaryAction - 主操作回调

  @example
  <TableToolbar
    searchable
    searchPlaceholder="搜索..."
    bind:searchValue
    filterFields={[
      { id: 'status', label: '状态', type: 'enum', options: [{ label: '启用', value: 'active' }] }
    ]}
    bind:filterValues
    sortableColumns={[{ key: 'name', label: '名称' }]}
    sortBy="name"
    sortDirection="asc"
    onsearch={(v) => handleSearch(v)}
    onfilterchange={(f) => handleFilter(f)}
    onsort={(key, dir) => handleSort(key, dir)}
  >
    <Button size="sm" onclick={handleExport}>导出</Button>
  </TableToolbar>
-->
<script lang='ts'>
  import type { Snippet } from 'svelte'
  import type { DataAttributes } from '../../types.js'
  import { onMount } from 'svelte'
  import { uiM } from '../../messages.js'
  import { getDataAttributes } from '../../utils.js'

  /** 工具栏筛选字段定义。 */
  type FilterFieldDef = {
    /** 筛选字段 key，同时作为回调中的属性名。 */
    id: string
    /** 用户可见字段名。 */
    label: string | (() => string)
    /** 控件类型；date-range 会渲染起止日期输入。 */
    type: string
    /** 控件占位文案。 */
    placeholder?: string | (() => string)
    /** 日期范围起始值 key。 */
    startKey?: string
    /** 日期范围结束值 key。 */
    endKey?: string
    /** 数值控件最小值。 */
    min?: number
    /** 数值控件最大值。 */
    max?: number
    /** 数值控件步长。 */
    step?: number
    /** 选择类控件选项。 */
    options?: Array<{ label: string, value: string | number | boolean }> | (() => Array<{ label: string, value: string | number | boolean }>)
  }

  /** TableToolbar 对外入参。 */
  type TableToolbarProps = {
    /** 是否显示搜索框，默认 true。 */
    searchable?: boolean
    /** 搜索框占位文案。 */
    searchPlaceholder?: string
    /** 搜索框当前值，可通过 bind:searchValue 受控。 */
    searchValue?: string
    /** 搜索框无障碍标签。 */
    searchLabel?: string
    /** 可用筛选字段。 */
    filterFields?: FilterFieldDef[]
    /** 当前筛选值，可通过 bind:filterValues 受控。 */
    filterValues?: Record<string, unknown>
    /** 可用排序列。 */
    sortableColumns?: Array<{ key: string, label: string }>
    /** 当前排序字段，可通过 bind:sortBy 受控。 */
    sortBy?: string
    /** 当前排序方向。 */
    sortDirection?: 'asc' | 'desc'
    /** 当前视图模式，可通过 bind:viewMode 受控。 */
    viewMode?: 'table' | 'card'
    /** 是否显示表格/卡片切换。 */
    showViewSwitch?: boolean
    /** 主操作按钮文案；为空时不显示。 */
    primaryActionLabel?: string
    /** 工具栏左侧内容插槽，可放置页面标题、统计信息等非操作内容。 */
    leading?: Snippet
    /** 工具栏右侧自定义操作插槽。 */
    children?: Snippet
    /** 搜索提交回调。 */
    onsearch?: (search: string) => void
    /** 筛选值变化回调。 */
    onfilterchange?: (filters: Record<string, unknown>) => void
    /** 清空筛选回调。 */
    onclearfilters?: () => void
    /** 排序变化回调。 */
    onsort?: (key: string, direction: 'asc' | 'desc') => void
    /** 清空排序回调。 */
    onclearsort?: () => void
    /** 视图变化回调。 */
    onviewmodechange?: (mode: 'table' | 'card') => void
    /** 主操作点击回调。 */
    onPrimaryAction?: () => void
    /** 根节点自定义 class。 */
    class?: string
  } & DataAttributes

  let {
    searchable = true,
    searchPlaceholder = '',
    searchValue = $bindable(''),
    searchLabel = '',
    filterFields = [],
    filterValues = $bindable({}),
    sortableColumns = [],
    sortBy = $bindable(''),
    sortDirection = $bindable('desc'),
    viewMode = $bindable('table'),
    showViewSwitch = false,
    primaryActionLabel = '',
    leading,
    children,
    onsearch,
    onfilterchange,
    onclearfilters,
    onsort,
    onclearsort,
    onviewmodechange,
    onPrimaryAction,
    class: className = '',
    ...restProps
  }: TableToolbarProps = $props()

  /** 透传到根节点的 data-* 属性。 */
  const dataAttributes = $derived(getDataAttributes(restProps))

  // ─── 弹层状态 ───
  /** 筛选弹层是否打开。 */
  let filterOpen = $state(false)
  /** 排序弹层是否打开。 */
  let sortOpen = $state(false)
  /** 用于检测外部点击的根节点。 */
  let rootElement = $state<HTMLElement | null>(null)

  // ─── 日期范围本地输入 ───
  /** 日期范围起始输入框草稿。 */
  const dateStartInputs = $state<Record<string, string>>({})
  /** 日期范围结束输入框草稿。 */
  const dateEndInputs = $state<Record<string, string>>({})

  // ─── 派生状态 ───
  /** 是否存在可用筛选字段。 */
  const hasFilters = $derived(filterFields.length > 0)
  /** 是否存在可用排序列。 */
  const hasSortableColumns = $derived(sortableColumns.length > 0)

  /** 已生效筛选条件数量，用于按钮角标。 */
  const activeFilterCount = $derived.by(() =>
    filterFields.filter((field) => {
      if (isDateRangeField(field)) {
        const startKey = field.startKey ?? `${field.id}Start`
        const endKey = field.endKey ?? `${field.id}End`
        return Boolean(getFilterValue(startKey) && getFilterValue(endKey))
      }
      return hasMeaningfulFilterValue(filterValues[field.id])
    }).length,
  )

  /** 当前排序字段的显示文案。 */
  const activeSortLabel = $derived(
    sortableColumns.find(col => col.key === sortBy)?.label ?? '',
  )

  // ─── 同步日期范围本地状态 ───
  $effect(() => {
    for (const field of filterFields) {
      if (!isDateRangeField(field))
        continue
      const startKey = field.startKey ?? `${field.id}Start`
      const endKey = field.endKey ?? `${field.id}End`
      if (!(startKey in dateStartInputs)) {
        dateStartInputs[startKey] = String(filterValues[startKey] ?? '')
      }
      if (!(endKey in dateEndInputs)) {
        dateEndInputs[endKey] = String(filterValues[endKey] ?? '')
      }
    }
  })

  // ─── 工具函数 ───

  /** 解析静态或动态文案。 */
  function resolveText(text: string | (() => string) | undefined): string {
    if (!text)
      return ''
    return typeof text === 'function' ? text() : text
  }

  /** 判断字段是否使用日期范围控件。 */
  function isDateRangeField(field: FilterFieldDef): boolean {
    const t = field.type.trim().toLowerCase()
    return t === 'date-range' || t === 'daterange'
  }

  /** 判断字段是否使用布尔筛选；空值选项统一表示“不限制”。 */
  function isBooleanField(field: FilterFieldDef): boolean {
    const t = field.type.trim().toLowerCase()
    return t === 'boolean' || t === 'switch' || t === 'toggle'
  }

  /** 判断字段是否使用日期输入控件。 */
  function isDateField(field: FilterFieldDef): boolean {
    return new Set(['date', 'datetime-local', 'datetime', 'month', 'week']).has(field.type.trim().toLowerCase())
  }

  /** 判断字段是否使用数值输入控件。 */
  function isNumberField(field: FilterFieldDef): boolean {
    return new Set(['number', 'integer']).has(field.type.trim().toLowerCase())
  }

  /** 把任意筛选值归一化为控件使用的字符串。 */
  function getFilterValue(key: string): string {
    return String(filterValues[key] ?? '')
  }

  /** 判断筛选值是否真正生效，避免 false 或 0 被误判为空。 */
  function hasMeaningfulFilterValue(value: unknown): boolean {
    return value !== undefined && value !== null && String(value) !== ''
  }

  /** 解析静态或动态选项。 */
  function resolveOptions(options?: FilterFieldDef['options']): Array<{ label: string, value: string | number | boolean }> {
    if (!options)
      return []
    return typeof options === 'function' ? options() : options
  }

  // ─── 弹层控制 ───

  /** 切换筛选弹层，并关闭排序弹层。 */
  function toggleFilterPopover(): void {
    filterOpen = !filterOpen
    if (filterOpen)
      sortOpen = false
  }

  /** 切换排序弹层，并关闭筛选弹层。 */
  function toggleSortPopover(): void {
    sortOpen = !sortOpen
    if (sortOpen)
      filterOpen = false
  }

  // ─── 筛选操作 ───

  /** 更新单个筛选值并通知父组件。 */
  function handleFilterChange(fieldId: string, value: string): void {
    /** 保留其它筛选字段，避免单项更新覆盖并行条件。 */
    const next = { ...filterValues, [fieldId]: value }
    filterValues = next
    onfilterchange?.(next)
  }

  /** 更新日期范围；只有起止完整且合法时才提交筛选。 */
  function handleDateRangeChange(startKey: string, endKey: string, field: 'start' | 'end', value: string): void {
    if (field === 'start') {
      dateStartInputs[startKey] = value
    }
    else {
      dateEndInputs[endKey] = value
    }

    /** 本次变更后的起始日期。 */
    const startVal = field === 'start' ? value : dateStartInputs[startKey]
    /** 本次变更后的结束日期。 */
    const endVal = field === 'end' ? value : dateEndInputs[endKey]

    if (!startVal || !endVal) {
      /** 单边日期不构成有效范围，因此同步清空父级两个值。 */
      const next = { ...filterValues }
      next[startKey] = ''
      next[endKey] = ''
      filterValues = next
      onfilterchange?.(next)
      return
    }

    if (startVal > endVal) {
      /** 非法范围不能提交给业务查询。 */
      const next = { ...filterValues }
      next[startKey] = ''
      next[endKey] = ''
      filterValues = next
      onfilterchange?.(next)
      return
    }

    /** 已校验的完整日期范围。 */
    const next = { ...filterValues, [startKey]: startVal, [endKey]: endVal }
    filterValues = next
    onfilterchange?.(next)
  }

  /** 清空父组件筛选状态和日期范围草稿。 */
  function handleClearFilters(): void {
    // 清空日期范围本地状态
    for (const field of filterFields) {
      if (!isDateRangeField(field))
        continue
      const startKey = field.startKey ?? `${field.id}Start`
      const endKey = field.endKey ?? `${field.id}End`
      dateStartInputs[startKey] = ''
      dateEndInputs[endKey] = ''
    }
    filterValues = {}
    onclearfilters?.()
  }

  // ─── 排序操作 ───

  /** 选择排序字段；选择默认项时清空排序。 */
  function handleSortFieldChange(event: Event): void {
    /** 下拉框选中的排序字段。 */
    const nextSortBy = (event.currentTarget as HTMLSelectElement).value
    if (!nextSortBy) {
      sortBy = ''
      sortDirection = 'desc'
      onclearsort?.()
      return
    }
    sortBy = nextSortBy
    onsort?.(nextSortBy, sortDirection)
  }

  /** 更新排序方向；未选字段时使用第一列。 */
  function updateSortDirection(direction: 'asc' | 'desc'): void {
    /** 未显式选择字段时，方向按钮作用于第一列。 */
    const nextSortBy = sortBy || sortableColumns[0]?.key
    if (!nextSortBy)
      return
    sortBy = nextSortBy
    sortDirection = direction
    onsort?.(nextSortBy, direction)
  }

  // ─── 点击外部关闭弹层 ───

  onMount(() => {
    /** 点击组件外部时关闭所有弹层。 */
    const handlePointerDown = (event: PointerEvent) => {
      if (rootElement && !rootElement.contains(event.target as Node)) {
        filterOpen = false
        sortOpen = false
      }
    }

    /** Escape 键关闭当前弹层。 */
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        filterOpen = false
        sortOpen = false
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  })
</script>

<div {...dataAttributes} bind:this={rootElement} class='flex items-center justify-between gap-3 flex-wrap {className}'>
  <!-- 左侧信息区：标题、说明等不参与表格操作的内容。 -->
  {#if leading}
    <div class='min-w-0 flex-1'>
      {@render leading()}
    </div>
  {/if}

  <!-- 右侧操作区：搜索、筛选、排序及自定义操作始终靠右对齐。 -->
  <div class='flex min-w-0 flex-1 items-center justify-end gap-2 flex-wrap'>
    <!-- 搜索框 -->
    {#if searchable}
      <div class='relative flex-1 min-w-[11rem] max-w-[15rem]'>
        <span class='icon-[tabler--search] pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-base-content/35'></span>
        <input
          type='search'
          bind:value={searchValue}
          aria-label={searchLabel || uiM('toolbar_search')}
          class='input input-sm w-full pl-9 bg-base-100 border-base-content/15'
          placeholder={searchPlaceholder || uiM('crud_search_placeholder')}
          onkeydown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              onsearch?.(searchValue)
            }
          }}
        />
      </div>
    {/if}

    <!-- 筛选弹层按钮 -->
    {#if hasFilters}
      <div class='relative'>
        <button
          type='button'
          aria-expanded={filterOpen}
          aria-haspopup='dialog'
          aria-label={uiM('toolbar_filter')}
          class='btn btn-sm btn-square border-base-content/15 bg-base-100 {activeFilterCount > 0 ? 'border-primary/50 text-primary bg-primary/5' : ''}'
          title={uiM('toolbar_filter')}
          onclick={toggleFilterPopover}
        >
          <span class='icon-[tabler--filter] size-4'></span>
          {#if activeFilterCount > 0}
            <span class='absolute -top-1.5 -right-1.5 inline-flex items-center justify-center min-w-[1.15rem] h-[1.15rem] rounded-full bg-primary text-white text-[10px] font-bold leading-none px-0.5'>
              {activeFilterCount}
            </span>
          {/if}
        </button>

        {#if filterOpen}
          <div
            role='dialog'
            aria-label={uiM('toolbar_filter_conditions')}
            class='absolute top-full right-0 mt-2 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-base-content/10 bg-base-100 p-4 shadow-lg'
          >
            <div class='flex items-center justify-between mb-3'>
              <h3 class='text-sm font-semibold text-base-content'>{uiM('toolbar_filter')}</h3>
              <button
                type='button'
                class='btn btn-xs btn-ghost text-primary'
                disabled={activeFilterCount === 0}
                onclick={handleClearFilters}
              >
                {uiM('toolbar_filter_reset')}
              </button>
            </div>

            <div class='flex flex-col gap-3'>
              {#each filterFields as field (field.id)}
                {@const fieldLabel = resolveText(field.label)}
                <div class='flex flex-col gap-1.5'>
                  <span class='text-xs text-base-content/55 font-medium'>{fieldLabel}</span>

                  {#if isDateRangeField(field)}
                    {@const startKey = field.startKey ?? `${field.id}Start`}
                    {@const endKey = field.endKey ?? `${field.id}End`}
                    <div class='grid grid-cols-[1fr_auto_1fr] items-center gap-1.5'>
                      <div class='relative'>
                        <input
                          type='date'
                          class='input input-sm w-full bg-base-100 border-base-content/15 cursor-pointer'
                          aria-label={uiM('crud_filter_from')}
                          max={dateEndInputs[endKey] || undefined}
                          value={dateStartInputs[startKey]}
                          oninput={e => handleDateRangeChange(startKey, endKey, 'start', e.currentTarget.value)}
                        />
                      </div>
                      <span class='text-xs text-base-content/40'>~</span>
                      <div class='relative'>
                        <input
                          type='date'
                          class='input input-sm w-full bg-base-100 border-base-content/15 cursor-pointer'
                          aria-label={uiM('crud_filter_to')}
                          min={dateStartInputs[startKey] || undefined}
                          value={dateEndInputs[endKey]}
                          oninput={e => handleDateRangeChange(startKey, endKey, 'end', e.currentTarget.value)}
                        />
                      </div>
                    </div>
                  {:else if isBooleanField(field)}
                    <select
                      class='select select-sm w-full bg-base-100 border-base-content/15'
                      aria-label={fieldLabel}
                      value={getFilterValue(field.id)}
                      onchange={e => handleFilterChange(field.id, e.currentTarget.value)}
                    >
                      <option value=''>{uiM('toolbar_filter_all')}</option>
                      <option value='true'>{uiM('crud_filter_yes')}</option>
                      <option value='false'>{uiM('crud_filter_no')}</option>
                    </select>
                  {:else if isDateField(field)}
                    <input
                      type='date'
                      class='input input-sm w-full bg-base-100 border-base-content/15'
                      aria-label={fieldLabel}
                      value={getFilterValue(field.id)}
                      onchange={e => handleFilterChange(field.id, e.currentTarget.value)}
                    />
                  {:else if isNumberField(field)}
                    <input
                      type='number'
                      class='input input-sm w-full bg-base-100 border-base-content/15'
                      aria-label={fieldLabel}
                      min={field.min}
                      max={field.max}
                      step={field.step}
                      placeholder={resolveText(field.placeholder) || fieldLabel}
                      value={getFilterValue(field.id)}
                      onchange={e => handleFilterChange(field.id, e.currentTarget.value)}
                    />
                  {:else}
                    {@const opts = resolveOptions(field.options)}
                    {#if opts.length > 0}
                      <select
                        class='select select-sm w-full bg-base-100 border-base-content/15'
                        aria-label={fieldLabel}
                        value={getFilterValue(field.id)}
                        onchange={e => handleFilterChange(field.id, e.currentTarget.value)}
                      >
                        <option value=''>{uiM('toolbar_filter_all')}</option>
                        {#each opts as option (option.value)}
                          <option value={String(option.value)}>{option.label}</option>
                        {/each}
                      </select>
                    {:else}
                      <input
                        type='text'
                        class='input input-sm w-full bg-base-100 border-base-content/15'
                        aria-label={fieldLabel}
                        placeholder={resolveText(field.placeholder) || fieldLabel}
                        value={getFilterValue(field.id)}
                        onchange={e => handleFilterChange(field.id, e.currentTarget.value)}
                      />
                    {/if}
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {/if}

    <!-- 排序弹层按钮 -->
    {#if hasSortableColumns}
      <div class='relative'>
        <button
          type='button'
          aria-expanded={sortOpen}
          aria-haspopup='dialog'
          aria-label={uiM('toolbar_sort')}
          class='btn btn-sm btn-square border-base-content/15 bg-base-100 {sortBy ? 'border-primary/50 text-primary bg-primary/5' : ''}'
          title={uiM('toolbar_sort')}
          onclick={toggleSortPopover}
        >
          <span class='icon-[tabler--arrows-sort] size-4'></span>
        </button>

        {#if sortOpen}
          <div
            role='dialog'
            aria-label={uiM('toolbar_sort_conditions')}
            class='absolute top-full right-0 mt-2 z-50 w-[min(18rem,calc(100vw-2rem))] rounded-xl border border-base-content/10 bg-base-100 p-4 shadow-lg'
          >
            <div class='flex items-center justify-between mb-3'>
              <h3 class='text-sm font-semibold text-base-content'>{uiM('toolbar_sort')}</h3>
              <button
                type='button'
                class='btn btn-xs btn-ghost text-primary'
                disabled={!sortBy}
                onclick={() => {
                  sortBy = ''
                  sortDirection = 'desc'
                  onclearsort?.()
                }}
              >
                {uiM('toolbar_sort_default')}
              </button>
            </div>

            <div class='flex flex-col gap-3'>
              <!-- 排序字段 -->
              <div class='flex flex-col gap-1.5'>
                <span class='text-xs text-base-content/55 font-medium'>{uiM('toolbar_sort_field')}</span>
                <select
                  class='select select-sm w-full bg-base-100 border-base-content/15'
                  aria-label={uiM('toolbar_sort_field')}
                  value={sortBy}
                  onchange={handleSortFieldChange}
                >
                  <option value=''>{uiM('toolbar_sort_default_order')}</option>
                  {#each sortableColumns as column (column.key)}
                    <option value={column.key}>{column.label}</option>
                  {/each}
                </select>
              </div>

              <!-- 排序方向 -->
              <div class='flex flex-col gap-1.5'>
                <span class='text-xs text-base-content/55 font-medium'>{uiM('toolbar_sort_direction')}</span>
                <div class='grid grid-cols-2 gap-1' role='group' aria-label={uiM('toolbar_sort_direction')}>
                  <button
                    type='button'
                    class='btn btn-sm {sortDirection === 'desc' ? 'btn-primary' : 'btn-ghost border-base-content/15'}'
                    onclick={() => updateSortDirection('desc')}
                  >
                    <span class='icon-[tabler--sort-descending] size-4'></span>
                    {uiM('toolbar_sort_desc')}
                  </button>
                  <button
                    type='button'
                    class='btn btn-sm {sortDirection === 'asc' ? 'btn-primary' : 'btn-ghost border-base-content/15'}'
                    onclick={() => updateSortDirection('asc')}
                  >
                    <span class='icon-[tabler--sort-ascending] size-4'></span>
                    {uiM('toolbar_sort_asc')}
                  </button>
                </div>
              </div>

              <!-- 排序摘要 -->
              {#if activeSortLabel}
                <p class='text-xs text-base-content/50'>
                  {uiM('toolbar_sort_summary', {
                    label: activeSortLabel,
                    direction: sortDirection === 'desc' ? uiM('toolbar_sort_desc') : uiM('toolbar_sort_asc'),
                  })}
                </p>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    {/if}

    <!-- 视图切换 -->
    {#if showViewSwitch}
      <div class='join' role='group' aria-label={uiM('toolbar_view_switch')}>
        <button
          type='button'
          class='btn btn-sm join-item border-base-content/15 bg-base-100 {viewMode === 'table' ? 'text-primary bg-primary/5' : ''}'
          aria-label={uiM('toolbar_view_table')}
          title={uiM('toolbar_view_table')}
          onclick={() => {
            viewMode = 'table'
            onviewmodechange?.('table')
          }}
        >
          <span class='icon-[tabler--table] size-4'></span>
        </button>
        <button
          type='button'
          class='btn btn-sm join-item border-base-content/15 bg-base-100 {viewMode === 'card' ? 'text-primary bg-primary/5' : ''}'
          aria-label={uiM('toolbar_view_card')}
          title={uiM('toolbar_view_card')}
          onclick={() => {
            viewMode = 'card'
            onviewmodechange?.('card')
          }}
        >
          <span class='icon-[tabler--layout-grid] size-4'></span>
        </button>
      </div>
    {/if}

    <!-- 自定义按钮插槽 -->
    {#if children}
      {@render children()}
    {/if}

    <!-- 主操作按钮 -->
    {#if primaryActionLabel && onPrimaryAction}
      <button type='button' class='btn btn-sm btn-primary shadow-sm' onclick={onPrimaryAction}>
        <span class='icon-[tabler--plus] size-4'></span>
        {primaryActionLabel}
      </button>
    {/if}
  </div>
</div>
