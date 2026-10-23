/**
 * @h-ai/serv — AI 默认 procedures
 *
 * 基于 `@h-ai/ai` 提供开箱即用的 AI procedures 实现：对话补全、消息发送、聊天历史、记忆管理、会话列表。
 * 默认将所有读取和写入绑定到认证 session.userId；跨主体访问必须通过显式授权。
 * @module features/serv-feature-ai
 */

import type {
  AIFunctions,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatMessage,
  InteractionScope,
  ToolCall,
} from '@h-ai/ai'
import type {
  AiChatCompletionData,
  AiChatCompletionInput,
  AiChatRecord,
  AiSendMessageInput,
} from '@h-ai/api-contract'
import type { HaiResult } from '@h-ai/core'
import type { ServContext } from '../serv-context.js'
import type { AuthenticatedServContext } from '../serv-router.js'
import { apiContract } from '@h-ai/api-contract'
import { err, HaiCommonError, ok } from '@h-ai/core'
import { servM } from '../serv-i18n.js'
import { implement } from '../serv-router.js'
import { wrapItemsResult } from './serv-feature-helpers.js'

const aiContract = apiContract.ai

/**
 * 对不同于当前认证用户的 AI 主体进行授权的请求。
 *
 * @example
 * ```ts
 * import type { AiObjectAuthorizationRequest } from '@h-ai/serv/features/ai'
 *
 * const authorize = ({ context, operation }: AiObjectAuthorizationRequest) =>
 *   operation === 'history' && context.session.permissions.includes('ai.history.manage')
 * // 租户型应用还应在此核验目标 objectId 与当前租户的真实关系。
 * ```
 */
export interface AiObjectAuthorizationRequest {
  /** 本次操作；授权可按读写能力分别限制。 */
  readonly operation: 'completion' | 'message' | 'history' | 'memoryRecall' | 'memoryList' | 'sessions'
  /** 可信认证上下文；不从客户端输入解析身份。 */
  readonly context: AuthenticatedServContext
  /** 请求访问的主体 ID；必须由策略核验所有者/租户关系。 */
  readonly objectId: string
  /** 请求指定的会话 ID；始终与 objectId 一起构成作用域。 */
  readonly sessionId?: string
}

/**
 * AI 默认 procedures 依赖；只要求实际使用的 AI 能力。
 *
 * @example
 * ```ts
 * import { ai } from '@h-ai/ai'
 * import { createAiProcedures } from '@h-ai/serv/features/ai'
 *
 * // 宿主已初始化 AI 及其共享存储；省略策略时只允许当前 session.userId。
 * const procedures = createAiProcedures({ ai })
 * // 默认 completion 为非流式 JSON；object/session 作用域来自可信认证上下文。
 * ```
 */
export interface AiProcedureDeps {
  readonly ai: Pick<AIFunctions, 'config'> & {
    readonly llm: Pick<AIFunctions['llm'], 'chat' | 'ask' | 'getHistory' | 'listSessions'>
    readonly memory: Pick<AIFunctions['memory'], 'recall' | 'listPage'>
  }
  /** 跨主体资源授权；省略时仅允许当前 session.userId，必须严格返回 true 才放行。 */
  readonly authorizeObject?: (request: AiObjectAuthorizationRequest) => boolean | Promise<boolean>
}

/**
 * 创建以认证用户为默认主体的 AI procedures。
 * 补全仅返回非流式 JSON，完整转发 function 工具和角色消息；工具执行由业务方授权处理。
 *
 * @param deps - 已初始化 AI 能力及可选的跨主体授权策略。
 * @returns AI router；跨主体访问未获授权时返回 FORBIDDEN。
 *
 * @example
 * ```ts
 * import { ai } from '@h-ai/ai'
 * import { createAiProcedures } from '@h-ai/serv/features/ai'
 *
 * // 宿主已初始化 AI 及其共享存储；省略策略时只允许当前 session.userId。
 * const procedures = createAiProcedures({ ai })
 * // 默认 completion 为非流式 JSON；object/session 作用域来自可信认证上下文。
 * ```
 */
export function createAiProcedures(deps: AiProcedureDeps) {
  async function resolveObjectId(
    operation: AiObjectAuthorizationRequest['operation'],
    context: AuthenticatedServContext,
    input: { objectId?: string, sessionId?: string },
  ): Promise<HaiResult<string>> {
    const objectId = input.objectId ?? context.session.userId
    if (objectId !== context.session.userId
      && await deps.authorizeObject?.({ context, objectId, sessionId: input.sessionId, operation }) !== true) {
      return err(HaiCommonError.FORBIDDEN, servM('serv_errorForbidden', { locale: context.locale }))
    }
    return ok(objectId)
  }

  return implement(aiContract)
    .context<ServContext>()

    .route('chats.createCompletion')
    .auth()
    .handle(async ({ input, context }) => {
      const objectId = await resolveObjectId('completion', context, input)
      if (!objectId.success)
        return objectId
      return mapChatCompletionResult(await deps.ai.llm.chat({
        ...toChatCompletionRequest(input),
        objectId: objectId.data,
        sessionId: input.sessionId ?? 'default',
      }))
    })

    .route('chats.sendMessage')
    .auth()
    .handle(async ({ input, context }) => {
      const objectId = await resolveObjectId('message', context, input)
      if (!objectId.success)
        return objectId
      return sendMessage(deps, input, { objectId: objectId.data, sessionId: input.sessionId ?? 'default' })
    })

    .route('chats.listHistory')
    .auth()
    .handle(async ({ input, context }) => {
      const objectId = await resolveObjectId('history', context, input)
      if (!objectId.success)
        return objectId
      const { sessionId, limit, order } = input
      return mapChatRecordsResult(
        await deps.ai.llm.getHistory({ objectId: objectId.data, sessionId }, { limit, order }),
      )
    })

    .route('memories.recall')
    .auth()
    .handle(async ({ input, context }) => {
      const objectId = await resolveObjectId('memoryRecall', context, input)
      if (!objectId.success)
        return objectId
      const { query, ...options } = input
      return wrapItemsResult(await deps.ai.memory.recall(query, { ...options, objectId: objectId.data }))
    })

    .route('memories.list')
    .auth()
    .handle(async ({ input, context }) => {
      const objectId = await resolveObjectId('memoryList', context, input)
      if (!objectId.success)
        return objectId
      return deps.ai.memory.listPage({ ...input, objectId: objectId.data })
    })

    .route('sessions.list')
    .auth()
    .handle(async ({ input, context }) => {
      const objectId = await resolveObjectId('sessions', context, input)
      if (!objectId.success)
        return objectId
      return wrapItemsResult(await deps.ai.llm.listSessions(objectId.data))
    })

    .build()
}

function toChatCompletionRequest(input: AiChatCompletionInput): ChatCompletionRequest {
  return {
    // Schema 已按角色校验完整消息，直接传递以保留 name、图片、tool_calls 和工具结果。
    messages: input.messages,
    model: input.model,
    temperature: input.temperature,
    top_p: input.top_p,
    max_tokens: input.max_tokens,
    tools: input.tools,
    tool_choice: input.tool_choice,
  }
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
      name: message.name,
      tool_calls: mapFunctionToolCalls(message.tool_calls),
    }
  }

  if (message.role === 'user') {
    return { role: 'user', content: toContentText(message.content), name: message.name }
  }

  return { role: 'system', content: toContentText(message.content), name: message.role === 'system' || message.role === 'developer' ? message.name : undefined }
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

async function sendMessage(
  deps: AiProcedureDeps,
  input: AiSendMessageInput,
  scope: InteractionScope,
): Promise<HaiResult<{ content: string, model: string }>> {
  const result = await deps.ai.llm.ask(input.message, {
    systemPrompt: input.systemPrompt,
    model: input.model,
    temperature: input.temperature,
    ...scope,
  })

  if (!result.success) {
    return result
  }

  return ok({
    content: result.data,
    model: input.model ?? deps.ai.config?.llm.model ?? 'default',
  })
}
