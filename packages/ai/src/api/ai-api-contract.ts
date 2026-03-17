/**
 * @h-ai/ai/api — AI API 端点契约定义
 *
 * 所有 ai 模块的 API 端点（path + method + schema），
 * 客户端和服务端都从此处引用，编译时保证一致性。
 *
 * 注意：`chatStream` 使用 SSE 流式协议，客户端应使用
 * `createAIClient().chatStream()` 而非 `api.call()`。
 * 此处定义仅用于服务端路由注册和文档生成。
 *
 * @module ai-api-contract
 */

import { z } from 'zod'
import {
  ChatCompletionInputSchema,
  ChatCompletionOutputSchema,
  ChatHistoryInputSchema,
  ChatHistoryOutputSchema,
  MemoryListInputSchema,
  MemoryListOutputSchema,
  MemoryRecallInputSchema,
  MemoryRecallOutputSchema,
  SendMessageInputSchema,
  SendMessageOutputSchema,
  SessionListInputSchema,
  SessionListOutputSchema,
} from './ai-api-schemas.js'

// ─── 端点定义辅助（内联，避免对 @h-ai/api-client 的循环依赖） ───

interface EndpointDef<TInput = unknown, TOutput = unknown> {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  path: string
  input: z.ZodType<TInput>
  output: z.ZodType<TOutput>
  requireAuth?: boolean
  meta?: { summary?: string, tags?: string[], streaming?: boolean }
}

function defineEndpoint<TInput, TOutput>(def: EndpointDef<TInput, TOutput>): EndpointDef<TInput, TOutput> {
  return def
}

// ─── ai API 端点 ───

/**
 * ai 所有 API 端点
 *
 * @example
 * ```ts
 * // 客户端（非流式）
 * import { aiEndpoints } from '@h-ai/ai/api'
 * const result = await api.call(aiEndpoints.chat, { messages: [...] })
 *
 * // 客户端（流式）— 使用专用 AIClient
 * import { api } from '@h-ai/api-client'
 * import { createAIClient } from '@h-ai/ai/client'
 * await api.init({ baseUrl: '/api' })
 * const client = createAIClient({ api })
 * for await (const chunk of client.chatStream({ messages })) { ... }
 *
 * // 服务端
 * export const POST = kit.fromContract(aiEndpoints.chat, async (input) => {
 *   const result = await ai.llm.chat(input)
 *   return result.success ? result.data : kit.response.internalError(result.error.message)
 * })
 * ```
 */
export const aiEndpoints = {
  /** 聊天完成（非流式） */
  chat: defineEndpoint({
    method: 'POST',
    path: '/ai/chat',
    input: ChatCompletionInputSchema,
    output: ChatCompletionOutputSchema,
    meta: { summary: 'Chat completion (non-streaming)', tags: ['ai'] },
  }),

  /**
   * 聊天完成（流式 SSE）
   *
   * 此端点使用 Server-Sent Events 协议返回流式 chunk。
   * 客户端应使用 `createAIClient().chatStream()` 而非 `api.call()`。
   * 定义此契约用于服务端路由注册和 API 文档。
   */
  chatStream: defineEndpoint({
    method: 'POST',
    path: '/ai/chat/stream',
    input: ChatCompletionInputSchema,
    output: z.unknown(),
    requireAuth: true,
    meta: { summary: 'Chat completion (SSE streaming)', tags: ['ai'], streaming: true },
  }),

  /** 简单消息（便捷接口，封装单轮对话） */
  sendMessage: defineEndpoint({
    method: 'POST',
    path: '/ai/message',
    input: SendMessageInputSchema,
    output: SendMessageOutputSchema,
    meta: { summary: 'Send a single message (convenience)', tags: ['ai'] },
  }),

  /** 记忆检索 */
  memoryRecall: defineEndpoint({
    method: 'POST',
    path: '/ai/memory/recall',
    input: MemoryRecallInputSchema,
    output: MemoryRecallOutputSchema,
    meta: { summary: 'Recall relevant memories', tags: ['ai', 'memory'] },
  }),

  /** 记忆列表（分页） */
  memoryList: defineEndpoint({
    method: 'POST',
    path: '/ai/memory/list',
    input: MemoryListInputSchema,
    output: MemoryListOutputSchema,
    meta: { summary: 'List memories (paginated)', tags: ['ai', 'memory'] },
  }),

  /** 会话列表 */
  sessionList: defineEndpoint({
    method: 'POST',
    path: '/ai/sessions',
    input: SessionListInputSchema,
    output: SessionListOutputSchema,
    meta: { summary: 'List sessions for an object', tags: ['ai', 'session'] },
  }),

  /** 对话历史 */
  chatHistory: defineEndpoint({
    method: 'POST',
    path: '/ai/chat/history',
    input: ChatHistoryInputSchema,
    output: ChatHistoryOutputSchema,
    meta: { summary: 'Get chat history for a session', tags: ['ai', 'llm'] },
  }),
} as const
