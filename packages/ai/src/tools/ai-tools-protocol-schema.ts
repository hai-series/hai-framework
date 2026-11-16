const maps = new Set([
  'properties',
  'patternProperties',
  '$defs',
  'definitions',
  'dependentSchemas',
])
const children = new Set([
  'items',
  'additionalItems',
  'additionalProperties',
  'contains',
  'propertyNames',
  'unevaluatedProperties',
  'unevaluatedItems',
  'if',
  'then',
  'else',
  'not',
  'contentSchema',
])
const lists = new Set([
  'allOf',
  'anyOf',
  'oneOf',
  'prefixItems',
])

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 投影模型/MCP Schema，仅移除两个 UI 资源选择格式，不触碰默认值和未知格式。
 * @example 模块内部上下文
 * ```ts
 * const schema = projectToolProtocolSchema({ type: 'string', format: 'artifact-id' })
 * ```
 */
export function projectToolProtocolSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const projected: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'format' && (value === 'artifact-id' || value === 'artifact-ids'))
      continue
    if (maps.has(key) && record(value)) {
      projected[key] = Object.fromEntries(Object.entries(value).map(([name, child]) => [
        name,
        record(child)
          ? projectToolProtocolSchema(child)
          : child,
      ]))
    }
    else if (children.has(key) && record(value)) {
      projected[key] = projectToolProtocolSchema(value)
    }
    else if ((lists.has(key) || key === 'items') && Array.isArray(value)) {
      projected[key] = value.map(child => record(child)
        ? projectToolProtocolSchema(child)
        : child)
    }
    else {
      Object.defineProperty(projected, key, {
        value,
        enumerable: true,
        configurable: true,
        writable: true,
      })
    }
  }
  return projected
}
