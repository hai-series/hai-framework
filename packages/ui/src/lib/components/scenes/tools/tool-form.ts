import type { ToolResource } from './workspace-types.js'

/**
 * 简单参数字段投影，复杂字段使用高级 JSON 输入。
 * @example 模块内部上下文
 * ```ts
 * const field: ToolFormField = { name: 'count', title: '数量', required: true, kind: 'integer' }
 * ```
 */
export interface ToolFormField {
  name: string
  title: string
  description?: string
  required: boolean
  kind: 'string' | 'number' | 'integer' | 'boolean' | 'enum' | 'json' | 'resource' | 'resources'
  values?: readonly (string | number | boolean | null)[]
  defaultValue?: unknown
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  minItems?: number
  maxItems?: number
  mediaType?: string
}

/**
 * 只接受普通记录，避免将数组或空值当作 Schema 对象。
 * @example 模块内部上下文
 * ```ts
 * const schema = asRecord({ type: 'string' })
 * ```
 */
export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

/**
 * 从 JSON Schema 提取可直接呈现的字段，不取代服务端完整验证。
 * @example 模块内部上下文
 * ```ts
 * const fields = describeToolFields({ type: 'object', properties: { prompt: { type: 'string' } } })
 * ```
 */
export function describeToolFields(schema: Record<string, unknown>): ToolFormField[] {
  const required = Array.isArray(schema.required)
    ? schema.required
    : []
  return Object.entries(asRecord(schema.properties) ?? {}).map(([name, value]) => {
    const property = asRecord(value) ?? {}
    const values = Array.isArray(property.enum) && property.enum.every(item => item === null || ['string', 'number', 'boolean'].includes(typeof item))
      ? property.enum as (string | number | boolean | null)[]
      : undefined
    const type = property.type
    return {
      name,
      title: typeof property.title === 'string'
        ? property.title
        : name,
      description: typeof property.description === 'string'
        ? property.description
        : undefined,
      required: required.includes(name),
      kind: property.format === 'artifact-id'
        ? 'resource'
        : property.format === 'artifact-ids'
          ? 'resources'
          : values
            ? 'enum'
            : type === 'string' || type === 'number' || type === 'integer' || type === 'boolean'
              ? type
              : 'json',
      values,
      defaultValue: property.default,
      minimum: typeof property.minimum === 'number'
        ? property.minimum
        : undefined,
      maximum: typeof property.maximum === 'number'
        ? property.maximum
        : undefined,
      minLength: typeof property.minLength === 'number'
        ? property.minLength
        : undefined,
      maxLength: typeof property.maxLength === 'number'
        ? property.maxLength
        : undefined,
      minItems: typeof property.minItems === 'number'
        ? property.minItems
        : undefined,
      maxItems: typeof property.maxItems === 'number'
        ? property.maxItems
        : undefined,
      mediaType: typeof property.contentMediaType === 'string'
        ? property.contentMediaType
        : undefined,
    }
  })
}

/**
 * 将资源多选或手工逐行输入投影为选择值，完整参数验证仍在提交时执行。
 * @example 模块内部上下文
 * ```ts
 * const ids = toolResourceIds('image-a\nimage-b')
 * ```
 */
export function toolResourceIds(value: unknown): string[] {
  if (Array.isArray(value))
    return value.filter((item): item is string => typeof item === 'string' && item.length > 0)
  return typeof value === 'string'
    ? value.split(/[\n,]/).map(item => item.trim()).filter(Boolean)
    : []
}

/**
 * 按可选 MIME 约束筛选资源；手工或预设的未知 ID 保留为可移除选项。
 * @example 模块内部上下文
 * ```ts
 * const options = toolResourceOptions([{ id: 'photo', title: '照片', mediaType: 'image/png' }], 'image/*')
 * ```
 */
export function toolResourceOptions(resources: readonly ToolResource[], mediaType?: string, selected: readonly string[] = []): { value: string, label: string, description?: string }[] {
  const expected = mediaType?.trim().toLowerCase()
  const options = new Map<string, { value: string, label: string, description?: string }>()
  for (const resource of resources) {
    const actual = resource.mediaType?.split(';')[0]?.trim().toLowerCase()
    if (expected && actual !== expected && !(expected.endsWith('/*') && actual?.startsWith(expected.slice(0, -1))))
      continue
    options.set(resource.id, { value: resource.id, label: resource.title, description: resource.mediaType ?? resource.kind })
  }
  for (const id of selected) {
    if (!options.has(id))
      options.set(id, { value: id, label: id })
  }
  return [
    ...options.values(),
  ]
}

/**
 * 表单输入转换为业务类型；失败仅返回字段名，不回显未知值。
 * @example 模块内部上下文
 * ```ts
 * const input = buildToolInput({ properties: { count: { type: 'integer' } } }, { count: '2' })
 * ```
 */
export function buildToolInput(schema: Record<string, unknown>, values: Record<string, unknown>): { success: true, input: Record<string, unknown> } | { success: false, field: string } {
  const input: Record<string, unknown> = {}
  for (const field of describeToolFields(schema)) {
    let value = Object.hasOwn(values, field.name)
      ? values[field.name]
      : field.defaultValue
    if (value === undefined || (value === '' && field.kind !== 'string')) {
      if (field.required)
        return { success: false, field: field.title }
      continue
    }
    if (field.kind === 'number' || field.kind === 'integer') {
      value = typeof value === 'number' || (typeof value === 'string' && value.trim())
        ? Number(value)
        : Number.NaN
      if (typeof value !== 'number' || !Number.isFinite(value) || (field.kind === 'integer' && !Number.isInteger(value))
        || (field.minimum !== undefined && value < field.minimum) || (field.maximum !== undefined && value > field.maximum)) {
        return { success: false, field: field.title }
      }
    }
    else if (field.kind === 'boolean') {
      if (typeof value !== 'boolean')
        return { success: false, field: field.title }
    }
    else if (field.kind === 'enum') {
      if (!field.values?.includes(value as string | number | boolean | null))
        return { success: false, field: field.title }
    }
    else if (field.kind === 'json' && typeof value === 'string') {
      try {
        value = JSON.parse(value)
      }
      catch { return { success: false, field: field.title } }
    }
    else if (field.kind === 'resources') {
      if (typeof value === 'string')
        value = toolResourceIds(value)
      if (!Array.isArray(value) || !value.every(item => typeof item === 'string' && item.trim().length > 0)
        || (field.minItems !== undefined && value.length < field.minItems)
        || (field.maxItems !== undefined && value.length > field.maxItems)) {
        return { success: false, field: field.title }
      }
    }
    else if (field.kind === 'string' || field.kind === 'resource') {
      if (typeof value !== 'string' || (field.minLength !== undefined && value.length < field.minLength)
        || (field.maxLength !== undefined && value.length > field.maxLength)) {
        return { success: false, field: field.title }
      }
    }
    // 参数名由已登记 Schema 决定，不允许原型字段污染业务对象。
    Object.defineProperty(input, field.name, {
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    })
  }
  return { success: true, input }
}
