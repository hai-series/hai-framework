<!--
  @component DataTable
  通用数据表格组件，支持自定义列、操作按钮和加载状态。

  @prop {T[]} data - 表格数据
  @prop {Column<T>[]} columns - 列配置
  @prop {keyof T} keyField - 用于唯一标识行的字段
  @prop {Snippet<[T, string]>} cell - 单元格内容插槽
  @prop {Snippet<[T]>} actions - 操作按钮插槽
  @prop {(item: T) => void} onrowclick - 行点击回调
  @prop {(item: T) => void} columns[].onclick - 指定列的单元格点击回调
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
    cell,
    actions,
    onrowclick,
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
    columns: { key: keyof T | string, label: string, width?: string, align?: 'left' | 'center' | 'right', sortable?: boolean, render?: (item: T) => string, onclick?: (item: T) => void }[]
    keyField: keyof T
    /** 自定义单元格内容；参数依次为行记录和列 key。 */
    cell?: Snippet<[T, string]>
    actions?: Snippet<[T]>
    /** 点击数据行时的回调。 */
    onrowclick?: (item: T) => void
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

  /** 透传到根节点的 data-* 属性。 */
  const dataAttributes = $derived(getDataAttributes(restProps))
  /** DataTable 内部使用的列定义。 */
  type Column = {
    /** 列对应的数据字段。 */
    key: keyof T | string
    /** 表头文案。 */
    label: string
    /** 列宽 CSS 值。 */
    width?: string
    /** 单元格对齐方式。 */
    align?: 'left' | 'center' | 'right'
    /** 是否允许点击表头排序。 */
    sortable?: boolean
    /** 自定义单元格格式化函数。 */
    render?: (item: T) => string
    /** 点击当前列单元格时的回调。 */
    onclick?: (item: T) => void
  }

  // ─── 排序状态 ───
  /** 是否由父组件接管排序；受控模式不复制和排序当前数据。 */
  const controlled = $derived(typeof onsort === 'function')
  // 非受控模式下的内部排序状态
  /** 非受控模式下的本地排序字段。 */
  let localSortKey = $state<string | null>(null)
  /** 非受控模式下的本地排序方向。 */
  let localSortDir = $state<'asc' | 'desc'>('asc')

  /** 当前生效的排序字段。 */
  const activeSortKey = $derived(controlled ? (sortKey ?? null) : localSortKey)
  /** 当前生效的排序方向。 */
  const activeSortDir = $derived<'asc' | 'desc' | null>(controlled ? (sortDir ?? null) : (localSortKey ? localSortDir : null))

  /** 切换列排序，并在受控模式下通知父组件。 */
  function toggleSort(col: Column) {
    if (!col.sortable)
      return
    /** 统一为字符串的列 key，用于和受控排序字段比较。 */
    const key = String(col.key)
    /** 同一列再次点击时切换方向，否则从升序开始。 */
    const nextDir: 'asc' | 'desc' = activeSortKey === key && activeSortDir === 'asc' ? 'desc' : 'asc'
    if (controlled) {
      onsort?.(key, nextDir)
      return
    }
    localSortKey = key
    localSortDir = nextDir
  }

  // 非受控模式：对当前数据做客户端排序（受控模式直接使用外部已排序数据）
  /** 非受控模式的当前页客户端排序结果。 */
  const sortedData = $derived.by(() => {
    if (controlled || !localSortKey)
      return data
    /** 已确定的排序字段和方向。 */
    const key = localSortKey
    const dir = localSortDir
    /** 复制输入数组，避免客户端排序改变父组件数据。 */
    const copy = [...data]
    copy.sort((a, b) => {
      /** 两条记录的待比较值。 */
      const av = (a as Record<string, unknown>)[key]
      const bv = (b as Record<string, unknown>)[key]
      if (av === bv)
        return 0
      if (av === null || av === undefined)
        return 1
      if (bv === null || bv === undefined)
        return -1
      /** 兼容数值和字符串字段的比较结果。 */
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

  /** 按密度生成表格单元格间距。 */
  const tableClass = $derived(
    density === 'compact'
      ? 'table table-sm w-full table-auto text-[12px] [&_thead_th]:px-3 [&_thead_th]:py-2 [&_tbody_td]:px-3 [&_tbody_td]:py-2'
      : 'table w-full table-auto text-[13px] [&_thead_th]:px-4 [&_thead_th]:py-2.5 [&_tbody_td]:px-4 [&_tbody_td]:py-3',
  )

  /** 表头字号样式；分隔线由每个表头单元格独立绘制，避免 sticky 列形成不同的层叠效果。 */
  const headerRowClass = $derived(
    density === 'compact'
      ? 'text-[11px] text-base-content/55'
      : 'text-[12px] text-base-content/55',
  )

  /** 所有表头单元格共用同一条分隔线，确保普通列与 sticky 操作列的颜色和位置完全一致。 */
  const headerCellDividerClass = `after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-base-300 after:content-['']`

  /** 数据行背景、悬停和分隔线样式；背景直接下发到每个单元格，避免 sticky 层透出下方内容。 */
  const rowClass = $derived(
    hoverable
      ? `border-b border-base-content/5 transition-colors [&>td]:bg-base-100 ${striped ? 'even:[&>td]:bg-base-200' : ''} hover:[&>td]:[background-color:color-mix(in_oklab,var(--color-base-content)_3%,var(--color-base-100))] ${striped ? 'even:hover:[&>td]:[background-color:color-mix(in_oklab,var(--color-base-content)_3%,var(--color-base-200))]' : ''} last:border-b-0`
      : `border-b border-base-content/5 [&>td]:bg-base-100 ${striped ? 'even:[&>td]:bg-base-200' : ''} last:border-b-0`,
  )

  /** 承载横向滚动的容器；固定操作列只在此容器中可能遮挡其他列。 */
  let scrollContainer = $state<HTMLDivElement>()
  /** 表格尺寸变化时需重新判断固定操作列是否已脱离其自然位置。 */
  let tableElement = $state<HTMLTableElement>()
  /** 仅在固定操作列覆盖滚动内容时显示其左侧分隔阴影。 */
  let showActionColumnShadow = $state(false)

  /**
   * 固定列在滚动起点和终点都处于自然位置，不应产生视觉分割；
   * 仅在横向滚动的中间区间覆盖其他列时才显示阴影，避免静态表格多出竖线。
   */
  function syncActionColumnShadow() {
    if (!scrollContainer || !actions) {
      showActionColumnShadow = false
      return
    }

    const maxScrollLeft = scrollContainer.scrollWidth - scrollContainer.clientWidth
    showActionColumnShadow = scrollContainer.scrollLeft > 1 && scrollContainer.scrollLeft < maxScrollLeft - 1
  }

  $effect(() => {
    if (!scrollContainer || !tableElement || !actions) {
      showActionColumnShadow = false
      return
    }

    syncActionColumnShadow()
    const resizeObserver = new ResizeObserver(syncActionColumnShadow)
    resizeObserver.observe(scrollContainer)
    resizeObserver.observe(tableElement)

    return () => resizeObserver.disconnect()
  })

  /**
   * 操作列严格按按钮内容的 max-content 宽度计算，不在少列时预留无效空白。
   * 内容过宽时由表格外层已有的横向滚动容器承接，避免浏览器压缩或裁剪操作按钮。
   */
  const actionColumnClass = $derived(
    `sticky right-0 z-10 w-max whitespace-nowrap text-center font-medium ${showActionColumnShadow ? 'shadow-[-1px_0_0_color-mix(in_srgb,var(--color-base-content)_10%,transparent)]' : ''}`,
  )
  /** 操作列表头复用统一分隔线，并保持不透明背景以遮挡横向滚动内容。 */
  const actionHeaderClass = $derived(`${actionColumnClass} ${headerCellDividerClass} bg-base-100`)
  /** 数据操作格的背景由 rowClass 统一下发，确保默认、斑马纹和 hover 状态一致且不透明。 */
  const actionCellClass = $derived(actionColumnClass)
  /** 操作按钮保持单行的固有宽度，既不强制填满单元格，也不会被其它列挤压。 */
  const actionWrapClass = $derived(density === 'compact' ? 'inline-flex flex-nowrap items-center justify-center gap-0.5' : 'inline-flex flex-nowrap items-center justify-center gap-1')
  /** 加载和空数据占位单元格样式。 */
  const placeholderCellClass = $derived(density === 'compact' ? 'text-center py-6 text-base-content/40' : 'text-center py-8 text-base-content/40')
  /** 未声明宽度的文本列最多占用的空间，保留其他列与操作列的可见区域。 */
  const defaultContentMaxWidth = 'min(24rem, 40vw)'

  /** 解析单元格值并应用自定义渲染、空值和时间戳格式化。 */
  function getValue(item: T, col: Column): string {
    if (col.render) {
      return col.render(item)
    }
    /** 当前列的原始字段值。 */
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

  /** 将列对齐配置转换为 Tailwind 文本对齐类。 */
  function getAlignClass(align?: string): string {
    switch (align) {
      case 'center': return 'text-center'
      case 'right': return 'text-right'
      default: return 'text-left'
    }
  }

  /**
   * 为每列提供可压缩的优先宽度与下限。
   * 显式宽度是调用方的布局契约，允许小于默认列宽；未设置宽度的列才保留 7rem 下限。
   */
  function getColumnStyle(col: Column): string {
    if (!col.width) {
      return 'width: auto; min-width: 7rem;'
    }

    /** 显式宽度仍受视口约束，同时通过 max-width 防止表格自动布局重新撑宽该列。 */
    const boundedWidth = `min(${col.width}, 20vw)`
    return `width: ${boundedWidth}; min-width: 0; max-width: ${boundedWidth};`
  }

  /**
   * 限制表头和默认单元格内容的实际可用宽度。
   * 仅给 th 设置 width 会被 table-auto 的内容尺寸重新撑开，必须同时限制 td 内的内容盒子。
   */
  function getContentStyle(col: Column): string {
    const maxWidth = col.width ? `min(${col.width}, 20vw)` : defaultContentMaxWidth
    return `max-width: ${maxWidth};`
  }
</script>

<div {...dataAttributes} bind:this={scrollContainer} class='overflow-x-auto {className}' onscroll={syncActionColumnShadow}>
  <table bind:this={tableElement} class={tableClass}>
    <thead>
      <tr class={headerRowClass}>
        {#each columns as col (String(col.key))}
          {@const isSorted = activeSortKey === String(col.key)}
          <th
            style={getColumnStyle(col)}
            class='{getAlignClass(col.align)} {headerCellDividerClass} relative font-medium'
          >
            {#if col.sortable}
              <button
                type='button'
                class='group inline-flex max-w-full min-w-0 select-none items-center gap-1 rounded-md px-1.5 py-0.5 -mx-1.5 font-medium transition-colors hover:bg-base-content/5 {isSorted ? 'text-base-content' : ''}'
                style={getContentStyle(col)}
                onclick={() => toggleSort(col)}
              >
                <span class='min-w-0 truncate'>{col.label}</span>
                {#if isSorted && activeSortDir === 'asc'}
                  <span class='icon-[tabler--arrow-narrow-up] size-3.5 text-base-content/70'></span>
                {:else if isSorted && activeSortDir === 'desc'}
                  <span class='icon-[tabler--arrow-narrow-down] size-3.5 text-base-content/70'></span>
                {:else}
                  <span class='icon-[tabler--arrows-sort] size-3.5 text-base-content/30 group-hover:text-base-content/50'></span>
                {/if}
              </button>
            {:else}
              <div class='block min-w-0 truncate' style={getContentStyle(col)} title={col.label}>{col.label}</div>
            {/if}
          </th>
        {/each}
        {#if actions}
          <th class='{actionHeaderClass} z-20'>{uiM('data_table_actions')}</th>
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
          <tr class='{rowClass} {onrowclick ? 'cursor-pointer' : ''}' onclick={() => onrowclick?.(item)}>
            {#each columns as col (String(col.key))}
              <td style={getColumnStyle(col)} class={getAlignClass(col.align)}>
                {#if col.onclick}
                  <button
                    type='button'
                    class='block min-w-0 max-w-full cursor-pointer rounded-sm text-inherit hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
                    style={getContentStyle(col)}
                    onclick={(event) => {
                      event.stopPropagation()
                      col.onclick?.(item)
                    }}
                  >
                    {#if cell}
                      {@render cell(item, String(col.key))}
                    {:else}
                      <span class='block min-w-0 truncate' title={getValue(item, col)}>{getValue(item, col)}</span>
                    {/if}
                  </button>
                {:else if cell}
                  <div class='min-w-0' style={getContentStyle(col)}>
                    {@render cell(item, String(col.key))}
                  </div>
                {:else}
                  <div class='block min-w-0 truncate' style={getContentStyle(col)} title={getValue(item, col)}>{getValue(item, col)}</div>
                {/if}
              </td>
            {/each}
            {#if actions}
              <td class={actionCellClass}>
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

<style>
  /* 表头层级必须高于固定操作数据格，避免纵向滚动时操作按钮覆盖表头。 */
  thead {
    position: sticky;
    top: 0;
    z-index: 20;
    background: var(--color-base-100);
  }
</style>
