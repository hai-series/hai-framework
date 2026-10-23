/**
 * @h-ai/deploy — i18n
 *
 * 本文件提供部署模块的 i18n 文案访问入口。
 * @module deploy-i18n
 */

import { core } from '@h-ai/core'
import messagesEnUS from '../messages/en-US.json'
import messagesJaJP from '../messages/ja-JP.json'
import messagesZhCN from '../messages/zh-CN.json'

// ─── i18n ───

/**
 * 部署模块文案 Key 类型
 * 从现有中文字典推导消息键，避免内部实现使用未注册的翻译。
 * @example 模块内部上下文
 * ```ts
 * const key: DeployMessageKey = 'deploy_notInitialized'
 * const message = deployM(key)
 * ```
 */
type DeployMessageKey = keyof typeof messagesZhCN

/**
 * 获取部署模块文案
 * 使用 core 请求/全局 locale 的现有中英字典；不自行缓存调用时的语言。
 * @param key - 文案 Key
 * @param options - 插值参数与格式化选项
 * @returns 本地化后的文案字符串
 * @example 模块内部上下文
 * ```ts
 * const message = deployM('deploy_sshRequired')
 * ```
 */
export const deployM = core.i18n.createMessageGetter<DeployMessageKey>({
  'zh-CN': messagesZhCN,
  'en-US': messagesEnUS,
  'ja-JP': messagesJaJP,
})
