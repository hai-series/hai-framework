/**
 * @h-ai/serv — i18n 工具
 *
 * Serv 模块的国际化消息工具，从 @h-ai/core 调用 i18n API。
 * 与 kit-i18n 结构对齐，便于跨包统一维护。
 * @module serv-i18n
 */

import { core } from '@h-ai/core'
import messagesEnUS from '../messages/en-US.json'
import messagesZhCN from '../messages/zh-CN.json'

type ServMessageKey = keyof typeof messagesZhCN

/**
 * 获取 Serv 模块的 i18n 消息。
 *
 * 单次调用可通过 `options.locale` 指定该次调用使用的语言，
 * 用于在请求处理过程中根据 `Accept-Language` 头本地化错误消息，
 * 而不污染全局 locale（多并发请求安全）。
 *
 * @example
 * ```ts
 * // 使用全局 locale
 * servM('serv_validationRequired')
 *
 * // 使用请求自身的 locale
 * servM('serv_validationStringMin', { locale: 'en-US', params: { min: 3 } })
 * ```
 */
export const servM
  = core.i18n.createMessageGetter<ServMessageKey>({ 'zh-CN': messagesZhCN, 'en-US': messagesEnUS })

export type { ServMessageKey }
