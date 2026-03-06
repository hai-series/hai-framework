/**
 * @h-ai/ui — 内置消息获取器
 *
 * 为 UI 组件提供内置的多语言翻译支持
 * @module messages
 */

import { core } from '@h-ai/core'

// 导入消息文件
import messagesEnUS from './messages/en-US.json'
import messagesZhCN from './messages/zh-CN.json'

// 消息 key 类型
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
 * @returns 当前 locale 对应的翻译文本
 *
 * @example
 * ```ts
 * uiM('password_show') // => '显示密码' (zh-CN) 或 'Show password' (en-US)
 * ```
 */
export function uiM(key: UIMessageKey, params?: Record<string, string | number | boolean>): string {
  return getMessage(key, params ? { params } : undefined)
}

/**
 * 获取当前 UI 模块使用的 locale
 */
export function getUILocale(): string {
  return core.i18n.getGlobalLocale()
}

/**
 * 手动设置 UI 模块的 locale（通常不需要，会自动同步）
 */
export function setUILocale(locale: string): void {
  core.i18n.setGlobalLocale(locale)
}
