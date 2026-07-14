/**
 * @h-ai/ai — Audio Provider: Qwen（阿里云百炼）实现
 *
 * 基于 DashScope Realtime WebSocket 协议实现实时语音识别与语音合成。
 * Provider 内部负责 Session、Buffer、Commit 等协议事件，公共 API 不暴露这些概念：
 * - ASR（`qwen3-asr-flash-realtime`）：完整音频用 Manual 模式，持续音频输入用 VAD 模式。
 * - TTS（`qwen3-tts-flash-realtime`）：完整文本用 Commit 模式，持续文本输入用 ServerCommit 模式。
 * @internal
 * @module audio/providers/ai-audio-provider-qwen
 */

import type { HaiResult } from '@h-ai/core'
import type { ResolvedAudioModel } from '../../ai-config.js'

import type { AudioFormat, SynthesisResult, TranscriptionChunk, TranscriptionResult } from '../ai-audio-types.js'
import type {
  AudioProvider,
  AudioWsConnection,
  ProviderSynthesisRequest,
  ProviderSynthesisStreamRequest,
  ProviderTranscriptionRequest,
  ProviderTranscriptionStreamRequest,
} from './ai-audio-provider.js'

import { core, err, ok } from '@h-ai/core'
import { nanoid } from 'nanoid'
import { aiM } from '../../ai-i18n.js'
import { HaiAIError } from '../../ai-types.js'
import { concatChunks, errorMessage, fromBase64, openAudioWebSocket, toBase64 } from './ai-audio-provider.js'

const logger = core.logger.child({ module: 'ai', scope: 'audio-qwen' })

/** 我方音频格式 → Qwen input_audio_format / response_format */
const QWEN_FORMAT: Record<AudioFormat, string> = {
  pcm16: 'pcm',
  wav: 'wav',
  mp3: 'mp3',
  opus: 'opus',
}

/** Qwen 服务端事件（仅取本模块关心的字段，字段名做防御性兼容） */
interface QwenServerEvent {
  type?: string
  text?: string
  transcript?: string
  delta?: string
  audio?: string
  transcription?: { text?: string, transcript?: string }
}

/**
 * 创建 Qwen Audio Provider
 *
 * @internal
 */
export function createQwenAudioProvider(): AudioProvider {
  function connect(model: ResolvedAudioModel, signal?: AbortSignal): Promise<AudioWsConnection> {
    const url = `${model.baseUrl}?model=${encodeURIComponent(model.model)}`
    const headers: Record<string, string> = {}
    if (model.apiKey)
      headers.Authorization = `Bearer ${model.apiKey}`
    if (model.workspaceId)
      headers['X-DashScope-WorkSpace'] = model.workspaceId
    return openAudioWebSocket(url, headers, { signal, timeout: model.timeout })
  }

  function newEventId(): string {
    return `event_${nanoid()}`
  }

  async function transcribe(request: ProviderTranscriptionRequest): Promise<HaiResult<TranscriptionResult>> {
    try {
      let finalText = ''
      for await (const chunk of transcribeStream({ model: request.model, audio: request.audio, language: request.language, signal: request.signal })) {
        if (chunk.final)
          finalText = finalText ? `${finalText}${chunk.text}` : chunk.text
      }
      return ok({ text: finalText })
    }
    catch (error) {
      logger.debug('Qwen transcribe failed', { error: errorMessage(error) })
      return err(HaiAIError.AUDIO_UPSTREAM_ERROR, aiM('ai_audioUpstreamError', { params: { error: errorMessage(error) } }), error)
    }
  }

  async function* transcribeStream(request: ProviderTranscriptionStreamRequest): AsyncIterable<TranscriptionChunk> {
    const { model, audio, language, signal } = request
    const isStreamInput = 'chunks' in audio
    const format = audio.format
    const sampleRate = audio.sampleRate

    const conn = await connect(model, signal)
    try {
      // 会话配置：持续音频输入用服务端 VAD 断句；完整音频用 Manual 模式（手动 commit）
      conn.send(JSON.stringify({
        event_id: newEventId(),
        type: 'session.update',
        session: {
          input_audio_format: QWEN_FORMAT[format],
          sample_rate: sampleRate ?? 16000,
          input_audio_transcription: language ? { language } : {},
          turn_detection: isStreamInput ? { type: 'server_vad' } : null,
        },
      }))

      // 音频发送：持续输入边到边送，完整音频一次送出后手动 commit
      const sendAudio = (async () => {
        if ('chunks' in audio) {
          for await (const part of audio.chunks)
            conn.send(JSON.stringify({ event_id: newEventId(), type: 'input_audio_buffer.append', audio: toBase64(part) }))
        }
        else {
          conn.send(JSON.stringify({ event_id: newEventId(), type: 'input_audio_buffer.append', audio: toBase64(audio.data) }))
          conn.send(JSON.stringify({ event_id: newEventId(), type: 'input_audio_buffer.commit' }))
        }
        conn.send(JSON.stringify({ event_id: newEventId(), type: 'session.finish' }))
      })()
      // 发送失败不阻塞读取循环，读取结束后再统一 surface
      let sendError: unknown
      sendAudio.catch((e: unknown) => {
        sendError = e
      })

      for await (const message of conn.messages()) {
        if (message.isBinary || !message.text)
          continue
        const event = parseEvent(message.text)
        switch (event.type) {
          case 'conversation.item.input_audio_transcription.text': {
            const text = event.text ?? event.transcript ?? event.transcription?.text ?? event.delta
            if (text)
              yield { text, final: false }
            break
          }
          case 'conversation.item.input_audio_transcription.completed': {
            const text = event.transcript ?? event.text ?? event.transcription?.transcript ?? event.transcription?.text
            if (text)
              yield { text, final: true }
            break
          }
          case 'session.finished':
            if (sendError)
              throw sendError
            return
        }
      }
      if (sendError)
        throw sendError
    }
    finally {
      conn.close()
    }
  }

  async function synthesize(request: ProviderSynthesisRequest): Promise<HaiResult<SynthesisResult>> {
    const { format, sampleRate } = request
    const outFormat: AudioFormat = format ?? 'pcm16'
    try {
      const chunks: Uint8Array[] = []
      for await (const audio of synthesizeStream({ model: request.model, text: request.text, voice: request.voice, format: outFormat, sampleRate, signal: request.signal }))
        chunks.push(audio)
      return ok({ data: concatChunks(chunks), format: outFormat, sampleRate: outFormat === 'pcm16' ? (sampleRate ?? 24000) : undefined, channels: 1 })
    }
    catch (error) {
      logger.debug('Qwen synthesize failed', { error: errorMessage(error) })
      return err(HaiAIError.AUDIO_UPSTREAM_ERROR, aiM('ai_audioUpstreamError', { params: { error: errorMessage(error) } }), error)
    }
  }

  async function* synthesizeStream(request: ProviderSynthesisStreamRequest): AsyncIterable<Uint8Array> {
    const { model, text, voice, format, sampleRate, signal } = request
    const isStreamInput = typeof text !== 'string'
    const outFormat: AudioFormat = format ?? 'pcm16'

    const conn = await connect(model, signal)
    try {
      conn.send(JSON.stringify({
        event_id: newEventId(),
        type: 'session.update',
        session: {
          voice: voice ?? 'Cherry',
          // 持续文本输入用 ServerCommit（服务端智能分段，低时延）；完整文本用 Commit
          mode: isStreamInput ? 'server_commit' : 'commit',
          response_format: QWEN_FORMAT[outFormat],
          sample_rate: sampleRate ?? 24000,
        },
      }))

      const sendText = (async () => {
        if (typeof text === 'string') {
          conn.send(JSON.stringify({ event_id: newEventId(), type: 'input_text_buffer.append', text }))
          conn.send(JSON.stringify({ event_id: newEventId(), type: 'input_text_buffer.commit' }))
        }
        else {
          for await (const part of text)
            conn.send(JSON.stringify({ event_id: newEventId(), type: 'input_text_buffer.append', text: part }))
        }
        conn.send(JSON.stringify({ event_id: newEventId(), type: 'session.finish' }))
      })()
      let sendError: unknown
      sendText.catch((e: unknown) => {
        sendError = e
      })

      for await (const message of conn.messages()) {
        if (message.isBinary || !message.text)
          continue
        const event = parseEvent(message.text)
        if (event.type === 'response.audio.delta') {
          const base64 = event.audio ?? event.delta
          if (base64)
            yield fromBase64(base64)
        }
        else if (event.type === 'session.finished') {
          if (sendError)
            throw sendError
          return
        }
      }
      if (sendError)
        throw sendError
    }
    finally {
      conn.close()
    }
  }

  return { transcribe, transcribeStream, synthesize, synthesizeStream }
}

/** 解析服务端 JSON 事件（解析失败返回空对象，交由调用方忽略） */
function parseEvent(text: string): QwenServerEvent {
  try {
    return JSON.parse(text) as QwenServerEvent
  }
  catch {
    return {}
  }
}
