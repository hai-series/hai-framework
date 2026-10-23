/**
 * @h-ai/api-client — i18n
 *
 * 模块 i18n 文案访问入口。
 * @module api-client-i18n
 */

import { core } from '@h-ai/core'
import messagesEnUS from '../messages/en-US.json'
import messagesZhCN from '../messages/zh-CN.json'

/**
 * 模块内合法翻译键；由中文词典推导并与现有英文词典配套维护。
 *
 * @example 模块内部上下文
 * ```ts
 * const key: ApiClientMessageKey = 'apiClient_notInitialized'
 * const message = apiClientM(key)
 * ```
 */
type ApiClientMessageKey = keyof typeof messagesZhCN

/**
 * 获取 API Client 本地化消息；跟随 Core 当前 locale，不记录凭据或响应正文。
 * @param key - 真实模块消息键。
 * @param options - 语言覆盖及 params 插值选项。
 * @returns 已插值的中文或英文消息。
 *
 * @example 模块内部上下文
 * ```ts
 * const message = apiClientM('apiClient_configError', { locale: 'en-US', params: { error: 'Invalid endpoint' } })
 * ```
 */
export const apiClientM = core.i18n.createMessageGetter<ApiClientMessageKey>({
  'zh-CN': messagesZhCN,
  'en-US': messagesEnUS,
})
