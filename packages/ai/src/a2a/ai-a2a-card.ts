/**
 * @h-ai/ai — A2A Agent Card 构建
 *
 * 将模块的声明配置转换为实际支持的 A2A 协议能力。
 * @module ai-a2a-card
 */

import type { AgentCard } from '@a2a-js/sdk'

import type { A2AAgentCardConfig } from './ai-a2a-types.js'

// ─── 便捷工厂 ───

/**
 * 从简化配置构建符合 SDK 规范的 AgentCard 对象
 *
 * @param config - 应用层提供的 Agent Card 配置
 * @returns 由共享 journal handler 提供的完整 AgentCard 对象
 *
 * @example 模块内部上下文
 * ```ts
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
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['text/plain'],
    capabilities: { streaming: true, pushNotifications: false },
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
