/**
 * @h-ai/ai — A2A Agent Card 构建
 *
 * 将模块的声明配置转换为实际支持的 A2A 协议能力。
 * @module ai-a2a-card
 */

import type { A2AAgentCardConfig, A2AAgentCardDocument } from './ai-a2a-types.js'

import { AgentCard } from '@a2a-js/sdk'

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
  return AgentCard.fromJSON(buildAgentCardDocument(config))
}

/**
 * 构建标准发现文档，HTTP 调用方无需了解 SDK 编解码器。
 *
 * @example 模块内部上下文
 * ```ts
 * const document = buildAgentCardDocument({ name: 'my-agent', url: 'https://example.com/a2a' })
 * const response = Response.json(document)
 * ```
 */
export function buildAgentCardDocument(config: A2AAgentCardConfig): A2AAgentCardDocument {
  const card: A2AAgentCardDocument = {
    name: config.name,
    description: config.description ?? '',
    supportedInterfaces: [
      { url: config.url, protocolBinding: 'JSONRPC', protocolVersion: '1.0' },
    ],
    version: config.version ?? '1.0.0',
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
      apiKey: {
        apiKeySecurityScheme: { location, name },
      },
    }
    card.securityRequirements = [
      {
        schemes: {
          apiKey: { list: [] },
        },
      },
    ]
  }

  return card
}
