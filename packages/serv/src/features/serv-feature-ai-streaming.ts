/** @h-ai/serv — 流式聊天 procedures。 */

import type { AIFunctions, ChatCompletionRequest } from '@h-ai/ai'
import type { AiChatStreamEvent } from '@h-ai/api-contract'
import type { ServContext } from '../serv-context.js'
import type { AiObjectAuthorizationRequest } from './serv-feature-ai.js'
import { apiContract } from '@h-ai/api-contract'
import { ORPCError } from '@orpc/server'
import { servM } from '../serv-i18n.js'
import { implement } from '../serv-router.js'
import { forbidden, requestSignal, unavailable } from './serv-feature-ai-helpers.js'
import { toChatCompletionRequest } from './serv-feature-ai.js'

/**
 * 流式聊天工厂使用的 SDK 能力及跨主体授权策略。
 * @example
 * ```ts
 * import { ai } from '@h-ai/ai'
 * import type { AiStreamingProcedureDeps } from '@h-ai/serv'
 *
 * const deps: AiStreamingProcedureDeps = { ai }
 * void deps
 * ```
 */
export interface AiStreamingProcedureDeps {
  readonly ai: { readonly llm?: Pick<AIFunctions['llm'], 'chatStream'> }
  /** 跨主体聊天沿用非流式补全中的 completion 授权。 */
  readonly authorizeObject?: (request: AiObjectAuthorizationRequest) => boolean | Promise<boolean>
}

/**
 * 为订单助手绑定流式聊天，前端可逐步显示回复。
 * @param deps - 已初始化的 AI 能力及可选的跨主体授权。
 * @returns 包含流式聊天端点的 router。
 * @example
 * ```ts
 * import { ai } from '@h-ai/ai'
 * import { apiContract } from '@h-ai/api-contract'
 * import { serv } from '@h-ai/serv'
 *
 * const contract = { chats: apiContract.extensions.ai.chats }
 * const procedures = serv.createAiStreamingProcedures({ ai })
 * const app = serv.createApp({
 *   contract,
 *   procedures,
 *   transportRoutes: [{ procedure: contract.chats.streamCompletion, maxRequestBytes: 64 * 1024 }],
 * })
 * void app
 * ```
 */
export function createAiStreamingProcedures(deps: AiStreamingProcedureDeps) {
  return implement({ chats: apiContract.extensions.ai.chats })
    .context<ServContext>()

    .route('chats.streamCompletion')
    .auth()
    .handleTransport(async ({ input, context, signal }) => {
      const objectId = input.objectId ?? context.session.userId
      const sessionId = input.sessionId ?? 'default'
      if (objectId !== context.session.userId
        && await deps.authorizeObject?.({
          operation: 'completion',
          context,
          objectId,
          sessionId,
        }) !== true) {
        return forbidden(context)
      }
      const llm = deps.ai.llm
      if (!llm)
        return unavailable(context)
      return streamCompletion(llm, {
        ...toChatCompletionRequest(input),
        objectId,
        sessionId,
        signal: requestSignal(context, signal),
      }, context.locale)
    })

    .build()
}

async function* streamCompletion(
  llm: Pick<AIFunctions['llm'], 'chatStream'>,
  request: ChatCompletionRequest,
  locale: string,
): AsyncGenerator<AiChatStreamEvent> {
  try {
    request.signal?.throwIfAborted()
    for await (const chunk of llm.chatStream(request)) {
      request.signal?.throwIfAborted()
      yield {
        type: 'delta',
        id: chunk.id,
        model: chunk.model,
        created: chunk.created,
        choices: chunk.choices.map(choice => ({
          index: choice.index,
          delta: {
            role: choice.delta.role === 'assistant'
              ? 'assistant'
              : undefined,
            content: choice.delta.content,
            tool_calls: choice.delta.tool_calls?.flatMap(tool => tool.type === 'custom' || tool.custom
              ? []
              : [
                  {
                    index: tool.index,
                    id: tool.id,
                    type: tool.type,
                    function: tool.function && { name: tool.function.name, arguments: tool.function.arguments },
                  },
                ]),
          },
          finish_reason: choice.finish_reason,
        })),
        usage: chunk.usage,
      }
    }
    request.signal?.throwIfAborted()
    yield { type: 'done' }
  }
  catch {
    request.signal?.throwIfAborted()
    throw new ORPCError('BAD_GATEWAY', {
      message: servM('serv_errorInternal', { locale }),
    })
  }
}
