/**
 * @h-ai/datapipe — i18n
 *
 * 本文件提供数据处理模块的 i18n 文案访问入口。
 * @module datapipe-i18n
 */

import { core } from '@h-ai/core'
import messagesEnUS from '../messages/en-US.json'
import messagesJaJP from '../messages/ja-JP.json'
import messagesZhCN from '../messages/zh-CN.json'

// ─── i18n ───

/**
 * 数据处理模块文案 Key 类型
 * @example 模块内部上下文
 * ```ts
 * const key: DatapipeMessageKey = 'datapipe_cleanFailed'
 * const message = datapipeM(key)
 * ```
 */
type DatapipeMessageKey = keyof typeof messagesZhCN

/**
 * 获取数据处理模块文案。
 * @param key - 文案 Key
 * @param options - 插值参数与格式化选项
 * @returns 本地化后的文案字符串
 * @example 模块内部上下文
 * ```ts
 * const message = datapipeM('datapipe_cleanFailed', { params: { error: 'invalid input' }, locale: 'en-US' })
 * ```
 */
export const datapipeM = core.i18n.createMessageGetter<DatapipeMessageKey>({
  'zh-CN': messagesZhCN,
  'en-US': messagesEnUS,
  'ja-JP': messagesJaJP,
})
