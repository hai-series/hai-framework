/**
 * @h-ai/core — i18n 国际化工具
 *
 * 国际化核心实现，为 JSON 消息字典提供通用类型支持。
 * @module core-i18n-utils
 */

import type { Locale, LocaleInfo, LocaleMessages, MessageOptions } from '../core-types.js'
import messagesEnUS from '../../messages/en-US.json'
import messagesZhCN from '../../messages/zh-CN.json'

// ─── 常量 ───

const DEFAULT_LOCALES: LocaleInfo[] = [
  { code: 'zh-CN', label: '简体中文' },
  { code: 'en-US', label: 'English' },
]

const DEFAULT_LOCALE: Locale = 'zh-CN'

function normalizeLocale(locale: Locale): Locale {
  return locale === 'en' ? 'en-US' : locale === 'zh' ? 'zh-CN' : locale
}

// ─── 全局 Locale 状态 ───

let currentLocale: Locale = DEFAULT_LOCALE
let requestLocaleResolver: (() => Locale | undefined) | null = null

function getGlobalLocale(): Locale {
  return currentLocale
}

function setGlobalLocale(locale: Locale): void {
  const normalized = normalizeLocale(locale)

  if (currentLocale !== normalized) {
    currentLocale = normalized
  }
}

function setRequestLocaleResolver(resolver: (() => Locale | undefined) | null): void {
  requestLocaleResolver = resolver
}

// ─── 消息获取工厂 ───

/**
 * 创建消息获取函数。
 *
 * 各模块通过此函数创建自己的消息获取器，自动读取全局 locale。
 * 若指定的 locale 不支持，回退到默认语言；key 不存在时返回 key 本身。
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
 * getMessage('hello')                              // '你好'
 * getMessage('hello', { locale: 'en-US' })          // 'Hello'
 * getMessage('msg', { params: { name: 'World' } }) // 插值
 * ```
 */
function createMessageGetter<K extends string>(
  messages: LocaleMessages<K>,
): (key: K, options?: MessageOptions) => string {
  return (key: K, options?: MessageOptions): string => {
    const resolvedRequestLocale = requestLocaleResolver?.()
    const preferredLocale = options?.locale ?? resolvedRequestLocale ?? currentLocale
    const locale = normalizeLocale(preferredLocale)
    const isSupported = DEFAULT_LOCALES.some(l => l.code === locale)
    const activeLocale = isSupported ? locale : DEFAULT_LOCALE

    // 获取消息字典和模板
    const dict = messages[activeLocale] ?? messages[DEFAULT_LOCALE]
    const template = dict?.[key]

    if (!template) {
      return String(key)
    }

    // 执行占位符插值（{key} → value）
    if (options?.params) {
      return template.replace(/\{(\w+)\}/g, (_, paramKey) => {
        const value = options.params![paramKey]
        return value !== undefined ? String(value) : `{${paramKey}}`
      })
    }

    return template
  }
}

// ─── Core 内置消息 ───

type CoreMessageKey = keyof typeof messagesZhCN

const coreM = createMessageGetter<CoreMessageKey>({
  'zh-CN': messagesZhCN,
  'en-US': messagesEnUS,
})

// ─── 对外入口 ───

export const i18n = {
  DEFAULT_LOCALES,
  DEFAULT_LOCALE,
  setGlobalLocale,
  setRequestLocaleResolver,
  getGlobalLocale,
  createMessageGetter,
  coreM,
}

/** i18n 子工具类型 */
export type I18nFn = typeof i18n
