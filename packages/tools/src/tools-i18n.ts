import { core } from '@h-ai/core'
import messagesEnUS from '../messages/en-US.json'
import messagesJaJP from '../messages/ja-JP.json'
import messagesZhCN from '../messages/zh-CN.json'

/**
 * 工具文案仅包含安全摘要，外部错误正文不用于消息插值。
 * @example 模块内部上下文
 * ```ts
 * const message = toolsM('tools_executionFailed')
 * ```
 */
export const toolsM = core.i18n.createMessageGetter<keyof typeof messagesZhCN>({
  'zh-CN': messagesZhCN,
  'en-US': messagesEnUS,
  'ja-JP': messagesJaJP,
})
