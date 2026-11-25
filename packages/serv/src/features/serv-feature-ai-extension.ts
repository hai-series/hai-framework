/** @h-ai/serv — 按需挂载的 AI procedures。 */

import type { AIFunctions, ChatCompletionRequest, ScopedMemoryBinding } from '@h-ai/ai'
import type { AiChatStreamEvent } from '@h-ai/api-contract'
import type { HaiResult } from '@h-ai/core'
import type { TicketOperations } from '@h-ai/iam'
import type { ServContext } from '../serv-context.js'
import type { AuthenticatedServContext } from '../serv-router.js'
import type { AiObjectAuthorizationRequest } from './serv-feature-ai.js'
import { apiContract } from '@h-ai/api-contract'
import { core, HaiCommonError } from '@h-ai/core'
import { ORPCError } from '@orpc/server'
import { servM } from '../serv-i18n.js'
import { markServResponsePrivate } from '../serv-route-transport.js'
import { implement } from '../serv-router.js'
import { audioFile, audioUploadFormat, imageFile, referenceImage } from './serv-feature-ai-media.js'
import { toChatCompletionRequest } from './serv-feature-ai.js'

/**
 * 宿主收到的记忆写入授权请求。objectId 是待授权的主体，context.session 才是已认证身份。
 * @example
 * ```ts
 * import type { AiMemoryWriteAuthorizationRequest } from '@h-ai/serv'
 *
 * function ownsMemory({ context, objectId }: AiMemoryWriteAuthorizationRequest) {
 *   return objectId === context.session.userId
 * }
 * ```
 */
export interface AiMemoryWriteAuthorizationRequest {
  readonly context: AuthenticatedServContext
  readonly operation: 'add' | 'update' | 'remove' | 'clear'
  readonly objectId: string
  readonly id?: string
}

/**
 * 宿主收到的 AI 媒体授权请求。model 和 voice 是调用方提出的值，须由宿主选定实际值。
 * @example
 * ```ts
 * import type { AiExtensionOperationRequest } from '@h-ai/serv'
 *
 * function canSynthesize({ context, operation }: AiExtensionOperationRequest) {
 *   return operation === 'synthesize' && context.session.permissions.includes('ai.speech.use')
 * }
 * ```
 */
export type AiExtensionOperationRequest = {
  readonly context: AuthenticatedServContext
  readonly model?: string
} & ({
  readonly operation: 'issueTicket' | 'getCapabilities'
  readonly audioOperation: 'transcribe' | 'synthesize'
} | {
  readonly operation: 'transcribe' | 'synthesize' | 'generateImage'
  readonly voice?: string
})

/**
 * 宿主确认的媒体模型和音色。省略字段使用 SDK 中配置的默认值。
 * @example
 * ```ts
 * import type { AiAuthorizedMediaRequest } from '@h-ai/serv'
 *
 * const grant: AiAuthorizedMediaRequest = { model: 'speech', voice: 'default-narrator' }
 * void grant
 * ```
 */
export interface AiAuthorizedMediaRequest {
  readonly model?: string
  readonly voice?: string
}

/**
 * AI 扩展工厂依赖。应用注入已经初始化的 SDK 能力与自身访问策略。
 * @example
 * ```ts
 * import { ai } from '@h-ai/ai'
 * import type { AiExtensionProcedureDeps } from '@h-ai/serv'
 *
 * const deps: AiExtensionProcedureDeps = {
 *   ai,
 *   resolveMemoryScope: ({ context, objectId }) => objectId === context.session.userId
 *     ? { objectId, scope: { app: 'chat' } }
 *     : null,
 * }
 * ```
 */
export interface AiExtensionProcedureDeps {
  readonly ai: {
    readonly llm?: Pick<AIFunctions['llm'], 'chatStream'>
    readonly memory?: Pick<AIFunctions['memory'], 'scoped'>
    readonly audio?: Pick<AIFunctions['audio'], 'transcribe' | 'synthesize' | 'getCapabilities'>
    readonly image?: Pick<AIFunctions['image'], 'generate'>
  }
  /** 跨主体聊天使用与非流式补全相同的授权操作 completion。 */
  readonly authorizeObject?: (request: AiObjectAuthorizationRequest) => boolean | Promise<boolean>
  /** 提供后检查所有记忆写入。不提供时仅允许本人新增、修改与单条删除，清空须由宿主明确授予作用域。 */
  readonly resolveMemoryScope?: (request: AiMemoryWriteAuthorizationRequest) => ScopedMemoryBinding | null | Promise<ScopedMemoryBinding | null>
  /** 媒体操作均要求宿主授权。宿主可在此执行权限、配额及模型限制。 */
  readonly authorizeMedia?: (request: AiExtensionOperationRequest) => HaiResult<AiAuthorizedMediaRequest> | Promise<HaiResult<AiAuthorizedMediaRequest>>
  /** 语音票据签发器，例如 iam.ticket。WebSocket 升级时由 verifyTicket 按用途消费。 */
  readonly audioTickets?: Pick<TicketOperations, 'issue'>
}

/**
 * 为 AI 扩展契约创建 procedures；选用的 procedure 与应用契约一起装配。
 * @param deps - 应用可用的 AI 能力与授权策略。
 * @returns 按聊天、记忆、语音和图像分组的 procedures。
 * @example
 * ```ts
 * import { ai } from '@h-ai/ai'
 * import { serv } from '@h-ai/serv'
 *
 * const procedures = serv.createAiExtensionProcedures({ ai })
 * const addMemory = procedures.memories.add
 * void addMemory
 * ```
 */
export function createAiExtensionProcedures(deps: AiExtensionProcedureDeps) {
  async function memoryFor(
    operation: AiMemoryWriteAuthorizationRequest['operation'],
    context: AuthenticatedServContext,
    input: { objectId?: string, id?: string },
  ) {
    const objectId = input.objectId ?? context.session.userId
    const binding = deps.resolveMemoryScope
      ? await deps.resolveMemoryScope({
          operation,
          context,
          objectId,
          id: input.id,
        })
      : operation !== 'clear' && objectId === context.session.userId
        ? { objectId }
        : null
    if (!binding?.objectId.trim())
      return forbidden(context)
    return deps.ai.memory
      ? core.ok(deps.ai.memory.scoped(binding))
      : unavailable(context)
  }

  function authorizeMedia(request: AiExtensionOperationRequest) {
    return deps.authorizeMedia?.(request) ?? forbidden(request.context)
  }

  return implement(apiContract.extensions.ai)
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

    .route('memories.add')
    .auth()
    .handle(async ({ input, context }) => {
      const memory = await memoryFor('add', context, input)
      if (!memory.success)
        return memory
      return memory.data.add({ content: input.content, type: input.type, importance: input.importance })
    })

    .route('memories.update')
    .auth()
    .handle(async ({ input, context }) => {
      const memory = await memoryFor('update', context, input)
      if (!memory.success)
        return memory
      const { id, content, type, importance } = input
      return memory.data.update(id, { content, type, importance })
    })

    .route('memories.remove')
    .auth()
    .handle(async ({ input, context }) => {
      const memory = await memoryFor('remove', context, input)
      return memory.success
        ? memory.data.remove(input.id)
        : memory
    })

    .route('memories.clear')
    .auth()
    .handle(async ({ input, context }) => {
      const memory = await memoryFor('clear', context, input)
      return memory.success
        ? memory.data.clear({ types: input.types })
        : memory
    })

    .route('audio.getCapabilities')
    .auth()
    .handle(async ({ input, context }) => {
      markServResponsePrivate(context)
      const grant = await authorizeMedia({
        operation: 'getCapabilities',
        audioOperation: input.operation,
        model: input.model,
        context,
      })
      if (!grant.success)
        return grant
      const audio = deps.ai.audio
      if (!audio)
        return unavailable(context)
      const result = audio.getCapabilities({ operation: input.operation, model: grant.data.model })
      if (!result.success)
        return result
      if (input.operation === 'transcribe' && result.data.transcribe?.supported) {
        const { realtimeAudioInput, streamingTranscriptOutput, speechBoundaryEvents, languageHint, languageDetection } = result.data.transcribe
        return core.ok({
          operation: 'transcribe' as const,
          realtimeAudioInput,
          streamingTranscriptOutput,
          speechBoundaryEvents,
          languageHint,
          languageDetection,
        })
      }
      if (input.operation === 'synthesize' && result.data.synthesize?.supported) {
        const { incrementalTextInput, streamingAudioOutput, presetVoice, supportedLanguages } = result.data.synthesize
        return core.ok({
          operation: 'synthesize' as const,
          incrementalTextInput,
          streamingAudioOutput,
          presetVoice,
          supportedLanguages,
        })
      }
      return unavailable(context)
    })

    .route('audio.issueTicket')
    .auth()
    .handle(async ({ input, context }) => {
      markServResponsePrivate(context)
      const grant = await authorizeMedia({
        operation: 'issueTicket',
        audioOperation: input.operation,
        model: input.model,
        context,
      })
      if (!grant.success)
        return grant
      const audio = deps.ai.audio
      const tickets = deps.audioTickets
      if (!audio || !tickets)
        return unavailable(context)
      const capabilities = audio.getCapabilities({ operation: input.operation, model: grant.data.model })
      if (!capabilities.success)
        return capabilities
      if (!capabilities.data[input.operation]?.supported)
        return unavailable(context)
      return tickets.issue({
        subjectId: context.session.userId,
        purpose: 'ai-audio',
        ttlMs: 30_000,
        grant: { operation: input.operation, model: grant.data.model, scopeId: context.scopeId },
      })
    })

    .route('audio.transcribe')
    .auth()
    .handleTransport(async ({ input, context, signal }) => {
      const grant = await authorizeMedia({ operation: 'transcribe', model: input.model, context })
      if (!grant.success)
        return grant
      const audio = deps.ai.audio
      if (!audio)
        return unavailable(context)
      const data = new Uint8Array(await input.audio.arrayBuffer())
      const format = audioUploadFormat(data, input.audio.type)
      if (!format)
        return invalid(context)
      const result = await audio.transcribe({
        model: grant.data.model,
        audio: { data, format },
        language: input.language,
        signal: requestSignal(context, signal),
      })
      if (!result.success)
        return result
      const { text, language, durationMs } = result.data
      return core.ok({ text, language, durationMs })
    })

    .route('audio.synthesize')
    .auth()
    .handleTransport(async ({ input, context, signal }) => {
      const grant = await authorizeMedia({
        operation: 'synthesize',
        model: input.model,
        voice: input.voice,
        context,
      })
      if (!grant.success)
        return grant
      const audio = deps.ai.audio
      if (!audio)
        return unavailable(context)
      const result = await audio.synthesize({
        text: input.text,
        model: grant.data.model,
        voice: grant.data.voice,
        format: input.format ?? 'wav',
        signal: requestSignal(context, signal),
      })
      if (!result.success)
        return result
      return audioFile(result.data) ?? invalidUpstream(context)
    })

    .route('images.generate')
    .auth()
    .handleTransport(async ({ input, context, signal }) => {
      const grant = await authorizeMedia({ operation: 'generateImage', model: input.model, context })
      if (!grant.success)
        return grant
      const image = deps.ai.image
      if (!image)
        return unavailable(context)
      const references = await Promise.all((input.referenceImages ?? []).map(referenceImage))
      const referenceImages = references.filter(item => item !== undefined)
      if (referenceImages.length !== references.length)
        return invalid(context)
      const result = await image.generate({
        prompt: input.prompt,
        model: grant.data.model,
        size: input.width !== undefined && input.height !== undefined
          ? { width: input.width, height: input.height }
          : undefined,
        referenceImages,
        signal: requestSignal(context, signal),
      })
      if (!result.success)
        return result
      return imageFile(result.data.images[0]) ?? invalidUpstream(context)
    })

    .build()
}

function forbidden(context: ServContext): HaiResult<never> {
  return core.err(HaiCommonError.FORBIDDEN, servM('serv_errorForbidden', { locale: context.locale }))
}

function unavailable(context: ServContext): HaiResult<never> {
  return core.err(HaiCommonError.SERVICE_UNAVAILABLE, servM('serv_errorInternal', { locale: context.locale }))
}

function invalid(context: ServContext): HaiResult<never> {
  return core.err(HaiCommonError.VALIDATION_ERROR, servM('serv_validationInvalid', { locale: context.locale }))
}

function invalidUpstream(context: ServContext): HaiResult<never> {
  return core.err(HaiCommonError.API_ERROR, servM('serv_errorInternal', { locale: context.locale }))
}

function requestSignal(context: ServContext, signal?: AbortSignal): AbortSignal {
  const request = context.request.signal
  return signal && signal !== request
    ? AbortSignal.any([request, signal])
    : request
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
