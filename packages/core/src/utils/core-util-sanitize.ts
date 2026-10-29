import type { SanitizeSensitiveFieldsOptions, SensitiveKeyMatcher } from '../core-types.js'
/**
 * @h-ai/core — 脱敏工具
 * @module core-util-sanitize
 */

import { typeUtils } from './core-util-type.js'

// 普通引号与一层 JSON 转义引号共用一套文本规则；结构化字段仍按下方键名规则处理。
const CREDENTIAL_TEXT = /\b(?:Bearer|Basic)\s+[\w.~+/-]+=*|\b(?:[\w-]*[_-])?(?:password(?:[_-]?hash)?|passwd|passcode|secret(?:[_-]?key)?|token|session(?:[_-]?id)?|authorization|cookie|csrf|credential|captcha|reauthentication|ticket|api[_-]?key|private[_-]?key|(?:access|refresh|id|csrf)token|(?:otp|totp|verification|verify|captcha|sms|email|auth|one[_-]?time|two[_-]?factor)[_-]?code)(?:\\?["'])?\s*[:=]\s*(?:(?:Bearer|Basic)\s+)?(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\\"(?:[^\\]|\\\\\\\\|\\\\\\"|\\\\[^"\\])*\\"|[^\s,;&}\]]+)/gi

/**
 * 清理诊断文本中的显式凭据、URL 凭据及调用方已知的秘密值；不猜测无标签的任意文本。
 * @example
 * ```ts
 * import { core } from '@h-ai/core'
 * const safe = core.sanitize.sanitizeText('verificationCode=123456')
 * ```
 */
export function sanitizeText(text: string, secretValues: readonly string[] = []): string {
  let result = text
  for (const value of [...new Set(secretValues)].filter(Boolean).sort((a, b) => b.length - a.length))
    result = result.replaceAll(value, '[REDACTED]')
  return result.replace(/\b[a-z][a-z\d+.-]*:\/\/[^\s<>"']+/gi, url => sanitizeUrl(url)).replace(CREDENTIAL_TEXT, match => match.includes('[REDACTED') ? match : '[REDACTED]')
}

/**
 * 默认敏感字段匹配规则（仅针对凭证类字段）
 * @example
 * ```ts
 * import { core } from '@h-ai/core'
 * const credential = core.sanitize.isSensitiveKey('apiKey') // true
 * ```
 */
export const DEFAULT_SENSITIVE_KEY_REGEX = /(?:^|_)(?:pass|passwd|passcode|password(?:_hash)?|secret(?:_key)?|authorization|cookie|otp|captcha|reauthentication|ticket|session|token)$|(?:^|_)(?:otp|totp|verification|verify|captcha|sms|email|auth|one_time|two_factor)_code$|(?:^|_)private_key$|(?:^|_)access_key(?:_id|_secret)?$|(?:^|_)secret_access_key$|(?:^|_)api(?:_[a-z0-9]+)*_key$|^apikey$/i

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

/** Error 诊断子图的递归上限；普通对象的循环缓存策略保持不变。 */
const ERROR_DIAGNOSTIC_MAX_DEPTH = 32

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

/**
 * 复用字段/URL 规则递归脱敏；仅异常子图使用活动路径与固定深度避免 JSON 环。
 * @param value - 当前原值。
 * @param key - 当前字段名；根或数组条目传 null。
 * @param context - 本次脱敏的匹配与替换规则。
 * @param cache - 普通对象的循环/共享引用缓存。
 * @param errorPath - Error 子图的当前祖先集合；不复用普通对象缓存。
 * @param errorDepth - Error 子图深度；达到上限返回固定标记。
 * @returns 脱敏副本；普通对象循环保留，异常诊断是有界树。
 * @example 模块内部上下文
 * ```ts
 * const diagnostic = sanitizeSensitiveValueWithContext(new Error('Request failed'), null, createSanitizeSensitiveContext(), new WeakMap())
 * ```
 */
function sanitizeSensitiveValueWithContext(
  value: unknown,
  key: string | null,
  context: SanitizeSensitiveContext,
  cache: WeakMap<object, unknown>,
  errorPath?: WeakSet<object>,
  errorDepth = 0,
): unknown {
  const isPlainObjectValue = isPlainRecord(value)
  const errorValue = value instanceof Error ? value : typeof DOMException !== 'undefined' && value instanceof DOMException ? value : undefined
  const isErrorDiagnostic = errorPath !== undefined || errorValue !== undefined

  if (key !== null) {
    const normalizedKey = normalizeKeyForMatching(key)

    if (typeof value === 'string' && isUrlLikeNormalizedKey(normalizedKey)) {
      return sanitizeUrlWithContext(value, context)
    }

    if (context.isSensitiveKey(key, normalizedKey) && !isPlainObjectValue) {
      // 自定义替换值也可能是 bigint 或循环对象；只在异常子图内转成有界诊断值。
      return isErrorDiagnostic
        ? sanitizeSensitiveValueWithContext(context.replacement, null, context, cache, errorPath ?? new WeakSet<object>(), errorDepth)
        : context.replacement
    }
  }

  // Error 诊断不复用普通对象缓存，避免 cause/context 回指外层对象后重新形成循环。
  if (isErrorDiagnostic) {
    if (typeof value === 'bigint')
      return value.toString()
    if (typeof value === 'function' || typeof value === 'symbol')
      return undefined
    if (value === null || typeof value !== 'object')
      return typeof value === 'string' ? sanitizeText(value) : value

    const activePath = errorPath ?? new WeakSet<object>()
    if (activePath.has(value))
      return '[Circular]'
    if (errorDepth >= ERROR_DIAGNOSTIC_MAX_DEPTH)
      return '[MaxDepth]'

    activePath.add(value)
    try {
      if (Array.isArray(value)) {
        return value.map(item => sanitizeSensitiveValueWithContext(item, null, context, cache, activePath, errorDepth + 1))
      }

      // 只复制枚举上下文，显式补齐原生异常的非枚举诊断；不调用原对象的 toJSON。
      const fields: Record<string, unknown> = { ...value }
      if (errorValue) {
        fields.name = errorValue.name
        fields.message = errorValue.message
        if ('stack' in errorValue)
          fields.stack = errorValue.stack
        if (Object.hasOwn(errorValue, 'cause') && 'cause' in errorValue)
          fields.cause = errorValue.cause
        if (errorValue instanceof AggregateError)
          fields.errors = errorValue.errors
      }

      const sanitized: Record<string, unknown> = {}
      for (const [childKey, childValue] of Object.entries(fields)) {
        if (!isProtectedPropertyKey(childKey))
          sanitized[childKey] = sanitizeSensitiveValueWithContext(childValue, childKey, context, cache, activePath, errorDepth + 1)
      }
      return sanitized
    }
    finally {
      activePath.delete(value)
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
 * @returns 递归脱敏后的值；普通对象循环保留，Error 规范化为有界诊断树，原值不被修改。
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
 * Error 保留 name/message/stack/cause、aggregate errors 与枚举上下文；错误子图循环和过深路径用固定标记，普通对象循环保留。
 * 诊断文本不会自动解析自由文本中的秘密；记录前仍需调用方清理，或配置明确的 redact 路径。
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
  sanitizeText,
  sanitizeSensitiveValue,
  sanitizeSensitiveFields,
}
