/** 通用环境配置：来源合并、结构覆盖与无损 dotenv 编解码，不依赖业务模块。 */
import type { ZodType } from 'zod'
import type { HaiResult } from '../core-types.js'
import process from 'node:process'
import { parseEnv as nodeParseEnv } from 'node:util'
import { parse } from 'yaml'
import { err, HaiConfigError, ok } from '../core-types.js'
import { i18n } from '../i18n/core-i18n-utils.js'

/**
 * 仅供结构遍历的 JSON Schema 节点，不代替模块业务 Schema。
 * @example 模块内部上下文
 * ```ts
 * const shape: Shape = { type: 'object', properties: { name: { type: 'string' } } }
 * ```
 */
type Shape = Record<string, unknown>
/**
 * 单个环境来源中的字面变量，undefined 表示未设置。
 * @example 模块内部上下文
 * ```ts
 * const values: Environment = { HAI_APP_NAME: 'Example' }
 * ```
 */
type Environment = Record<string, string | undefined>

/** 只接受普通数据对象，路径写入不经过对象原型。 */
function object(value: unknown): Shape | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Shape : undefined
}

/** camelCase 保持连写；实际字段名来自结构或 Schema，不从大写变量猜测。 */
function segment(value: string): string {
  return value.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toUpperCase()
}

/** JSON Schema 的本地引用与联合分支只提供结构提示，最终仍由原始 Zod 校验。 */
function shapes(node: Shape, root: Shape, value?: unknown, depth = 0): Shape[] {
  if (depth > 32)
    return []
  const result = [node]
  if (typeof node.$ref === 'string' && node.$ref.startsWith('#/')) {
    let target: unknown = root
    for (const key of node.$ref.slice(2).split('/').map(item => item.replaceAll('~1', '/').replaceAll('~0', '~')))
      target = object(target)?.[key]
    if (object(target))
      result.push(...shapes(object(target)!, root, value, depth + 1))
  }
  for (const keyword of ['anyOf', 'oneOf', 'allOf']) {
    if (!Array.isArray(node[keyword]))
      continue
    for (const item of node[keyword]) {
      const branch = object(item)
      if (!branch)
        continue
      const fields = object(branch.properties)
      const input = object(value)
      if (fields && input && Object.entries(fields).some(([key, field]) => input[key] !== undefined && object(field)?.const !== undefined && object(field)!.const !== input[key]))
        continue
      result.push(...shapes(branch, root, value, depth + 1))
    }
  }
  return result
}

/** 合并同一路径的结构提示，保持 Provider 的联合定义。 */
function combined(nodes: unknown[]): Shape {
  const entries = nodes.map(object).filter((item): item is Shape => item !== undefined)
  return entries.length === 1 ? entries[0]! : { anyOf: entries }
}

/** 字符串字段保留前导零等字面内容，其余值沿用 YAML 类型还原。 */
function scalar(text: string, node: Shape, root: Shape): unknown {
  const types = new Set(shapes(node, root).flatMap(item => Array.isArray(item.type) ? item.type : typeof item.type === 'string' ? [item.type] : []))
  if (types.has('string') && [...types].every(type => type === 'string' || type === 'null') && !(text === 'null' && types.has('null')))
    return text
  if (text === '')
    return ''
  try {
    return parse(text) ?? (text === 'null' ? null : text)
  }
  catch { return text }
}

/**
 * 从低到高合并来源；高来源父项删除旧细项，同来源始终先父后子。
 * @example 模块内部上下文
 * ```ts
 * const values = mergeEnv([{ HAI_APP_NAME: 'base' }, { HAI_APP_NAME: 'test' }])
 * ```
 */
export function mergeEnv(layers: readonly Environment[]): Record<string, string> {
  const values: Record<string, string> = {}
  for (const layer of layers) {
    for (const name of Object.keys(layer).sort((left, right) => left.length - right.length || left.localeCompare(right))) {
      if (layer[name] === undefined)
        continue
      if (name.startsWith('HAI_')) {
        for (const previous of Object.keys(values)) {
          if (previous.startsWith(`${name}_`))
            delete values[previous]
        }
      }
      values[name] = layer[name]
    }
  }
  return values
}

/**
 * dotenv 使用 Node 字面规则；补齐生成器双引号的 JSON 转义，拒绝同文件重复键。
 * @example 模块内部上下文
 * ```ts
 * const values = parseEnvironment('HAI_APP_NAME=Example\n')
 * ```
 */
export function parseEnvironment(text: string): Record<string, string> {
  const result = nodeParseEnv(text)
  const names = new Set<string>()
  const assignments = /^(?:export\s+)?([A-Z_]\w*)\s*=\s*('[^']*'|"(?:[^"\\]|\\.)*"|`[^`]*`|[^\r\n]*)/gim
  for (const match of text.matchAll(assignments)) {
    const name = match[1]!
    if (names.has(name))
      throw new Error(`Duplicate environment variable: ${name}`)
    names.add(name)
    if (match[2]!.startsWith('"') && (match[2]!.includes('\\"') || match[2]!.includes('\\u0027'))) {
      try {
        result[name] = JSON.parse(match[2]!)
      }
      catch { /* 普通 dotenv 双引号仍按 Node 规则解析。 */ }
    }
  }
  return Object.fromEntries(Object.entries(result).filter((entry): entry is [string, string] => entry[1] !== undefined))
}

/**
 * 所有值均按字面量编码；排序让模块 JSON 位于其细项之前。
 * @example 模块内部上下文
 * ```ts
 * const text = stringifyEnv({ HAI_APP_NAME: 'Example' })
 * ```
 */
export function stringifyEnv(values: Record<string, string>, options: { target?: 'node' | 'compose' } = {}): string {
  return `${Object.keys(values).sort().map((name) => {
    if (!/^[A-Z_]\w*$/i.test(name))
      throw new Error('Invalid environment variable name')
    const value = values[name]!
    let literal: string
    if (!value.includes('\''))
      literal = `'${value}'`
    else if (options.target === 'compose')
      literal = JSON.stringify(value).replaceAll('$', () => '$$')
    else literal = JSON.stringify(value).replaceAll('\'', '\\u0027')
    return `${name}=${literal}`
  }).join('\n')}\n`
}

/**
 * 在给定结构上解析环境变量；父对象提供基础值，具体路径继续覆盖。
 * @example 模块内部上下文
 * ```ts
 * const result = resolveEnvironment({ name: 'app', value: { name: 'Example' }, environment: { HAI_APP_NAME: 'Test' } })
 * ```
 */
export function resolveEnvironment(options: { name: string, value: unknown, environment?: Environment, schema?: ZodType, shape?: Readonly<Record<string, unknown>>, missing?: 'error' | 'empty' }, literal = false): HaiResult<unknown> {
  const environment = options.environment ?? process.env
  const missingNames = new Set<string>()
  let root: Shape
  try {
    root = options.schema ? options.schema.toJSONSchema({ io: 'input', unrepresentable: 'any' }) : options.shape ?? {}
  }
  catch { root = {} }
  const prefix = `HAI_${segment(options.name)}`
  function visit(original: unknown, name: string, node: Shape, inheritedLiteral: boolean, depth: number, declaration: unknown = original): unknown {
    if (depth > 32)
      throw new Error(name)
    let value = original
    let fromEnvironment = inheritedLiteral
    if (environment[name] !== undefined) {
      value = scalar(environment[name], node, root)
      fromEnvironment = true
    }
    // 先应用判别字段的细项，再选择联合分支，避免旧 Provider 隐藏新分支字段。
    const alternatives = shapes(node, root)
    const discriminators = new Map<string, unknown[]>()
    for (const candidate of alternatives) {
      for (const [key, field] of Object.entries(object(candidate.properties) ?? {})) {
        if (shapes(object(field) ?? {}, root).some(item => Object.hasOwn(item, 'const')))
          discriminators.set(key, [...discriminators.get(key) ?? [], field])
      }
    }
    const selection = { ...object(value) }
    for (const [key, fields] of discriminators) {
      const text = environment[`${name}_${segment(key)}`]
      if (text !== undefined)
        selection[key] = scalar(text, combined(fields), root)
    }
    const candidates = shapes(node, root, Object.keys(selection).length ? selection : value)
    const synthesized = value === undefined
    // 更细字段可替换粗粒度的 false/标量节点；来源合并已先清除低来源细项。
    const valueType: string = typeof value
    const primitiveOverride = value === undefined || candidates.some(candidate => (value !== null && candidate.type === valueType) || candidate.const === value || (value === null && candidate.type === 'null'))
    if (primitiveOverride && !object(value) && !Array.isArray(value)) {
      const declared = new Set([...Object.keys(object(declaration) ?? {}), ...candidates.flatMap(candidate => Object.keys(object(candidate.properties) ?? {}))])
      const specified = [...declared].filter(key => Object.keys(environment).some(candidate => environment[candidate] !== undefined && (candidate === `${name}_${segment(key)}` || candidate.startsWith(`${name}_${segment(key)}_`))))
      if (specified.length)
        value = Object.fromEntries(specified.map(key => [key, undefined]))
    }
    if (value === undefined && Object.keys(environment).some(key => environment[key] !== undefined && key.startsWith(`${name}_`))) {
      if (candidates.some(item => item.type === 'object' || object(item.properties)))
        value = {}
    }
    const indexed = Object.keys(environment).filter(key => environment[key] !== undefined && key.startsWith(`${name}_`) && /^\d+(?:_|$)/.test(key.slice(name.length + 1)))
    if (value === undefined && indexed.length && candidates.some(candidate => candidate.type === 'array')) {
      const defaults = candidates.find(candidate => Array.isArray(candidate.default))?.default
      if (!Array.isArray(defaults))
        throw new Error(indexed[0])
      value = structuredClone(defaults)
    }
    if (Array.isArray(value)) {
      const itemShape = combined(candidates.map(item => item.items))
      for (const key of indexed) {
        const index = key.slice(name.length + 1).split('_')[0]!
        if (/^\d+$/.test(index) && (String(Number(index)) !== index || Number(index) >= value.length))
          throw new Error(key)
      }
      return value.map((item, index) => visit(item, `${name}_${index}`, itemShape, fromEnvironment, depth + 1, Array.isArray(declaration) ? declaration[index] : undefined))
    }
    const input = object(value)
    if (input) {
      const properties = new Map<string, unknown[]>()
      for (const candidate of candidates) {
        for (const [key, field] of Object.entries(object(candidate.properties) ?? {}))
          properties.set(key, [...properties.get(key) ?? [], field])
      }
      const declaredKeys = new Set([...Object.keys(object(declaration) ?? {}), ...properties.keys()])
      const keys = new Set([...Object.keys(input), ...[...declaredKeys].filter(key => Object.keys(environment).some(nameInEnv => environment[nameInEnv] !== undefined && (nameInEnv === `${name}_${segment(key)}` || nameInEnv.startsWith(`${name}_${segment(key)}_`))))])
      const entries = [...keys].map((key) => {
        if (['__proto__', 'prototype', 'constructor'].includes(key))
          throw new Error(name)
        return [key, visit(input[key], `${name}_${segment(key)}`, combined(properties.get(key) ?? candidates.map(candidate => candidate.additionalProperties)), fromEnvironment, depth + 1, object(declaration)?.[key])]
      }).filter(([, child]) => child !== undefined)
      return synthesized && !entries.length ? undefined : Object.fromEntries(entries)
    }
    if (typeof value !== 'string' || fromEnvironment)
      return value
    const full = /^\$\{[^}:]+(?::[^}]*)?\}$/.test(value)
    const resolved = value.replace(/\$\{([^}:]+)(?::([^}]*))?\}/g, (_match, key: string, fallback?: string) => {
      if (environment[key] === undefined && fallback === undefined && options.missing !== 'empty') {
        missingNames.add(key)
        throw new Error(key)
      }
      return environment[key] ?? fallback ?? ''
    })
    return full ? scalar(resolved, node, root) : resolved
  }
  try {
    return ok(visit(options.value, prefix, root, literal, 0))
  }
  catch (failure) {
    const name = failure instanceof Error && /^[A-Z_]\w*$/i.test(failure.message) ? failure.message : prefix
    if (!missingNames.has(name))
      return err(HaiConfigError.CONFIG_VALIDATION_ERROR, i18n.coreM('core_configValidationFailed'), { fields: [name] })
    return err(HaiConfigError.CONFIG_ENV_VAR_MISSING, i18n.coreM('core_configEnvVarMissing', { params: { varName: name } }))
  }
}

/**
 * 默认展开对象，数组与动态键字典保留 JSON；不做模块名称判断。
 * @example 模块内部上下文
 * ```ts
 * const values = toEnv({ prefix: 'HAI_APP', value: { name: 'Example', tags: ['demo'] } })
 * ```
 */
export function toEnv(options: { prefix: string, value: unknown, schema?: ZodType, shape?: Readonly<Record<string, unknown>> }): Record<string, string> {
  const result: Record<string, string> = {}
  const root: Shape = options.schema ? options.schema.toJSONSchema({ io: 'input', unrepresentable: 'any' }) : options.shape ?? {}
  function visit(value: unknown, name: string, node: Shape): void {
    if (!/^[A-Z][A-Z0-9_]*$/.test(name))
      throw new Error('Invalid environment variable name')
    if (value === undefined)
      return
    const input = object(value)
    const candidates = shapes(node, root, value)
    const properties = Object.assign({}, ...candidates.map(candidate => object(candidate.properties) ?? {})) as Shape
    const dynamic = candidates.some(candidate => candidate.additionalProperties === true || object(candidate.additionalProperties))
    if (input && Object.keys(input).length && !dynamic && Object.keys(input).every(key => /^[a-z][a-zA-Z0-9]*$/.test(key))) {
      for (const [key, item] of Object.entries(input))
        visit(item, `${name}_${segment(key)}`, object(properties[key]) ?? {})
    }
    else {
      result[name] = value === null || typeof value === 'object' ? JSON.stringify(value) : String(value)
    }
  }
  visit(options.value, options.prefix, root)
  return result
}
