/**
 * @h-ai/storage — i18n 消息获取器
 *
 * 加载存储模块的中英文翻译文件，提供统一的文案获取函数。
 * 内部使用，不对外导出。
 * @module storage-i18n
 */

import { core } from '@h-ai/core'
import messagesEnUS from '../messages/en-US.json'
import messagesZhCN from '../messages/zh-CN.json'

/**
 * 消息键类型（从 zh-CN 翻译文件自动推断）
 * @example 模块内部上下文
 * ```ts
 * const key: StorageMessageKey = 'storage_notInitialized'
 * void storageM(key)
 * ```
 */
type StorageMessageKey = keyof typeof messagesZhCN

/**
 * 获取存储模块本地化文案
 *
 * 根据当前 locale 自动选择 zh-CN 或 en-US 的文案，
 * 支持带参数插值（通过 `{ params: { key: value } }`）。
 * @example 模块内部上下文
 * ```ts
 * void storageM('storage_notInitialized', { locale: 'en-US' })
 * ```
 */
export const storageM = core.i18n.createMessageGetter<StorageMessageKey>({
  'zh-CN': messagesZhCN,
  'en-US': messagesEnUS,
})
