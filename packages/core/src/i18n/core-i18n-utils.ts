/**
 * @h-ai/core — i18n 国际化工具
 *
 * 国际化核心实现，为 JSON 消息字典提供通用类型支持。
 * @module core-i18n-utils
 */

import type { AsyncLocalStorage } from 'node:async_hooks'
import type { Locale, LocaleInfo, LocaleMessages, MessageOptions } from '../core-types.js'
import messagesEnUS from '../../messages/en-US.json'
import messagesJaJP from '../../messages/ja-JP.json'
import messagesZhCN from '../../messages/zh-CN.json'

// ─── 常量 ───

const DEFAULT_LOCALES: LocaleInfo[] = [
  { code: 'zh-CN', label: '简体中文' },
  { code: 'en-US', label: 'English' },
  { code: 'ja-JP', label: '日本語' },
]

const DEFAULT_LOCALE: Locale = 'zh-CN'

// ─── 全局 Locale 状态 ───

let currentLocale: Locale = DEFAULT_LOCALE

/** 请求语言上下文；仅由 Node 入口安装，浏览器不加载 Node 运行时代码。 */
let requestLocales: AsyncLocalStorage<{ locale: Locale }> | undefined

/**
 * Node 入口注入真实 AsyncLocalStorage，不对外暴露可替换的运行时配置。
 * @param storage - Node 入口创建的 AsyncLocalStorage，存储当前请求语言。
 * @example 模块内部上下文
 * ```ts
 * function installNodeRequestContext(storage: AsyncLocalStorage<{ locale: Locale }>): void {
 *   installRequestLocales(storage)
 * }
 * ```
 */
export function installRequestLocales(storage: AsyncLocalStorage<{ locale: Locale }>): void {
  requestLocales = storage
}

/** 规范化公共语言简写，未知语言由消息获取器按字典回退。 */
function normalizeLocale(locale: Locale): Locale {
  return locale === 'en' ? 'en-US' : locale === 'zh' ? 'zh-CN' : locale === 'ja' ? 'ja-JP' : locale
}

function getGlobalLocale(): Locale {
  return requestLocales?.getStore()?.locale ?? currentLocale
}

function setGlobalLocale(locale: Locale): void {
  const normalized = normalizeLocale(locale)
  const request = requestLocales?.getStore()
  if (request)
    request.locale = normalized
  else
    currentLocale = normalized
}

/**
 * 在独立的 Node 请求语言上下文中运行操作，异步子任务继承当前语言。
 *
 * 显式 MessageOptions.locale 优先于请求语言，请求结束不会改变进程启动默认值。
 *
 * @param locale - 当前请求的语言
 * @param operation - 请求处理或 SSR 操作；保留原同步值或 Promise 返回类型
 * @returns operation 的原始返回值
 * @throws 浏览器入口没有 Node 请求上下文时抛出错误；浏览器使用 setGlobalLocale。
 * @example
 * ```ts
 * const response = await core.i18n.runWithLocale('en-US', async () => {
 *   await loadData()
 *   return renderPage()
 * })
 * ```
 */
function runWithLocale<T>(locale: Locale, operation: () => T): T {
  if (!requestLocales)
    throw new Error('Request locale context requires the Node.js entry')
  return requestLocales.run({ locale: normalizeLocale(locale) }, operation)
}

// ─── 消息获取工厂 ───

/**
 * 创建消息获取函数。
 *
 * 各模块通过此函数创建消息获取器，依次读取显式 locale、Node 请求语言和应用默认语言。
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
    // 确定使用的 locale（允许通过 options 覆盖全局设置）
    const requestLocale = normalizeLocale(options?.locale ?? getGlobalLocale())
    const isSupported = DEFAULT_LOCALES.some(l => l.code === requestLocale)
    const locale = isSupported ? requestLocale : DEFAULT_LOCALE

    // 获取消息字典和模板
    const dict = messages[locale] ?? messages[DEFAULT_LOCALE]
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

/**
 * Core 内置消息字典的合法键；与应用业务翻译键独立。
 * @example 模块内部上下文
 * ```ts
 * const key: CoreMessageKey = 'core_validationRequired'
 * const message = coreM(key)
 * ```
 */
type CoreMessageKey = keyof typeof messagesZhCN

const coreM = createMessageGetter<CoreMessageKey>({
  'zh-CN': messagesZhCN,
  'en-US': messagesEnUS,
  'ja-JP': messagesJaJP,
})

// ─── 对外入口 ───

/**
 * 语言上下文、字典消息获取与插值工具；Node 请求通过 runWithLocale 隔离语言。
 * @example
 * ```ts
 * import { core } from '@h-ai/core'
 * const tools = core.i18n
 * const message = tools.createMessageGetter({ 'en-US': { hello: 'Hello' }, 'zh-CN': { hello: '你好' } })
 * message('hello', { locale: 'en-US' })
 * ```
 */
export const i18n = {
  DEFAULT_LOCALES,
  DEFAULT_LOCALE,
  setGlobalLocale,
  getGlobalLocale,
  runWithLocale,
  createMessageGetter,
  coreM,
}

/**
 * i18n 子工具类型
 * @example 模块内部上下文
 * ```ts
 * const tools: I18nFn = i18n
 * const message = tools.createMessageGetter({ 'en-US': { hello: 'Hello' }, 'zh-CN': { hello: '你好' } })
 * message('hello', { locale: 'en-US' })
 * ```
 */
export type I18nFn = typeof i18n
