/** @h-ai/serv — 语音及图像 procedures。 */

import type { AIFunctions } from '@h-ai/ai'
import type { HaiResult } from '@h-ai/core'
import type { TicketOperations } from '@h-ai/iam'
import type { ServContext } from '../serv-context.js'
import type { AuthenticatedServContext } from '../serv-router.js'
import { apiContract } from '@h-ai/api-contract'
import { core, HaiCommonError } from '@h-ai/core'
import { servM } from '../serv-i18n.js'
import { markServResponsePrivate } from '../serv-route-transport.js'
import { implement } from '../serv-router.js'
import { forbidden, requestSignal, unavailable } from './serv-feature-ai-helpers.js'
import { audioFile, audioUploadFormat, imageFile, referenceImage } from './serv-feature-ai-media-files.js'

/**
 * 宿主收到的 AI 媒体授权请求。model 和 voice 是调用方提出的值，须由宿主选定实际值。
 * @example
 * ```ts
 * import type { AiMediaOperationRequest } from '@h-ai/serv'
 *
 * function canSynthesize({ context, operation }: AiMediaOperationRequest) {
 *   return operation === 'synthesize' && context.session.permissions.includes('ai.speech.use')
 * }
 * ```
 */
export type AiMediaOperationRequest = {
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
 * 媒体工厂使用的 SDK 能力、宿主授权策略及语音票据签发器。
 * @example
 * ```ts
 * import { ai } from '@h-ai/ai'
 * import { core, HaiCommonError } from '@h-ai/core'
 * import { iam } from '@h-ai/iam'
 * import type { AiMediaProcedureDeps } from '@h-ai/serv'
 *
 * function voiceOverDeps(): AiMediaProcedureDeps {
 *   return {
 *     ai,
 *     audioTickets: iam.ticket,
 *     authorizeMedia: ({ context }) => context.session.permissions.includes('ai.speech.use')
 *       ? core.ok({ model: 'approved-speech' })
 *       : core.err(HaiCommonError.FORBIDDEN),
 *   }
 * }
 * ```
 */
export interface AiMediaProcedureDeps {
  readonly ai: {
    readonly audio?: Pick<AIFunctions['audio'], 'transcribe' | 'synthesize' | 'getCapabilities'>
    readonly image?: Pick<AIFunctions['image'], 'generate'>
  }
  /** 媒体操作均要求宿主授权。宿主可在此执行权限、配额及模型限制。 */
  readonly authorizeMedia?: (request: AiMediaOperationRequest) => HaiResult<AiAuthorizedMediaRequest> | Promise<HaiResult<AiAuthorizedMediaRequest>>
  /** 语音票据签发器，例如 iam.ticket。WebSocket 升级时由 verifyTicket 按用途消费。 */
  readonly audioTickets?: Pick<TicketOperations, 'issue'>
}

/**
 * 为媒体工作台提供语音与图像端点，应用选择要挂载的操作。
 * @param deps - 已初始化的 AI 能力、媒体授权和可选的票据签发器。
 * @returns 包含语音和图像端点的 router。
 * @example
 * ```ts
 * import type { AiMediaProcedureDeps } from '@h-ai/serv'
 * import { apiContract } from '@h-ai/api-contract'
 * import { serv } from '@h-ai/serv'
 *
 * function createImageStudio(deps: AiMediaProcedureDeps) {
 *   const contract = { images: apiContract.extensions.ai.images }
 *   const { images } = serv.createAiMediaProcedures(deps)
 *   return serv.createApp({
 *     contract,
 *     procedures: { images },
 *     transportRoutes: [{ procedure: contract.images.generate, maxRequestBytes: 11 * 1024 * 1024 }],
 *   })
 * }
 * ```
 */
export function createAiMediaProcedures(deps: AiMediaProcedureDeps) {
  function authorizeMedia(request: AiMediaOperationRequest) {
    return deps.authorizeMedia?.(request) ?? forbidden(request.context)
  }

  const { audio, images } = apiContract.extensions.ai
  return implement({ audio, images })
    .context<ServContext>()

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

function invalid(context: ServContext): HaiResult<never> {
  return core.err(HaiCommonError.VALIDATION_ERROR, servM('serv_validationInvalid', { locale: context.locale }))
}

function invalidUpstream(context: ServContext): HaiResult<never> {
  return core.err(HaiCommonError.API_ERROR, servM('serv_errorInternal', { locale: context.locale }))
}
