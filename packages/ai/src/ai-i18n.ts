/**
 * =============================================================================
 * @hai/ai - i18n
 * =============================================================================
 *
 * 本文件提供 AI 模块的 i18n 文案访问入口。
 * 模块内部使用，不对外导出。
 *
 * @internal
 */

import { core } from '@hai/core'
import messagesEnUS from '../messages/en-US.json'
import messagesZhCN from '../messages/zh-CN.json'

// =============================================================================
// i18n
// =============================================================================

/**
 * AI 模块文案 Key 类型
 */
type AiMessageKey = keyof typeof messagesZhCN

/**
 * 获取 AI 模块文案。
 * @param key - 文案 Key
 * @param options - 插值参数与格式化选项
 * @returns 本地化后的文案字符串
 * @remarks 具体参数结构与 core.i18n.createMessageGetter 保持一致。
 * 模块内部使用，不对外导出。
 * @internal
 */
export const aiM = core.i18n.createMessageGetter<AiMessageKey>({
  'zh-CN': messagesZhCN,
  'en-US': messagesEnUS,
})
