/**
 * @h-ai/ai — A2A Server 创建与传输层
 *
 * 基于 `@a2a-js/sdk/server` 封装，提供便捷的 A2A 服务器创建和 SDK 再导出。
 * @module ai-a2a-server
 */

import type { AgentCard } from '@a2a-js/sdk'

import type { A2AAgentCardConfig } from './ai-a2a-types.js'

// ─── SDK Server 导出 ───

export {
  A2AError,
  DefaultExecutionEventBus,
  DefaultExecutionEventBusManager,
  DefaultRequestHandler,
  ExecutionEventQueue,
  InMemoryPushNotificationStore,
  InMemoryTaskStore,
  JsonRpcTransportHandler,
  RequestContext,
  ResultManager,
} from '@a2a-js/sdk/server'

export type {
  AgentExecutionEvent,
  AgentExecutor,
  ExecutionEventBus,
  ExecutionEventBusManager,
  PushNotificationSender,
  PushNotificationStore,
  ServerCallContext,
  TaskStore,
} from '@a2a-js/sdk/server'

// ─── 便捷工厂 ───

/**
 * 从简化配置构建符合 SDK 规范的 AgentCard 对象
 *
 * @param config - 应用层提供的 Agent Card 配置
 * @returns 完整的 AgentCard 对象（可传给 DefaultRequestHandler）
 *
 * @example
 * ```ts
 * import { buildAgentCard } from '@h-ai/ai'
 *
 * const card = buildAgentCard({
 *   name: 'my-agent',
 *   description: 'An example agent',
 *   url: 'https://example.com',
 *   skills: [{ id: 'chat', name: 'Chat', description: 'General chat' }],
 * })
 * ```
 */
export function buildAgentCard(config: A2AAgentCardConfig): AgentCard {
  const card: AgentCard = {
    name: config.name,
    description: config.description ?? '',
    url: config.url,
    version: config.version ?? '1.0.0',
    protocolVersion: '0.3.0',
    defaultInputModes: ['text'],
    defaultOutputModes: ['text'],
    capabilities: {},
    skills: (config.skills ?? []).map(s => ({
      id: s.id,
      name: s.name,
      description: s.description ?? '',
      tags: s.tags ?? [],
    })),
  }

  // 声明安全认证方案到 Agent Card
  if (config.security?.apiKey) {
    const { in: location, name } = config.security.apiKey
    card.securitySchemes = {
      apiKey: { type: 'apiKey', in: location, name },
    }
    card.security = [{ apiKey: [] }]
  }

  return card
}
