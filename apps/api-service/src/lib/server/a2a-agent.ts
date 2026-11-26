/**
 * =============================================================================
 * API Service - A2A Echo Executor
 * =============================================================================
 *
 * 简单回声执行器示例，由应用在启用 A2A HTTP 入口后注册。Agent Card 由
 * `config/_ai.yml` 定义，发现和调用路径由 `config/_serv.yml` 定义。
 */

import type { AgentExecutor } from '@h-ai/ai'
import { ai } from '@h-ai/ai'

/** 回声执行器：将用户消息原样返回 */
export const echoExecutor: AgentExecutor = {
  async execute(context, eventBus) {
    const parts = context.userMessage.parts ?? []
    const textParts = parts
      .flatMap(part => part.content?.$case === 'text'
        ? [part.content.value]
        : [])
    const userText = textParts.join(' ') || '(empty message)'

    eventBus.publish(ai.AgentEvent.message(ai.Message.fromJSON({
      messageId: `echo_${Date.now()}`,
      role: 'ROLE_AGENT',
      parts: [
        { text: `Echo: ${userText}` },
      ],
    })))
    eventBus.finished()
  },

  async cancelTask(_taskId, eventBus) {
    eventBus.finished()
  },
}
