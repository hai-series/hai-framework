/**
 * @h-ai/ai — Audio Provider: MiMo（小米）实现
 *
 * 基于 MiMo 兼容 Chat Completions 的 HTTP 接口实现语音识别与语音合成：
 * - ASR（`mimo-v2.5-asr`）：完整音频以 `input_audio` 传入，`stream` 时增量返回识别文本。
 *   MiMo ASR 不支持持续上传音频，故 `transcribeStream` 传入 `AudioInputStream` 时明确返回不支持。
 * - TTS（`mimo-v2.5-tts`）：合成文本放入 `assistant` 消息，`stream` 时以 Base64 分片返回 PCM 音频。
 * @internal
 * @module audio/providers/ai-audio-provider-mimo
 */

import type { HaiResult } from '@h-ai/core'

import type { AudioContent, AudioFormat, AudioModelCapabilities, SynthesisResult, TranscriptionEvent, TranscriptionResult } from '../ai-audio-types.js'
import type {
  AudioProvider,
  ProviderSynthesisRequest,
  ProviderSynthesisStreamRequest,
  ProviderTranscriptionRequest,
  ProviderTranscriptionStreamRequest,
  SynthesisOutputMeta,
} from './ai-audio-provider.js'

import { core, err, ok } from '@h-ai/core'
import { aiM } from '../../ai-i18n.js'
import { HaiAIError } from '../../ai-types.js'
import { createSSEDecoder } from '../../llm/ai-llm-stream.js'
import { audioError, combineSignal, describeHttpError, errorMessage, fromBase64, streamSentences, toAudioErrorResult, toBase64 } from './ai-audio-provider.js'

const logger = core.logger.child({ module: 'ai', scope: 'audio-mimo' })

/** MiMo 平台能力：HTTP 识别（非持续音频输入，流式返回文本）+ HTTP 流式合成（不接收增量文本，框架内句子分段） */
const MIMO_CAPABILITIES: AudioModelCapabilities = {
  transcribe: { supported: true, realtimeAudioInput: false, speechBoundaryEvents: false, streamingTranscriptOutput: true },
  synthesize: { supported: true, incrementalTextInput: false, streamingAudioOutput: true },
}

/** MiMo ASR 支持的音频容器 → MIME 类型 */
const MIMO_ASR_MIME: Partial<Record<AudioFormat, string>> = {
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
}

/** MiMo 流式响应中的增量结构 */
interface MimoDelta {
  content?: string
  audio?: { data?: string }
}

/** MiMo Chat Completions 响应/流块结构（仅取本模块关心的字段） */
interface MimoChunk {
  choices?: Array<{
    delta?: MimoDelta
    message?: { content?: string, audio?: { data?: string } }
  }>
}

/**
 * 创建 MiMo Audio Provider
 *
 * @internal
 */
export function createMimoAudioProvider(): AudioProvider {
  async function transcribe(request: ProviderTranscriptionRequest): Promise<HaiResult<TranscriptionResult>> {
    const { model, audio, language, signal } = request
    const mime = MIMO_ASR_MIME[audio.format]
    if (!mime)
      return err(HaiAIError.AUDIO_UNSUPPORTED_INPUT, aiM('ai_audioUnsupportedInput', { params: { provider: 'mimo', reason: `format ${audio.format} (only wav/mp3)` } }))

    try {
      const response = await postChat(model.baseUrl, model.apiKey, {
        model: model.model,
        messages: [{ role: 'user', content: [{ type: 'input_audio', input_audio: { data: `data:${mime};base64,${toBase64(audio.data)}` } }] }],
        asr_options: { language: language ?? 'auto' },
      }, model.timeout, signal)
      if (!response.ok)
        return err(HaiAIError.AUDIO_UPSTREAM_ERROR, aiM('ai_audioUpstreamError', { params: { error: await describeHttpError(response) } }))

      const body = await response.json() as MimoChunk
      const text = body.choices?.[0]?.message?.content ?? ''
      return ok({ text })
    }
    catch (error) {
      logger.debug('MiMo transcribe failed', { error: errorMessage(error) })
      return toAudioErrorResult(error, signal)
    }
  }

  async function* transcribeStream(request: ProviderTranscriptionStreamRequest): AsyncIterable<TranscriptionEvent> {
    const { model, audio, language, signal } = request
    if ('chunks' in audio) {
      throw audioError(HaiAIError.AUDIO_UNSUPPORTED_INPUT, aiM('ai_audioUnsupportedInput', { params: { provider: 'mimo', reason: 'streaming audio input' } }))
    }
    const content = audio as AudioContent
    const mime = MIMO_ASR_MIME[content.format]
    if (!mime)
      throw audioError(HaiAIError.AUDIO_UNSUPPORTED_INPUT, aiM('ai_audioUnsupportedInput', { params: { provider: 'mimo', reason: `format ${content.format} (only wav/mp3)` } }))

    const response = await postChat(model.baseUrl, model.apiKey, {
      model: model.model,
      messages: [{ role: 'user', content: [{ type: 'input_audio', input_audio: { data: `data:${mime};base64,${toBase64(content.data)}` } }] }],
      asr_options: { language: language ?? 'auto' },
      stream: true,
    }, model.timeout, signal)
    if (!response.ok)
      throw audioError(HaiAIError.AUDIO_UPSTREAM_ERROR, aiM('ai_audioUpstreamError', { params: { error: await describeHttpError(response) } }))

    let text = ''
    for await (const chunk of readChunks(response)) {
      const delta = chunk.choices?.[0]?.delta?.content
      if (delta) {
        text += delta
        yield { type: 'transcript', text, final: false }
      }
    }
    yield { type: 'transcript', text, final: true }
  }

  async function synthesize(request: ProviderSynthesisRequest): Promise<HaiResult<SynthesisResult>> {
    const { model, text, voice, instruction, format, sampleRate, signal } = request
    // 与 synthesizeStream 共用同一解析函数，确保完整与流式合成对同一 format 得到一致编码
    const out = resolveSynthesisOutput({ format, sampleRate })
    try {
      const response = await postChat(model.baseUrl, model.apiKey, {
        model: model.model,
        messages: buildTtsMessages(text, instruction),
        audio: { format: out.format, ...(voice ? { voice } : {}) },
      }, model.timeout, signal)
      if (!response.ok)
        return err(HaiAIError.AUDIO_UPSTREAM_ERROR, aiM('ai_audioUpstreamError', { params: { error: await describeHttpError(response) } }))

      const body = await response.json() as MimoChunk
      const base64 = body.choices?.[0]?.message?.audio?.data
      if (!base64)
        return err(HaiAIError.AUDIO_UPSTREAM_ERROR, aiM('ai_audioUpstreamError', { params: { error: 'missing audio data' } }))

      return ok({ data: fromBase64(base64), format: out.format, sampleRate: out.sampleRate, channels: out.channels })
    }
    catch (error) {
      logger.debug('MiMo synthesize failed', { error: errorMessage(error) })
      return toAudioErrorResult(error, signal)
    }
  }

  async function* synthesizeStream(request: ProviderSynthesisStreamRequest): AsyncIterable<Uint8Array> {
    const { model, text, voice, instruction, format, signal } = request
    const outFormat = resolveSynthesisOutput({ format }).format

    // MiMo TTS 不原生接收增量文本：字符串一次合成；持续文本流按句子分段逐句合成，降低首音延迟
    const segments = typeof text === 'string' ? [text] : streamSentences(text)
    for await (const segment of segments) {
      if (!segment)
        continue
      const response = await postChat(model.baseUrl, model.apiKey, {
        model: model.model,
        messages: buildTtsMessages(segment, instruction),
        audio: { format: outFormat, ...(voice ? { voice } : {}) },
        stream: true,
      }, model.timeout, signal)
      if (!response.ok)
        throw audioError(HaiAIError.AUDIO_UPSTREAM_ERROR, aiM('ai_audioUpstreamError', { params: { error: await describeHttpError(response) } }))

      for await (const chunk of readChunks(response)) {
        const base64 = chunk.choices?.[0]?.delta?.audio?.data
        if (base64)
          yield fromBase64(base64)
      }
    }
  }

  return {
    transcription: { transcribe, transcribeStream },
    synthesis: { synthesize, synthesizeStream, resolveSynthesisOutput },
    getCapabilities: () => MIMO_CAPABILITIES,
  }
}

/** MiMo 流式合成除 wav 外均输出 pcm16；pcm16 时补默认采样率 24000。 */
function resolveSynthesisOutput(request: { format?: AudioFormat, sampleRate?: number }): SynthesisOutputMeta {
  const format: AudioFormat = request.format === 'wav' ? 'wav' : 'pcm16'
  return { format, sampleRate: format === 'pcm16' ? (request.sampleRate ?? 24000) : undefined, channels: 1 }
}

// ─── 内部辅助 ───

/** 构造 MiMo TTS 消息：风格指令放入 user 消息，待合成文本放入 assistant 消息 */
function buildTtsMessages(text: string, instruction?: string): Array<{ role: string, content: string }> {
  const messages: Array<{ role: string, content: string }> = []
  if (instruction)
    messages.push({ role: 'user', content: instruction })
  messages.push({ role: 'assistant', content: text })
  return messages
}

/** 发送 Chat Completions 请求（Authorization Bearer） */
function postChat(baseUrl: string, apiKey: string | undefined, body: Record<string, unknown>, timeout: number, signal?: AbortSignal): Promise<Response> {
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey)
    headers.Authorization = `Bearer ${apiKey}`
  return fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: combineSignal(signal, timeout),
  })
}

/** 迭代 SSE 响应，逐个产出解析后的 MiMo 数据块（`[DONE]` 结束） */
async function* readChunks(response: Response): AsyncIterable<MimoChunk> {
  const body = response.body
  if (!body)
    return
  const reader = body.getReader()
  const decoder = new TextDecoder()
  const sse = createSSEDecoder()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done)
        break
      const text = decoder.decode(value, { stream: true })
      for (const event of sse.decode(text)) {
        if (!event.data || event.data === '[DONE]')
          continue
        try {
          yield JSON.parse(event.data) as MimoChunk
        }
        catch {
          // 忽略无法解析的心跳/空行
        }
      }
    }
  }
  finally {
    reader.releaseLock()
  }
}
