/**
 * @h-ai/core — 对象操作工具
 * @module core-util-object
 */

import { typeUtils } from './core-util-type.js'

/** 默认敏感字段匹配规则（仅针对凭证类字段） */
const DEFAULT_SENSITIVE_KEY_REGEX = /password|token|secret|api[-_]?key|access[-_]?key|authorization|cookie|session|otp|passcode/i

/** 默认脱敏替换值 */
const DEFAULT_SENSITIVE_REPLACEMENT = '[REDACTED]'

/** 敏感字段匹配器 */
export type SensitiveKeyMatcher = RegExp | string[] | ((key: string) => boolean)

/** 敏感字段脱敏选项 */
export interface SanitizeSensitiveFieldsOptions {
  /** 自定义敏感字段匹配规则 */
  matcher?: SensitiveKeyMatcher
  /** 自定义脱敏替换值 */
  replacement?: unknown
}

/** 统一字段名匹配形态（camelCase / kebab-case / snake_case → snake_case） */
function normalizeKeyForMatching(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_')
    .toLowerCase()
}

function matchesDefaultSensitiveKey(normalizedKey: string): boolean {
  if (DEFAULT_SENSITIVE_KEY_REGEX.test(normalizedKey)) {
    return true
  }

  if (normalizedKey === 'pass' || normalizedKey.endsWith('_pass')) {
    return true
  }

  if (normalizedKey === 'private_key' || normalizedKey.endsWith('_private_key')) {
    return true
  }

  return /^api(?:_[a-z0-9]+)*_key(?:$|_)/i.test(normalizedKey)
}

/** 判断值是否为可安全递归处理的普通对象 */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!typeUtils.isObject(value)) {
    return false
  }

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/** 判断键名是否属于敏感字段 */
function isSensitiveKey(
  key: string,
  matcher: SensitiveKeyMatcher = DEFAULT_SENSITIVE_KEY_REGEX,
): boolean {
  const normalizedKey = normalizeKeyForMatching(key)

  if (matcher instanceof RegExp) {
    if (matcher === DEFAULT_SENSITIVE_KEY_REGEX) {
      return matchesDefaultSensitiveKey(normalizedKey)
    }
    return matcher.test(normalizedKey)
  }

  if (Array.isArray(matcher)) {
    return matcher.some(item => normalizeKeyForMatching(item) === normalizedKey)
  }

  return matcher(key)
}

/** 判断字段名是否表示 URL/endpoint/uri */
function isUrlLikeKey(key: string): boolean {
  const normalizedKey = normalizeKeyForMatching(key)
  return normalizedKey.split('_').some(part => part === 'url' || part === 'uri' || part === 'endpoint')
}

/** 脱敏 URL 中内嵌的用户名/密码，解析失败时回退原值 */
function sanitizeUrlCredentials(url: string, replacement = DEFAULT_SENSITIVE_REPLACEMENT): string {
  try {
    const parsed = new URL(url)
    let changed = false

    if (parsed.username) {
      parsed.username = replacement
      changed = true
    }

    if (parsed.password) {
      parsed.password = replacement
      changed = true
    }

    if (!changed) {
      return parsed.toString()
    }

    return parsed.toString().replaceAll(encodeURIComponent(replacement), replacement)
  }
  catch {
    return url
  }
}

/**
 * 递归脱敏单个值。
 *
 * @param value - 原始值
 * @param key - 当前字段名；根节点传 null
 * @param options - 脱敏选项
 * @param cache - 循环引用 / 重复引用缓存
 */
function sanitizeSensitiveValue(
  value: unknown,
  key: string | null,
  options: SanitizeSensitiveFieldsOptions = {},
  cache: WeakMap<object, unknown> = new WeakMap(),
): unknown {
  const matcher = options.matcher ?? DEFAULT_SENSITIVE_KEY_REGEX
  const replacement = options.replacement ?? DEFAULT_SENSITIVE_REPLACEMENT

  if (key && typeof value === 'string' && isUrlLikeKey(key)) {
    return sanitizeUrlCredentials(value, typeof replacement === 'string' ? replacement : DEFAULT_SENSITIVE_REPLACEMENT)
  }

  if (key && isSensitiveKey(key, matcher)) {
    return replacement
  }

  if (Array.isArray(value)) {
    if (cache.has(value)) {
      return cache.get(value)
    }

    const sanitizedArray: unknown[] = []
    cache.set(value, sanitizedArray)
    for (const item of value) {
      sanitizedArray.push(sanitizeSensitiveValue(item, null, options, cache))
    }
    return sanitizedArray
  }

  if (isPlainRecord(value)) {
    if (cache.has(value)) {
      return cache.get(value)
    }

    const sanitized: Record<string, unknown> = {}
    cache.set(value, sanitized)

    for (const [childKey, childValue] of Object.entries(value)) {
      if (childKey === '__proto__' || childKey === 'constructor' || childKey === 'prototype') {
        continue
      }
      sanitized[childKey] = sanitizeSensitiveValue(childValue, childKey, options, cache)
    }

    return sanitized
  }

  return value
}

/**
 * 对对象中的敏感字段执行递归脱敏，并自动处理 URL/endpoint 字段中的内嵌凭证。
 *
 * @param value - 原始对象/数组/值
 * @param options - 脱敏选项
 * @returns 脱敏后的新值
 */
function sanitizeSensitiveFields<T>(
  value: T,
  options: SanitizeSensitiveFieldsOptions = {},
): T {
  return sanitizeSensitiveValue(value, null, options) as T
}

/**
 * 深度克隆对象。
 * 使用 structuredClone（Node 17+ / 现代浏览器），支持 Date、Map、Set、RegExp、
 * ArrayBuffer、循环引用等 JSON 方案无法处理的类型。
 *
 * @param obj - 目标对象
 * @returns 深度克隆结果
 *
 * @example
 * ```ts
 * const cloned = object.deepClone({ a: 1, d: new Date() })
 * ```
 */
function deepClone<T>(obj: T): T {
  return structuredClone(obj)
}

/**
 * 深度合并多个对象。
 * @param objects - 需要合并的对象列表
 * @returns 合并后的新对象
 * @remarks 仅合并纯对象字段，数组会被直接覆盖。
 *
 * @example
 * ```ts
 * const merged = object.deepMerge({ a: 1 }, { b: 2 })
 * ```
 */
function deepMerge<T extends Record<string, unknown>>(...objects: Partial<T>[]): T {
  const result = {} as Record<string, unknown>
  for (const obj of objects) {
    for (const key in obj) {
      if (!Object.hasOwn(obj, key))
        continue
      // 防止原型污染（拦截 JSON.parse 产生的 __proto__、constructor 等危险键）
      if (key === '__proto__' || key === 'constructor' || key === 'prototype')
        continue
      const val = obj[key]
      if (typeUtils.isObject(val) && typeUtils.isObject(result[key])) {
        result[key] = deepMerge(
          result[key] as Record<string, unknown>,
          val as Record<string, unknown>,
        )
      }
      else {
        result[key] = val
      }
    }
  }
  return result as T
}

/**
 * 从对象中选取指定的键。
 * @param obj - 目标对象
 * @param keys - 要选取的键列表
 * @returns 仅包含指定键的新对象
 *
 * @example
 * ```ts
 * object.pick({ a: 1, b: 2 }, ['a'])
 * ```
 */
function pick<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[],
): Pick<T, K> {
  const result = {} as Pick<T, K>
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key]
    }
  }
  return result
}

/**
 * 从对象中排除指定的键。
 * @param obj - 目标对象
 * @param keys - 要排除的键列表
 * @returns 排除指定键后的新对象
 *
 * @example
 * ```ts
 * object.omit({ a: 1, b: 2 }, ['b'])
 * ```
 */
function omit<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[],
): Omit<T, K> {
  const result = { ...obj }
  for (const key of keys) {
    delete result[key]
  }
  return result as Omit<T, K>
}

/**
 * 获取对象的所有键。
 * @param obj - 目标对象
 * @returns 键列表
 *
 * @example
 * ```ts
 * object.keys({ a: 1, b: 2 })
 * ```
 */
function keys<T extends Record<string, unknown>>(obj: T): (keyof T)[] {
  return Object.keys(obj) as (keyof T)[]
}

/**
 * 获取对象的所有值。
 * @param obj - 目标对象
 * @returns 值列表
 *
 * @example
 * ```ts
 * object.values({ a: 1, b: 2 })
 * ```
 */
function values<T extends Record<string, unknown>>(obj: T): T[keyof T][] {
  return Object.values(obj) as T[keyof T][]
}

/**
 * 获取对象的键值对数组。
 * @param obj - 目标对象
 * @returns 键值对数组
 *
 * @example
 * ```ts
 * object.entries({ a: 1 })
 * ```
 */
function entries<T extends Record<string, unknown>>(obj: T): [keyof T, T[keyof T]][] {
  return Object.entries(obj) as [keyof T, T[keyof T]][]
}

/**
 * 从键值对数组创建对象。
 * @param entries - 键值对数组
 * @returns 生成的对象
 *
 * @example
 * ```ts
 * object.fromEntries([['a', 1]])
 * ```
 */
function fromEntries<K extends string, V>(entries: [K, V][]): Record<K, V> {
  return Object.fromEntries(entries) as Record<K, V>
}

/**
 * 对象操作工具对象。
 *
 * @example
 * ```ts
 * object.deepMerge({ a: 1 }, { b: 2 })
 * ```
 */
export const object = {
  deepClone,
  deepMerge,
  pick,
  omit,
  keys,
  values,
  entries,
  fromEntries,
  defaultSensitiveKeyRegex: DEFAULT_SENSITIVE_KEY_REGEX,
  defaultSensitiveReplacement: DEFAULT_SENSITIVE_REPLACEMENT,
  isSensitiveKey,
  sanitizeSensitiveValue,
  sanitizeSensitiveFields,
}

/** object 子工具类型 */
export type ObjectFn = typeof object
