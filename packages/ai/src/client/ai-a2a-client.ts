/**
 * @h-ai/ai — 前端 A2A 客户端
 *
 * 浏览器端 A2A 操作客户端，通过 API 服务调用后端 A2A 能力。
 * @module ai-a2a-client
 */

import type {
  A2AAgentCardConfig,
  A2ACallResult,
  A2AMessageRecord,
} from '../a2a/ai-a2a-types.js'
import type { StorePage } from '../store/ai-store-types.js'
import type { AIApiAdapter } from './ai-client.js'

// ─── A2A 客户端接口 ───

/**
 * A2A 客户端接口
 *
 * 提供浏览器端调用后端 A2A API 的能力。
 */
export interface A2AClientOperations {
  /** 获取当前 Agent Card 配置 */
  getAgentCard: () => Promise<A2AAgentCardConfig>
  /** 直接请求默认 A2A JSON-RPC 端点 */
  sendRequest: (requestBody: unknown) => Promise<unknown>
  /** 查询 A2A 消息记录 */
  listMessages: (filter?: { contextId?: string, status?: string, limit?: number, offset?: number }) => Promise<StorePage<A2AMessageRecord>>
  /** 作为客户端调用远端 Agent */
  callRemoteAgent: (remoteUrl: string, message: string, options?: { timeout?: number }) => Promise<A2ACallResult>
}

// ─── A2A API 路径 ───

const A2A_PATH = {
  agentCard: '/.well-known/agent.json',
  rpc: '/a2a',
  messages: '/a2a/messages',
  callRemote: '/a2a/call',
} as const

// ─── 工厂函数 ───

/**
 * 创建 A2A 客户端
 *
 * @param api - API 适配器（来自 @h-ai/api-client）
 * @returns A2A 客户端操作实例
 */
export function createA2AClient(api: AIApiAdapter): A2AClientOperations {
  return {
    async getAgentCard(): Promise<A2AAgentCardConfig> {
      const result = await api.get<A2AAgentCardConfig>(A2A_PATH.agentCard)
      if (!result.success) {
        throw new Error(`A2A get agent card failed: ${result.error.message}`)
      }
      return result.data
    },

    async sendRequest(requestBody: unknown): Promise<unknown> {
      const result = await api.post<unknown>(A2A_PATH.rpc, requestBody)
      if (!result.success) {
        throw new Error(`A2A request failed: ${result.error.message}`)
      }
      return result.data
    },

    async listMessages(filter?: { contextId?: string, status?: string, limit?: number, offset?: number }): Promise<StorePage<A2AMessageRecord>> {
      const result = await api.post<StorePage<A2AMessageRecord>>(A2A_PATH.messages, filter ?? {})
      if (!result.success) {
        throw new Error(`A2A list messages failed: ${result.error.message}`)
      }
      return result.data
    },

    async callRemoteAgent(remoteUrl: string, message: string, options?: { timeout?: number }): Promise<A2ACallResult> {
      const result = await api.post<A2ACallResult>(A2A_PATH.callRemote, {
        remoteUrl,
        message,
        ...options,
      })
      if (!result.success) {
        throw new Error(`A2A remote call failed: ${result.error.message}`)
      }
      return result.data
    },
  }
}
