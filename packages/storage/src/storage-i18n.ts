/**
 * @hai/storage — i18n 消息获取器
 *
 * 加载存储模块的中英文翻译文件，提供统一的文案获取函数。
 * 内部使用，不对外导出。
 */

import { core } from '@hai/core'
import messagesEnUS from '../messages/en-US.json'
import messagesZhCN from '../messages/zh-CN.json'

/** 消息键类型（从 zh-CN 翻译文件自动推断） */
type StorageMessageKey = keyof typeof messagesZhCN

/**
 * 获取存储模块本地化文案
 *
 * 根据当前 locale 自动选择 zh-CN 或 en-US 的文案，
 * 支持带参数插值（通过 `{ params: { key: value } }`）。
 *
 * @example
 * ```ts
 * storageM('storage_fileNotFound', { params: { key: 'a.txt' } })
 * ```
 */
export const storageM = core.i18n.createMessageGetter<StorageMessageKey>({
  'zh-CN': messagesZhCN,
  'en-US': messagesEnUS,
})
