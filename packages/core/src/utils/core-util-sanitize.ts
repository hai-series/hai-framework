/**
 * @h-ai/core — 脱敏工具
 * @module core-util-sanitize
 */

import { typeUtils } from './core-util-type.js'

/** 默认敏感字段匹配规则（仅针对凭证类字段） */
export const DEFAULT_SENSITIVE_KEY_REGEX = /(?:^|_)(?:pass|passcode|password|secret|authorization|cookie|otp|session|token)$|(?:^|_)otp_code$|(?:^|_)private_key$|(?:^|_)access_key(?:_id|_secret)?$|(?:^|_)secret_access_key$|(?:^|_)api(?:_[a-z0-9]+)*_key$|^apikey$/i

/** 默认脱敏替换值 */
export const DEFAULT_SENSITIVE_REPLACEMENT = '[REDACTED]'

/** URL/URI/endpoint 键名匹配规则（基于已归一化的 snake_case） */
const URL_LIKE_KEY_REGEX = /(?:^|_)(?:url|uri|endpoint)(?:_|$)/

/** 小型键名缓存上限，避免日志热路径重复归一化/匹配 */
const SENSITIVE_KEY_CACHE_LIMIT = 512

/** 敏感字段匹配器 */
export type SensitiveKeyMatcher = RegExp | string[] | ((key: string) => boolean)

/** 敏感字段脱敏选项 */
export interface SanitizeSensitiveFieldsOptions {
  /** 自定义敏感字段匹配规则 */
  matcher?: SensitiveKeyMatcher
  /** 自定义脱敏替换值 */
  replacement?: unknown
}

type CompiledSensitiveKeyMatcher = (key: string, normalizedKey: string) => boolean

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

/** 判断键名是否属于敏感字段 */
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
      return sanitizeUrlCredentials(value, context.urlReplacement)
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
 */
export function sanitizeSensitiveFields<T>(
  value: T,
  options: SanitizeSensitiveFieldsOptions = {},
): T {
  return sanitizeSensitiveValue(value, null, options) as T
}

/** 脱敏工具对象。 */
export const sanitize = {
  defaultSensitiveKeyRegex: DEFAULT_SENSITIVE_KEY_REGEX,
  defaultSensitiveReplacement: DEFAULT_SENSITIVE_REPLACEMENT,
  isSensitiveKey,
  sanitizeSensitiveValue,
  sanitizeSensitiveFields,
}

/** sanitize 子工具类型 */
export type SanitizeFn = typeof sanitize
