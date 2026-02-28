/**
 * =============================================================================
 * @h-ai/scheduler - i18n
 * =============================================================================
 *
 * 本文件提供定时任务模块的 i18n 文案访问入口。
 *
 * @example
 * ```ts
 * import { schedulerM } from './scheduler-i18n.js'
 *
 * const message = schedulerM('scheduler_notInitialized')
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
 * 定时任务模块文案 Key 类型
 */
type SchedulerMessageKey = keyof typeof messagesZhCN

/**
 * 获取定时任务模块文案。
 * @param key - 文案 Key
 * @param options - 插值参数与格式化选项
 * @returns 本地化后的文案字符串
 */
export const schedulerM = core.i18n.createMessageGetter<SchedulerMessageKey>({
  'zh-CN': messagesZhCN,
  'en-US': messagesEnUS,
})
