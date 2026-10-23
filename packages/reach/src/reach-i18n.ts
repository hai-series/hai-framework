/**
 * @h-ai/reach — i18n
 *
 * 本文件提供触达模块的 i18n 文案访问入口。
 * @module reach-i18n
 */

import { core } from '@h-ai/core'
import messagesEnUS from '../messages/en-US.json'
import messagesZhCN from '../messages/zh-CN.json'

// ─── i18n ───

/**
 * 内部消息键，由中文词典推导；中英词典同步维护。
 *
 * @example 模块内部上下文
 * ```ts
 * const key: ReachMessageKey = 'reach_notInitialized'
 * const message = reachM(key)
 * ```
 */
type ReachMessageKey = keyof typeof messagesZhCN

/**
 * 获取当前locale的Reach消息；插值不应包含正文、收件人或凭据。
 * @param key - 已维护的消息键。
 * @param options - locale覆盖与params插值。
 * @returns 本地化消息。
 *
 * @example 模块内部上下文
 * ```ts
 * const message = reachM('reach_notInitialized', { locale: 'en-US' })
 * ```
 */
export const reachM = core.i18n.createMessageGetter<ReachMessageKey>({
  'zh-CN': messagesZhCN,
  'en-US': messagesEnUS,
})
