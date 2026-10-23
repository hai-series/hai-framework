/**
 * @h-ai/ui — 内置消息获取器
 *
 * 为 UI 组件提供内置的多语言翻译支持
 * @module messages
 */

import { core } from '@h-ai/core'
import { changeUILocale, readUILocale } from './internal/locale.js'

// 导入消息文件
import messagesEnUS from './messages/en-US.json'
import messagesZhCN from './messages/zh-CN.json'

// 消息 key 类型
/**
 * 内置翻译键集合；应用业务文案使用应用自己的翻译字典。
 *
 * @example 模块内部上下文
 * ```ts
 * const example: UIMessageKey = 'password_show'
 * ```
 */
export type UIMessageKey = keyof typeof messagesZhCN

// 创建消息获取器
const getMessage = core.i18n.createMessageGetter({
  'zh-CN': messagesZhCN as Record<string, string>,
  'en-US': messagesEnUS as Record<string, string>,
})

/**
 * 获取 UI 组件翻译消息
 *
 * @param key - 消息 key
 * @param params - 可选的插值参数
 * @param locale - 可选的宿主语言；省略时使用 Node 请求语言或浏览器应用语言
 * @returns 当前 locale 对应的翻译文本
 *
 * @example 模块内部上下文
 * ```ts
 * const label = uiM('password_show', undefined, 'zh-CN')
 * ```
 */
export function uiM(key: UIMessageKey, params?: Record<string, string | number | boolean>, locale?: string): string {
  return getMessage(key, { params, locale: locale ?? readUILocale() })
}

/**
 * 获取当前 UI 模块使用的 locale
 * @returns 当前 UI 语言。
 *
 * @example 模块内部上下文
 * ```ts
 * const locale = getUILocale()
 * ```
 */
export function getUILocale(): string {
  return readUILocale()
}

/**
 * 手动设置 UI 模块的 locale（通常不需要，会自动同步）
 * @param locale - 显式语言代码；省略时使用当前上下文。
 * @returns {void} 无返回值；同步浏览器 UI 语言。
 *
 * @example 模块内部上下文
 * ```ts
 * setUILocale('en-US')
 * ```
 */
export function setUILocale(locale: string): void {
  changeUILocale(locale)
}
