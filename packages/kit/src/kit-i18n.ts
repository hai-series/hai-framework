/**
 * @h-ai/kit — i18n 工具
 *
 * Kit 模块的国际化消息工具，从 @h-ai/core 调用 i18n API。
 * @module kit-i18n
 */

import { core } from '@h-ai/core'
import messagesEnUS from '../messages/en-US.json'
import messagesZhCN from '../messages/zh-CN.json'

type KitMessageKey = keyof typeof messagesZhCN

/** 获取 Kit 模块的 i18n 消息 */
export const kitM
  = core.i18n.createMessageGetter<KitMessageKey>({ 'zh-CN': messagesZhCN, 'en-US': messagesEnUS })

/**
 * 设置浏览器应用语言或 Node 启动默认语言；请求中只更新当前 runWithLocale 上下文。
 *
 * 通过 @h-ai/core 的集中式 locale 管理器，一次调用即可同步所有模块。
 * 各模块的 createMessageGetter 优先读取当前 Node 请求上下文；SSR 必须包裹实际 resolve。
 *
 * @example
 * ```ts
 * import { kit } from '@h-ai/kit'
 *
 * // 浏览器应用入口；SSR handle 使用 kit.i18n.runWithLocale(locale, () => resolve(event))。
 * kit.i18n.setLocale('en-US')
 * ```
 */
export function setAllModulesLocale(locale: string): void {
  core.i18n.setGlobalLocale(locale)
}
