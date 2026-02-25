/**
 * @h-ai/ai — i18n 消息获取器
 *
 * 模块内部使用，不对外导出。
 *
 * @internal
 */

import { core } from '@h-ai/core'
import messagesEnUS from '../messages/en-US.json'
import messagesZhCN from '../messages/zh-CN.json'

type AiMessageKey = keyof typeof messagesZhCN

/**
 * 获取 AI 模块本地化文案
 *
 * @internal
 */
export const aiM = core.i18n.createMessageGetter<AiMessageKey>({
  'zh-CN': messagesZhCN,
  'en-US': messagesEnUS,
})
