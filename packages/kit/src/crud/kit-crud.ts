/**
 * @h-ai/kit — CRUD 操作定义
 *
 * 声明式 CRUD 资源定义工厂函数。
 * @module kit-crud
 */

import type {
  CrudFieldDef,
  CrudFieldOptions,
  CrudOperations,
  CrudResourceDef,
  CrudTableColumn,
  CrudText,
} from './kit-crud-types.js'

/**
 * 解析 CrudText 为字符串
 */
function resolveText(text: CrudText): string {
  return typeof text === 'function' ? text() : text
}

/**
 * 按 order 排序字段
 */
function sortFields(fields: CrudFieldDef[]): CrudFieldDef[] {
  return [...fields].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

/**
 * 解析选项列表
 */
function resolveOptions(options: CrudFieldOptions | undefined): Array<{ label: string, value: string | number | boolean }> {
  if (!options)
    return []
  return typeof options === 'function' ? options() : options
}

/**
 * 定义 CRUD 资源
 *
 * 返回 CrudOperations 对象，包含字段过滤、列构建和 API 代理等能力。
 * 与 @h-ai/ui 的 CrudPage 组件配合使用。
 *
 * @param resource - 资源定义
 * @returns CRUD 操作对象
 *
 * @example
 * ```ts
 * const userCrud = defineCrud({
 *   name: 'user',
 *   label: () => m.users_title(),
 *   fields: [
 *     { id: 'username', label: '用户名', type: 'string', validation: { required: true } },
 *     { id: 'email', label: '邮箱', type: 'email' },
 *   ],
 *   api: { list, get, create, update, remove },
 * })
 * ```
 */
export function defineCrud<T = Record<string, unknown>>(
  resource: CrudResourceDef<T>,
): CrudOperations<T> {
  const fields = resource.fields

  function getListFields(): CrudFieldDef[] {
    return sortFields(fields.filter(f => f.inList !== false))
  }

  function getFilterFields(): CrudFieldDef[] {
    return sortFields(fields.filter(f => f.filterable === true))
  }

  function getCreateFields(): CrudFieldDef[] {
    return sortFields(fields.filter(f => f.inCreate !== false))
  }

  function getEditFields(): CrudFieldDef[] {
    return sortFields(fields.filter(f => f.inEdit !== false))
  }

  function getDetailFields(): CrudFieldDef[] {
    return sortFields(fields.filter(f => f.inDetail !== false))
  }

  function toTableColumns(): CrudTableColumn[] {
    return getListFields().map(f => ({
      key: f.id,
      label: resolveText(f.label),
      width: f.width,
      align: f.align,
      render: f.render
        ? (item: Record<string, unknown>) => f.render!(item[f.id], item)
        : undefined,
    }))
  }

  function getDefaultValues(): Record<string, unknown> {
    const defaults: Record<string, unknown> = {}
    for (const f of fields) {
      if (f.defaultValue !== undefined) {
        defaults[f.id] = f.defaultValue
      }
      else if (f.type === 'boolean' || f.type === 'checkbox') {
        defaults[f.id] = false
      }
      else if (f.type === 'multi-select') {
        defaults[f.id] = []
      }
      else if (f.type === 'number') {
        defaults[f.id] = undefined
      }
      else {
        defaults[f.id] = ''
      }
    }
    return defaults
  }

  return {
    resource,
    getListFields,
    getFilterFields,
    getCreateFields,
    getEditFields,
    getDetailFields,
    toTableColumns,
    getDefaultValues,
    api: resource.api,
  }
}

// re-export 解析工具，供 UI 层使用
export { resolveOptions, resolveText }
