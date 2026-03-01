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
  import { m } from '../../messages.js'

  let {
    data,
    columns,
    keyField,
    actions,
    empty,
    loading = false,
    striped = true,
    hoverable = true,
    class: className = '',
  }: {
    data: T[]
    columns: { key: keyof T | string; label: string; width?: string; align?: 'left' | 'center' | 'right'; render?: (item: T) => string }[]
    keyField: keyof T
    actions?: Snippet<[T]>
    empty?: Snippet
    loading?: boolean
    striped?: boolean
    hoverable?: boolean
    class?: string
  } = $props()

  type Column = { key: keyof T | string; label: string; width?: string; align?: 'left' | 'center' | 'right'; render?: (item: T) => string }

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

<div class='overflow-x-auto {className}'>
  <table class='table w-full text-[13px]' class:table-zebra={striped}>
    <thead>
      <tr class='text-xs text-base-content/50 border-b border-base-content/6'>
        {#each columns as col}
          <th 
            style={col.width ? `width: ${col.width}` : ''}
            class="{getAlignClass(col.align)} font-medium"
          >
            {col.label}
          </th>
        {/each}
        {#if actions}
          <th class='w-24 text-center font-medium'>{m('data_table_actions')}</th>
        {/if}
      </tr>
    </thead>
    <tbody>
      {#if loading}
        <tr>
          <td colspan={columns.length + (actions ? 1 : 0)} class='text-center py-8'>
            <span class='loading loading-spinner loading-sm'></span>
          </td>
        </tr>
      {:else if data.length === 0}
        <tr>
          <td colspan={columns.length + (actions ? 1 : 0)} class='text-center py-8 text-base-content/40'>
            {#if empty}
              {@render empty()}
            {:else}
              {m('data_table_empty')}
            {/if}
          </td>
        </tr>
      {:else}
        {#each data as item (item[keyField])}
          <tr class={hoverable ? 'hover:bg-base-content/3 transition-colors' : ''}>
            {#each columns as col}
              <td class={getAlignClass(col.align)}>{getValue(item, col)}</td>
            {/each}
            {#if actions}
              <td>
                <div class='flex items-center justify-center gap-1'>
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
