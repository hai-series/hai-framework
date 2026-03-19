/**
 * @h-ai/core — i18n 国际化工具
 *
 * 国际化核心实现，为 JSON 消息字典提供通用类型支持。
 * @module core-i18n-utils
 */

import type { InterpolationParams, Locale, LocaleInfo, LocaleMessages, MessageOptions } from '../core-types.js'
import messagesEnUS from '../../messages/en-US.json'
import messagesZhCN from '../../messages/zh-CN.json'

// ─── 常量 ───

/**
 * 默认支持的语言列表。
 *
 * 目前支持简体中文和英文。
 */
const DEFAULT_LOCALES: LocaleInfo[] = [
  { code: 'zh-CN', label: '简体中文' },
  { code: 'en-US', label: 'English' },
]

/**
 * 默认语言（简体中文）。
 */
const DEFAULT_LOCALE: Locale = 'zh-CN'

// ─── 字符串插值 ───

/**
 * 执行字符串插值。
 *
 * 将模板中的 `{key}` 占位符替换为 params 中对应的值，缺失的参数保留占位符。
 *
 * @param template - 模板字符串，如 'Hello, {name}!'
 * @param params - 插值参数
 * @returns 插值后的字符串
 *
 * @example
 * ```ts
 * interpolate('Hello, {name}!', { name: 'World' })
 * // => 'Hello, World!'
 * ```
 */
function interpolate(template: string, params: InterpolationParams): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const value = params[key]
    return value !== undefined ? String(value) : `{${key}}`
  })
}

// ─── Locale 工具函数 ───

/**
 * 检查语言是否在支持列表中。
 *
 * @param locale - 要检查的语言代码
 * @param supportedLocales - 支持的语言列表
 * @returns 是否支持
 *
 * @example
 * ```ts
 * isLocaleSupported('zh-CN') // true
 * isLocaleSupported('fr-FR') // false
 * ```
 */
function isLocaleSupported(
  locale: Locale,
  supportedLocales: LocaleInfo[] = DEFAULT_LOCALES,
): boolean {
  return supportedLocales.some(l => l.code === locale)
}

/**
 * 获取有效的语言代码（不支持时回退到默认语言）。
 *
 * @param locale - 请求的语言代码
 * @param supportedLocales - 支持的语言列表
 * @param fallback - 回退语言
 * @returns 有效的语言代码
 *
 * @example
 * ```ts
 * resolveLocale('fr-FR') // 'zh-CN'（回退）
 * resolveLocale('en-US') // 'en-US'
 * ```
 */
function resolveLocale(
  locale: Locale | undefined,
  supportedLocales: LocaleInfo[] = DEFAULT_LOCALES,
  fallback: Locale = DEFAULT_LOCALE,
): Locale {
  if (locale && isLocaleSupported(locale, supportedLocales)) {
    return locale
  }
  return fallback
}

/**
 * 检测浏览器首选语言。
 *
 * 依次尝试精确匹配和语言代码前缀匹配。仅在浏览器环境可用。
 *
 * @param supportedLocales - 支持的语言列表
 * @returns 检测到的语言代码；不支持或非浏览器环境时返回 undefined
 *
 * @example
 * ```ts
 * detectBrowserLocale() // 'zh-CN' 或 'en-US' 或 undefined
 * ```
 */
function detectBrowserLocale(supportedLocales: LocaleInfo[] = DEFAULT_LOCALES): Locale | undefined {
  if (typeof navigator === 'undefined') {
    return undefined
  }

  const browserLocales = navigator.languages || [navigator.language]

  for (const browserLocale of browserLocales) {
    // 精确匹配
    const exactMatch = supportedLocales.find(l => l.code === browserLocale)
    if (exactMatch) {
      return exactMatch.code
    }

    // 语言代码前缀匹配（如 'zh' 匹配 'zh-CN'）
    const langCode = browserLocale.split('-')[0]
    const partialMatch = supportedLocales.find(l => l.code.startsWith(langCode))
    if (partialMatch) {
      return partialMatch.code
    }
  }

  return undefined
}

// ─── 全局 Locale 状态管理 ───

/** 当前全局 locale */
let currentLocale: Locale = DEFAULT_LOCALE

/** 请求级 locale 解析器（可选） */
let requestLocaleResolver: (() => Locale | undefined) | null = null

/**
 * 规范化简写语言代码。
 *
 * 将 'en' 映射为 'en-US'，'zh' 映射为 'zh-CN'，其他原样返回。
 *
 * @param locale - 输入的语言代码
 * @returns 规范化后的语言代码
 */
function normalizeLocale(locale: Locale): Locale {
  if (locale === 'en')
    return 'en-US'
  if (locale === 'zh')
    return 'zh-CN'
  return locale
}

/**
 * 获取当前全局 locale。
 *
 * @returns 当前生效的 locale 代码
 */
function getGlobalLocale(): Locale {
  return currentLocale
}

/**
 * 注册请求级 locale 解析器。
 *
 * 服务端可在请求上下文中注入 locale（例如基于 AsyncLocalStorage），
 * createMessageGetter 会优先读取该 locale，再回退到全局 locale。
 *
 * @param resolver - 返回当前请求 locale 的函数；传 null 可清除
 */
function setRequestLocaleResolver(resolver: (() => Locale | undefined) | null): void {
  requestLocaleResolver = resolver
}

/**
 * 设置全局 locale。
 *
 * 会自动规范化简写（如 'en' → 'en-US'），然后通知所有订阅者。
 * 若值未变化则不触发通知。
 *
 * @param locale - 目标 locale 代码
 */
function setGlobalLocale(locale: Locale): void {
  const normalized = normalizeLocale(locale)

  if (currentLocale === normalized) {
    return
  }

  currentLocale = normalized
}

/**
 * 获取当前消息解析应使用的 locale。
 *
 * 优先级：请求级 resolver > 全局 locale。
 */
function getEffectiveLocale(): Locale {
  const requestLocale = requestLocaleResolver?.()
  if (requestLocale) {
    return normalizeLocale(requestLocale)
  }
  return currentLocale
}

// ─── 消息解析 ───

/**
 * 从消息字典中解析消息文本。
 *
 * 按 locale 查找 → 回退到默认语言 → 找不到 key 时返回 key 本身。
 *
 * @param messages - 多语言消息集合
 * @param key - 消息 key
 * @param options - 消息选项（locale 覆盖、插值参数）
 * @returns 解析后的消息文本
 */
function resolveMessage<K extends string>(
  messages: LocaleMessages<K>,
  key: K,
  options: MessageOptions | undefined,
): string {
  const locale = resolveLocale(
    options?.locale ?? getEffectiveLocale(),
    DEFAULT_LOCALES,
    DEFAULT_LOCALE,
  )

  const dict = messages[locale] ?? messages[DEFAULT_LOCALE]
  if (!dict) {
    return String(key)
  }

  const template = dict[key]
  if (template === undefined) {
    return String(key)
  }

  if (options?.params) {
    return interpolate(template, options.params)
  }

  return template
}

/**
 * 创建消息获取函数。
 *
 * 各模块通过此函数创建自己的消息获取器，自动读取全局 locale。
 *
 * @param messages - 多语言消息对象
 * @returns 消息获取函数
 *
 * @example
 * ```ts
 * const getMessage = createMessageGetter({
 *   'zh-CN': { hello: '你好' },
 *   'en-US': { hello: 'Hello' },
 * })
 * getMessage('hello')
 * getMessage('hello', { locale: 'en-US' })
 * getMessage('hello', { params: { name: 'World' } })
 * ```
 */
function createMessageGetter<K extends string>(
  messages: LocaleMessages<K>,
): (key: K, options?: MessageOptions) => string {
  return (key: K, options?: MessageOptions): string => {
    return resolveMessage(messages, key, options)
  }
}

// ─── Core 内置消息 ───

/** Core 内置消息 key 类型。 */
type CoreMessageKey = keyof typeof messagesZhCN

/**
 * Core 内置消息获取器。
 *
 * @example
 * ```ts
 * coreM('core_errorTimeout')
 * coreM('core_validationRequired', { params: { field: '用户名' } })
 * ```
 */
const coreM = createMessageGetter<CoreMessageKey>({
  'zh-CN': messagesZhCN,
  'en-US': messagesEnUS,
})

// ─── 对外入口 ───

/**
 * i18n 工具集合。
 *
 * @example
 * ```ts
 * i18n.setGlobalLocale('en-US')
 * i18n.coreM('core_errorTimeout')
 *
 * const getMessage = i18n.createMessageGetter({
 *   'zh-CN': { ok: '好' },
 *   'en-US': { ok: 'OK' },
 * })
 * getMessage('ok')
 * ```
 */
export const i18n = {
  /** 默认支持的语言列表 */
  DEFAULT_LOCALES,
  /** 默认语言 */
  DEFAULT_LOCALE,
  /** 字符串插值（将 `{key}` 替换为 params 中的值） */
  interpolate,
  /** 检测浏览器首选语言 */
  detectBrowserLocale,
  /** 检查语言是否在支持列表中 */
  isLocaleSupported,
  /** 获取有效的语言代码（不支持时回退到默认语言） */
  resolveLocale,
  /** 设置全局 locale（所有 createMessageGetter 创建的函数自动响应） */
  setGlobalLocale,
  /** 设置请求级 locale 解析器（优先于全局 locale） */
  setRequestLocaleResolver,
  /** 获取当前全局 locale */
  getGlobalLocale,
  /** 创建消息获取函数（读取全局 locale） */
  createMessageGetter,
  /** Core 内置消息获取器 */
  coreM,
}
