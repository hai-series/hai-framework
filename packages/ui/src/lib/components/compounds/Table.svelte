<!--
  =============================================================================
  @h-ai/ui - Table 组件
  =============================================================================
  表格组件
  
  使用 Svelte 5 Runes ($props, $derived)
  =============================================================================
-->
<script lang="ts" generics="T = Record<string, unknown>">
  import type { TableProps } from '../../types.js'
  import { cn } from '../../utils.js'
  
  let {
    data,
    columns,
    bordered = false,
    striped = false,
    hoverable = true,
    compact = false,
    loading = false,
    class: className = '',
  }: TableProps<T> = $props()
  
  const tableClass = $derived(
    cn(
      'table',
      striped && 'table-zebra',
      compact && 'table-xs',
      className,
    )
  )
  
  const wrapperClass = $derived(
    cn(
      'overflow-x-auto',
      bordered && 'border border-base-300 rounded-lg',
    )
  )
  
  // 获取单元格值
  function getCellValue(row: T, column: { key: string; render?: (row: T, index: number) => string }, index: number): string {
    if (column.render) {
      return column.render(row, index)
    }
    const value = (row as Record<string, unknown>)[column.key]
    return String(value ?? '')
  }
  
  // 获取对齐类名
  function getAlignClass(align?: 'start' | 'center' | 'end'): string {
    switch (align) {
      case 'center': return 'text-center'
      case 'end': return 'text-right'
      default: return 'text-left'
    }
  }
</script>

<div class={wrapperClass}>
  {#if loading}
    <div class="flex items-center justify-center py-8">
      <span class="loading loading-spinner loading-lg"></span>
    </div>
  {:else}
    <table class={tableClass}>
      <thead>
        <tr>
          {#each columns as column}
            <th
              class={getAlignClass(column.align)}
              style:width={typeof column.width === 'number' ? `${column.width}px` : column.width}
            >
              {column.title}
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each data as row, rowIndex}
          <tr class:hover={hoverable}>
            {#each columns as column}
              <td class={getAlignClass(column.align)}>
                {getCellValue(row, column, rowIndex)}
              </td>
            {/each}
          </tr>
        {:else}
          <tr>
            <td colspan={columns.length} class="text-center py-8 text-base-content/50">
              暂无数据
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>
