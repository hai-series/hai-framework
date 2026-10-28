<!--
  @component CrudFilterBar
  CRUD 复用统一列表查询栏；草稿更新不自动请求，查询和重置始终可用。
  @example
  ```ts
  import type { ComponentProps } from 'svelte'
  import { CrudFilterBar } from '@h-ai/ui'
  const props: ComponentProps<typeof CrudFilterBar> = { searchValue: 'Ada' }
  ```
-->
<script lang='ts'>
  import type { ComponentProps, Snippet } from 'svelte'
  import TableToolbar from '../../compounds/TableToolbar.svelte'

  let {
    searchValue = $bindable(''),
    filterValues = $bindable<Record<string, unknown>>({}),
    expanded = $bindable(false),
    actions,
    onreset,
    ...restProps
  }: Omit<ComponentProps<typeof TableToolbar>, 'leading' | 'children' | 'onclearfilters' | 'viewMode' | 'showViewSwitch' | 'primaryActionLabel' | 'onPrimaryAction' | 'onviewmodechange'> & {
    actions?: Snippet
    onreset?: () => void
  } = $props()
</script>

<TableToolbar {...restProps} bind:searchValue bind:filterValues bind:expanded onclearfilters={onreset} children={actions} />
