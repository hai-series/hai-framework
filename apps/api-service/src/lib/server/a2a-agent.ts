/**
 * =============================================================================
 * API Service - A2A Echo Executor
 * =============================================================================
 *
 * 简单回声执行器示例，配合 ai.a2a.registerExecutor() 使用。
 * Agent Card 通过 _ai.yml 配置，端点由 kit.createHandle({ a2a }) 自动挂载。
 */

import type { AgentExecutor } from '@h-ai/ai'

/** 回声执行器：将用户消息原样返回 */
export const echoExecutor: AgentExecutor = {
  async execute(context, eventBus) {
    const parts = context.userMessage.parts ?? []
    const textParts = parts
      .filter((p): p is { kind: 'text', text: string } => p.kind === 'text')
      .map(p => p.text)
    const userText = textParts.join(' ') || '(empty message)'

    eventBus.publish({
      kind: 'message',
      messageId: `echo_${Date.now()}`,
      role: 'agent',
      parts: [{ kind: 'text', text: `Echo: ${userText}` }],
    })
    eventBus.finished()
  },

  async cancelTask(_taskId, eventBus) {
    eventBus.finished()
  },
}
