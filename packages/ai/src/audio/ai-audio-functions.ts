/**
 * @h-ai/ai — Audio 子功能工厂
 *
 * 组装 `AudioOperations`：参数校验、模型解析、Provider 路由与调用。
 * Provider 惰性创建并缓存，未使用的平台不初始化客户端与连接。
 * @module audio/ai-audio-functions
 */

import type { HaiError, HaiResult } from '@h-ai/core'
import type { AIConfig, AudioConfig, AudioProviderName } from '../ai-config.js'

import type {
  AudioCapabilitiesRequest,
  AudioContent,
  AudioModelCapabilities,
  AudioOperations,
  SynthesisEvent,
  SynthesisRequest,
  SynthesisResult,
  SynthesisStreamRequest,
  SynthesisTextSegment,
  TranscriptionEvent,
  TranscriptionRequest,
  TranscriptionResult,
  TranscriptionStreamRequest,
} from './ai-audio-types.js'
import type { AudioProvider } from './providers/ai-audio-provider.js'

import { core, err, ok } from '@h-ai/core'
import { AudioConfigSchema, resolveAudioModel } from '../ai-config.js'
import { aiM } from '../ai-i18n.js'
import { HaiAIError } from '../ai-types.js'
import { createDoubaoAudioProvider } from './providers/ai-audio-provider-doubao.js'
import { createMimoAudioProvider } from './providers/ai-audio-provider-mimo.js'
import { createOpenAIAudioProvider } from './providers/ai-audio-provider-openai.js'
import { createQwenAudioProvider } from './providers/ai-audio-provider-qwen.js'
import { audioError, mapStreamError } from './providers/ai-audio-provider.js'

const logger = core.logger.child({ module: 'ai', scope: 'audio' })

/**
 * 创建 Audio 操作接口
 *
 * @param config - 校验后的 AI 配置
 * @returns Audio 操作接口
 */
export function createAudioOperations(config: AIConfig): AudioOperations {
  const audioConfig: AudioConfig = AudioConfigSchema.parse(config.audio ?? {})
  const providerCache = new Map<AudioProviderName, AudioProvider>()

  /** 惰性创建并缓存 Provider（未使用的平台不初始化） */
  function getProvider(name: AudioProviderName): AudioProvider {
    const cached = providerCache.get(name)
    if (cached)
      return cached
    const provider = createProvider(name)
    providerCache.set(name, provider)
    return provider
  }

  /** 校验完整音频大小，超过上限返回错误 */
  function guardAudioSize(audio: AudioContent): HaiError | null {
    if (audio.data.length > audioConfig.maxAudioBytes)
      return audioError(HaiAIError.AUDIO_INPUT_TOO_LARGE, aiM('ai_audioInputTooLarge', { params: { limit: audioConfig.maxAudioBytes } }))
    return null
  }

  /** 组合请求取消信号与实时连接时长上限（P0-5：maxStreamDurationMs 生效） */
  function withStreamTimeout(signal: AbortSignal | undefined): AbortSignal {
    const timeout = AbortSignal.timeout(audioConfig.maxStreamDurationMs)
    return signal ? AbortSignal.any([signal, timeout]) : timeout
  }

  async function transcribe(request: TranscriptionRequest): Promise<HaiResult<TranscriptionResult>> {
    if (!request.audio?.data?.length)
      return err(HaiAIError.AUDIO_INVALID_REQUEST, aiM('ai_audioInvalidRequest', { params: { reason: 'empty audio' } }))
    const sizeErr = guardAudioSize(request.audio)
    if (sizeErr)
      return { success: false, error: sizeErr }

    const resolved = resolveAudioModel(audioConfig, 'transcribe', request.model)
    if (!resolved.success)
      return resolved
    const startedAt = Date.now()
    const context = { provider: resolved.data.provider, model: resolved.data.model, audioBytes: request.audio.data.length }
    logger.debug('Audio transcription started', context)
    const result = await getProvider(resolved.data.provider).transcribe({ model: resolved.data, audio: request.audio, language: request.language, contextHints: request.contextHints, signal: request.signal })
    if (result.success)
      logger.info('Audio transcription completed', { ...context, durationMs: Date.now() - startedAt, textLength: result.data.text.length })
    else
      logger.warn('Audio transcription failed', { ...context, durationMs: Date.now() - startedAt, code: result.error.code, error: result.error.message })
    return result
  }

  async function* transcribeStream(request: TranscriptionStreamRequest): AsyncIterable<TranscriptionEvent> {
    if (!('chunks' in request.audio) && !request.audio.data?.length)
      throw audioError(HaiAIError.AUDIO_INVALID_REQUEST, aiM('ai_audioInvalidRequest', { params: { reason: 'empty audio' } }))
    if (!('chunks' in request.audio)) {
      const sizeErr = guardAudioSize(request.audio)
      if (sizeErr)
        throw sizeErr
    }

    const resolved = resolveAudioModel(audioConfig, 'transcribe', request.model)
    if (!resolved.success)
      throw resolved.error
    const startedAt = Date.now()
    const context = { provider: resolved.data.provider, model: resolved.data.model }
    logger.debug('Audio transcription stream started', context)
    const signal = withStreamTimeout(request.signal)
    try {
      yield* getProvider(resolved.data.provider).transcribeStream({ model: resolved.data, audio: request.audio, language: request.language, contextHints: request.contextHints, signal })
      logger.info('Audio transcription stream completed', { ...context, durationMs: Date.now() - startedAt })
    }
    catch (error) {
      logger.warn('Audio transcription stream failed', { ...context, durationMs: Date.now() - startedAt, error })
      throw mapStreamError(error, signal)
    }
  }

  async function synthesize(request: SynthesisRequest): Promise<HaiResult<SynthesisResult>> {
    if (!request.text)
      return err(HaiAIError.AUDIO_INVALID_REQUEST, aiM('ai_audioInvalidRequest', { params: { reason: 'empty text' } }))

    const resolved = resolveAudioModel(audioConfig, 'synthesize', request.model)
    if (!resolved.success)
      return resolved
    const startedAt = Date.now()
    const context = { provider: resolved.data.provider, model: resolved.data.model, textLength: request.text.length, voice: request.voice }
    logger.debug('Audio synthesis started', context)
    const result = await getProvider(resolved.data.provider).synthesize({ model: resolved.data, text: request.text, voice: request.voice, instruction: request.instruction, format: request.format, sampleRate: request.sampleRate, signal: request.signal })
    if (result.success)
      logger.info('Audio synthesis completed', { ...context, durationMs: Date.now() - startedAt, audioBytes: result.data.data.length, format: result.data.format })
    else
      logger.warn('Audio synthesis failed', { ...context, durationMs: Date.now() - startedAt, code: result.error.code, error: result.error.message })
    return result
  }

  async function* synthesizeStream(request: SynthesisStreamRequest): AsyncIterable<SynthesisEvent> {
    const resolved = resolveAudioModel(audioConfig, 'synthesize', request.model)
    if (!resolved.success)
      throw resolved.error
    const startedAt = Date.now()
    const context = { provider: resolved.data.provider, model: resolved.data.model, voice: request.voice }
    logger.debug('Audio synthesis stream started', context)
    const signal = withStreamTimeout(request.signal)
    const provider = getProvider(resolved.data.provider)
    // 由 Provider 依据自身默认规则解析真实输出格式，供 segment_started 标注（不由调用方猜测）
    const output = provider.resolveSynthesisOutput({ format: request.format, sampleRate: request.sampleRate })
    try {
      const segments = isSynthesisTextSegment(request.text) ? singleSegment(request.text) : request.text
      for await (const segment of segments) {
        if (!segment.id || !segment.text)
          throw audioError(HaiAIError.AUDIO_INVALID_REQUEST, aiM('ai_audioInvalidRequest', { params: { reason: 'empty segment id or text' } }))
        yield { type: 'segment_started', segmentId: segment.id, text: segment.text, format: output.format, sampleRate: output.sampleRate, channels: output.channels }
        for await (const data of provider.synthesizeStream({ model: resolved.data, text: segment.text, voice: request.voice, instruction: request.instruction, format: request.format, sampleRate: request.sampleRate, signal }))
          yield { type: 'audio', segmentId: segment.id, data }
        yield { type: 'segment_done', segmentId: segment.id }
      }
      logger.info('Audio synthesis stream completed', { ...context, durationMs: Date.now() - startedAt })
    }
    catch (error) {
      logger.warn('Audio synthesis stream failed', { ...context, durationMs: Date.now() - startedAt, error })
      throw mapStreamError(error, signal)
    }
  }

  /**
   * 查询模型所属平台的实时能力声明（不需凭据，仅解析模型→平台）
   */
  function getCapabilities(request: AudioCapabilitiesRequest): HaiResult<AudioModelCapabilities> {
    const targetId = request.model ?? (request.operation === 'transcribe' ? audioConfig.transcribeModel : audioConfig.synthesizeModel)
    if (!targetId)
      return err(HaiAIError.AUDIO_MODEL_NOT_FOUND, aiM('ai_audioModelNotFound', { params: { model: `<${request.operation}>` } }))
    const entry = audioConfig.models?.find(model => model.id === targetId || model.model === targetId)
    if (!entry)
      return err(HaiAIError.AUDIO_MODEL_NOT_FOUND, aiM('ai_audioModelNotFound', { params: { model: targetId } }))
    const operations: readonly string[] = entry.operations
    if (!operations.includes(request.operation)) {
      return err(
        HaiAIError.AUDIO_UNSUPPORTED_INPUT,
        aiM('ai_audioUnsupportedInput', { params: { provider: entry.provider, reason: `model ${entry.id} does not support ${request.operation}` } }),
      )
    }
    const capabilities = getProvider(entry.provider).capabilities
    return ok(request.operation === 'transcribe'
      ? { transcribe: capabilities.transcribe }
      : { synthesize: capabilities.synthesize })
  }

  return { transcribe, transcribeStream, synthesize, synthesizeStream, getCapabilities }
}

function isSynthesisTextSegment(value: SynthesisStreamRequest['text']): value is SynthesisTextSegment {
  return typeof value === 'object' && value !== null && 'id' in value && 'text' in value
}

async function* singleSegment(segment: SynthesisTextSegment): AsyncIterable<SynthesisTextSegment> {
  yield segment
}

/** 按平台创建 Provider */
function createProvider(name: AudioProviderName): AudioProvider {
  switch (name) {
    case 'openai':
      return createOpenAIAudioProvider()
    case 'mimo':
      return createMimoAudioProvider()
    case 'qwen':
      return createQwenAudioProvider()
    case 'doubao':
      return createDoubaoAudioProvider()
  }
}
