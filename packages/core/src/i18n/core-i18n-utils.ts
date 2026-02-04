/**
 * =============================================================================
 * @hai/core - i18n 核心类型定义
 * =============================================================================
 * 国际化核心类型，为 JSON 消息字典提供通用类型支持
 *
 * 设计原则：
 * - 集中式 locale 管理：通过 LocaleManager 单例统一管理全局 locale
 * - 集中式读取：各模块的 createMessageGetter 读取全局 locale
 * - 轻量实现：通过 JSON + createMessageGetter 完成消息获取
 * - 类型安全：完整的 TypeScript 类型支持
 * =============================================================================
 */

import { typeUtils } from '../utils/core-util-type.js'

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
const DEFAULT_LOCALES: LocaleInfo[] = [
  { code: 'zh-CN', label: '简体中文' },
  { code: 'en-US', label: 'English' },
]

/**
 * 默认语言
 */
const DEFAULT_LOCALE: Locale = 'zh-CN'

// =============================================================================
// 工具函数
// =============================================================================

/**
 * 执行字符串插值。
 * @param template - 模板字符串，如 'Hello, {name}!'
 * @param params - 插值参数
 * @returns 插值后的字符串
 *
 * @example
 * ```ts
 * interpolate('Hello, {name}!', { name: 'World' })
 * ```
 */
function interpolate(template: string, params: InterpolationParams): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const value = params[key]
    return value !== undefined ? String(value) : `{${key}}`
  })
}

/**
 * 检测浏览器首选语言。
 * @param supportedLocales - 支持的语言列表
 * @returns 检测到的语言代码，如果不支持则返回 undefined
 *
 * @example
 * ```ts
 * const locale = detectBrowserLocale()
 * ```
 */
function detectBrowserLocale(supportedLocales: LocaleInfo[] = DEFAULT_LOCALES): Locale | undefined {
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
 * 检查语言是否支持。
 * @param locale - 要检查的语言代码
 * @param supportedLocales - 支持的语言列表
 *
 * @example
 * ```ts
 * isLocaleSupported('zh-CN')
 * ```
 */
function isLocaleSupported(
  locale: Locale,
  supportedLocales: LocaleInfo[] = DEFAULT_LOCALES,
): boolean {
  return supportedLocales.some(l => l.code === locale)
}

/**
 * 获取有效的语言代码（如果不支持则返回默认语言）。
 * @param locale - 请求的语言代码
 * @param supportedLocales - 支持的语言列表
 * @param fallback - 回退语言
 *
 * @example
 * ```ts
 * resolveLocale('fr-FR') // fallback
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

// =============================================================================
// 集中式 Locale 管理器
// =============================================================================

type LocaleChangeListener = (locale: Locale) => void

/**
 * 全局 Locale 管理器
 *
 * 提供集中式的 locale 状态管理，各模块通过订阅机制自动同步。
 *
 * @example
 * ```ts
 * // 应用层设置全局 locale
 * import { localeManager } from '@hai/core'
 *
 * localeManager.setGlobalLocale('en-US')
 *
 * // 所有通过 createMessageGetter 创建的消息获取器会读取全局 locale
 * ```
 */
const localeManager = (() => {
  let currentLocale: Locale = DEFAULT_LOCALE
  const listeners = new Set<LocaleChangeListener>()

  /**
   * 规范化简写语言（en/zh）。
   */
  function normalizeLocale(locale: Locale): Locale {
    return locale === 'en'
      ? 'en-US'
      : locale === 'zh'
        ? 'zh-CN'
        : locale
  }

  /**
   * 通知订阅者。
   */
  function notifyListeners(): void {
    for (const listener of listeners) {
      listener(currentLocale)
    }
  }

  /**
   * 获取当前 locale。
   */
  function getLocale(): Locale {
    return currentLocale
  }

  /**
   * 设置全局 locale。
   */
  function setGlobalLocale(locale: Locale): void {
    const normalizedLocale = normalizeLocale(locale)

    if (currentLocale === normalizedLocale) {
      return
    }

    currentLocale = normalizedLocale
    notifyListeners()
  }

  /**
   * 订阅 locale 变更。
   */
  function subscribe(listener: LocaleChangeListener): () => void {
    listeners.add(listener)
    // 立即用当前 locale 调用一次，确保初始状态同步
    listener(currentLocale)
    return () => {
      listeners.delete(listener)
    }
  }

  return {
    getLocale,
    setGlobalLocale,
    subscribe,
  }
})()

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
 * 消息获取选项
 */
export interface MessageOptions {
  locale?: Locale
  params?: InterpolationParams
}

/**
 * 判断是否为 MessageOptions。
 */
function isMessageOptions(value: unknown): value is MessageOptions {
  return typeUtils.isObject(value) && ('locale' in value || 'params' in value)
}

/**
 * 消息管理器
 */
const messageManager = (() => {
  const messageRegistry = new Map<string, LocaleMessages>()

  /**
   * 解析消息文本。
   */
  function resolveMessage<K extends string>(
    messages: LocaleMessages<K>,
    key: K,
    options: MessageOptions | InterpolationParams | undefined,
    defaultLocale: Locale,
  ): string {
    const resolvedOptions = isMessageOptions(options)
      ? options
      : options
        ? { params: options }
        : undefined

    const locale = resolveLocale(
      resolvedOptions?.locale ?? defaultLocale,
      DEFAULT_LOCALES,
      DEFAULT_LOCALE,
    )
    const dict = messages[locale] ?? messages[DEFAULT_LOCALE] ?? messages['zh-CN']
    if (!dict)
      return String(key)

    const template = dict[key]
    if (template === undefined)
      return String(key)

    if (resolvedOptions?.params) {
      return interpolate(template, resolvedOptions.params)
    }

    return template
  }

  /**
   * 注册消息字典。
   */
  function registerMessages<K extends string>(namespace: string, messages: LocaleMessages<K>): void {
    messageRegistry.set(namespace, messages as LocaleMessages)
  }

  /**
   * 获取已注册消息。
   */
  function getRegisteredMessage<K extends string>(
    namespace: string,
    key: K,
    options?: MessageOptions | InterpolationParams,
  ): string {
    const messages = messageRegistry.get(namespace)
    if (!messages)
      return String(key)

    return resolveMessage(messages as LocaleMessages<K>, key, options, DEFAULT_LOCALE)
  }

  return {
    resolveMessage,
    registerMessages,
    getRegisteredMessage,
  }
})()

/**
 * 创建消息获取函数。
 *
 * 用于各模块创建自己的 getMessage 函数，统一消息加载和插值逻辑。
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
 * ```
 */
function createMessageGetter<K extends string>(
  messages: LocaleMessages<K>,
): (key: K, options?: MessageOptions | InterpolationParams) => string {
  function getMessage(
    key: K,
    options?: MessageOptions | InterpolationParams,
  ): string {
    return messageManager.resolveMessage(messages, key, options, localeManager.getLocale())
  }

  return getMessage
}

// =============================================================================
// 对外入口
// =============================================================================

/**
 * i18n 工具集合。
 *
 * @example
 * ```ts
 * i18n.setGlobalLocale('en-US')
 * const getMessage = i18n.createMessageGetter({
 *   'zh-CN': { ok: '好' },
 *   'en-US': { ok: 'OK' },
 * })
 * getMessage('ok')
 * ```
 */
export const i18n = {
  DEFAULT_LOCALES,
  DEFAULT_LOCALE,
  interpolate,
  detectBrowserLocale,
  isLocaleSupported,
  resolveLocale,
  setGlobalLocale: (locale: Locale) => {
    localeManager.setGlobalLocale(locale)
  },
  getGlobalLocale: () => localeManager.getLocale(),
  subscribeLocale: (listener: (locale: Locale) => void) => localeManager.subscribe(listener),
  createMessageGetter,
  registerMessages: messageManager.registerMessages,
  getRegisteredMessage: messageManager.getRegisteredMessage,
}
