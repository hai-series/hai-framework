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
  AudioContent,
  AudioOperations,
  SynthesisRequest,
  SynthesisResult,
  SynthesisStreamRequest,
  TranscriptionChunk,
  TranscriptionRequest,
  TranscriptionResult,
  TranscriptionStreamRequest,
} from './ai-audio-types.js'
import type { AudioProvider } from './providers/ai-audio-provider.js'

import { core, err } from '@h-ai/core'
import { AudioConfigSchema, resolveAudioModel } from '../ai-config.js'
import { aiM } from '../ai-i18n.js'
import { HaiAIError } from '../ai-types.js'
import { createDoubaoAudioProvider } from './providers/ai-audio-provider-doubao.js'
import { createMimoAudioProvider } from './providers/ai-audio-provider-mimo.js'
import { createOpenAIAudioProvider } from './providers/ai-audio-provider-openai.js'
import { createQwenAudioProvider } from './providers/ai-audio-provider-qwen.js'
import { audioError } from './providers/ai-audio-provider.js'

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

  async function transcribe(request: TranscriptionRequest): Promise<HaiResult<TranscriptionResult>> {
    if (!request.audio?.data?.length)
      return err(HaiAIError.AUDIO_INVALID_REQUEST, aiM('ai_audioInvalidRequest', { params: { reason: 'empty audio' } }))
    const sizeErr = guardAudioSize(request.audio)
    if (sizeErr)
      return { success: false, error: sizeErr }

    const resolved = resolveAudioModel(audioConfig, 'transcribe', request.model)
    if (!resolved.success)
      return resolved
    logger.debug('audio transcribe', { provider: resolved.data.provider, model: resolved.data.model })
    return getProvider(resolved.data.provider).transcribe({ model: resolved.data, audio: request.audio, language: request.language, signal: request.signal })
  }

  async function* transcribeStream(request: TranscriptionStreamRequest): AsyncIterable<TranscriptionChunk> {
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
    logger.debug('audio transcribeStream', { provider: resolved.data.provider, model: resolved.data.model })
    yield* getProvider(resolved.data.provider).transcribeStream({ model: resolved.data, audio: request.audio, language: request.language, signal: request.signal })
  }

  async function synthesize(request: SynthesisRequest): Promise<HaiResult<SynthesisResult>> {
    if (!request.text)
      return err(HaiAIError.AUDIO_INVALID_REQUEST, aiM('ai_audioInvalidRequest', { params: { reason: 'empty text' } }))

    const resolved = resolveAudioModel(audioConfig, 'synthesize', request.model)
    if (!resolved.success)
      return resolved
    logger.debug('audio synthesize', { provider: resolved.data.provider, model: resolved.data.model })
    return getProvider(resolved.data.provider).synthesize({ model: resolved.data, text: request.text, voice: request.voice, format: request.format, sampleRate: request.sampleRate, signal: request.signal })
  }

  async function* synthesizeStream(request: SynthesisStreamRequest): AsyncIterable<Uint8Array> {
    if (typeof request.text === 'string' && !request.text)
      throw audioError(HaiAIError.AUDIO_INVALID_REQUEST, aiM('ai_audioInvalidRequest', { params: { reason: 'empty text' } }))

    const resolved = resolveAudioModel(audioConfig, 'synthesize', request.model)
    if (!resolved.success)
      throw resolved.error
    logger.debug('audio synthesizeStream', { provider: resolved.data.provider, model: resolved.data.model })
    yield* getProvider(resolved.data.provider).synthesizeStream({ model: resolved.data, text: request.text, voice: request.voice, format: request.format, sampleRate: request.sampleRate, signal: request.signal })
  }

  return { transcribe, transcribeStream, synthesize, synthesizeStream }
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
