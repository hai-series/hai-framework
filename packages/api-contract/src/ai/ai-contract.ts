/**
 * @h-ai/api-contract — AI 领域 contract
 *
 * 定义 AI 功能相关 API 的接口边界：聊天补全、记忆管理与会话管理。
 * 聊天补全使用 OpenAI 兼容结构（`messages` 数组 + `choices` 数组）。
 * 所有接口均需 Bearer Token 认证（由 `@h-ai/serv` 的 feature 层强制）。
 * @module ai-contract
 */

import { haiResultSchema } from '../common/result-schemas.js'
import { route } from '../common/route.js'
import {
  AiChatCompletionDataSchema,
  AiChatCompletionInputSchema,
  AiChatHistoryDataSchema,
  AiChatHistoryInputSchema,
  AiMemoryListDataSchema,
  AiMemoryListInputSchema,
  AiMemoryRecallDataSchema,
  AiMemoryRecallInputSchema,
  AiSendMessageDataSchema,
  AiSendMessageInputSchema,
  AiSessionListDataSchema,
  AiSessionListInputSchema,
} from './ai-schemas.js'

/** AI 领域 oRPC contract。 */
export const aiContract = {
  chats: {
    createCompletion: route({ method: 'POST', path: '/ai/chats/completions', operationId: 'ai.chats.createCompletion', summary: 'Create chat completion', tags: ['ai', 'chats'] })
      .input(AiChatCompletionInputSchema)
      .output(haiResultSchema(AiChatCompletionDataSchema)),
    sendMessage: route({ method: 'POST', path: '/ai/chats/messages', operationId: 'ai.chats.sendMessage', summary: 'Send a single chat message', tags: ['ai', 'chats'] })
      .input(AiSendMessageInputSchema)
      .output(haiResultSchema(AiSendMessageDataSchema)),
    listHistory: route({ method: 'POST', path: '/ai/chats/history', operationId: 'ai.chats.listHistory', summary: 'List chat history', tags: ['ai', 'chats'] })
      .input(AiChatHistoryInputSchema)
      .output(haiResultSchema(AiChatHistoryDataSchema)),
  },
  memories: {
    recall: route({ method: 'POST', path: '/ai/memories/recall', operationId: 'ai.memories.recall', summary: 'Recall relevant memories', tags: ['ai', 'memories'] })
      .input(AiMemoryRecallInputSchema)
      .output(haiResultSchema(AiMemoryRecallDataSchema)),
    list: route({ method: 'POST', path: '/ai/memories/list', operationId: 'ai.memories.list', summary: 'List memories', tags: ['ai', 'memories'] })
      .input(AiMemoryListInputSchema)
      .output(haiResultSchema(AiMemoryListDataSchema)),
  },
  sessions: {
    list: route({ method: 'POST', path: '/ai/sessions/list', operationId: 'ai.sessions.list', summary: 'List sessions', tags: ['ai', 'sessions'] })
      .input(AiSessionListInputSchema)
      .output(haiResultSchema(AiSessionListDataSchema)),
  },
}

export type AiContract = typeof aiContract
