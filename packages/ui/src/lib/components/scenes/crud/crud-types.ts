/**
 * @h-ai/ui — CRUD 场景组件类型定义
 *
 * CrudPage 及其子组件的 Props 类型
 * @module crud-types
 */

import type { Snippet } from 'svelte'
import type { DataAttributes, Size } from '../../../types.js'

// 从 @h-ai/kit 导入的类型在使用处通过泛型约束，此处仅定义 UI 层特有类型

/** CrudPage 权限控制 */
export interface CrudPermissions {
  /** 允许新建 */
  create?: boolean
  /** 允许编辑 */
  update?: boolean
  /** 允许删除 */
  delete?: boolean
}

/** 新建/编辑表单的展示形式 */
export type CrudFormVariant = 'drawer' | 'modal'

/** 列表显示密度 */
export type CrudDensity = 'normal' | 'compact'

/** 新建/编辑表单展示配置 */
export interface CrudFormConfig {
  /** 展示形式：'drawer'（抽屉，默认）或 'modal'（弹出窗口） */
  variant?: CrudFormVariant
  /** 抽屉尺寸预设（variant='drawer'，默认 '2xl'） */
  drawerSize?: Size
  /** 抽屉自定义宽度 CSS 值，优先级高于 drawerSize（variant='drawer'） */
  drawerWidth?: string
  /** 是否允许拖动并按资源记忆抽屉宽度（variant='drawer'，默认 true） */
  drawerResizable?: boolean
  /** 弹窗尺寸预设（variant='modal'，默认 '2xl'） */
  modalSize?: Size | 'full'
  /** 弹窗自定义宽度 CSS 值（variant='modal'） */
  modalWidth?: string
  /** 弹窗自定义高度 CSS 值（variant='modal'） */
  modalHeight?: string
}

/** 分页栏展示配置 */
export interface CrudPaginationConfig {
  /** 是否显示每页条数选择器（默认 true） */
  showSizeChanger?: boolean
  /** 每页条数候选项（默认 [10, 20, 50, 100]） */
  pageSizeOptions?: number[]
  /** 是否显示跳页输入（默认 true） */
  showJumper?: boolean
  /** 是否显示总数（默认 true） */
  showTotal?: boolean
  /** 是否显示页码信息文案（默认 true；紧凑视图可关闭） */
  showPageInfo?: boolean
  /** 是否显示首页 / 末页跳转按钮（默认 true；紧凑视图可仅保留上一页 / 下一页） */
  showFirstLast?: boolean
}

/** CrudPage 工具栏风格；toolbar 是默认的图标弹层布局。 */
export type CrudToolbarStyle = 'filter-bar' | 'toolbar'

/** CrudPage 初始列表数据（由 +page.server.ts load 返回） */
export interface CrudPageData<T = Record<string, unknown>> {
  items: T[]
  total: number
  page: number
  pageSize: number
  filters?: Record<string, unknown>
}

/** CrudPage 组件 Props */
export interface CrudPageProps<T = Record<string, unknown>> extends DataAttributes {
  /** CRUD 操作定义（来自 kit.crud.define） */
  crud: {
    resource: {
      name: string
      label: string | (() => string)
      keyField?: string
      fields: Array<{
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
        /** 日期范围起始值 key；默认 `${id}Start`。 */
        startKey?: string
        /** 日期范围结束值 key；默认 `${id}End`。 */
        endKey?: string
        defaultValue?: unknown
        order?: number
      }>
      defaultPageSize?: number
      searchable?: boolean
      searchPlaceholder?: string | (() => string)
      api: {
        list: (params: Record<string, unknown>) => Promise<{ items: T[], total: number, page: number, pageSize: number }>
        get?: (id: string) => Promise<T | null>
        create?: (data: Partial<T>) => Promise<T>
        update?: (id: string, data: Partial<T>) => Promise<T>
        remove?: (id: string) => Promise<void>
      }
    }
    getListFields: () => Array<Record<string, unknown>>
    getFilterFields: () => Array<Record<string, unknown>>
    getCreateFields: () => Array<Record<string, unknown>>
    getEditFields: () => Array<Record<string, unknown>>
    getDetailFields: () => Array<Record<string, unknown>>
    toTableColumns: () => Array<{ key: string, label: string, width?: string, align?: string, render?: (item: Record<string, unknown>) => string }>
    getDefaultValues: () => Record<string, unknown>
    api: {
      list: (params: Record<string, unknown>) => Promise<{ items: T[], total: number, page: number, pageSize: number }>
      get?: (id: string) => Promise<T | null>
      create?: (data: Partial<T>) => Promise<T>
      update?: (id: string, data: Partial<T>) => Promise<T>
      remove?: (id: string) => Promise<void>
    }
  }
  /** 初始列表数据 */
  data: CrudPageData<T>
  /** 权限控制 */
  permissions?: CrudPermissions
  /** 新建/编辑表单展示配置（抽屉或弹窗、尺寸、宽高） */
  form?: CrudFormConfig
  /** 分页栏展示配置（每页条数选择、跳页、总数） */
  pagination?: CrudPaginationConfig
  /** 列表显示密度：影响列表行、行内操作、分页与详情/编辑表单；不影响页头与筛选栏 */
  density?: CrudDensity
  /** 列表行点击是否打开详情（默认 true） */
  rowClickDetail?: boolean
  /** 点击后打开详情的列 key；只让标题等主标识列可点击时使用 */
  detailColumns?: string[]
  /** 是否显示默认页面标题栏；需要把标题放进工具栏左侧时设为 false。 */
  showHeader?: boolean
  /** 列表行操作按钮插槽 */
  listItemActions?: Snippet<[T]>
  /** 自定义表格单元格插槽；参数依次为行记录和列 key。 */
  tableCell?: Snippet<[T, string]>
  /** 点击表格行的回调。 */
  onrowclick?: (item: T) => void
  /** 编辑表单额外字段插槽 */
  editFormExtra?: Snippet<[T | null, 'create' | 'edit']>
  /** 详情额外内容插槽 */
  detailExtra?: Snippet<[T]>
  /** 页面头部额外操作区插槽 */
  headerActions?: Snippet
  /** 工具栏风格；toolbar 使用图标弹层，filter-bar 使用平铺筛选栏。 */
  toolbarStyle?: CrudToolbarStyle
  /** toolbar 风格下工具栏左侧内容插槽，可放置页面标题或说明。 */
  toolbarLeading?: Snippet
  /** 工具栏右侧自定义操作插槽。 */
  toolbarActions?: Snippet
  /** 卡片列表项渲染插槽；存在时替代数据表格，分页和滚动容器保持一致。 */
  card?: Snippet<[T]>
  /** 可排序列；为空时默认使用全部列表列。 */
  sortableColumns?: Array<{ key: string, label: string }>
  /** 删除前钩子（返回 false 取消） */
  onbeforedelete?: (item: T) => Promise<boolean> | boolean
  /** 提交成功后钩子 */
  onaftersubmit?: (item: T, mode: 'create' | 'edit') => void
  /** 删除成功后钩子 */
  onafterdelete?: (item: T) => void
  /** 自定义错误处理 */
  onerror?: (error: string) => void
  /** 自定义类名 */
  class?: string
  /** 当前路由路径（用于 URL 参数同步） */
  basePath?: string
}
