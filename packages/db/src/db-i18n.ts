/**
 * =============================================================================
 * @h-ai/db - i18n
 * =============================================================================
 *
 * 本文件提供数据库模块的 i18n 文案访问入口。
 *
 * @example
 * ```ts
 * import { dbM } from '@h-ai/db'
 *
 * const message = dbM('db_someMessageKey')
 * ```
 * =============================================================================
 */

import { core } from '@h-ai/core'
import messagesEnUS from '../messages/en-US.json'
import messagesZhCN from '../messages/zh-CN.json'

// =============================================================================
// i18n
// =============================================================================

/**
 * 数据库模块文案 Key 类型
 */
type DbMessageKey = keyof typeof messagesZhCN

/**
 * 获取数据库模块文案。
 * @param key - 文案 Key
 * @param options - 插值参数与格式化选项
 * @returns 本地化后的文案字符串
 * @remarks 具体参数结构与 core.i18n.createMessageGetter 保持一致。
 *
 * @example
 * ```ts
 * import { dbM } from '@h-ai/db'
 *
 * const text = dbM('db_someMessageKey')
 * ```
 */
export const dbM = core.i18n.createMessageGetter<DbMessageKey>({
  'zh-CN': messagesZhCN,
  'en-US': messagesEnUS,
})
