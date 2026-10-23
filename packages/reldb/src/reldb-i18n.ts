/**
 * @h-ai/reldb — i18n
 *
 * 本文件提供数据库模块的 i18n 文案访问入口。
 * @module reldb-i18n
 */

import { core } from '@h-ai/core'
import messagesEnUS from '../messages/en-US.json'
import messagesJaJP from '../messages/ja-JP.json'
import messagesZhCN from '../messages/zh-CN.json'

// ─── i18n ───

/**
 * 数据库模块文案 Key 类型
 * @example 模块内部上下文
 * ```ts
 * const key: ReldbMessageKey = 'reldb_notInitialized'
 * void reldbM(key)
 * ```
 */
type ReldbMessageKey = keyof typeof messagesZhCN

/**
 * 获取数据库模块文案。
 * @param key - 文案 Key
 * @param options - 插值参数与格式化选项
 * @returns 本地化后的文案字符串
 * @remarks 具体参数结构与 core.i18n.createMessageGetter 保持一致。
 * @example 模块内部上下文
 * ```ts
 * void reldbM('reldb_notInitialized', { locale: 'en-US' })
 * ```
 */
export const reldbM = core.i18n.createMessageGetter<ReldbMessageKey>({
  'zh-CN': messagesZhCN,
  'en-US': messagesEnUS,
  'ja-JP': messagesJaJP,
})
