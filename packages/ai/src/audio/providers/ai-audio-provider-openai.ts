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

import type { AudioContent, AudioFormat, AudioModelCapabilities, SynthesisResult, TranscriptionEvent, TranscriptionResult } from '../ai-audio-types.js'
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
import { audioError, errorMessage, streamSentences, toAudioErrorResult } from './ai-audio-provider.js'

const logger = core.logger.child({ module: 'ai', scope: 'audio-openai' })

/** OpenAI 平台能力：HTTP 文件识别（非实时）+ HTTP 流式合成（不原生接收增量文本，框架内句子分段） */
const OPENAI_CAPABILITIES: AudioModelCapabilities = {
  realtimeAudioInput: false,
  speechBoundaryEvents: false,
  incrementalTextInput: false,
  streamingTranscriptOutput: false,
  streamingAudioOutput: true,
}

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
    const { model, audio, language, contextHints, signal } = request
    if (!model.apiKey)
      return err(HaiAIError.CONFIGURATION_ERROR, aiM('ai_audioMissingApiKey', { params: { provider: 'openai' } }))

    try {
      const client = createClient(model.apiKey, model.baseUrl, model.timeout)
      const file = await toUploadFile(audio)
      const result = await client.audio.transcriptions.create({
        file,
        model: model.model,
        language,
        ...(contextHints?.length ? { prompt: contextHints.join(', ') } : {}),
      }, { signal })
      return ok({ text: result.text })
    }
    catch (error) {
      logger.debug('OpenAI transcribe failed', { error: errorMessage(error) })
      return toAudioErrorResult(error, signal)
    }
  }

  async function* transcribeStream(request: ProviderTranscriptionStreamRequest): AsyncIterable<TranscriptionEvent> {
    const { model, audio, language, contextHints, signal } = request
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
    const file = await toUploadFile(audio)
    const stream = await client.audio.transcriptions.create({
      file,
      model: model.model,
      language,
      stream: true,
      ...(contextHints?.length ? { prompt: contextHints.join(', ') } : {}),
    }, { signal })

    let text = ''
    for await (const event of stream) {
      if (event.type === 'transcript.text.delta') {
        text += event.delta
        yield { type: 'transcript', text, final: false }
      }
      else if (event.type === 'transcript.text.done') {
        yield { type: 'transcript', text: event.text, final: true }
      }
    }
  }

  async function synthesize(request: ProviderSynthesisRequest): Promise<HaiResult<SynthesisResult>> {
    const { model, text, voice, instruction, format, sampleRate, signal } = request
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
        ...(instruction ? { instructions: instruction } : {}),
      }, { signal })
      const data = new Uint8Array(await response.arrayBuffer())
      return ok({ data, format: outFormat, sampleRate: outFormat === 'pcm16' ? (sampleRate ?? 24000) : undefined, channels: 1 })
    }
    catch (error) {
      logger.debug('OpenAI synthesize failed', { error: errorMessage(error) })
      return toAudioErrorResult(error, signal)
    }
  }

  async function* synthesizeStream(request: ProviderSynthesisStreamRequest): AsyncIterable<Uint8Array> {
    const { model, text, voice, instruction, format, signal } = request
    if (!model.apiKey)
      throw audioError(HaiAIError.CONFIGURATION_ERROR, aiM('ai_audioMissingApiKey', { params: { provider: 'openai' } }))

    const outFormat = format ?? 'mp3'
    const client = createClient(model.apiKey, model.baseUrl, model.timeout)

    // OpenAI TTS 不原生接收增量文本：字符串一次合成；持续文本流按句子分段逐句合成，降低首音延迟
    const segments = typeof text === 'string' ? [text] : streamSentences(text)
    for await (const segment of segments) {
      if (!segment)
        continue
      const response = await client.audio.speech.create({
        model: model.model,
        voice: voice ?? 'alloy',
        input: segment,
        response_format: OPENAI_SPEECH_FORMAT[outFormat],
        ...(instruction ? { instructions: instruction } : {}),
      }, { signal })

      const body = response.body
      if (!body) {
        yield new Uint8Array(await response.arrayBuffer())
        continue
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
  }

  return { transcribe, transcribeStream, synthesize, synthesizeStream, capabilities: OPENAI_CAPABILITIES }
}

/** 构造上传文件：裸 pcm16 先封装为 WAV 容器（OpenAI 文件接口需要容器格式） */
async function toUploadFile(audio: AudioContent): Promise<Awaited<ReturnType<typeof toFile>>> {
  if (audio.format === 'pcm16') {
    const wav = wrapPcmToWav(audio.data, audio.sampleRate ?? 16000, audio.channels ?? 1)
    return toFile(Buffer.from(wav), 'audio.wav')
  }
  return toFile(Buffer.from(audio.data), OPENAI_UPLOAD_FILENAME[audio.format])
}

/** 将 16bit 小端裸 PCM 封装为 WAV 容器（44 字节头 + 数据） */
function wrapPcmToWav(pcm: Uint8Array, sampleRate: number, channels: number): Uint8Array {
  const bitsPerSample = 16
  const byteRate = (sampleRate * channels * bitsPerSample) / 8
  const blockAlign = (channels * bitsPerSample) / 8
  const dataSize = pcm.length
  const buffer = Buffer.alloc(44 + dataSize)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(channels, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(byteRate, 28)
  buffer.writeUInt16LE(blockAlign, 32)
  buffer.writeUInt16LE(bitsPerSample, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)
  Buffer.from(pcm).copy(buffer, 44)
  return new Uint8Array(buffer)
}
