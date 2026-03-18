<!--
  @component CrudPage
  通用 CRUD 页面组件

  基于声明式资源定义，自动生成列表 + 搜索过滤 + 分页 + 详情抽屉 + 编辑/新建抽屉 + 删除确认。

  使用 Svelte 5 Runes ($props, $state, $derived, $effect)
  使用 compounds 组件：Card, DataTable, PageHeader, Pagination, Drawer

  @example
  <CrudPage crud={userCrud} data={data} permissions={{ create: true, update: true, delete: true }} />
-->
<script lang='ts'>
  import type { Snippet } from 'svelte'
  import type { Size } from '../../../types.js'
  import { goto, invalidateAll } from '$app/navigation'
  import { page } from '$app/state'
  import { uiM } from '../../../messages.js'
  import Card from '../../compounds/Card.svelte'
  import DataTable from '../../compounds/DataTable.svelte'
  import PageHeader from '../../compounds/PageHeader.svelte'
  import Pagination from '../../compounds/Pagination.svelte'
  import Button from '../../primitives/Button.svelte'
  import IconButton from '../../primitives/IconButton.svelte'
  import CrudDeleteConfirm from './CrudDeleteConfirm.svelte'
  import CrudDetailDrawer from './CrudDetailDrawer.svelte'
  import CrudEditDrawer from './CrudEditDrawer.svelte'
  import CrudFilterBar from './CrudFilterBar.svelte'

  // ─── 类型定义 ───

  type FieldDef = {
    id: string
    label: string | (() => string)
    type: string
    inList?: boolean
    filterable?: boolean
    readonly?: boolean
    inCreate?: boolean
    inEdit?: boolean
    inDetail?: boolean
    options?: Array<{ label: string, value: string | number | boolean }> | (() => Array<{ label: string, value: string | number | boolean }>)
    validation?: { required?: boolean, min?: number, max?: number, pattern?: string, message?: string }
    width?: string
    align?: 'left' | 'center' | 'right'
    render?: (value: unknown, item: Record<string, unknown>) => string
    placeholder?: string | (() => string)
    defaultValue?: unknown
    order?: number
  }

  type AnyApiFunc = (...args: unknown[]) => Promise<Record<string, unknown> | unknown> | Record<string, unknown> | unknown

  type CrudDef = {
    resource: {
      name: string
      label: string | (() => string)
      keyField?: string
      fields: FieldDef[]
      defaultPageSize?: number
      searchable?: boolean
      searchPlaceholder?: string | (() => string)
      api: {
        list: AnyApiFunc
        get?: AnyApiFunc
        create?: AnyApiFunc
        update?: AnyApiFunc
        remove?: AnyApiFunc
      }
    }
    getListFields: () => FieldDef[]
    getFilterFields: () => FieldDef[]
    getCreateFields: () => FieldDef[]
    getEditFields: () => FieldDef[]
    getDetailFields: () => FieldDef[]
    toTableColumns: () => Array<{ key: string, label: string, width?: string, align?: string, render?: (item: Record<string, unknown>) => string }>
    getDefaultValues: () => Record<string, unknown>
    api: {
      list: AnyApiFunc
      get?: AnyApiFunc
      create?: AnyApiFunc
      update?: AnyApiFunc
      remove?: AnyApiFunc
    }
  }

  // ─── Props ───

  const {
    crud,
    data,
    permissions = {},
    drawerSize = '2xl' as Size,
    rowClickDetail = true,
    listItemActions,
    editFormExtra,
    detailExtra,
    headerActions,
    onbeforedelete,
    onaftersubmit,
    onafterdelete,
    onerror,
    basePath = '',
    class: className = '',
  }: {
    crud: CrudDef
    data: { items: Record<string, unknown>[], total: number, page: number, pageSize: number, filters?: Record<string, unknown> }
    permissions?: { create?: boolean, update?: boolean, delete?: boolean }
    drawerSize?: Size
    rowClickDetail?: boolean
    listItemActions?: Snippet<[Record<string, unknown>]>
    editFormExtra?: Snippet<[Record<string, unknown> | null, 'create' | 'edit']>
    detailExtra?: Snippet<[Record<string, unknown>]>
    headerActions?: Snippet
    onbeforedelete?: (item: Record<string, unknown>) => Promise<boolean> | boolean
    onaftersubmit?: (item: Record<string, unknown>, mode: 'create' | 'edit') => void
    onafterdelete?: (item: Record<string, unknown>) => void
    onerror?: (error: string) => void
    basePath?: string
    class?: string
  } = $props()

  // ─── 状态 ───

  const keyField = $derived(crud.resource.keyField ?? 'id')
  const resourceLabel = $derived(resolveText(crud.resource.label))
  const canCreate = $derived(permissions.create !== false && Boolean(crud.api.create))
  const canUpdate = $derived(permissions.update !== false && Boolean(crud.api.update))
  const canDelete = $derived(permissions.delete !== false && Boolean(crud.api.remove))
  const searchable = $derived(crud.resource.searchable !== false)

  // 视图状态
  let drawerMode = $state<'detail' | 'edit' | 'create' | null>(null)
  let selectedItem = $state<Record<string, unknown> | null>(null)
  let formData = $state<Record<string, unknown>>({})
  let submitting = $state(false)
  let formError = $state('')
  let deleteConfirmOpen = $state(false)
  let deletingItem = $state<Record<string, unknown> | null>(null)
  let deleting = $state(false)

  // 过滤状态
  let searchValue = $state('')
  let filterValues = $state<Record<string, unknown>>({})

  // 基础路径
  const currentBasePath = $derived(basePath || page.url.pathname)

  // ─── 工具函数 ───

  function resolveText(text: string | (() => string)): string {
    return typeof text === 'function' ? text() : text
  }

  // 同步 data.filters → 本地过滤状态
  $effect(() => {
    if (data.filters) {
      searchValue = String(data.filters.search ?? '')
      const fv: Record<string, unknown> = {}
      for (const f of crud.getFilterFields()) {
        if (data.filters[f.id] !== undefined) {
          fv[f.id] = data.filters[f.id]
        }
      }
      filterValues = fv
    }
  })

  // ─── 表格列 ───

  const tableColumns = $derived(crud.toTableColumns())

  // ─── 导航 ───

  function navigateWithParams(overrides: Record<string, string | number>) {
    const params = new URLSearchParams()
    const merged: Record<string, string | number> = {
      search: searchValue,
      page: data.page,
      pageSize: data.pageSize,
      ...Object.fromEntries(
        Object.entries(filterValues)
          .filter(([, v]) => v !== undefined && v !== '')
          .map(([k, v]) => [k, String(v)]),
      ),
      ...overrides,
    }

    for (const [key, val] of Object.entries(merged)) {
      const strVal = String(val)
      if (strVal && strVal !== '' && !(key === 'page' && strVal === '1') && !(key === 'pageSize' && strVal === String(crud.resource.defaultPageSize ?? 20))) {
        params.set(key, strVal)
      }
    }

    const qs = params.toString()
    goto(`${currentBasePath}${qs ? `?${qs}` : ''}`, { invalidateAll: true })
  }

  function handleSearch(search: string) {
    navigateWithParams({ search, page: 1 })
  }

  function handleFilterChange(filters: Record<string, unknown>) {
    const overrides: Record<string, string | number> = { page: 1 }
    for (const [k, v] of Object.entries(filters)) {
      overrides[k] = String(v ?? '')
    }
    navigateWithParams(overrides)
  }

  function handlePageChange(newPage: number) {
    navigateWithParams({ page: newPage })
  }

  // ─── 打开/关闭抽屉 ───

  function openDetail(item: Record<string, unknown>) {
    selectedItem = item
    drawerMode = 'detail'
  }

  function openCreate() {
    selectedItem = null
    formData = { ...crud.getDefaultValues() }
    formError = ''
    drawerMode = 'create'
  }

  function openEdit(item: Record<string, unknown>) {
    selectedItem = item
    formData = { ...item }
    formError = ''
    drawerMode = 'edit'
  }

  function closeDrawer() {
    drawerMode = null
    selectedItem = null
    formError = ''
  }

  function switchToEdit() {
    if (selectedItem) {
      openEdit(selectedItem)
    }
  }

  // ─── 提交 ───

  async function handleSubmit(submitData: Record<string, unknown>) {
    formError = ''
    submitting = true

    try {
      if (drawerMode === 'create' && crud.api.create) {
        const result = await crud.api.create(submitData)
        closeDrawer()
        onaftersubmit?.(result, 'create')
        await invalidateAll()
      }
      else if (drawerMode === 'edit' && crud.api.update && selectedItem) {
        const id = String(selectedItem[keyField])
        const result = await crud.api.update(id, submitData)
        closeDrawer()
        onaftersubmit?.(result, 'edit')
        await invalidateAll()
      }
    }
    catch (e) {
      const msg = e instanceof Error ? e.message : uiM('crud_submit_failed')
      formError = msg
      onerror?.(msg)
    }
    finally {
      submitting = false
    }
  }

  // ─── 删除 ───

  function requestDelete(item: Record<string, unknown>) {
    deletingItem = item
    deleteConfirmOpen = true
  }

  async function confirmDelete() {
    if (!deletingItem || !crud.api.remove)
      return

    if (onbeforedelete) {
      const proceed = await onbeforedelete(deletingItem)
      if (!proceed) {
        deleteConfirmOpen = false
        deletingItem = null
        return
      }
    }

    deleting = true
    try {
      const id = String(deletingItem[keyField])
      await crud.api.remove(id)
      const deleted = deletingItem
      deleteConfirmOpen = false
      deletingItem = null
      // 如果删除的是当前详情/编辑中的项，关闭抽屉
      if (selectedItem && String(selectedItem[keyField]) === id) {
        closeDrawer()
      }
      onafterdelete?.(deleted)
      await invalidateAll()
    }
    catch (e) {
      const msg = e instanceof Error ? e.message : uiM('crud_delete_failed')
      onerror?.(msg)
    }
    finally {
      deleting = false
    }
  }

  function cancelDelete() {
    deleteConfirmOpen = false
    deletingItem = null
  }

  // 搜索占位符
  const searchPlaceholderText = $derived(
    crud.resource.searchPlaceholder
      ? resolveText(crud.resource.searchPlaceholder)
      : uiM('crud_search_placeholder'),
  )

  // 构建编辑/新建字段
  const createFields = $derived(crud.getCreateFields() as FieldDef[])
  const editFields = $derived(crud.getEditFields() as FieldDef[])
  const detailFields = $derived(crud.getDetailFields() as FieldDef[])
  const filterFields = $derived(crud.getFilterFields() as FieldDef[])

  // 抽屉标题
  const drawerTitle = $derived(
    drawerMode === 'create'
      ? `${uiM('crud_create')}${resourceLabel}`
      : drawerMode === 'edit'
      ? `${uiM('crud_edit')}${resourceLabel}`
      : `${resourceLabel}${uiM('crud_detail')}`,
  )

  // 抽屉 open 状态
  const detailOpen = $derived(drawerMode === 'detail')
  const editOpen = $derived(drawerMode === 'create' || drawerMode === 'edit')

  // 用于 DataTable 的 columns（含自定义渲染）
  const dtColumns = $derived(
    tableColumns.map(col => ({
      key: col.key,
      label: col.label,
      width: col.width,
      align: col.align as 'left' | 'center' | 'right' | undefined,
      render: col.render
        ? (item: Record<string, unknown>) => col.render!(item)
        : undefined,
    })),
  )
</script>

<div class='space-y-4 {className}'>
  <!-- 页面标题 -->
  <PageHeader title={resourceLabel}>
    {#snippet actions()}
      {#if headerActions}
        {@render headerActions()}
      {/if}
      {#if canCreate}
        <Button variant='primary' onclick={openCreate}>
          <span class='icon-[tabler--plus] size-4.5 mr-1'></span>
          {uiM('crud_create')}
        </Button>
      {/if}
    {/snippet}
  </PageHeader>

  <!-- 搜索 + 过滤栏 -->
  {#if searchable || filterFields.length > 0}
    <Card>
      <CrudFilterBar
        {searchable}
        searchPlaceholder={searchPlaceholderText}
        bind:searchValue
        {filterFields}
        bind:filterValues
        total={data.total}
        onsearch={handleSearch}
        onfilterchange={handleFilterChange}
      />
    </Card>
  {/if}

  <!-- 数据列表 -->
  <Card>
    <DataTable
      data={data.items}
      columns={dtColumns}
      keyField={keyField}
      loading={false}
    >
      {#snippet actions(item)}
        {#if rowClickDetail}
          <IconButton
            variant='ghost'
            size='sm'
            ariaLabel={uiM('crud_detail')}
            onclick={() => openDetail(item)}
          >
            <span class='icon-[tabler--eye] size-4'></span>
          </IconButton>
        {/if}
        {#if canUpdate}
          <IconButton
            variant='ghost'
            size='sm'
            ariaLabel={uiM('crud_edit')}
            onclick={() => openEdit(item)}
          >
            <span class='icon-[tabler--edit] size-4'></span>
          </IconButton>
        {/if}
        {#if canDelete}
          <IconButton
            variant='ghost'
            size='sm'
            ariaLabel={uiM('crud_delete')}
            onclick={() => requestDelete(item)}
            class='hover:text-error'
          >
            <span class='icon-[tabler--trash] size-4'></span>
          </IconButton>
        {/if}
        {#if listItemActions}
          {@render listItemActions(item)}
        {/if}
      {/snippet}
    </DataTable>

    <!-- 分页 -->
    {#if data.total > data.pageSize}
      <div class='flex justify-center p-4 border-t border-base-content/5'>
        <Pagination
          page={data.page}
          total={data.total}
          pageSize={data.pageSize}
          size='sm'
          showTotal
          onchange={handlePageChange}
        />
      </div>
    {/if}
  </Card>
</div>

<!-- 详情抽屉 -->
<CrudDetailDrawer
  open={detailOpen}
  item={selectedItem}
  fields={detailFields}
  title={drawerTitle}
  size={drawerSize}
  canEdit={canUpdate}
  onedit={switchToEdit}
  onclose={closeDrawer}
  {detailExtra}
/>

<!-- 编辑/新建抽屉 -->
<CrudEditDrawer
  open={editOpen}
  mode={drawerMode === 'create' ? 'create' : 'edit'}
  fields={drawerMode === 'create' ? createFields : editFields}
  bind:formData
  title={drawerTitle}
  size={drawerSize}
  {submitting}
  error={formError}
  onsubmit={handleSubmit}
  onclose={closeDrawer}
  {editFormExtra}
  editingItem={selectedItem}
/>

<!-- 删除确认对话框 -->
<CrudDeleteConfirm
  bind:open={deleteConfirmOpen}
  loading={deleting}
  onconfirm={confirmDelete}
  oncancel={cancelDelete}
/>
