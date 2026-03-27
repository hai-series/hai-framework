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
 * 统一设置所有 hai 模块的默认/回退语言
 *
 * 通过 @h-ai/core 的集中式 locale 管理器，一次调用即可同步所有模块。
 * 当未提供请求级 locale 时，各模块的 createMessageGetter 会读取该全局 locale。
 *
 * @example
 * ```ts
 * import { kit } from '@h-ai/kit'
 *
 * // 在 i18n handle 中
 * const locale = event.cookies.get('PARAGLIDE_LOCALE') ?? 'zh-CN'
 * kit.i18n.setLocale(locale)
 * ```
 */
export function setAllModulesLocale(locale: string): void {
  core.i18n.setGlobalLocale(locale)
}

/**
 * 设置请求级 locale 解析器。
 *
 * 服务端可结合 AsyncLocalStorage 等机制注入请求上下文 locale，
 * 使并发请求间的消息语言互不干扰。
 */
export function setRequestLocaleResolver(resolver: (() => string | undefined) | null): void {
  core.i18n.setRequestLocaleResolver(resolver)
}
