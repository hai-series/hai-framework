/**
 * @h-ai/core — 脱敏工具
 * @module core-util-sanitize
 */

import { typeUtils } from './core-util-type.js'

/**
 * 默认敏感字段匹配规则（仅针对凭证类字段）
 * @example
 * ```ts
 * import { core } from '@h-ai/core'
 * const credential = core.sanitize.isSensitiveKey('apiKey') // true
 * ```
 */
export const DEFAULT_SENSITIVE_KEY_REGEX = /(?:^|_)(?:pass|passcode|password|secret|authorization|cookie|otp|session|token)$|(?:^|_)otp_code$|(?:^|_)private_key$|(?:^|_)access_key(?:_id|_secret)?$|(?:^|_)secret_access_key$|(?:^|_)api(?:_[a-z0-9]+)*_key$|^apikey$/i

/**
 * 默认脱敏替换值
 * @example
 * ```ts
 * import { core } from '@h-ai/core'
 * const snapshot = core.sanitize.sanitizeSensitiveFields({ password: 'example-only' })
 * const replacement = core.sanitize.defaultSensitiveReplacement
 * ```
 */
export const DEFAULT_SENSITIVE_REPLACEMENT = '[REDACTED]'

/** URL/URI/endpoint 键名匹配规则（基于已归一化的 snake_case） */
const URL_LIKE_KEY_REGEX = /(?:^|_)(?:url|uri|endpoint)(?:_|$)/

/** 小型键名缓存上限，避免日志热路径重复归一化/匹配 */
const SENSITIVE_KEY_CACHE_LIMIT = 512

/**
 * 敏感字段匹配器
 * @example 模块内部上下文
 * ```ts
 * const matcher: SensitiveKeyMatcher = ['password', 'credential']
 * const safe = sanitizeSensitiveFields({ credential: 'example-only', id: 'order-1' }, { matcher })
 * ```
 */
export type SensitiveKeyMatcher = RegExp | string[] | ((key: string) => boolean)

/**
 * 敏感字段脱敏选项
 * @example 模块内部上下文
 * ```ts
 * const options: SanitizeSensitiveFieldsOptions = { matcher: ['credential'], replacement: '[HIDDEN]' }
 * const safe = sanitizeSensitiveFields({ credential: 'example-only' }, options)
 * ```
 */
export interface SanitizeSensitiveFieldsOptions {
  /** 自定义敏感字段匹配规则 */
  matcher?: SensitiveKeyMatcher
  /** 自定义脱敏替换值 */
  replacement?: unknown
}

/**
 * 已编译的敏感键匹配函数；第二个参数是已归一化字段名。
 * @example 模块内部上下文
 * ```ts
 * const matches: CompiledSensitiveKeyMatcher = (_key, normalizedKey) => normalizedKey === 'password'
 * const sensitive = matches('Password', 'password')
 * ```
 */
type CompiledSensitiveKeyMatcher = (key: string, normalizedKey: string) => boolean

/**
 * 单次递归脱敏共享的替换值与匹配器；不保存业务输入。
 * @example 模块内部上下文
 * ```ts
 * const context: SanitizeSensitiveContext = { replacement: '[HIDDEN]', urlReplacement: '[HIDDEN]', isSensitiveKey: (_key, normalizedKey) => normalizedKey === 'password' }
 * const sensitive = context.isSensitiveKey('Password', 'password')
 * ```
 */
interface SanitizeSensitiveContext {
  replacement: unknown
  urlReplacement: string
  isSensitiveKey: CompiledSensitiveKeyMatcher
}

const normalizedKeyCache = new Map<string, string>()
const urlLikeKeyCache = new Map<string, boolean>()
const defaultSensitiveKeyCache = new Map<string, boolean>()

function getCachedValue<K, V>(cache: Map<K, V>, key: K, createValue: () => V): V {
  const cachedValue = cache.get(key)
  if (cachedValue !== undefined) {
    return cachedValue
  }

  const value = createValue()
  if (cache.size >= SENSITIVE_KEY_CACHE_LIMIT) {
    cache.clear()
  }
  cache.set(key, value)
  return value
}

/** 统一字段名匹配形态（camelCase / kebab-case / snake_case → snake_case） */
function normalizeKeyForMatching(key: string): string {
  return getCachedValue(normalizedKeyCache, key, () => {
    return key
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/[\s-]+/g, '_')
      .replace(/_+/g, '_')
      .toLowerCase()
  })
}

function matchesDefaultSensitiveKey(normalizedKey: string): boolean {
  return getCachedValue(defaultSensitiveKeyCache, normalizedKey, () => {
    return DEFAULT_SENSITIVE_KEY_REGEX.test(normalizedKey)
  })
}

/** 判断值是否为可安全递归处理的普通对象 */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!typeUtils.isObject(value)) {
    return false
  }

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function compileSensitiveKeyMatcher(matcher: SensitiveKeyMatcher): CompiledSensitiveKeyMatcher {
  if (matcher instanceof RegExp) {
    if (matcher === DEFAULT_SENSITIVE_KEY_REGEX) {
      return (_key, normalizedKey) => matchesDefaultSensitiveKey(normalizedKey)
    }

    const safeMatcher = matcher.global || matcher.sticky
      ? new RegExp(matcher.source, matcher.flags.replace(/[gy]/g, ''))
      : matcher

    return (_key, normalizedKey) => safeMatcher.test(normalizedKey)
  }

  if (Array.isArray(matcher)) {
    const normalizedKeys = new Set(matcher.map(normalizeKeyForMatching))
    return (_key, normalizedKey) => normalizedKeys.has(normalizedKey)
  }

  return key => matcher(key)
}

/**
 * 判断键名是否属于敏感字段
 * @param key - 原始字段名；会统一 camelCase、kebab-case 与 snake_case。
 * @param matcher - 自定义规则；省略时使用凭证字段默认规则。
 * @returns 当前字段名是否被匹配为敏感字段。
 * @example
 * ```ts
 * import { core } from '@h-ai/core'
 * const safe = core.sanitize.isSensitiveKey('apiKey')
 * ```
 */
export function isSensitiveKey(
  key: string,
  matcher: SensitiveKeyMatcher = DEFAULT_SENSITIVE_KEY_REGEX,
): boolean {
  const normalizedKey = normalizeKeyForMatching(key)

  return compileSensitiveKeyMatcher(matcher)(key, normalizedKey)
}

function isUrlLikeNormalizedKey(normalizedKey: string): boolean {
  return getCachedValue(urlLikeKeyCache, normalizedKey, () => URL_LIKE_KEY_REGEX.test(normalizedKey))
}

/**
 * 遮蔽 URL 的用户名、密码及敏感查询参数；OAuth 风格 fragment 按查询参数处理。
 *
 * 解析失败返回固定占位符，避免畸形地址把凭据原样写入日志。
 *
 * @param url - 待记录的绝对 URL
 * @param options - 与对象脱敏一致的匹配规则和替换值
 * @returns 可安全用于结构化日志的 URL
 * @example
 * ```ts
 * import { core } from '@h-ai/core'
 * const safe = core.sanitize.sanitizeUrl('https://service.example/path?token=example-only')
 * ```
 */
export function sanitizeUrl(url: string, options: SanitizeSensitiveFieldsOptions = {}): string {
  return sanitizeUrlWithContext(url, createSanitizeSensitiveContext(options))
}

/** 保留参数顺序和重复项，名称由 URLSearchParams 解码后再匹配。 */
function sanitizeUrlParameters(parameters: URLSearchParams, context: SanitizeSensitiveContext): URLSearchParams {
  const sanitized = new URLSearchParams()
  for (const [key, value] of parameters) {
    sanitized.append(key, context.isSensitiveKey(key, normalizeKeyForMatching(key)) ? context.urlReplacement : value)
  }
  return sanitized
}

function sanitizeUrlWithContext(url: string, context: SanitizeSensitiveContext): string {
  try {
    const parsed = new URL(url)

    if (parsed.username) {
      parsed.username = context.urlReplacement
    }

    if (parsed.password) {
      parsed.password = context.urlReplacement
    }

    parsed.search = sanitizeUrlParameters(parsed.searchParams, context).toString()
    // 普通锚点保留；带键值对的 fragment 可能携带 OAuth access_token。
    if (parsed.hash.includes('='))
      parsed.hash = sanitizeUrlParameters(new URLSearchParams(parsed.hash.slice(1)), context).toString()

    return parsed.toString().replaceAll(encodeURIComponent(context.urlReplacement), context.urlReplacement)
  }
  catch {
    return '(invalid url)'
  }
}

function isProtectedPropertyKey(key: string): boolean {
  return key === '__proto__' || key === 'constructor' || key === 'prototype'
}

function createSanitizeSensitiveContext(
  options: SanitizeSensitiveFieldsOptions = {},
): SanitizeSensitiveContext {
  const replacement = options.replacement ?? DEFAULT_SENSITIVE_REPLACEMENT

  return {
    replacement,
    urlReplacement: typeof replacement === 'string' ? replacement : DEFAULT_SENSITIVE_REPLACEMENT,
    isSensitiveKey: compileSensitiveKeyMatcher(options.matcher ?? DEFAULT_SENSITIVE_KEY_REGEX),
  }
}

function sanitizeSensitiveValueWithContext(
  value: unknown,
  key: string | null,
  context: SanitizeSensitiveContext,
  cache: WeakMap<object, unknown>,
): unknown {
  const isPlainObjectValue = isPlainRecord(value)

  if (key !== null) {
    const normalizedKey = normalizeKeyForMatching(key)

    if (typeof value === 'string' && isUrlLikeNormalizedKey(normalizedKey)) {
      return sanitizeUrlWithContext(value, context)
    }

    if (context.isSensitiveKey(key, normalizedKey) && !isPlainObjectValue) {
      return context.replacement
    }
  }

  if (Array.isArray(value)) {
    if (cache.has(value)) {
      return cache.get(value)
    }

    const sanitizedArray: unknown[] = []
    cache.set(value, sanitizedArray)
    for (let index = 0; index < value.length; index++) {
      sanitizedArray[index] = sanitizeSensitiveValueWithContext(value[index], null, context, cache)
    }
    return sanitizedArray
  }

  if (isPlainObjectValue) {
    if (cache.has(value)) {
      return cache.get(value)
    }

    const sanitized: Record<string, unknown> = {}
    cache.set(value, sanitized)

    for (const childKey in value) {
      if (!Object.hasOwn(value, childKey) || isProtectedPropertyKey(childKey)) {
        continue
      }
      sanitized[childKey] = sanitizeSensitiveValueWithContext(value[childKey], childKey, context, cache)
    }

    return sanitized
  }

  return value
}

/**
 * 递归脱敏单个值。
 *
 * @param value - 原始值
 * @param key - 当前字段名；根节点传 null
 * @param options - 脱敏选项
 * @param cache - 循环引用 / 重复引用缓存
 * @returns 递归脱敏后的值；循环引用保留结构，原值不被修改。
 * @example
 * ```ts
 * import { core } from '@h-ai/core'
 * const safe = core.sanitize.sanitizeSensitiveValue('example-only', 'password')
 * ```
 */
export function sanitizeSensitiveValue(
  value: unknown,
  key: string | null,
  options: SanitizeSensitiveFieldsOptions = {},
  cache: WeakMap<object, unknown> = new WeakMap(),
): unknown {
  return sanitizeSensitiveValueWithContext(value, key, createSanitizeSensitiveContext(options), cache)
}

/**
 * 对对象中的敏感字段执行递归脱敏，并自动处理 URL/endpoint 字段中的内嵌凭证。
 *
 * @param value - 原始对象/数组/值
 * @param options - 脱敏选项
 * @returns 脱敏后的新值
 * @example
 * ```ts
 * import { core } from '@h-ai/core'
 * const safe = core.sanitize.sanitizeSensitiveFields({ password: 'example-only', id: 'order-1' })
 * ```
 */
export function sanitizeSensitiveFields<T>(
  value: T,
  options: SanitizeSensitiveFieldsOptions = {},
): T {
  return sanitizeSensitiveValue(value, null, options) as T
}

/**
 * 脱敏工具对象。
 * @example
 * ```ts
 * import { core } from '@h-ai/core'
 * const tools = core.sanitize
 * tools.sanitizeSensitiveFields({ apiKey: 'example-only', id: 'order-1' })
 * ```
 */
export const sanitize = {
  defaultSensitiveKeyRegex: DEFAULT_SENSITIVE_KEY_REGEX,
  defaultSensitiveReplacement: DEFAULT_SENSITIVE_REPLACEMENT,
  isSensitiveKey,
  sanitizeUrl,
  sanitizeSensitiveValue,
  sanitizeSensitiveFields,
}

/**
 * sanitize 子工具类型
 * @example 模块内部上下文
 * ```ts
 * const tools: SanitizeFn = sanitize
 * tools.sanitizeSensitiveFields({ apiKey: 'example-only', id: 'order-1' })
 * ```
 */
export type SanitizeFn = typeof sanitize
