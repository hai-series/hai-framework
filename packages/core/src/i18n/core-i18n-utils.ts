/**
 * =============================================================================
 * @hai/core - i18n 国际化工具
 * =============================================================================
 * 国际化核心实现，为 JSON 消息字典提供通用类型支持。
 *
 * 设计原则：
 * - 集中式 locale 管理：通过 LocaleManager 单例统一管理全局 locale
 * - 集中式读取：各模块的 createMessageGetter 读取全局 locale
 * - 轻量实现：通过 JSON + createMessageGetter 完成消息获取
 * - 类型安全：完整的 TypeScript 类型支持
 * =============================================================================
 */

import type { InterpolationParams, Locale, LocaleInfo, LocaleMessages, MessageOptions } from '../core-types.js'
import messagesEnUS from '../../messages/en-US.json'
import messagesZhCN from '../../messages/zh-CN.json'
import { typeUtils } from '../utils/core-util-type.js'

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
   * 规范化简写语言代码。
   *
   * 将 'en' 映射为 'en-US'，'zh' 映射为 'zh-CN'，其他原样返回。
   *
   * @param locale - 输入的语言代码
   * @returns 规范化后的语言代码
   */
  function normalizeLocale(locale: Locale): Locale {
    return locale === 'en'
      ? 'en-US'
      : locale === 'zh'
        ? 'zh-CN'
        : locale
  }

  /**
   * 通知所有订阅者 locale 已变更。
   */
  function notifyListeners(): void {
    for (const listener of listeners) {
      listener(currentLocale)
    }
  }

  /**
   * 获取当前全局 locale。
   *
   * @returns 当前生效的 locale 代码
   */
  function getLocale(): Locale {
    return currentLocale
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
    const normalizedLocale = normalizeLocale(locale)

    if (currentLocale === normalizedLocale) {
      return
    }

    currentLocale = normalizedLocale
    notifyListeners()
  }

  /**
   * 订阅 locale 变更。
   *
   * 注册后会立即用当前 locale 调用一次，确保初始状态同步。
   *
   * @param listener - locale 变更监听器
   * @returns 取消订阅函数
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
 * 判断值是否为 MessageOptions 类型。
 *
 * 用于区分 `getMessage(key, options)` 中第二参数是 MessageOptions 还是 InterpolationParams。
 *
 * @param value - 待检查值
 * @returns 是否包含 locale 或 params 字段
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
   *
   * 根据 locale 从消息字典中查找模板，并执行插值。
   * 找不到对应 locale 时回退到默认语言，找不到 key 时返回 key 本身。
   *
   * @param messages - 多语言消息集合
   * @param key - 消息 key
   * @param options - 消息选项或插值参数
   * @param defaultLocale - 默认 locale
   * @returns 解析后的消息文本
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
   *
   * 将消息集合按 namespace 存储，供 `getRegisteredMessage` 查询。
   *
   * @param namespace - 命名空间（通常为模块名）
   * @param messages - 多语言消息集合
   */
  function registerMessages<K extends string>(namespace: string, messages: LocaleMessages<K>): void {
    messageRegistry.set(namespace, messages as LocaleMessages)
  }

  /**
   * 获取已注册的消息。
   *
   * 从指定 namespace 的消息字典中查找并解析消息。
   * namespace 未注册时返回 key 本身。
   *
   * @param namespace - 命名空间
   * @param key - 消息 key
   * @param options - 消息选项或插值参数
   * @returns 解析后的消息文本
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
 * i18n 基础工具集合（不含 coreM）。
 *
 * 提供 locale 管理、浏览器检测、消息创建与注册等基础能力。
 */
const baseI18n = {
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
  setGlobalLocale: (locale: Locale) => {
    localeManager.setGlobalLocale(locale)
  },
  /** 获取当前全局 locale */
  getGlobalLocale: () => localeManager.getLocale(),
  /** 订阅 locale 变更（注册后立即回调一次当前值） */
  subscribeLocale: (listener: (locale: Locale) => void) => localeManager.subscribe(listener),
  /** 创建消息获取函数（读取全局 locale） */
  createMessageGetter,
  /** 按 namespace 注册消息字典 */
  registerMessages: messageManager.registerMessages,
  /** 从已注册的 namespace 中获取消息 */
  getRegisteredMessage: messageManager.getRegisteredMessage,
}

// =============================================================================
// Core 内置消息
// =============================================================================

/**
 * Core 内置消息 key 类型。
 */
type CoreMessageKey = keyof typeof messagesZhCN

/**
 * Core 内置消息获取器。
 *
 * @example
 * ```ts
 * coreM('core_errorTimeout')
 * ```
 */
const coreM = baseI18n.createMessageGetter<CoreMessageKey>({
  'zh-CN': messagesZhCN,
  'en-US': messagesEnUS,
})

/**
 * i18n 工具集合（含 coreM）。
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
  ...baseI18n,
  coreM,
}
