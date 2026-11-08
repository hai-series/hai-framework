/**
 * =============================================================================
 * API Service - A2A Echo Executor
 * =============================================================================
 *
 * 简单回声执行器示例，配合 `ai.a2a.registerExecutor()` 使用；Agent Card 通过
 * `config/_ai.yml` 配置。如需通过 HTTP 暴露 A2A 端点，可在 `@h-ai/serv`
 * 之外自行扩展应用路由。
 */

import type { AgentExecutor } from '@h-ai/ai'
import { AgentEvent, Message } from '@h-ai/ai'

/** 回声执行器：将用户消息原样返回 */
export const echoExecutor: AgentExecutor = {
  async execute(context, eventBus) {
    const parts = context.userMessage.parts ?? []
    const textParts = parts
      .flatMap(part => part.content?.$case === 'text'
        ? [part.content.value]
        : [])
    const userText = textParts.join(' ') || '(empty message)'

    eventBus.publish(AgentEvent.message(Message.fromJSON({
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
