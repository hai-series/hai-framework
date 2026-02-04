/**
 * =============================================================================
 * @hai/core - 内部消息获取器
 * =============================================================================
 * 用于 core 模块内部复用，避免重复创建消息 getter。
 * 通过 i18n/index.ts 导出，允许外部复用。
 * =============================================================================
 */

import messagesEnUS from '../../messages/en-US.json'
import messagesZhCN from '../../messages/zh-CN.json'
import { createMessageGetter } from './core-i18n-utils.js'

// 内部消息 Key 类型
export type CoreMessageKey = keyof typeof messagesZhCN

// 内部消息获取器（自动订阅全局 locale）
export const { getMessage: getCoreMessage } = createMessageGetter<CoreMessageKey>({
  'zh-CN': messagesZhCN,
  'en-US': messagesEnUS,
})
