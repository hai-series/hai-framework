/**
 * @h-ai/capacitor — i18n
 *
 * 模块 i18n 文案访问入口。
 * @module capacitor-i18n
 */

import { core } from '@h-ai/core'
import messagesEnUS from '../messages/en-US.json'
import messagesZhCN from '../messages/zh-CN.json'

/**
 * CapacitorMessageKey 的数据约束与操作契约。
 * @example 模块内部上下文
 * ```ts
 * const key: CapacitorMessageKey = 'capacitor_notAvailable'
 * const text = capacitorM(key)
 * void text
 * ```
 */
type CapacitorMessageKey = keyof typeof messagesZhCN

/**
 * capacitor 模块 i18n 文案获取器
 *
 * @param key - 文案 Key
 * @returns 本地化后的文案字符串
 * @example 模块内部上下文
 * ```ts
 * const text = capacitorM('capacitor_notAvailable', { locale: 'en-US' })
 * void text
 * ```
 */
export const capacitorM = core.i18n.createMessageGetter<CapacitorMessageKey>({
  'zh-CN': messagesZhCN,
  'en-US': messagesEnUS,
})
