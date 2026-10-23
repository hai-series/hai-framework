/**
 * @h-ai/ai — i18n 消息获取器
 *
 * 模块内部使用，不对外导出。
 *
 * @internal
 * @module ai-i18n
 */

import { core } from '@h-ai/core'
import messagesEnUS from '../messages/en-US.json'
import messagesJaJP from '../messages/ja-JP.json'
import messagesZhCN from '../messages/zh-CN.json'

/**
 * AI 模块自有消息键，调用时由请求语言上下文选择文案。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const key: AiMessageKey = 'ai_notInitialized'
 * const message = aiM(key)
 * ```
 */
type AiMessageKey = keyof typeof messagesZhCN

/**
 * 获取 AI 模块本地化文案
 *
 * @internal
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const message = aiM('ai_toolNotFound', { params: { name: 'weather' }, locale: 'zh-CN' })
 * ```
 */
export const aiM = core.i18n.createMessageGetter<AiMessageKey>({
  'zh-CN': messagesZhCN,
  'en-US': messagesEnUS,
  'ja-JP': messagesJaJP,
})
