/**
 * @h-ai/reldb — i18n
 *
 * 本文件提供数据库模块的 i18n 文案访问入口。
 * @module reldb-i18n
 */

import { core } from '@h-ai/core'
import messagesEnUS from '../messages/en-US.json'
import messagesZhCN from '../messages/zh-CN.json'

// ─── i18n ───

/**
 * 数据库模块文案 Key 类型
 */
type ReldbMessageKey = keyof typeof messagesZhCN

/**
 * 获取数据库模块文案。
 * @param key - 文案 Key
 * @param options - 插值参数与格式化选项
 * @returns 本地化后的文案字符串
 * @remarks 具体参数结构与 core.i18n.createMessageGetter 保持一致。
 *
 * @example
 * ```ts
 * import { reldbM } from '@h-ai/reldb'
 *
 * const text = reldbM('reldb_someMessageKey')
 * ```
 */
export const reldbM = core.i18n.createMessageGetter<ReldbMessageKey>({
  'zh-CN': messagesZhCN,
  'en-US': messagesEnUS,
})
