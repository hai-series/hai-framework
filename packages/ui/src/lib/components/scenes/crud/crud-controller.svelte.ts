/**
 * @h-ai/ui — CRUD 控制器（SPA 数据 + 导航托管）
 *
 * 为 `CrudPage` 提供两个框架级适配器，业务应用无需在各自项目里重复实现：
 *   1. `defineCrud`：由声明式资源定义生成 `CrudPage` 所需的 `crud` 对象（字段筛选、列映射、默认值），
 *      不依赖 `@h-ai/kit`，纯 SPA / Tauri / Capacitor 均可直接使用。
 *   2. `createCrudController`：在纯客户端（无 SvelteKit SSR）下托管 `CrudPage` 的 `data` 与 `nav`，
 *      把 `CrudPage` 通过 URL query 同步的搜索/过滤/分页参数解析回本地状态并重新拉取列表。
 *
 * 控制器特性：latest-wins（seq + AbortSignal 双保险）、失败保留旧数据、惰性加载、并发去重、
 * 查询串回填地址栏（保留 pathname 与 hash，不整页跳转）。
 *
 * @module crud-controller
 */

import type { PaginatedResult } from '@h-ai/core'
import type { NavAdapter } from './nav-adapter.js'
import { SvelteURLSearchParams } from 'svelte/reactivity'

/** 字段展示形式；与 `CrudEditPanel` / `CrudFilterBar` 支持的类型对齐，保留 `string` 以兼容 `@h-ai/kit`。 */
export type CrudFieldType
  = | 'text'
    | 'string'
    | 'textarea'
    | 'select'
    | 'radio'
    | 'multi-select'
    | 'boolean'
    | 'checkbox'
    | 'email'
    | 'url'
    | 'tel'
    | 'password'
    | 'number'
    | 'date'
    | 'datetime'
    | 'date-range'
    | 'custom'

/** 可解析为字符串的文本值（支持 i18n 函数）。 */
export type CrudText = string | (() => string)

/** 选项项（select / radio / multi-select）。 */
export interface CrudOption {
  label: string
  value: string | number | boolean
}

/** 字段定义（与 `CrudPage` 的字段模型对齐）。 */
export interface CrudFieldDef {
  /** 字段 id（对应数据对象的属性名）。 */
  id: string
  /** 字段标签（支持 i18n 函数）。 */
  label: CrudText
  /** 字段类型。 */
  type: CrudFieldType
  /** 是否在列表展示（默认 true）。 */
  inList?: boolean
  /** 是否可过滤（默认 false）。 */
  filterable?: boolean
  /** 是否只读（编辑态禁用）。 */
  readonly?: boolean
  /** 是否在新建表单出现（默认 true）。 */
  inCreate?: boolean
  /** 是否在编辑表单出现（默认 true）。 */
  inEdit?: boolean
  /** 是否在详情出现（默认 true）。 */
  inDetail?: boolean
  /** 选项（select / radio / multi-select），支持工厂函数。 */
  options?: CrudOption[] | (() => CrudOption[])
  /** 校验规则。 */
  validation?: { required?: boolean, min?: number, max?: number, pattern?: string, message?: string }
  /** 列宽（CSS）。 */
  width?: string
  /** 列对齐。 */
  align?: 'left' | 'center' | 'right'
  /** 列表单元格自定义渲染。 */
  render?: (value: unknown, item: Record<string, unknown>) => string
  /** 占位文本。 */
  placeholder?: CrudText
  /** 日期范围起始值 key（仅 date-range，默认 `${id}Start`）。 */
  startKey?: string
  /** 日期范围结束值 key（仅 date-range，默认 `${id}End`）。 */
  endKey?: string
  /** 默认值（新建时）。 */
  defaultValue?: unknown
  /** 排序权重（升序）。 */
  order?: number
}

/** 列表请求附加项；用于 latest-wins 取消旧请求。 */
export interface CrudListOptions {
  /** 取消信号；旧请求被新请求取代时触发 abort。 */
  signal?: AbortSignal
}

/** CRUD API 集合。列表返回标准 `PaginatedResult<T>`，避免各页面重复 page/pageSize/total 映射。 */
export interface CrudApi<T> {
  /** 分页列表；第二参数携带取消信号，实现方可透传给 fetch。 */
  list: (params: Record<string, unknown>, options?: CrudListOptions) => Promise<PaginatedResult<T>>
  /** 按主键获取单条。 */
  get?: (id: string) => Promise<T | null>
  /** 创建一条记录。 */
  create?: (data: Partial<T>) => Promise<T>
  /** 更新一条记录。 */
  update?: (id: string, data: Partial<T>) => Promise<T>
  /** 删除一条记录。 */
  remove?: (id: string) => Promise<void>
}

/** 资源定义。 */
export interface CrudResource<T> {
  /** 资源名称（用于识别业务实体）。 */
  name: string
  /** 资源标题（支持 i18n 函数）。 */
  label: CrudText
  /** 主键字段（默认 `id`）。 */
  keyField?: string
  /** 字段定义列表。 */
  fields: CrudFieldDef[]
  /** 默认分页条数（默认 10）。 */
  defaultPageSize?: number
  /** 是否显示搜索框（默认 true）。 */
  searchable?: boolean
  /** 搜索框占位文案。 */
  searchPlaceholder?: CrudText
  /** 资源 CRUD API。 */
  api: CrudApi<T>
}

/** DataTable 列定义（适配 `CrudPage`）。 */
export interface CrudTableColumn {
  key: string
  label: string
  width?: string
  align?: 'left' | 'center' | 'right'
  render?: (item: Record<string, unknown>) => string
}

/** `CrudPage` 所需的 crud 对象形状（`defineCrud` 的返回值）。 */
export interface CrudDef<T> {
  resource: CrudResource<T>
  getListFields: () => CrudFieldDef[]
  getFilterFields: () => CrudFieldDef[]
  getCreateFields: () => CrudFieldDef[]
  getEditFields: () => CrudFieldDef[]
  getDetailFields: () => CrudFieldDef[]
  toTableColumns: () => CrudTableColumn[]
  getDefaultValues: () => Record<string, unknown>
  api: CrudApi<T>
}

/** `CrudPage` 的 `data` 形状。 */
export interface CrudData<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  filters: Record<string, unknown>
}

/** CRUD 控制器：托管列表数据与 SPA 导航适配器。 */
export interface CrudController<T> {
  /** 传给 `<CrudPage data={...}>` 的响应式数据对象。 */
  readonly data: CrudData<T>
  /** 传给 `<CrudPage nav={...}>` 的导航适配器（仅同步 query，不整页跳转）。 */
  readonly nav: NavAdapter
  /** 首次或按需拉取当前参数；惰性页签用它在首次激活时启动查询。 */
  load: () => Promise<void>
  /** 主动按当前参数重新拉取（写操作后或重试触发）。 */
  reload: () => Promise<void>
  /** 当前是否有最新一轮列表请求尚未结束。 */
  readonly loading: boolean
  /** 是否至少成功取得过一次列表响应。 */
  readonly loaded: boolean
  /** 最新一轮请求错误；已有成功数据时仍保留原列表。 */
  readonly error: Error | undefined
}

/** CRUD 控制器创建选项。 */
export interface CrudControllerOptions {
  /** 是否在创建后立即加载；不可见 / 惰性页签应设为 false（默认 true）。 */
  autoLoad?: boolean
  /** 请求失败或重新拉取时是否保留已有数据（默认 true，避免闪现空列表）。 */
  keepPreviousData?: boolean
  /** 是否把查询串回填浏览器地址栏（保留 pathname 与 hash，默认 true）。 */
  syncUrl?: boolean
}

/**
 * 解析可能是 i18n 函数的文本。
 */
function resolveText(text: CrudText): string {
  return typeof text === 'function' ? text() : text
}

/**
 * 映射分页结果的 `items`，保留 total / page / pageSize。
 *
 * @description 标准 `PaginatedResult<T>` 适配器：业务页面只需转换条目本身，
 *   无需重复搬运分页元数据，配合 `CrudApi.list` 消除 page/pageSize/total 样板。
 *
 * @param result - 后端返回的分页结果。
 * @param map - 单条映射函数。
 * @returns 条目被映射、分页元数据不变的新分页结果。
 *
 * @example
 * list: async (params) => mapPaginated(await api.listUsers(params), toRow)
 */
export function mapPaginated<T, R>(
  result: PaginatedResult<T>,
  map: (item: T, index: number) => R,
): PaginatedResult<R> {
  return {
    items: result.items.map(map),
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
  }
}

/**
 * 由声明式资源定义生成 `CrudPage` 所需的 `crud` 对象。
 *
 * @description 仅做字段筛选、列映射与默认值收集，不依赖 `@h-ai/kit`，可在纯 SPA 直接使用。
 *
 * @param resource - 资源定义（字段、标签、API）。
 * @returns `CrudPage` 可直接消费的 `crud` 对象。
 *
 * @example
 * const userCrud = defineCrud<User>({
 *   name: 'user',
 *   label: () => m.users_title(),
 *   fields: [{ id: 'name', label: () => m.user_name(), type: 'text', filterable: true }],
 *   api: { list: params => listUsers(params) },
 * })
 */
export function defineCrud<T extends Record<string, unknown>>(resource: CrudResource<T>): CrudDef<T> {
  const fields = [...resource.fields].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  return {
    resource,
    getListFields: () => fields.filter(f => f.inList !== false),
    getFilterFields: () => fields.filter(f => f.filterable === true),
    // readonly 仅表示“编辑态禁用”（由 CrudEditPanel 在 edit 模式 disable），新建仍可填写；
    // 因此创建表单只按 inCreate 过滤，不排除 readonly 字段。
    getCreateFields: () => fields.filter(f => f.inCreate !== false),
    getEditFields: () => fields.filter(f => f.inEdit !== false),
    getDetailFields: () => fields.filter(f => f.inDetail !== false),
    toTableColumns: () => fields
      .filter(f => f.inList !== false)
      .map(f => ({
        key: f.id,
        label: resolveText(f.label),
        width: f.width,
        align: f.align,
        render: f.render ? (item: Record<string, unknown>) => f.render!(item[f.id], item) : undefined,
      })),
    getDefaultValues: () => Object.fromEntries(
      fields.filter(f => f.defaultValue !== undefined).map(f => [f.id, f.defaultValue]),
    ),
    api: resource.api,
  }
}

/**
 * 在纯客户端（无 SvelteKit SSR）下为 `CrudPage` 创建数据 + 导航控制器。
 *
 * @description `CrudPage` 通过 `nav.navigate(url)` 把搜索/过滤/分页写进 URL query，再调用 `nav.refresh()`
 *   触发列表刷新。本控制器把 query 解析回参数、调用 `crud.api.list` 更新本地 `data`，并把查询串回填地址栏，
 *   不触发整页跳转（避免刷新与登录态丢失）。连续请求只允许最新一轮更新状态（seq + AbortSignal 双保险），
 *   失败时保留已有数据并暴露错误供页面重试。
 *
 * @param crud - `defineCrud` 的返回值。
 * @param options - 加载策略；默认立即加载、失败保留旧数据、回填地址栏。
 * @returns 含响应式 `data`、`nav` 适配器与 `load` / `reload` 的控制器。
 *
 * @example
 * const controller = createCrudController(userCrud)
 * // <CrudPage crud={userCrud} data={controller.data} nav={controller.nav}
 * //   loading={controller.loading} loaded={controller.loaded}
 * //   error={controller.error} onRetry={controller.reload} />
 */
export function createCrudController<T extends Record<string, unknown>>(
  crud: CrudDef<T>,
  options: CrudControllerOptions = {},
): CrudController<T> {
  const defaultPageSize = crud.resource.defaultPageSize ?? 10
  const keepPreviousData = options.keepPreviousData !== false
  const syncUrl = options.syncUrl !== false
  const filterIds = crud.getFilterFields().map(f => f.id)

  const data = $state<CrudData<T>>({
    items: [],
    total: 0,
    page: 1,
    pageSize: defaultPageSize,
    filters: {},
  })

  // 最近一次解析出的查询参数（供 refresh 使用）。
  let pending: Record<string, unknown> = { search: '', page: 1, pageSize: defaultPageSize }
  // 单调递增请求号；只有最新一轮请求可写回状态（latest-wins）。
  let listRequestSeq = 0
  // 最新一轮请求的取消控制器；新请求发起前 abort 上一轮。
  let abortController: AbortController | undefined
  // 并发去重：同参数请求在途时复用同一 Promise。
  let inFlightKey: string | undefined
  let inFlightPromise: Promise<void> | undefined

  let loading = $state(false)
  let loaded = $state(false)
  let error = $state<Error | undefined>(undefined)

  /** 生成参数的稳定 key（用于并发去重）。 */
  function paramsKey(params: Record<string, unknown>): string {
    return JSON.stringify(Object.entries(params).sort(([a], [b]) => a.localeCompare(b)))
  }

  /** 把成功响应写回响应式 data，并回填 filters 供筛选栏回显。 */
  function applyResult(result: PaginatedResult<T>, params: Record<string, unknown>): void {
    data.items = result.items
    data.total = result.total
    data.page = result.page
    data.pageSize = result.pageSize
    const filters: Record<string, unknown> = { search: params.search ?? '' }
    for (const id of filterIds) {
      if (params[id] !== undefined)
        filters[id] = params[id]
    }
    data.filters = filters
  }

  /**
   * 按参数拉取列表并写回响应式 data。
   *
   * @description 暴露查询中、已成功加载和错误三种状态；连续请求只允许最新响应更新状态与数据，
   *   旧请求被 abort 且其结果被丢弃；失败时按 keepPreviousData 决定是否保留旧列表。
   *
   * @param params - 搜索、过滤与分页参数。
   * @returns 最新请求结算后完成；错误被保存在控制器中，避免未处理 Promise 拒绝。
   */
  function fetchList(params: Record<string, unknown>): Promise<void> {
    const key = paramsKey(params)
    // 并发去重：同参数请求在途时直接复用，避免重复打后端。
    if (inFlightPromise && inFlightKey === key)
      return inFlightPromise

    const requestSeq = ++listRequestSeq
    // 取消上一轮在途请求，实现 latest-wins 的第一重保险。
    abortController?.abort()
    const ac = new AbortController()
    abortController = ac

    loading = true
    error = undefined
    // 不保留旧数据时立即清空，展示查询中占位；保留时维持旧列表避免闪烁。
    if (!keepPreviousData) {
      data.items = []
      data.total = 0
    }
    inFlightKey = key

    const promise = (async () => {
      try {
        const result = await crud.api.list(params, { signal: ac.signal })
        // 旧请求晚返回：seq 已被新请求覆盖时丢弃，绝不污染用户当前看到的结果。
        if (requestSeq !== listRequestSeq)
          return
        applyResult(result, params)
        loaded = true
      }
      catch (cause) {
        // 被新请求取代而 abort 的旧请求：静默丢弃，不写错误。
        if (ac.signal.aborted || (cause instanceof Error && cause.name === 'AbortError'))
          return
        // 列表加载失败（慢响应/重启/超时）时保留上一次结果，绝不用空列表覆盖，避免误显示“0 条记录”；
        // 同时暴露错误给页面：首次失败不能被当成一次成功的空结果。
        if (requestSeq === listRequestSeq)
          error = cause instanceof Error ? cause : new Error(String(cause))
      }
      finally {
        if (requestSeq === listRequestSeq) {
          loading = false
          inFlightPromise = undefined
          inFlightKey = undefined
          abortController = undefined
        }
      }
    })()

    inFlightPromise = promise
    return promise
  }

  /** 从 CrudPage 生成的 URL 中解析查询参数。 */
  function parseParams(url: string): Record<string, unknown> {
    const qs = url.includes('?') ? url.slice(url.indexOf('?') + 1) : ''
    const sp = new SvelteURLSearchParams(qs)
    const params: Record<string, unknown> = {
      search: sp.get('search') ?? '',
      page: sp.get('page') ? Number(sp.get('page')) : 1,
      pageSize: sp.get('pageSize') ? Number(sp.get('pageSize')) : defaultPageSize,
    }
    for (const key of ['sortBy', 'sortDirection']) {
      const v = sp.get(key)
      if (v !== null && v !== '')
        params[key] = v
    }
    for (const id of filterIds) {
      const v = sp.get(id)
      if (v !== null && v !== '')
        params[id] = v
    }
    return params
  }

  /** 把查询串回填地址栏，保留 pathname 与 hash，不触发跳转；SSR / 无 history 环境静默跳过。 */
  function writeUrl(url: string): void {
    if (!syncUrl)
      return
    const his = globalThis.history
    const loc = globalThis.location
    if (!his?.replaceState || !loc)
      return
    const qs = url.includes('?') ? url.slice(url.indexOf('?')) : ''
    try {
      his.replaceState(his.state, '', `${loc.pathname}${qs}${loc.hash}`)
    }
    catch {
      // 隐私模式 / 跨域等限制下忽略，不影响数据加载。
    }
  }

  const nav: NavAdapter = {
    pathname: '',
    navigate: (url: string) => {
      // 仅解析参数并回填地址栏，不做真实跳转。
      pending = parseParams(url)
      writeUrl(url)
    },
    refresh: () => fetchList(pending),
  }

  // 默认立即加载；惰性页签显式关闭，避免挂载时抢占后端资源，在首次激活时调用 load()。
  if (options.autoLoad !== false)
    void fetchList(pending)

  return {
    get data() {
      return data
    },
    nav,
    load: () => fetchList(pending),
    reload: () => fetchList(pending),
    get loading() {
      return loading
    },
    get loaded() {
      return loaded
    },
    get error() {
      return error
    },
  }
}
