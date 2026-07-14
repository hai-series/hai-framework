/**
 * @h-ai/ai — Audio Provider: OpenAI 实现
 *
 * 基于 OpenAI Audio API（transcriptions / speech）实现完整与流式的语音识别、语音合成。
 * OpenAI 标准 Audio API 不支持持续音频输入的实时识别，故 `transcribeStream` 传入
 * `AudioInputStream` 时明确返回不支持，不将整段音频缓冲后伪装为实时识别。
 * @internal
 * @module audio/providers/ai-audio-provider-openai
 */

import type { HaiResult } from '@h-ai/core'

import type { AudioFormat, SynthesisResult, TranscriptionChunk, TranscriptionResult } from '../ai-audio-types.js'
import type {
  AudioProvider,
  ProviderSynthesisRequest,
  ProviderSynthesisStreamRequest,
  ProviderTranscriptionRequest,
  ProviderTranscriptionStreamRequest,
} from './ai-audio-provider.js'

import { Buffer } from 'node:buffer'
import { core, err, ok } from '@h-ai/core'
import OpenAI, { toFile } from 'openai'
import { aiM } from '../../ai-i18n.js'
import { HaiAIError } from '../../ai-types.js'
import { audioError, errorMessage } from './ai-audio-provider.js'

const logger = core.logger.child({ module: 'ai', scope: 'audio-openai' })

/** 我方音频格式 → OpenAI speech response_format */
const OPENAI_SPEECH_FORMAT: Record<AudioFormat, 'pcm' | 'wav' | 'mp3' | 'opus'> = {
  pcm16: 'pcm',
  wav: 'wav',
  mp3: 'mp3',
  opus: 'opus',
}

/** 我方音频格式 → 上传文件名（transcriptions 依据扩展名识别容器） */
const OPENAI_UPLOAD_FILENAME: Record<AudioFormat, string> = {
  pcm16: 'audio.wav',
  wav: 'audio.wav',
  mp3: 'audio.mp3',
  opus: 'audio.ogg',
}

/**
 * 创建 OpenAI Audio Provider
 *
 * @internal
 */
export function createOpenAIAudioProvider(): AudioProvider {
  function createClient(apiKey: string, baseUrl: string, timeout: number): OpenAI {
    return new OpenAI({ apiKey, baseURL: baseUrl, timeout })
  }

  async function transcribe(request: ProviderTranscriptionRequest): Promise<HaiResult<TranscriptionResult>> {
    const { model, audio, language, signal } = request
    if (!model.apiKey)
      return err(HaiAIError.CONFIGURATION_ERROR, aiM('ai_audioMissingApiKey', { params: { provider: 'openai' } }))

    try {
      const client = createClient(model.apiKey, model.baseUrl, model.timeout)
      const file = await toFile(Buffer.from(audio.data), OPENAI_UPLOAD_FILENAME[audio.format])
      const result = await client.audio.transcriptions.create({
        file,
        model: model.model,
        language,
      }, { signal })
      return ok({ text: result.text })
    }
    catch (error) {
      logger.debug('OpenAI transcribe failed', { error: errorMessage(error) })
      return err(HaiAIError.AUDIO_UPSTREAM_ERROR, aiM('ai_audioUpstreamError', { params: { error: errorMessage(error) } }), error)
    }
  }

  async function* transcribeStream(request: ProviderTranscriptionStreamRequest): AsyncIterable<TranscriptionChunk> {
    const { model, audio, language, signal } = request
    if (!model.apiKey)
      throw audioError(HaiAIError.CONFIGURATION_ERROR, aiM('ai_audioMissingApiKey', { params: { provider: 'openai' } }))

    // OpenAI 标准 Audio API 仅支持完整音频文件，不支持持续音频输入的实时识别
    if ('chunks' in audio) {
      throw audioError(
        HaiAIError.AUDIO_UNSUPPORTED_INPUT,
        aiM('ai_audioUnsupportedInput', { params: { provider: 'openai', reason: 'streaming audio input' } }),
      )
    }

    const client = createClient(model.apiKey, model.baseUrl, model.timeout)
    const file = await toFile(Buffer.from(audio.data), OPENAI_UPLOAD_FILENAME[audio.format])
    const stream = await client.audio.transcriptions.create({
      file,
      model: model.model,
      language,
      stream: true,
    }, { signal })

    let text = ''
    for await (const event of stream) {
      if (event.type === 'transcript.text.delta') {
        text += event.delta
        yield { text, final: false }
      }
      else if (event.type === 'transcript.text.done') {
        yield { text: event.text, final: true }
      }
    }
  }

  async function synthesize(request: ProviderSynthesisRequest): Promise<HaiResult<SynthesisResult>> {
    const { model, text, voice, format, sampleRate, signal } = request
    if (!model.apiKey)
      return err(HaiAIError.CONFIGURATION_ERROR, aiM('ai_audioMissingApiKey', { params: { provider: 'openai' } }))

    const outFormat = format ?? 'mp3'
    try {
      const client = createClient(model.apiKey, model.baseUrl, model.timeout)
      const response = await client.audio.speech.create({
        model: model.model,
        voice: voice ?? 'alloy',
        input: text,
        response_format: OPENAI_SPEECH_FORMAT[outFormat],
      }, { signal })
      const data = new Uint8Array(await response.arrayBuffer())
      return ok({ data, format: outFormat, sampleRate: outFormat === 'pcm16' ? (sampleRate ?? 24000) : undefined, channels: 1 })
    }
    catch (error) {
      logger.debug('OpenAI synthesize failed', { error: errorMessage(error) })
      return err(HaiAIError.AUDIO_UPSTREAM_ERROR, aiM('ai_audioUpstreamError', { params: { error: errorMessage(error) } }), error)
    }
  }

  async function* synthesizeStream(request: ProviderSynthesisStreamRequest): AsyncIterable<Uint8Array> {
    const { model, text, voice, format, signal } = request
    if (!model.apiKey)
      throw audioError(HaiAIError.CONFIGURATION_ERROR, aiM('ai_audioMissingApiKey', { params: { provider: 'openai' } }))

    // OpenAI TTS 接收完整文本；持续文本流先聚合为完整文本再流式输出音频
    const fullText = typeof text === 'string' ? text : await collectText(text)
    const outFormat = format ?? 'mp3'
    const client = createClient(model.apiKey, model.baseUrl, model.timeout)
    const response = await client.audio.speech.create({
      model: model.model,
      voice: voice ?? 'alloy',
      input: fullText,
      response_format: OPENAI_SPEECH_FORMAT[outFormat],
    }, { signal })

    const body = response.body
    if (!body) {
      yield new Uint8Array(await response.arrayBuffer())
      return
    }
    const reader = body.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done)
          break
        if (value)
          yield value
      }
    }
    finally {
      reader.releaseLock()
    }
  }

  return { transcribe, transcribeStream, synthesize, synthesizeStream }
}

/** 聚合持续文本流为完整文本 */
async function collectText(stream: AsyncIterable<string>): Promise<string> {
  let full = ''
  for await (const part of stream)
    full += part
  return full
}
