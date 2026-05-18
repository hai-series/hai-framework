/**
 * @h-ai/serv — AI 默认 procedures
 *
 * 基于 `@h-ai/ai` 提供开箱即用的 AI procedures 实现：对话补全、消息发送、聊天历史、记忆管理、会话列表。
 * 通过 `createAiProcedures(deps)` 组装后直接挂载到 oRPC router。
 * @module features/ai
 */

import type {
  AIFunctions,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatMessage,
  MemoryEntry,
  SessionInfo,
  ToolCall,
} from '@h-ai/ai'
import type {
  AiChatCompletionData,
  AiChatCompletionInput,
  AiChatHistoryInput,
  AiChatRecord,
  AiMemoryListInput,
  AiMemoryRecallInput,
  AiSendMessageInput,
  AiSessionListInput,
} from '@h-ai/api-contract'
import type { HaiResult } from '@h-ai/core'
import type { ServContext } from '../context/context-types.js'
import { aiContract } from '@h-ai/api-contract'
import { ok } from '@h-ai/core'
import { implement } from '@orpc/server'
import { requireAuth } from '../pipeline/orpc.js'

/** AI 默认 procedures 依赖。 */
export interface AiProcedureDeps {
  readonly ai: AIFunctions
}

/** 创建 AI 默认 procedures。 */
export function createAiProcedures(deps: AiProcedureDeps) {
  const p = implement(aiContract).$context<ServContext>()

  return p.router({
    chats: {
      createCompletion: p.chats.createCompletion.handler(requireAuth<AiChatCompletionInput, AiChatCompletionData>(async ({ input }) => {
        return mapChatCompletionResult(await deps.ai.llm.chat(toChatCompletionRequest(input)))
      })),
      sendMessage: p.chats.sendMessage.handler(requireAuth<AiSendMessageInput, { content: string, model: string }>(async ({ input }) => {
        return sendMessage(deps, input)
      })),
      listHistory: p.chats.listHistory.handler(requireAuth<AiChatHistoryInput, { items: AiChatRecord[] }>(async ({ input }) => {
        const { objectId, sessionId, limit, order } = input
        return mapChatRecordsResult(await deps.ai.llm.getHistory({ objectId, sessionId }, { limit, order }))
      })),
    },
    memories: {
      recall: p.memories.recall.handler(requireAuth<AiMemoryRecallInput, { items: MemoryEntry[] }>(async ({ input }) => {
        const { query, ...options } = input
        return wrapItemsResult(await deps.ai.memory.recall(query, options))
      })),
      list: p.memories.list.handler(requireAuth<AiMemoryListInput, { items: MemoryEntry[], total: number }>(async ({ input }) => {
        return deps.ai.memory.listPage(input)
      })),
    },
    sessions: {
      list: p.sessions.list.handler(requireAuth<AiSessionListInput, { items: SessionInfo[] }>(async ({ input }) => {
        return wrapItemsResult(await deps.ai.llm.listSessions(input.objectId))
      })),
    },
  })
}

function toChatCompletionRequest(input: AiChatCompletionInput): ChatCompletionRequest {
  return {
    messages: input.messages.map(toChatMessage),
    model: input.model,
    temperature: input.temperature,
    top_p: input.top_p,
    max_tokens: input.max_tokens,
  }
}

function toChatMessage(message: AiChatCompletionInput['messages'][number]): ChatMessage {
  if (message.role === 'system') {
    return { role: 'system', content: toMessageText(message.content) }
  }

  if (message.role === 'user') {
    return { role: 'user', content: message.content ?? '' }
  }

  if (message.role === 'tool') {
    return { role: 'tool', content: toMessageText(message.content), tool_call_id: message.tool_call_id ?? '' }
  }

  return {
    role: 'assistant',
    content: toAssistantContent(message.content),
    tool_calls: message.tool_calls,
  }
}

function toMessageText(content: AiChatCompletionInput['messages'][number]['content']): string {
  if (typeof content === 'string') {
    return content
  }

  return content?.map(part => part.type === 'text' ? part.text : part.image_url.url).join('\n') ?? ''
}

function toAssistantContent(content: AiChatCompletionInput['messages'][number]['content']): string | null {
  if (typeof content === 'string') {
    return content
  }

  return content ? toMessageText(content) : null
}

function mapChatCompletionResult(result: HaiResult<ChatCompletionResponse>): HaiResult<AiChatCompletionData> {
  if (!result.success) {
    return result
  }

  return ok({
    id: result.data.id,
    object: 'chat.completion',
    created: result.data.created,
    model: result.data.model,
    choices: result.data.choices.map(choice => ({
      index: choice.index,
      message: {
        role: 'assistant',
        content: choice.message.content ?? null,
        tool_calls: mapFunctionToolCalls(choice.message.tool_calls),
      },
      finish_reason: toApiFinishReason(choice.finish_reason),
    })),
    usage: {
      prompt_tokens: result.data.usage?.prompt_tokens ?? 0,
      completion_tokens: result.data.usage?.completion_tokens ?? 0,
      total_tokens: result.data.usage?.total_tokens ?? 0,
    },
  })
}

function toApiFinishReason(reason: string | null): AiChatCompletionData['choices'][number]['finish_reason'] {
  if (reason === 'length' || reason === 'tool_calls' || reason === 'content_filter') {
    return reason
  }

  return 'stop'
}

function mapChatRecordsResult(result: HaiResult<Array<import('@h-ai/ai').ChatRecord>>): HaiResult<{ items: AiChatRecord[] }> {
  if (!result.success) {
    return result
  }

  return ok({ items: result.data.map(toApiChatRecord) })
}

function toApiChatRecord(record: import('@h-ai/ai').ChatRecord): AiChatRecord {
  return {
    id: record.id,
    objectId: record.objectId,
    sessionId: record.sessionId,
    request: {
      model: record.request.model,
      messages: record.request.messages.map(toApiChatMessage),
    },
    response: {
      content: record.response.content,
      toolCalls: mapFunctionToolCalls(record.response.toolCalls),
      finishReason: record.response.finishReason,
      usage: {
        prompt_tokens: record.response.usage.prompt_tokens,
        completion_tokens: record.response.usage.completion_tokens,
        total_tokens: record.response.usage.total_tokens,
      },
    },
    createdAt: record.createdAt,
    duration: record.duration,
  }
}

function toApiChatMessage(message: ChatMessage): AiChatCompletionInput['messages'][number] {
  if (message.role === 'tool') {
    return { role: 'tool', content: toContentText(message.content), tool_call_id: message.tool_call_id }
  }

  if (message.role === 'assistant') {
    return {
      role: 'assistant',
      content: toContentText(message.content),
      tool_calls: mapFunctionToolCalls(message.tool_calls),
    }
  }

  if (message.role === 'user') {
    return { role: 'user', content: toContentText(message.content) }
  }

  return { role: 'system', content: toContentText(message.content) }
}

function toContentText(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }

  if (!Array.isArray(content)) {
    return ''
  }

  return content.map((part) => {
    if (typeof part !== 'object' || part === null) {
      return ''
    }

    const record = part as Record<string, unknown>
    if (typeof record.text === 'string') {
      return record.text
    }

    if (typeof record.image_url === 'object' && record.image_url !== null) {
      const image = record.image_url as Record<string, unknown>
      return typeof image.url === 'string' ? image.url : ''
    }

    return ''
  }).filter(Boolean).join('\n')
}

function mapFunctionToolCalls(toolCalls: ToolCall[] | undefined) {
  return toolCalls?.flatMap((toolCall) => {
    if (toolCall.type !== 'function' || !('function' in toolCall)) {
      return []
    }

    return [{
      id: toolCall.id,
      type: 'function' as const,
      function: {
        name: toolCall.function.name,
        arguments: toolCall.function.arguments,
      },
    }]
  })
}

async function sendMessage(deps: AiProcedureDeps, input: AiSendMessageInput): Promise<HaiResult<{ content: string, model: string }>> {
  const result = await deps.ai.llm.ask(input.message, {
    systemPrompt: input.systemPrompt,
    model: input.model,
    temperature: input.temperature,
  })

  if (!result.success) {
    return result
  }

  return ok({
    content: result.data,
    model: input.model ?? deps.ai.config?.llm.model ?? 'default',
  })
}

function wrapItemsResult<T>(result: HaiResult<T[]>): HaiResult<{ items: T[] }> {
  if (!result.success) {
    return result
  }

  return ok({ items: result.data })
}
