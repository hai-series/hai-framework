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
  SynthesisOptions,
  SynthesisRequest,
  SynthesisResult,
  SynthesisStreamRequest,
  SynthesisTextSegment,
  TranscriptionEvent,
  TranscriptionOptions,
  TranscriptionRequest,
  TranscriptionResult,
  TranscriptionStreamRequest,
} from './ai-audio-types.js'
import type { AudioProvider, AudioSynthesisProvider, AudioTranscriptionProvider, ProviderSynthesisStreamRequest, ProviderTranscriptionStreamRequest } from './providers/ai-audio-provider.js'

import { core, err, ok } from '@h-ai/core'
import { AudioConfigSchema, ensureAudioCredential, resolveAudioModel } from '../ai-config.js'
import { aiM } from '../ai-i18n.js'
import { HaiAIError } from '../ai-types.js'
import { createDoubaoAudioProvider } from './providers/ai-audio-provider-doubao.js'
import { createIndexTtsAudioProvider } from './providers/ai-audio-provider-indextts.js'
import { createMimoAudioProvider } from './providers/ai-audio-provider-mimo.js'
import { createOpenAIAudioProvider } from './providers/ai-audio-provider-openai.js'
import { createQwenAudioProvider } from './providers/ai-audio-provider-qwen.js'
import { createWhisperAudioProvider } from './providers/ai-audio-provider-whisper.js'
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

  /** 校验 TTS 参考音频大小（说话人 / 风格参考与主音频同样受 maxAudioBytes 保护） */
  function guardSynthesisReferences(options: SynthesisOptions): HaiError | null {
    if (options.speakerReference) {
      const e = guardAudioSize(options.speakerReference.audio)
      if (e)
        return e
    }
    if (options.styleReference) {
      const e = guardAudioSize(options.styleReference.audio)
      if (e)
        return e
    }
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

    const resolved = resolveAudioModel(audioConfig, 'transcribe', request.model, config.llm.apiKey)
    if (!resolved.success)
      return resolved
    const provider = getProvider(resolved.data.provider)
    const transcription = provider.transcription
    if (!transcription)
      return err(HaiAIError.AUDIO_UNSUPPORTED_INPUT, aiM('ai_audioUnsupportedInput', { params: { provider: resolved.data.provider, reason: 'transcription' } }))
    const credErr = ensureAudioCredential(resolved.data)
    if (credErr)
      return { success: false, error: credErr }
    if (request.strictCapabilities) {
      const capErr = checkTranscribeCapabilities(resolved.data.provider, request, provider.getCapabilities(resolved.data))
      if (capErr)
        return { success: false, error: capErr }
    }

    const startedAt = Date.now()
    const context = { provider: resolved.data.provider, model: resolved.data.model, audioBytes: request.audio.data.length }
    logger.debug('Audio transcription started', context)
    const result = await transcription.transcribe({ model: resolved.data, audio: request.audio, language: request.language, contextHints: request.contextHints, timestampGranularities: request.timestampGranularities, vad: request.vad, signal: request.signal })
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

    const resolved = resolveAudioModel(audioConfig, 'transcribe', request.model, config.llm.apiKey)
    if (!resolved.success)
      throw resolved.error
    const provider = getProvider(resolved.data.provider)
    const transcription = provider.transcription
    if (!transcription)
      throw audioError(HaiAIError.AUDIO_UNSUPPORTED_INPUT, aiM('ai_audioUnsupportedInput', { params: { provider: resolved.data.provider, reason: 'transcription' } }))
    const credErr = ensureAudioCredential(resolved.data)
    if (credErr)
      throw credErr
    if (request.strictCapabilities) {
      const capErr = checkTranscribeCapabilities(resolved.data.provider, request, provider.getCapabilities(resolved.data))
      if (capErr)
        throw capErr
    }

    const startedAt = Date.now()
    const context = { provider: resolved.data.provider, model: resolved.data.model }
    logger.debug('Audio transcription stream started', context)
    const signal = withStreamTimeout(request.signal)
    try {
      yield* transcribeStreamOrFallback(transcription, { model: resolved.data, audio: request.audio, language: request.language, contextHints: request.contextHints, timestampGranularities: request.timestampGranularities, vad: request.vad, signal })
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
    const validErr = validateSynthesisRequest(request)
    if (validErr)
      return { success: false, error: validErr }
    const refErr = guardSynthesisReferences(request)
    if (refErr)
      return { success: false, error: refErr }

    const resolved = resolveAudioModel(audioConfig, 'synthesize', request.model, config.llm.apiKey)
    if (!resolved.success)
      return resolved
    const provider = getProvider(resolved.data.provider)
    const synthesis = provider.synthesis
    if (!synthesis)
      return err(HaiAIError.AUDIO_UNSUPPORTED_INPUT, aiM('ai_audioUnsupportedInput', { params: { provider: resolved.data.provider, reason: 'synthesis' } }))
    const credErr = ensureAudioCredential(resolved.data)
    if (credErr)
      return { success: false, error: credErr }
    if (request.strictCapabilities) {
      const capErr = checkSynthesizeCapabilities(resolved.data.provider, request, provider.getCapabilities(resolved.data))
      if (capErr)
        return { success: false, error: capErr }
    }

    const startedAt = Date.now()
    const context = { provider: resolved.data.provider, model: resolved.data.model, textLength: request.text.length, voice: request.voice }
    logger.debug('Audio synthesis started', context)
    const result = await synthesis.synthesize({ model: resolved.data, text: request.text, language: request.language, voice: request.voice, speakerReference: request.speakerReference, styleReference: request.styleReference, styleStrength: request.styleStrength, instruction: request.instruction, speed: request.speed, targetDurationMs: request.targetDurationMs, durationToleranceMs: request.durationToleranceMs, format: request.format, sampleRate: request.sampleRate, signal: request.signal })
    if (result.success)
      logger.info('Audio synthesis completed', { ...context, durationMs: Date.now() - startedAt, audioBytes: result.data.data.length, format: result.data.format })
    else
      logger.warn('Audio synthesis failed', { ...context, durationMs: Date.now() - startedAt, code: result.error.code, error: result.error.message })
    return result
  }

  async function* synthesizeStream(request: SynthesisStreamRequest): AsyncIterable<SynthesisEvent> {
    const validErr = validateSynthesisRequest(request)
    if (validErr)
      throw validErr
    const refErr = guardSynthesisReferences(request)
    if (refErr)
      throw refErr

    const resolved = resolveAudioModel(audioConfig, 'synthesize', request.model, config.llm.apiKey)
    if (!resolved.success)
      throw resolved.error
    const provider = getProvider(resolved.data.provider)
    const synthesis = provider.synthesis
    if (!synthesis)
      throw audioError(HaiAIError.AUDIO_UNSUPPORTED_INPUT, aiM('ai_audioUnsupportedInput', { params: { provider: resolved.data.provider, reason: 'synthesis' } }))
    const credErr = ensureAudioCredential(resolved.data)
    if (credErr)
      throw credErr
    if (request.strictCapabilities) {
      const capErr = checkSynthesizeCapabilities(resolved.data.provider, request, provider.getCapabilities(resolved.data))
      if (capErr)
        throw capErr
    }

    const startedAt = Date.now()
    const context = { provider: resolved.data.provider, model: resolved.data.model, voice: request.voice }
    logger.debug('Audio synthesis stream started', context)
    const signal = withStreamTimeout(request.signal)
    // 由 Provider 依据自身默认规则解析真实输出格式，供 segment_started 标注（不由调用方猜测）
    const output = synthesis.resolveSynthesisOutput({ format: request.format, sampleRate: request.sampleRate })
    try {
      const segments = isSynthesisTextSegment(request.text) ? singleSegment(request.text) : request.text
      for await (const segment of segments) {
        if (!segment.id || !segment.text)
          throw audioError(HaiAIError.AUDIO_INVALID_REQUEST, aiM('ai_audioInvalidRequest', { params: { reason: 'empty segment id or text' } }))
        yield { type: 'segment_started', segmentId: segment.id, text: segment.text, format: output.format, sampleRate: output.sampleRate, channels: output.channels }
        for await (const data of synthesizeSegmentAudio(synthesis, { model: resolved.data, text: segment.text, language: request.language, voice: request.voice, speakerReference: request.speakerReference, styleReference: request.styleReference, styleStrength: request.styleStrength, instruction: request.instruction, speed: request.speed, format: request.format, sampleRate: request.sampleRate, signal }))
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
   * 查询模型能力声明（复用统一模型解析，不需凭据）
   */
  function getCapabilities(request: AudioCapabilitiesRequest): HaiResult<AudioModelCapabilities> {
    const resolved = resolveAudioModel(audioConfig, request.operation, request.model, config.llm.apiKey)
    if (!resolved.success)
      return resolved
    const capabilities = getProvider(resolved.data.provider).getCapabilities(resolved.data)
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

/** 构造 `AUDIO_INVALID_REQUEST` 错误 */
function invalidRequest(reason: string): HaiError {
  return audioError(HaiAIError.AUDIO_INVALID_REQUEST, aiM('ai_audioInvalidRequest', { params: { reason } }))
}

/** 构造「模型不支持某能力」的 `AUDIO_UNSUPPORTED_INPUT` 错误 */
function unsupportedCapability(provider: AudioProviderName, feature: string): HaiError {
  return audioError(HaiAIError.AUDIO_UNSUPPORTED_INPUT, aiM('ai_audioUnsupportedInput', { params: { provider, reason: `${feature} not supported by this model` } }))
}

/** 校验 TTS 公共选项（风格强度 / 语速）；识别与合成流式均复用 */
function validateSynthesisOptions(options: SynthesisOptions): HaiError | null {
  if (options.styleStrength !== undefined && (options.styleStrength < 0 || options.styleStrength > 1))
    return invalidRequest('styleStrength must be between 0 and 1')
  if (options.styleStrength !== undefined && !options.styleReference)
    return invalidRequest('styleStrength requires styleReference')
  if (options.speed !== undefined && (!Number.isFinite(options.speed) || options.speed <= 0))
    return invalidRequest('speed must be greater than 0')
  return null
}

/** 校验完整 TTS 请求（公共选项 + 目标时长 / 容差 / 与语速冲突） */
function validateSynthesisRequest(request: SynthesisRequest | SynthesisStreamRequest): HaiError | null {
  const base = validateSynthesisOptions(request)
  if (base)
    return base
  // targetDurationMs / durationToleranceMs 仅完整合成支持
  const targetDurationMs = 'targetDurationMs' in request ? request.targetDurationMs : undefined
  const durationToleranceMs = 'durationToleranceMs' in request ? request.durationToleranceMs : undefined
  if (targetDurationMs !== undefined && (!Number.isInteger(targetDurationMs) || targetDurationMs <= 0))
    return invalidRequest('targetDurationMs must be a positive integer')
  if (durationToleranceMs !== undefined && targetDurationMs === undefined)
    return invalidRequest('durationToleranceMs requires targetDurationMs')
  if (durationToleranceMs !== undefined && (!Number.isInteger(durationToleranceMs) || durationToleranceMs < 0))
    return invalidRequest('durationToleranceMs must be a non-negative integer')
  // 语速与固定目标时长是两个互斥的控制量
  if (request.speed !== undefined && targetDurationMs !== undefined)
    return invalidRequest('speed and targetDurationMs cannot be used together')
  return null
}

/** 严格能力校验：请求的高级 ASR 能力必须被模型支持，否则在调用 Provider 前失败 */
function checkTranscribeCapabilities(provider: AudioProviderName, options: TranscriptionOptions, capabilities: AudioModelCapabilities): HaiError | null {
  const caps = capabilities.transcribe
  if (!caps?.supported)
    return unsupportedCapability(provider, 'transcription')
  if (options.timestampGranularities?.includes('word') && !caps.wordTimestamps)
    return unsupportedCapability(provider, 'word timestamps')
  if (options.timestampGranularities?.includes('segment') && !caps.segmentTimestamps)
    return unsupportedCapability(provider, 'segment timestamps')
  if (options.vad && !caps.vad)
    return unsupportedCapability(provider, 'vad')
  if (options.contextHints?.length && !caps.contextHints)
    return unsupportedCapability(provider, 'context hints')
  return null
}

/** 严格能力校验：请求的高级 TTS 能力必须被模型支持，否则在调用 Provider 前失败 */
function checkSynthesizeCapabilities(provider: AudioProviderName, options: SynthesisOptions & { targetDurationMs?: number }, capabilities: AudioModelCapabilities): HaiError | null {
  const caps = capabilities.synthesize
  if (!caps?.supported)
    return unsupportedCapability(provider, 'synthesis')
  if (options.speakerReference && !caps.speakerReference)
    return unsupportedCapability(provider, 'speaker reference')
  if (options.styleReference && !caps.styleReference)
    return unsupportedCapability(provider, 'style reference')
  if (options.instruction && !caps.instruction)
    return unsupportedCapability(provider, 'instruction')
  if (options.speed !== undefined && !caps.speedControl)
    return unsupportedCapability(provider, 'speed control')
  if (options.targetDurationMs !== undefined && !caps.targetDuration)
    return unsupportedCapability(provider, 'target duration')
  return null
}

/**
 * 流式识别：优先原生流式，无则有限降级
 *
 * 完整音频→完整识别后产出最终结果；持续音频输入→拒绝（不伪装实时）。
 */
async function* transcribeStreamOrFallback(transcription: AudioTranscriptionProvider, request: ProviderTranscriptionStreamRequest): AsyncIterable<TranscriptionEvent> {
  if (transcription.transcribeStream) {
    yield* transcription.transcribeStream(request)
    return
  }
  if ('chunks' in request.audio)
    throw audioError(HaiAIError.AUDIO_UNSUPPORTED_INPUT, aiM('ai_audioUnsupportedInput', { params: { provider: request.model.provider, reason: 'streaming audio input' } }))
  const result = await transcription.transcribe({ model: request.model, audio: request.audio, language: request.language, contextHints: request.contextHints, timestampGranularities: request.timestampGranularities, vad: request.vad, signal: request.signal })
  if (!result.success)
    throw result.error
  yield { type: 'transcript', text: result.data.text, final: true }
}

/**
 * 流式合成：优先原生流式，无则完整合成后一次性产出该段音频
 *
 * Capability 仍保持 `streamingAudioOutput=false`（API 可兼容 ≠ 模型具备原生实时能力）。
 */
async function* synthesizeSegmentAudio(synthesis: AudioSynthesisProvider, request: ProviderSynthesisStreamRequest): AsyncIterable<Uint8Array> {
  if (synthesis.synthesizeStream) {
    yield* synthesis.synthesizeStream(request)
    return
  }
  const text = typeof request.text === 'string' ? request.text : await collectText(request.text)
  const result = await synthesis.synthesize({ model: request.model, text, language: request.language, voice: request.voice, speakerReference: request.speakerReference, styleReference: request.styleReference, styleStrength: request.styleStrength, instruction: request.instruction, speed: request.speed, format: request.format, sampleRate: request.sampleRate, signal: request.signal })
  if (!result.success)
    throw result.error
  yield result.data.data
}

/** 收集持续文本流为完整字符串（降级路径使用） */
async function collectText(stream: AsyncIterable<string>): Promise<string> {
  let text = ''
  for await (const part of stream)
    text += part
  return text
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
    case 'whisper':
      return createWhisperAudioProvider()
    case 'indextts':
      return createIndexTtsAudioProvider()
  }
}
