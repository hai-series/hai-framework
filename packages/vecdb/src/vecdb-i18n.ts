/**
 * @h-ai/vecdb — i18n
 *
 * 本文件提供向量数据库模块的 i18n 文案访问入口。
 * @module vecdb-i18n
 */

import { core } from '@h-ai/core'
import messagesEnUS from '../messages/en-US.json'
import messagesZhCN from '../messages/zh-CN.json'

// ─── i18n ───

/**
 * 向量数据库模块文案 Key 类型
 */
type VecdbMessageKey = keyof typeof messagesZhCN

/**
 * 获取向量数据库模块文案。
 * @param key - 文案 Key
 * @param options - 插值参数与格式化选项
 * @returns 本地化后的文案字符串
 */
export const vecdbM = core.i18n.createMessageGetter<VecdbMessageKey>({
  'zh-CN': messagesZhCN,
  'en-US': messagesEnUS,
})
