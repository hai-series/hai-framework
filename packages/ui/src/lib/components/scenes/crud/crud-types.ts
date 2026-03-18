/**
 * @h-ai/ui — CRUD 场景组件类型定义
 *
 * CrudPage 及其子组件的 Props 类型
 * @module crud-types
 */

import type { Snippet } from 'svelte'
import type { Size } from '../../../types.js'

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

/** CrudPage 初始列表数据（由 +page.server.ts load 返回） */
export interface CrudPageData<T = Record<string, unknown>> {
  items: T[]
  total: number
  page: number
  pageSize: number
  filters?: Record<string, unknown>
}

/** CrudPage 组件 Props */
export interface CrudPageProps<T = Record<string, unknown>> {
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
  /** 抽屉尺寸（默认 '2xl'） */
  drawerSize?: Size
  /** 列表行点击是否打开详情（默认 true） */
  rowClickDetail?: boolean
  /** 列表行操作按钮插槽 */
  listItemActions?: Snippet<[T]>
  /** 编辑表单额外字段插槽 */
  editFormExtra?: Snippet<[T | null, 'create' | 'edit']>
  /** 详情额外内容插槽 */
  detailExtra?: Snippet<[T]>
  /** 页面头部额外操作区插槽 */
  headerActions?: Snippet
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
