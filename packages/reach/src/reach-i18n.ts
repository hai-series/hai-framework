/**
 * @h-ai/reach — i18n
 *
 * 本文件提供触达模块的 i18n 文案访问入口。
 * @module reach-i18n
 */

import { core } from '@h-ai/core'
import messagesEnUS from '../messages/en-US.json'
import messagesZhCN from '../messages/zh-CN.json'

// ─── i18n ───

/**
 * 触达模块文案 Key 类型
 */
type ReachMessageKey = keyof typeof messagesZhCN

/**
 * 获取触达模块文案。
 * @param key - 文案 Key
 * @param options - 插值参数与格式化选项
 * @returns 本地化后的文案字符串
 */
export const reachM = core.i18n.createMessageGetter<ReachMessageKey>({
  'zh-CN': messagesZhCN,
  'en-US': messagesEnUS,
})
