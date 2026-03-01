/**
 * @h-ai/deploy — i18n
 *
 * 本文件提供部署模块的 i18n 文案访问入口。
 * @module deploy-i18n
 */

import { core } from '@h-ai/core'
import messagesEnUS from '../messages/en-US.json'
import messagesZhCN from '../messages/zh-CN.json'

// ─── i18n ───

/** 部署模块文案 Key 类型 */
type DeployMessageKey = keyof typeof messagesZhCN

/**
 * 获取部署模块文案
 *
 * @param key - 文案 Key
 * @param options - 插值参数与格式化选项
 * @returns 本地化后的文案字符串
 *
 * @example
 * ```ts
 * import { deployM } from '@h-ai/deploy'
 *
 * const text = deployM('deploy_notInitialized')
 * ```
 */
export const deployM = core.i18n.createMessageGetter<DeployMessageKey>({
  'zh-CN': messagesZhCN,
  'en-US': messagesEnUS,
})
