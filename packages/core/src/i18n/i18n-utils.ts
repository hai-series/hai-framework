/**
 * =============================================================================
 * @hai/core - i18n 核心类型定义
 * =============================================================================
 * 国际化核心类型，为 Paraglide 生成的消息提供通用类型支持
 *
 * 设计原则：
 * - 显式传 locale：库包不维护全局 locale 状态，由应用层决定并传入
 * - Paraglide 优先：翻译由 Paraglide 编译生成，此模块提供辅助工具
 * - 类型安全：完整的 TypeScript 类型支持
 * =============================================================================
 */

/**
 * 语言代码（ISO 639-1 + 地区代码）
 * @example 'zh-CN', 'en-US', 'ja-JP'
 */
export type Locale = string

/**
 * 语言信息
 */
export interface LocaleInfo {
  /** 语言代码 */
  code: Locale
  /** 显示名称 */
  label: string
  /** 是否为 RTL 语言 */
  rtl?: boolean
}

/**
 * 插值参数类型
 */
export type InterpolationParams = Record<string, string | number | boolean>

/**
 * 默认支持的语言列表
 */
export const DEFAULT_LOCALES: LocaleInfo[] = [
  { code: 'zh-CN', label: '简体中文' },
  { code: 'en-US', label: 'English' },
]

/**
 * 默认语言
 */
export const DEFAULT_LOCALE: Locale = 'zh-CN'

// =============================================================================
// 工具函数
// =============================================================================

/**
 * 执行字符串插值
 * @param template - 模板字符串，如 'Hello, {name}!'
 * @param params - 插值参数
 * @returns 插值后的字符串
 *
 * @example
 * interpolate('Hello, {name}!', { name: 'World' }) // => 'Hello, World!'
 */
export function interpolate(template: string, params: InterpolationParams): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const value = params[key]
    return value !== undefined ? String(value) : `{${key}}`
  })
}

/**
 * 检测浏览器首选语言
 * @param supportedLocales - 支持的语言列表
 * @returns 检测到的语言代码，如果不支持则返回 undefined
 */
export function detectBrowserLocale(supportedLocales: LocaleInfo[] = DEFAULT_LOCALES): Locale | undefined {
  // 仅在浏览器环境中可用
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

    // 语言代码匹配（如 'zh' 匹配 'zh-CN'）
    const langCode = browserLocale.split('-')[0]
    const partialMatch = supportedLocales.find(l => l.code.startsWith(langCode))
    if (partialMatch) {
      return partialMatch.code
    }
  }

  return undefined
}

/**
 * 检查语言是否支持
 * @param locale - 要检查的语言代码
 * @param supportedLocales - 支持的语言列表
 */
export function isLocaleSupported(
  locale: Locale,
  supportedLocales: LocaleInfo[] = DEFAULT_LOCALES,
): boolean {
  return supportedLocales.some(l => l.code === locale)
}

/**
 * 获取有效的语言代码（如果不支持则返回默认语言）
 * @param locale - 请求的语言代码
 * @param supportedLocales - 支持的语言列表
 * @param fallback - 回退语言
 */
export function resolveLocale(
  locale: Locale | undefined,
  supportedLocales: LocaleInfo[] = DEFAULT_LOCALES,
  fallback: Locale = DEFAULT_LOCALE,
): Locale {
  if (locale && isLocaleSupported(locale, supportedLocales)) {
    return locale
  }
  return fallback
}

// =============================================================================
// 消息管理器
// =============================================================================

/**
 * 消息字典类型
 */
export type MessageDictionary = Record<string, string>

/**
 * 多语言消息集合
 */
export type LocaleMessages<K extends string = string> = Record<Locale, Record<K, string>>

/**
 * 创建消息获取函数
 *
 * 用于各模块创建自己的 getMessage 函数，统一消息加载和插值逻辑。
 *
 * @param messages - 多语言消息对象
 * @param initialLocale - 默认语言，默认 'zh-CN'
 * @returns 消息获取函数和设置默认语言函数
 *
 * @example
 * ```ts
 * // db 模块
 * import messagesZhCN from '../messages/zh-CN.json'
 * import messagesEnUS from '../messages/en-US.json'
 *
 * const { getMessage, setDefaultLocale } = createMessageGetter({
 *   'zh-CN': messagesZhCN,
 *   'en-US': messagesEnUS,
 * })
 *
 * export const getDbMessage = getMessage
 * export const setDbDefaultLocale = setDefaultLocale
 * ```
 */
export function createMessageGetter<K extends string>(
  messages: LocaleMessages<K>,
  initialLocale: Locale = DEFAULT_LOCALE,
): {
  getMessage: (key: K, locale?: Locale, params?: InterpolationParams) => string
  setDefaultLocale: (locale: Locale) => void
  getDefaultLocale: () => Locale
} {
  let defaultLocale = initialLocale

  function getMessage(
    key: K,
    locale: Locale = defaultLocale,
    params?: InterpolationParams,
  ): string {
    const dict = messages[locale] ?? messages[DEFAULT_LOCALE] ?? messages['zh-CN']
    if (!dict) {
      return String(key)
    }

    const template = dict[key]
    if (template === undefined) {
      return String(key)
    }

    if (params) {
      return interpolate(template, params)
    }

    return template
  }

  function setDefaultLocale(locale: Locale): void {
    defaultLocale = locale
  }

  function getDefaultLocale(): Locale {
    return defaultLocale
  }

  return { getMessage, setDefaultLocale, getDefaultLocale }
}
