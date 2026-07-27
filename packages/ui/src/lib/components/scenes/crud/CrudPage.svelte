<!--
  @component CrudPage
  通用 CRUD 页面组件

  基于声明式资源定义，自动生成列表 + 搜索过滤 + 分页 + 详情查看 + 编辑/新建面板 + 删除确认。

  使用 Svelte 5 Runes ($props, $state, $derived, $effect)
  使用 compounds 组件：Card, DataTable, PageHeader, Pagination, Drawer, Modal

  @example
  <CrudPage crud={userCrud} data={data} permissions={{ create: true, update: true, delete: true }} />
-->
<script lang='ts'>
  import type { Snippet } from 'svelte'
  import type { DataAttributes } from '../../../types.js'
  import type { CrudDensity, CrudFormConfig, CrudPaginationConfig, CrudToolbarStyle } from './crud-types.js'
  import type { NavAdapter } from './nav-adapter.js'
  import { SvelteURLSearchParams } from 'svelte/reactivity'
  import { uiM } from '../../../messages.js'
  import { getDataAttributes } from '../../../utils.js'
  import Card from '../../compounds/Card.svelte'
  import DataTable from '../../compounds/DataTable.svelte'
  import PageHeader from '../../compounds/PageHeader.svelte'
  import Pagination from '../../compounds/Pagination.svelte'
  import TableToolbar from '../../compounds/TableToolbar.svelte'
  import Button from '../../primitives/Button.svelte'
  import IconButton from '../../primitives/IconButton.svelte'
  import CrudDeleteConfirm from './CrudDeleteConfirm.svelte'
  import CrudDetailPanel from './CrudDetailPanel.svelte'
  import CrudEditPanel from './CrudEditPanel.svelte'
  import CrudFilterBar from './CrudFilterBar.svelte'
  import { createBrowserNavAdapter } from './nav-adapter.js'

  // ─── 类型定义 ───

  /** CRUD 字段定义，决定列表、筛选器和表单的字段行为。 */
  type FieldDef = {
    /** 字段稳定标识，同时对应数据记录中的属性名。 */
    id: string
    /** 字段显示文案，允许通过函数延迟读取当前语言。 */
    label: string | (() => string)
    /** 字段控件类型，最终由表单或筛选器解释。 */
    type: string
    /** 是否出现在列表中；未设置时默认显示。 */
    inList?: boolean
    /** 是否出现在筛选器中；只有显式为 true 时显示。 */
    filterable?: boolean
    /** 编辑时是否禁止修改。 */
    readonly?: boolean
    /** 是否出现在新建表单中；未设置时默认显示。 */
    inCreate?: boolean
    /** 是否出现在编辑表单中；未设置时默认显示。 */
    inEdit?: boolean
    /** 是否出现在详情面板中；未设置时默认显示。 */
    inDetail?: boolean
    /** 选择类字段的静态选项或动态选项工厂。 */
    options?: Array<{ label: string, value: string | number | boolean }> | (() => Array<{ label: string, value: string | number | boolean }>)
    /** 表单校验规则。 */
    validation?: { required?: boolean, min?: number, max?: number, pattern?: string, message?: string }
    /** 列宽 CSS 值。 */
    width?: string
    /** 单元格对齐方式。 */
    align?: 'left' | 'center' | 'right'
    /** 列表单元格的自定义渲染函数。 */
    render?: (value: unknown, item: Record<string, unknown>) => string
    /** 输入控件占位文案。 */
    placeholder?: string | (() => string)
    /** 日期范围起始值 key。 */
    startKey?: string
    /** 日期范围结束值 key。 */
    endKey?: string
    /** 新建记录时使用的默认值。 */
    defaultValue?: unknown
    /** 字段排序权重，数值越小越靠前。 */
    order?: number
  }

  // 使用 method shorthand 语法（双向协变）以兼容来自 @h-ai/kit 的 CrudOperations 类型
  // 详见：https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-6.html#strict-function-types
  /** CrudPage 使用的异步资源操作集合。 */
  type CrudApi = {
    /** 获取当前分页、筛选和排序结果。 */
    list(params: Record<string, unknown>): Promise<{ items: Record<string, unknown>[], total: number, page: number, pageSize: number }>
    /** 按主键获取一条记录。 */
    get?(id: string): Promise<Record<string, unknown> | null>
    /** 创建一条记录。 */
    create?(data: Record<string, unknown>): Promise<Record<string, unknown>>
    /** 更新一条记录。 */
    update?(id: string, data: Record<string, unknown>): Promise<Record<string, unknown>>
    /** 删除一条记录。 */
    remove?(id: string): Promise<void>
  }

  /** 声明式 CRUD 资源及字段转换能力。 */
  type CrudDef = {
    /** 资源元信息与后端 API。 */
    resource: {
      /** 资源名称，用于识别当前业务实体。 */
      name: string
      /** 资源标题文案。 */
      label: string | (() => string)
      /** 记录主键字段，默认使用 id。 */
      keyField?: string
      /** 资源字段定义。 */
      fields: FieldDef[]
      /** 默认分页条数。 */
      defaultPageSize?: number
      /** 是否显示搜索框。 */
      searchable?: boolean
      /** 搜索框占位文案。 */
      searchPlaceholder?: string | (() => string)
      /** 资源 CRUD API。 */
      api: CrudApi
    }
    /** 获取列表字段。 */
    getListFields: () => FieldDef[]
    /** 获取筛选字段。 */
    getFilterFields: () => FieldDef[]
    /** 获取新建字段。 */
    getCreateFields: () => FieldDef[]
    /** 获取编辑字段。 */
    getEditFields: () => FieldDef[]
    /** 获取详情字段。 */
    getDetailFields: () => FieldDef[]
    /** 转换为 DataTable 列定义。 */
    toTableColumns: () => Array<{ key: string, label: string, width?: string, align?: string, render?: (item: Record<string, unknown>) => string }>
    /** 生成新建表单默认值。 */
    getDefaultValues: () => Record<string, unknown>
    /** API 操作代理。 */
    api: CrudApi
  }

  // ─── Props ───

  const {
    crud,
    data,
    permissions = {},
    form = {},
    pagination = {},
    density = 'normal',
    rowClickDetail = true,
    showHeader = true,
    listItemActions,
    tableCell,
    onrowclick,
    editFormExtra,
    detailExtra,
    headerActions,
    toolbarStyle = 'toolbar',
    toolbarLeading,
    toolbarActions,
    card,
    sortableColumns = [],
    onbeforedelete,
    onaftersubmit,
    onafterdelete,
    onerror,
    basePath = '',
    nav = createBrowserNavAdapter(),
    class: className = '',
    ...restProps
  }: {
    /** CRUD 资源定义及其 API 操作。 */
    crud: CrudDef
    /** 当前页数据与服务端分页元数据。 */
    data: { items: Record<string, unknown>[], total: number, page: number, pageSize: number, filters?: Record<string, unknown> }
    /** 新建、编辑、删除权限；未设置的权限默认跟随 API 是否存在。 */
    permissions?: { create?: boolean, update?: boolean, delete?: boolean }
    /** 新建/编辑面板展示配置。 */
    form?: CrudFormConfig
    /** 分页栏展示配置。 */
    pagination?: CrudPaginationConfig
    /** 列表密度，影响行高、操作按钮和面板控件尺寸。 */
    density?: CrudDensity
    /** 点击详情图标是否打开详情面板。 */
    rowClickDetail?: boolean
    /** 是否显示默认页面标题栏；使用 toolbarLeading 承载标题时可设为 false。 */
    showHeader?: boolean
    /** 每行额外操作按钮插槽。 */
    listItemActions?: Snippet<[Record<string, unknown>]>
    /** 自定义表格单元格；参数依次为行记录和列 key。 */
    tableCell?: Snippet<[Record<string, unknown>, string]>
    /** 点击表格行时的回调。 */
    onrowclick?: (item: Record<string, unknown>) => void
    /** 编辑表单额外字段插槽。 */
    editFormExtra?: Snippet<[Record<string, unknown> | null, 'create' | 'edit']>
    /** 详情面板额外内容插槽。 */
    detailExtra?: Snippet<[Record<string, unknown>]>
    /** 页面标题右侧额外操作插槽。 */
    headerActions?: Snippet
    /** 工具栏风格：`toolbar` 使用图标弹层工具栏（默认），`filter-bar` 使用平铺筛选栏。 */
    toolbarStyle?: CrudToolbarStyle
    /** toolbar 风格下工具栏左侧内容插槽，可用于放置页面标题或说明。 */
    toolbarLeading?: Snippet
    /** TableToolbar 风格下工具栏右侧自定义操作插槽。 */
    toolbarActions?: Snippet
    /** 卡片列表项渲染插槽；存在时替代 DataTable，仍复用工具栏、分页和独立滚动容器。 */
    card?: Snippet<[Record<string, unknown>]>
    /** 可排序列配置；为空时默认使用全部列表列。 */
    sortableColumns?: Array<{ key: string, label: string }>
    /** 删除前钩子，返回 false 时取消删除。 */
    onbeforedelete?: (item: Record<string, unknown>) => Promise<boolean> | boolean
    /** 新建或编辑成功后的回调。 */
    onaftersubmit?: (item: Record<string, unknown>, mode: 'create' | 'edit') => void
    /** 删除成功后的回调。 */
    onafterdelete?: (item: Record<string, unknown>) => void
    /** 自定义错误回调。 */
    onerror?: (error: string) => void
    /** 列表路由基础路径。 */
    basePath?: string
    /**
     * 路由适配器：用于读取当前 pathname、同步过滤参数到 URL、列表刷新。
     * 默认使用 `createBrowserNavAdapter()`（基于 `globalThis.location`）。
     * SvelteKit 应用应传入 `createSvelteKitNavAdapter()`（来自 `@h-ai/kit/client`），
     * 以获得客户端跳转 + invalidateAll 体验。
     */
    nav?: NavAdapter
    /** 根节点自定义 class。 */
    class?: string
  } & DataAttributes = $props()

  /** 透传到根节点的 data-* 属性。 */
  const dataAttributes = $derived(getDataAttributes(restProps))
  // ─── 状态 ───

  /** 表格行的主键字段。 */
  const keyField = $derived(crud.resource.keyField ?? 'id')
  /** 当前资源的本地化标题。 */
  const resourceLabel = $derived(resolveText(crud.resource.label))
  /** 根据权限和 API 能力判断是否显示新建入口。 */
  const canCreate = $derived(permissions.create !== false && Boolean(crud.api.create))
  /** 根据权限和 API 能力判断是否显示编辑入口。 */
  const canUpdate = $derived(permissions.update !== false && Boolean(crud.api.update))
  /** 根据权限和 API 能力判断是否显示删除入口。 */
  const canDelete = $derived(permissions.delete !== false && Boolean(crud.api.remove))
  /** 当前资源是否支持关键字搜索。 */
  const searchable = $derived(crud.resource.searchable !== false)
  /** 是否使用紧凑列表密度。 */
  const isCompact = $derived(density === 'compact')
  /** 页面主体垂直间距；列表卡片会占满其余可用高度。 */
  const pageGapClass = 'flex min-h-0 h-full flex-col gap-5'
  /** 行内操作按钮尺寸。 */
  const actionButtonSize = $derived(isCompact ? 'xs' : 'sm')
  /** 行内操作图标尺寸。 */
  const actionIconClass = $derived(isCompact ? 'size-3.5' : 'size-4')
  /** 分页组件尺寸。 */
  const paginationSize = $derived(isCompact ? 'xs' : 'sm')
  /**
   * 列表承载容器样式；表格模式使用有边框的 Card，卡片模式移除该外壳以保留业务卡片的原始视觉层级。
   * 两种模式均保留 flex 约束，避免数据区把底部分页推出父容器。
   */
  const listCardClass = $derived(
    card
      ? 'flex min-h-0 flex-1 flex-col overflow-hidden !rounded-none !border-0 !bg-transparent !shadow-none [&>.card-body]:min-h-0 [&>.card-body]:flex-1'
      : 'flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.25rem] border-base-content/7 shadow-sm [&>.card-body]:min-h-0 [&>.card-body]:flex-1',
  )
  /** 分页栏样式；shrink-0 保证它始终贴在卡片底部。 */
  const paginationBarClass = 'shrink-0 border-t border-base-content/5 px-4 py-3'

  // 表单展示配置（抽屉 / 弹窗）
  /** 编辑/新建面板类型。 */
  const formVariant = $derived(form.variant ?? 'drawer')
  /** 抽屉尺寸预设。 */
  const formDrawerSize = $derived(form.drawerSize ?? '2xl')
  /** 抽屉自定义宽度。 */
  const formDrawerWidth = $derived(form.drawerWidth)
  /** 弹窗尺寸预设。 */
  const formModalSize = $derived(form.modalSize ?? '2xl')
  /** 弹窗自定义宽度。 */
  const formModalWidth = $derived(form.modalWidth)
  /** 弹窗自定义高度。 */
  const formModalHeight = $derived(form.modalHeight)

  // 分页栏配置
  /** 是否显示每页条数选择器。 */
  const paginationShowSizeChanger = $derived(pagination.showSizeChanger !== false)
  /** 是否显示跳页输入框。 */
  const paginationShowJumper = $derived(pagination.showJumper !== false)
  /** 是否显示记录总数。 */
  const paginationShowTotal = $derived(pagination.showTotal !== false)
  /** 是否显示当前页 / 总页数文案。 */
  const paginationShowPageInfo = $derived(pagination.showPageInfo !== false)
  /** 是否显示首页和末页按钮。 */
  const paginationShowFirstLast = $derived(pagination.showFirstLast !== false)
  /** 每页条数候选项。 */
  const paginationPageSizeOptions = $derived(pagination.pageSizeOptions ?? [10, 20, 50, 100])

  // 视图状态
  /** 当前打开的详情/编辑面板模式。 */
  let panelMode = $state<'detail' | 'edit' | 'create' | null>(null)
  /** 当前选中的列表记录。 */
  let selectedItem = $state<Record<string, unknown> | null>(null)
  /** 编辑面板的草稿数据。 */
  let formData = $state<Record<string, unknown>>({})
  /** 新建或编辑请求是否进行中。 */
  let submitting = $state(false)
  /** 当前表单错误文案。 */
  let formError = $state('')
  /** 删除确认框是否打开。 */
  let deleteConfirmOpen = $state(false)
  /** 等待确认删除的记录。 */
  let deletingItem = $state<Record<string, unknown> | null>(null)
  /** 删除请求是否进行中。 */
  let deleting = $state(false)

  // 过滤状态
  /** 搜索框当前值；提交时才同步到路由。 */
  let searchValue = $state('')
  /** 当前已提交的筛选值。 */
  let filterValues = $state<Record<string, unknown>>({})

  // 排序状态（toolbarStyle='toolbar' 时使用）
  /** 当前服务端排序字段。 */
  let sortBy = $state('')
  /** 当前服务端排序方向。 */
  let sortDirection = $state<'asc' | 'desc'>('desc')

  // 基础路径
  /** 用于生成列表查询 URL 的基础路径。 */
  const currentBasePath = $derived(basePath || nav.pathname)

  // ─── 工具函数 ───

  /** 解析静态或延迟读取的显示文案。 */
  function resolveText(text: string | (() => string)): string {
    return typeof text === 'function' ? text() : text
  }

  // 同步 data.filters → 本地过滤/排序状态；没有 filters 时也要清空旧状态。
  $effect(() => {
    const filters = data.filters ?? {}
    searchValue = String(filters.search ?? '')
    sortBy = String(filters.sortBy ?? '')
    sortDirection = filters.sortDirection === 'asc' ? 'asc' : 'desc'
    const fv: Record<string, unknown> = {}
    for (const f of crud.getFilterFields()) {
      if (filters[f.id] !== undefined) {
        fv[f.id] = filters[f.id]
      }
      if (f.type.trim().toLowerCase() === 'date-range') {
        const startKey = f.startKey ?? `${f.id}Start`
        const endKey = f.endKey ?? `${f.id}End`
        if (filters[startKey] !== undefined)
          fv[startKey] = filters[startKey]
        if (filters[endKey] !== undefined)
          fv[endKey] = filters[endKey]
      }
    }
    filterValues = fv
  })

  // ─── 表格列 ───

  /** 资源定义生成的基础列表列。 */
  const tableColumns = $derived(crud.toTableColumns())
  /** 供排序弹层显示的列；未传时默认允许所有列表列排序。 */
  const effectiveSortableColumns = $derived(
    sortableColumns.length > 0
      ? sortableColumns
      : tableColumns.map(column => ({ key: column.key, label: column.label })),
  )

  // ─── 导航 ───

  /** 合并搜索、筛选、排序和分页状态，并交给宿主导航器刷新列表。 */
  function navigateWithParams(overrides: Record<string, string | number>) {
    /** 只包含有效值的查询参数容器。 */
    const params = new SvelteURLSearchParams()
    /** 当前状态与本次覆盖值合并后的完整查询对象。 */
    const merged: Record<string, string | number> = {
      search: searchValue,
      page: data.page,
      pageSize: data.pageSize,
      sortBy,
      sortDirection,
      ...Object.fromEntries(
        Object.entries(filterValues)
          .filter(([, v]) => v !== undefined && v !== '')
          .map(([k, v]) => [k, String(v)]),
      ),
      ...overrides,
    }

    for (const [key, val] of Object.entries(merged)) {
      /** 统一转换后的查询值。 */
      const strVal = String(val)
      if (strVal && strVal !== '' && !(key === 'page' && strVal === '1') && !(key === 'pageSize' && strVal === String(crud.resource.defaultPageSize ?? 20))) {
        params.set(key, strVal)
      }
    }

    /** 序列化后的查询字符串。 */
    const qs = params.toString()
    /** 交给宿主路由的目标 URL。 */
    const url = `${currentBasePath}${qs ? `?${qs}` : ''}`
    void Promise.resolve(nav.navigate(url)).then(() => nav.refresh?.())
  }

  /** 提交关键字搜索并回到第一页。 */
  function handleSearch(search: string) {
    navigateWithParams({ search, page: 1 })
  }

  /** 提交筛选条件并回到第一页。 */
  function handleFilterChange(filters: Record<string, unknown>) {
    /** 筛选变化时的 URL 覆盖项。 */
    const overrides: Record<string, string | number> = { page: 1 }
    for (const [k, v] of Object.entries(filters)) {
      overrides[k] = String(v ?? '')
    }
    navigateWithParams(overrides)
  }

  /** 切换页码。 */
  function handlePageChange(newPage: number) {
    navigateWithParams({ page: newPage })
  }

  /** 修改每页条数并回到第一页。 */
  function handlePageSizeChange(newPageSize: number) {
    navigateWithParams({ pageSize: newPageSize, page: 1 })
  }

  /** 清空搜索、筛选、排序并恢复默认分页。 */
  function handleResetFilters() {
    searchValue = ''
    filterValues = {}
    sortBy = ''
    sortDirection = 'desc'
    void Promise.resolve(nav.navigate(currentBasePath)).then(() => nav.refresh?.())
  }

  /** 提交服务端排序条件。 */
  function handleSort(key: string, direction: 'asc' | 'desc') {
    sortBy = key
    sortDirection = direction
    navigateWithParams({ sortBy: key, sortDirection: direction, page: 1 })
  }

  /** 清空服务端排序条件。 */
  function handleClearSort() {
    sortBy = ''
    sortDirection = 'desc'
    navigateWithParams({ sortBy: '', sortDirection: '', page: 1 })
  }

  // ─── 打开/关闭抽屉 ───

  /** 打开记录详情面板。 */
  function openDetail(item: Record<string, unknown>) {
    selectedItem = item
    panelMode = 'detail'
  }

  /** 打开新建面板并填充默认值。 */
  function openCreate() {
    selectedItem = null
    formData = { ...crud.getDefaultValues() }
    formError = ''
    panelMode = 'create'
  }

  /** 打开编辑面板并复制当前记录作为草稿。 */
  function openEdit(item: Record<string, unknown>) {
    selectedItem = item
    formData = { ...item }
    formError = ''
    panelMode = 'edit'
  }

  /** 关闭详情或编辑面板并清理临时状态。 */
  function closePanel() {
    panelMode = null
    selectedItem = null
    formError = ''
  }

  /** 将详情面板切换为当前记录的编辑面板。 */
  function switchToEdit() {
    if (selectedItem) {
      openEdit(selectedItem)
    }
  }

  // ─── 提交 ───

  /** 根据当前面板模式调用新建或更新 API。 */
  async function handleSubmit(submitData: Record<string, unknown>) {
    formError = ''
    submitting = true

    try {
      if (panelMode === 'create' && crud.api.create) {
        /** 创建 API 返回的记录；空返回时传递空对象以保持回调稳定。 */
        const result = await crud.api.create(submitData)
        const submitted = (result ?? {}) as Record<string, unknown>
        closePanel()
        onaftersubmit?.(submitted, 'create')
        await nav.refresh?.()
      }
      else if (panelMode === 'edit' && crud.api.update && selectedItem) {
        /** 当前编辑记录的稳定主键。 */
        const id = String(selectedItem[keyField])
        /** 更新 API 返回的记录。 */
        const result = await crud.api.update(id, submitData)
        const submitted = (result ?? {}) as Record<string, unknown>
        closePanel()
        onaftersubmit?.(submitted, 'edit')
        await nav.refresh?.()
      }
    }
    catch (e) {
      /** 优先展示 API Error 文案，未知异常回退到内置 i18n。 */
      const msg = e instanceof Error ? e.message : uiM('crud_submit_failed')
      formError = msg
      onerror?.(msg)
    }
    finally {
      submitting = false
    }
  }

  // ─── 删除 ───

  /** 打开删除确认框并记录待删除项。 */
  function requestDelete(item: Record<string, unknown>) {
    deletingItem = item
    deleteConfirmOpen = true
  }

  /** 执行删除前钩子、删除请求和刷新流程。 */
  async function confirmDelete() {
    if (!deletingItem || !crud.api.remove)
      return

    if (onbeforedelete) {
      /** 业务删除前钩子的最终决策。 */
      const proceed = await onbeforedelete(deletingItem)
      if (!proceed) {
        deleteConfirmOpen = false
        deletingItem = null
        return
      }
    }

    deleting = true
    try {
      /** 待删除记录的稳定主键。 */
      const id = String(deletingItem[keyField])
      await crud.api.remove(id)
      /** 保留删除成功的记录，供回调在状态清空后使用。 */
      const deleted = deletingItem
      deleteConfirmOpen = false
      deletingItem = null
      // 如果删除的是当前详情/编辑中的项，关闭抽屉
      if (selectedItem && String(selectedItem[keyField]) === id) {
        closePanel()
      }
      onafterdelete?.(deleted)
      await nav.refresh?.()
    }
    catch (e) {
      /** 删除失败提示。 */
      const msg = e instanceof Error ? e.message : uiM('crud_delete_failed')
      onerror?.(msg)
    }
    finally {
      deleting = false
    }
  }

  /** 取消删除并清理确认状态。 */
  function cancelDelete() {
    deleteConfirmOpen = false
    deletingItem = null
  }

  // 搜索占位符
  /** 搜索框最终显示的占位文案。 */
  const searchPlaceholderText = $derived(
    crud.resource.searchPlaceholder
      ? resolveText(crud.resource.searchPlaceholder)
      : uiM('crud_search_placeholder'),
  )

  // 构建编辑/新建字段
  /** 新建面板字段。 */
  const createFields = $derived(crud.getCreateFields() as FieldDef[])
  /** 编辑面板字段。 */
  const editFields = $derived(crud.getEditFields() as FieldDef[])
  /** 详情面板字段。 */
  const detailFields = $derived(crud.getDetailFields() as FieldDef[])
  /** 工具栏筛选字段。 */
  const filterFields = $derived(crud.getFilterFields() as FieldDef[])

  // 抽屉标题
  /** 当前详情/编辑面板标题。 */
  const panelTitle = $derived(
    panelMode === 'create'
      ? `${uiM('crud_create')}${resourceLabel}`
      : panelMode === 'edit'
      ? `${uiM('crud_edit')}${resourceLabel}`
      : `${resourceLabel}${uiM('crud_detail')}`,
  )

  // 面板 open 状态
  /** 详情面板开关。 */
  const detailOpen = $derived(panelMode === 'detail')
  /** 编辑/新建面板开关。 */
  const editOpen = $derived(panelMode === 'create' || panelMode === 'edit')

  // 用于 DataTable 的 columns（含自定义渲染）
  /** DataTable 列定义，补充受控排序所需的列元数据。 */
  const dtColumns = $derived(
    tableColumns.map(col => ({
      key: col.key,
      label: col.label,
      width: col.width,
      align: col.align as 'left' | 'center' | 'right' | undefined,
      sortable: effectiveSortableColumns.some(column => column.key === col.key),
      render: col.render
        ? (item: Record<string, unknown>) => col.render!(item)
        : undefined,
    })),
  )
</script>

<div {...dataAttributes} class='{pageGapClass} {className}'>
  <!-- 页面标题；toolbarLeading 承载标题时由调用方关闭，避免重复占用垂直空间。 -->
  {#if showHeader}
    <PageHeader title={resourceLabel} class='mb-0 shrink-0'>
      {#snippet actions()}
        {#if headerActions}
          {@render headerActions()}
        {/if}
        {#if canCreate && toolbarStyle === 'filter-bar'}
          <Button variant='primary' size='sm' onclick={openCreate} class='shadow-sm'>
            <span class='icon-[tabler--plus] size-4.5 mr-1.5'></span>
            {uiM('crud_create')}
          </Button>
        {/if}
      {/snippet}
    </PageHeader>
  {/if}

  <!-- 搜索 + 过滤栏 -->
  {#if searchable || filterFields.length > 0}
    {#if toolbarStyle === 'toolbar'}
      <TableToolbar
        {searchable}
        searchPlaceholder={searchPlaceholderText}
        searchLabel={searchPlaceholderText}
        bind:searchValue
        {filterFields}
        bind:filterValues
        sortableColumns={effectiveSortableColumns}
        bind:sortBy
        bind:sortDirection
        showViewSwitch={false}
        leading={toolbarLeading}
        primaryActionLabel={canCreate ? uiM('crud_create') : ''}
        onPrimaryAction={canCreate ? openCreate : undefined}
        onsearch={handleSearch}
        onfilterchange={handleFilterChange}
        onclearfilters={handleResetFilters}
        onsort={handleSort}
        onclearsort={handleClearSort}
      >
        {#if toolbarActions}
          {@render toolbarActions()}
        {/if}
      </TableToolbar>
    {:else}
      <CrudFilterBar
        {searchable}
        searchPlaceholder={searchPlaceholderText}
        bind:searchValue
        {filterFields}
        bind:filterValues
        onsearch={handleSearch}
        onfilterchange={handleFilterChange}
        onreset={handleResetFilters}
      />
    {/if}
  {/if}

  <!-- 数据列表 -->
  <Card padding='none' class={listCardClass}>
    {#if card}
      <!-- 卡片视图使用独立滚动容器，分页栏始终保留在容器外。 -->
      <div class='min-h-0 flex-1 overflow-auto'>
        {#if data.items.length > 0}
          <div class='grid min-h-full grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))] content-start gap-3'>
            {#each data.items as item (String(item[keyField]))}
              {@render card(item)}
            {/each}
          </div>
        {:else}
          <div class='flex min-h-full items-center justify-center px-4 text-sm text-base-content/55'>
            {uiM('data_table_empty')}
          </div>
        {/if}
      </div>
    {:else}
      <!-- DataTable 自身同时承接横向和纵向滚动，确保 sticky 表头与数据行共享滚动上下文。 -->
      <DataTable
        data={data.items}
        columns={dtColumns}
        keyField={keyField}
        loading={false}
        sortKey={sortBy || undefined}
        sortDir={sortBy ? sortDirection : null}
        onsort={handleSort}
        class='min-h-0 min-w-0 flex-1 overflow-auto'
        {density}
        cell={tableCell}
        {onrowclick}
      >
        {#snippet actions(item)}
          {#if rowClickDetail}
            <IconButton
              variant='ghost'
              size={actionButtonSize}
              ariaLabel={uiM('crud_detail')}
              onclick={(event) => {
                event.stopPropagation()
                openDetail(item)
              }}
            >
              <span class='icon-[tabler--eye] {actionIconClass}'></span>
            </IconButton>
          {/if}
          {#if canUpdate}
            <IconButton
              variant='ghost'
              size={actionButtonSize}
              ariaLabel={uiM('crud_edit')}
              onclick={(event) => {
                event.stopPropagation()
                openEdit(item)
              }}
            >
              <span class='icon-[tabler--edit] {actionIconClass}'></span>
            </IconButton>
          {/if}
          {#if canDelete}
            <IconButton
              variant='ghost'
              size={actionButtonSize}
              ariaLabel={uiM('crud_delete')}
              onclick={(event) => {
                event.stopPropagation()
                requestDelete(item)
              }}
              class='hover:text-error'
            >
              <span class='icon-[tabler--trash] {actionIconClass}'></span>
            </IconButton>
          {/if}
          {#if listItemActions}
            {@render listItemActions(item)}
          {/if}
        {/snippet}
      </DataTable>
    {/if}

    <!-- 分页栏：始终显示，支持每页条数选择与跳页（shadcn table 风格） -->
    <div class={paginationBarClass}>
      <Pagination
        page={data.page}
        total={data.total}
        pageSize={data.pageSize}
        size={paginationSize}
        showTotal={paginationShowTotal}
        showJumper={paginationShowJumper}
        showSizeChanger={paginationShowSizeChanger}
        showPageInfo={paginationShowPageInfo}
        showFirstLast={paginationShowFirstLast}
        pageSizeOptions={paginationPageSizeOptions}
        onchange={handlePageChange}
        onpagesizechange={handlePageSizeChange}
      />
    </div>
  </Card>
</div>

<!-- 详情：抽屉或弹窗 -->
<CrudDetailPanel
  open={detailOpen}
  item={selectedItem}
  fields={detailFields}
  {density}
  title={panelTitle}
  variant={formVariant}
  size={formDrawerSize}
  drawerWidth={formDrawerWidth}
  modalSize={formModalSize}
  modalWidth={formModalWidth}
  modalHeight={formModalHeight}
  canEdit={canUpdate}
  onedit={switchToEdit}
  onclose={closePanel}
  {detailExtra}
/>

<!-- 编辑/新建：抽屉或弹窗 -->
<CrudEditPanel
  open={editOpen}
  mode={panelMode === 'create' ? 'create' : 'edit'}
  fields={panelMode === 'create' ? createFields : editFields}
  {density}
  bind:formData
  title={panelTitle}
  variant={formVariant}
  size={formDrawerSize}
  drawerWidth={formDrawerWidth}
  modalSize={formModalSize}
  modalWidth={formModalWidth}
  modalHeight={formModalHeight}
  {submitting}
  error={formError}
  onsubmit={handleSubmit}
  onclose={closePanel}
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
