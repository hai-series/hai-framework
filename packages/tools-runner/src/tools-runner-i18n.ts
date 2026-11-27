import { core } from '@h-ai/core'
import messagesEnUS from '../messages/en-US.json'
import messagesJaJP from '../messages/ja-JP.json'
import messagesZhCN from '../messages/zh-CN.json'

/**
 * 工具服务和容器作业使用可公开的本地化消息。
 * @example 模块内部上下文
 * ```ts
 * const message = toolsRunnerM('tools_executionFailed')
 * ```
 */
export const toolsRunnerM = core.i18n.createMessageGetter<keyof typeof messagesZhCN>({
  'zh-CN': messagesZhCN,
  'en-US': messagesEnUS,
  'ja-JP': messagesJaJP,
})
