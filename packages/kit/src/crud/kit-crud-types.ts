/**
 * @h-ai/kit — CRUD 类型定义
 *
 * 声明式 CRUD 资源定义所需的全部类型。
 * @module kit-crud-types
 */

// ─── 字段类型 ───

/** 支持的字段类型 */
export type CrudFieldType
  = | 'string'
    | 'number'
    | 'boolean'
    | 'date'
    | 'datetime'
    | 'email'
    | 'url'
    | 'tel'
    | 'password'
    | 'textarea'
    | 'select'
    | 'multi-select'
    | 'radio'
    | 'checkbox'
    | 'custom'

// ─── 校验规则 ───

/** 字段校验规则 */
export interface CrudFieldValidation {
  /** 是否必填 */
  required?: boolean
  /** 最小值（number）或 最小长度（string） */
  min?: number
  /** 最大值（number）或 最大长度（string） */
  max?: number
  /** 正则表达式 */
  pattern?: string
  /** 自定义错误提示 */
  message?: string
}

// ─── 选项 ───

/** 选项项（用于 select/radio 等） */
export interface CrudFieldOption {
  label: string
  value: string | number | boolean
}

/** 选项来源：静态数组或动态工厂函数 */
export type CrudFieldOptions = CrudFieldOption[] | (() => CrudFieldOption[])

// ─── 字段定义 ───

/** 可解析为字符串的文本值（支持 i18n） */
export type CrudText = string | (() => string)

/** 字段定义 */
export interface CrudFieldDef {
  /** 字段 ID（对应数据对象的 key） */
  id: string
  /** 显示名称（支持 i18n 函数） */
  label: CrudText
  /** 字段类型 */
  type: CrudFieldType
  /** 是否在列表中显示（默认 true） */
  inList?: boolean
  /** 是否是过滤项（默认 false） */
  filterable?: boolean
  /** 是否只读（编辑时不可修改，默认 false） */
  readonly?: boolean
  /** 是否在新建表单中显示（默认 true） */
  inCreate?: boolean
  /** 是否在编辑表单中显示（默认 true） */
  inEdit?: boolean
  /** 是否在详情中显示（默认 true） */
  inDetail?: boolean
  /** 选项列表（select/radio/checkbox/multi-select） */
  options?: CrudFieldOptions
  /** 校验规则 */
  validation?: CrudFieldValidation
  /** 列宽（列表模式） */
  width?: string
  /** 列对齐方式 */
  align?: 'left' | 'center' | 'right'
  /** 自定义列表渲染 */
  render?: (value: unknown, item: Record<string, unknown>) => string
  /** 占位符 */
  placeholder?: CrudText
  /** 默认值（新建时） */
  defaultValue?: unknown
  /** 排列权重（数值越小越靠前） */
  order?: number
}

// ─── 分页与过滤 ───

/** 分页参数 */
export interface CrudPaginationParams {
  page: number
  pageSize: number
}

/** 过滤参数（搜索 + 自定义过滤字段） */
export interface CrudFilterParams {
  search?: string
  [key: string]: unknown
}

/** 分页结果 */
export interface CrudPaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

// ─── API 定义 ───

/** CRUD API 接口定义 */
export interface CrudApiDef<T = Record<string, unknown>> {
  /** 获取分页列表 */
  list: (params: CrudPaginationParams & CrudFilterParams) => Promise<CrudPaginatedResult<T>>
  /** 获取单条记录 */
  get?: (id: string) => Promise<T | null>
  /** 新建记录 */
  create?: (data: Partial<T>) => Promise<T>
  /** 更新记录（patch） */
  update?: (id: string, data: Partial<T>) => Promise<T>
  /** 删除记录 */
  remove?: (id: string) => Promise<void>
}

// ─── 资源定义 ───

/** CRUD 资源定义 */
export interface CrudResourceDef<T = Record<string, unknown>> {
  /** 资源名称（如 'user', 'role'），用于 URL 路由 */
  name: string
  /** 显示名称（面包屑、标题用，支持 i18n） */
  label: CrudText
  /** 主键字段名（默认 'id'） */
  keyField?: string
  /** 字段列表 */
  fields: CrudFieldDef[]
  /** API 接口 */
  api: CrudApiDef<T>
  /** 默认分页大小（默认 20） */
  defaultPageSize?: number
  /** 是否支持搜索（默认 true） */
  searchable?: boolean
  /** 搜索占位符 */
  searchPlaceholder?: CrudText
}

// ─── 操作对象 ───

/** DataTable 列配置（适配 @h-ai/ui DataTable） */
export interface CrudTableColumn {
  key: string
  label: string
  width?: string
  align?: 'left' | 'center' | 'right'
  render?: (item: Record<string, unknown>) => string
}

/** CRUD 操作对象（由 defineCrud 返回） */
export interface CrudOperations<T = Record<string, unknown>> {
  /** 资源元信息 */
  resource: CrudResourceDef<T>
  /** 获取列表列字段（inList=true） */
  getListFields: () => CrudFieldDef[]
  /** 获取过滤字段（filterable=true） */
  getFilterFields: () => CrudFieldDef[]
  /** 获取新建表单字段（inCreate=true） */
  getCreateFields: () => CrudFieldDef[]
  /** 获取编辑表单字段（inEdit=true） */
  getEditFields: () => CrudFieldDef[]
  /** 获取详情字段（inDetail=true） */
  getDetailFields: () => CrudFieldDef[]
  /** 构建 DataTable 列配置 */
  toTableColumns: () => CrudTableColumn[]
  /** 构建新建时的默认值 */
  getDefaultValues: () => Record<string, unknown>
  /** API 操作代理 */
  api: CrudApiDef<T>
}
