import { eventIterator } from '@orpc/contract'
import { haiResultSchema } from '../../common/result-schemas.js'
import { route } from '../../common/route.js'
import {
  AiChatCompletionDataSchema,
  AiChatCompletionInputSchema,
  AiChatHistoryDataSchema,
  AiChatHistoryInputSchema,
  AiChatStreamEventSchema,
  AiSendMessageDataSchema,
  AiSendMessageInputSchema,
} from './ai-chat-schemas.js'

/**
 * 聊天补全、消息和会话历史的 JSON 端点。
 * @example
 * ```ts
 * import { apiContract } from '@h-ai/api-contract'
 *
 * const operation = apiContract.ai.chats.listHistory
 * void operation
 * ```
 */
export const aiChatContract = {
  createCompletion: route({
    method: 'POST',
    path: '/ai/chats/completions',
    operationId: 'ai.chats.createCompletion',
    summary: 'Create non-streaming chat completion with function tools',
    tags: ['ai', 'chats'],
  })
    .input(AiChatCompletionInputSchema)
    .output(haiResultSchema(AiChatCompletionDataSchema)),
  sendMessage: route({
    method: 'POST',
    path: '/ai/chats/messages',
    operationId: 'ai.chats.sendMessage',
    summary: 'Send a single chat message',
    tags: ['ai', 'chats'],
  })
    .input(AiSendMessageInputSchema)
    .output(haiResultSchema(AiSendMessageDataSchema)),
  listHistory: route({
    method: 'POST',
    path: '/ai/chats/history',
    operationId: 'ai.chats.listHistory',
    summary: 'List chat history',
    tags: ['ai', 'chats'],
  })
    .input(AiChatHistoryInputSchema)
    .output(haiResultSchema(AiChatHistoryDataSchema)),
}

/**
 * 逐事件返回聊天补全结果的端点。
 * @example
 * ```ts
 * import { apiContract } from '@h-ai/api-contract'
 *
 * const operation = apiContract.extensions.ai.chats.streamCompletion
 * void operation
 * ```
 */
export const aiChatStreamingContract = {
  streamCompletion: route({
    method: 'POST',
    path: '/ai/chats/completions/stream',
    operationId: 'ai.chats.streamCompletion',
    summary: 'Stream chat completion and function tool deltas',
    tags: ['ai', 'chats'],
  })
    .input(AiChatCompletionInputSchema)
    .output(eventIterator(AiChatStreamEventSchema)),
}
