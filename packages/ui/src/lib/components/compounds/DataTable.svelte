<!--
  @component DataTable
  通用数据表格组件，支持自定义列、操作按钮和加载状态。

  @prop {T[]} data - 表格数据
  @prop {Column<T>[]} columns - 列配置
  @prop {keyof T} keyField - 用于唯一标识行的字段
  @prop {Snippet<[T]>} actions - 操作按钮插槽
  @prop {Snippet} empty - 空状态插槽
  @prop {boolean} loading - 是否加载中
  @prop {boolean} striped - 是否斑马纹
  @prop {boolean} hoverable - 是否悬停高亮
  @prop {'normal' | 'compact'} density - 显示密度，compact 为紧凑布局

  @example
  <DataTable
    data={users}
    columns={[
      { key: 'name', label: '姓名' },
      { key: 'email', label: '邮箱' },
      { key: 'createdAt', label: '创建时间', render: (item) => formatDate(item.createdAt) }
    ]}
    keyField="id"
  >
    {#snippet actions(item)}
      <Button size="xs" onclick={() => edit(item)}>编辑</Button>
    {/snippet}
  </DataTable>
-->
<script lang='ts' generics='T'>
  import type { Snippet } from 'svelte'
  import type { DataAttributes } from '../../types.js'
  import { uiM } from '../../messages.js'
  import { getDataAttributes } from '../../utils.js'

  const {
    data,
    columns,
    keyField,
    actions,
    empty,
    loading = false,
    striped = true,
    hoverable = true,
    density = 'normal',
    sortKey,
    sortDir,
    onsort,
    class: className = '',
    ...restProps
  }: {
    data: T[]
    columns: { key: keyof T | string, label: string, width?: string, align?: 'left' | 'center' | 'right', sortable?: boolean, render?: (item: T) => string }[]
    keyField: keyof T
    actions?: Snippet<[T]>
    empty?: Snippet
    loading?: boolean
    striped?: boolean
    hoverable?: boolean
    density?: 'normal' | 'compact'
    /** 受控排序字段（提供 onsort 时由外部驱动，通常用于服务端排序） */
    sortKey?: string
    /** 受控排序方向 */
    sortDir?: 'asc' | 'desc' | null
    /** 排序回调；提供时为受控模式（不再对 data 做本地排序），否则组件内部对当前数据做客户端排序 */
    onsort?: (key: string, dir: 'asc' | 'desc') => void
    class?: string
  } & DataAttributes = $props()

  const dataAttributes = $derived(getDataAttributes(restProps))
  type Column = { key: keyof T | string, label: string, width?: string, align?: 'left' | 'center' | 'right', sortable?: boolean, render?: (item: T) => string }

  // ─── 排序状态 ───
  const controlled = $derived(typeof onsort === 'function')
  // 非受控模式下的内部排序状态
  let localSortKey = $state<string | null>(null)
  let localSortDir = $state<'asc' | 'desc'>('asc')

  const activeSortKey = $derived(controlled ? (sortKey ?? null) : localSortKey)
  const activeSortDir = $derived<'asc' | 'desc' | null>(controlled ? (sortDir ?? null) : (localSortKey ? localSortDir : null))

  function toggleSort(col: Column) {
    if (!col.sortable)
      return
    const key = String(col.key)
    const nextDir: 'asc' | 'desc' = activeSortKey === key && activeSortDir === 'asc' ? 'desc' : 'asc'
    if (controlled) {
      onsort?.(key, nextDir)
      return
    }
    localSortKey = key
    localSortDir = nextDir
  }

  // 非受控模式：对当前数据做客户端排序（受控模式直接使用外部已排序数据）
  const sortedData = $derived.by(() => {
    if (controlled || !localSortKey)
      return data
    const key = localSortKey
    const dir = localSortDir
    const copy = [...data]
    copy.sort((a, b) => {
      const av = (a as Record<string, unknown>)[key]
      const bv = (b as Record<string, unknown>)[key]
      if (av === bv)
        return 0
      if (av === null || av === undefined)
        return 1
      if (bv === null || bv === undefined)
        return -1
      let cmp: number
      if (typeof av === 'number' && typeof bv === 'number') {
        cmp = av - bv
      }
      else {
        cmp = String(av).localeCompare(String(bv), undefined, { numeric: true })
      }
      return dir === 'asc' ? cmp : -cmp
    })
    return copy
  })

  const tableClass = $derived(
    density === 'compact'
      ? 'table table-sm w-full text-[12px] [&_thead_th]:px-3 [&_thead_th]:py-2 [&_tbody_td]:px-3 [&_tbody_td]:py-2'
      : 'table w-full text-[13px] [&_thead_th]:px-4 [&_thead_th]:py-2.5 [&_tbody_td]:px-4 [&_tbody_td]:py-3',
  )

  const headerRowClass = $derived(
    density === 'compact'
      ? 'text-[11px] text-base-content/55 border-b border-base-content/6'
      : 'text-[12px] text-base-content/55 border-b border-base-content/6',
  )

  const rowClass = $derived(
    hoverable
      ? 'border-b border-base-content/5 transition-colors hover:bg-base-content/3 last:border-b-0'
      : 'border-b border-base-content/5 last:border-b-0',
  )

  const actionColumnClass = $derived(density === 'compact' ? 'w-20 text-center font-medium' : 'w-24 text-center font-medium')
  const actionWrapClass = $derived(density === 'compact' ? 'flex items-center justify-center gap-0.5' : 'flex items-center justify-center gap-1')
  const placeholderCellClass = $derived(density === 'compact' ? 'text-center py-6 text-base-content/40' : 'text-center py-8 text-base-content/40')

  function getValue(item: T, col: Column): string {
    if (col.render) {
      return col.render(item)
    }
    const value = item[col.key as keyof T]
    if (value === null || value === undefined) {
      return '-'
    }
    // 自动格式化时间戳
    if (typeof value === 'number' && col.key.toString().toLowerCase().includes('at')) {
      return new Date(value).toLocaleString()
    }
    return String(value)
  }

  function getAlignClass(align?: string): string {
    switch (align) {
      case 'center': return 'text-center'
      case 'right': return 'text-right'
      default: return 'text-left'
    }
  }
</script>

<div {...dataAttributes} class='overflow-x-auto {className}'>
  <table class={tableClass} class:table-zebra={striped}>
    <thead>
      <tr class={headerRowClass}>
        {#each columns as col (String(col.key))}
          {@const isSorted = activeSortKey === String(col.key)}
          <th
            style={col.width ? `width: ${col.width}` : ''}
            class='{getAlignClass(col.align)} font-medium'
          >
            {#if col.sortable}
              <button
                type='button'
                class='group inline-flex select-none items-center gap-1 rounded-md px-1.5 py-0.5 -mx-1.5 font-medium transition-colors hover:bg-base-content/5 {isSorted ? 'text-base-content' : ''}'
                onclick={() => toggleSort(col)}
              >
                <span>{col.label}</span>
                {#if isSorted && activeSortDir === 'asc'}
                  <span class='icon-[tabler--arrow-narrow-up] size-3.5 text-base-content/70'></span>
                {:else if isSorted && activeSortDir === 'desc'}
                  <span class='icon-[tabler--arrow-narrow-down] size-3.5 text-base-content/70'></span>
                {:else}
                  <span class='icon-[tabler--arrows-sort] size-3.5 text-base-content/30 group-hover:text-base-content/50'></span>
                {/if}
              </button>
            {:else}
              {col.label}
            {/if}
          </th>
        {/each}
        {#if actions}
          <th class={actionColumnClass}>{uiM('data_table_actions')}</th>
        {/if}
      </tr>
    </thead>
    <tbody>
      {#if loading}
        <tr>
          <td colspan={columns.length + (actions ? 1 : 0)} class={placeholderCellClass}>
            <span class='loading loading-spinner loading-sm'></span>
          </td>
        </tr>
      {:else if data.length === 0}
        <tr>
          <td colspan={columns.length + (actions ? 1 : 0)} class={placeholderCellClass}>
            {#if empty}
              {@render empty()}
            {:else}
              {uiM('data_table_empty')}
            {/if}
          </td>
        </tr>
      {:else}
        {#each sortedData as item (item[keyField])}
          <tr class={rowClass}>
            {#each columns as col (String(col.key))}
              <td class={getAlignClass(col.align)}>{getValue(item, col)}</td>
            {/each}
            {#if actions}
              <td>
                <div class={actionWrapClass}>
                  {@render actions(item)}
                </div>
              </td>
            {/if}
          </tr>
        {/each}
      {/if}
    </tbody>
  </table>
</div>
