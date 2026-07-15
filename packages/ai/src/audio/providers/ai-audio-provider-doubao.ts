/**
 * @h-ai/ai — Audio Provider: 豆包 / 火山引擎实现
 *
 * 基于火山引擎二进制 WebSocket 协议实现语音识别与语音合成。协议编解码保留在本 Provider 内部：
 * - ASR（`/api/v3/sauc/bigmodel`）：4 字节头 + payload_size + payload 的序列号协议。
 * - TTS（`/api/v3/tts/bidirection`）：4 字节头 + event + [session_id] + payload_size + payload 的事件协议。
 *
 * 二进制协议整数字段均为大端。公共 API 不暴露协议版本、消息类型、序列号、事件号等细节。
 * @internal
 * @module audio/providers/ai-audio-provider-doubao
 */

import type { HaiResult } from '@h-ai/core'
import type { ResolvedAudioModel } from '../../ai-config.js'

import type { AudioFormat, AudioModelCapabilities, SynthesisResult, TranscriptionEvent, TranscriptionResult } from '../ai-audio-types.js'
import type {
  AudioProvider,
  AudioWsMessage,
  ProviderSynthesisRequest,
  ProviderSynthesisStreamRequest,
  ProviderTranscriptionRequest,
  ProviderTranscriptionStreamRequest,
  SynthesisOutputMeta,
} from './ai-audio-provider.js'

import { Buffer } from 'node:buffer'
import { gunzipSync } from 'node:zlib'
import { core, ok } from '@h-ai/core'
import { aiM } from '../../ai-i18n.js'
import { HaiAIError } from '../../ai-types.js'
import { audioError, concatChunks, errorMessage, openAudioWebSocket, toAudioErrorResult } from './ai-audio-provider.js'

const logger = core.logger.child({ module: 'ai', scope: 'audio-doubao' })

/** 豆包实时平台能力：WebSocket 实时识别（不产出服务端 VAD 起止事件）+ 实时合成（支持增量文本输入） */
const DOUBAO_CAPABILITIES: AudioModelCapabilities = {
  transcribe: { supported: true, realtimeAudioInput: true, speechBoundaryEvents: false, streamingTranscriptOutput: true },
  synthesize: { supported: true, incrementalTextInput: true, streamingAudioOutput: true },
}

// ─── 二进制协议常量 ───

const PROTOCOL_VERSION = 0b0001
const HEADER_SIZE = 0b0001

/** 消息类型 */
const MSG_FULL_CLIENT = 0b0001
const MSG_AUDIO_ONLY_CLIENT = 0b0010
const MSG_FULL_SERVER = 0b1001
const MSG_AUDIO_ONLY_SERVER = 0b1011
const MSG_SERVER_ERROR = 0b1111

/** 消息类型补充标志 */
const FLAG_NO_SEQ = 0b0000
const FLAG_LAST_NO_SEQ = 0b0010
const FLAG_WITH_EVENT = 0b0100

/** 序列化方式 */
const SERIAL_NONE = 0b0000
const SERIAL_JSON = 0b0001

/** 压缩方式 */
const COMPRESS_NONE = 0b0000
const COMPRESS_GZIP = 0b0001

/** TTS 事件号（火山引擎双向流式 TTS v3 协议） */
const EVENT_START_CONNECTION = 1
const EVENT_FINISH_CONNECTION = 2
const EVENT_CONNECTION_STARTED = 50
const EVENT_CONNECTION_FAILED = 51
const EVENT_START_SESSION = 100
const EVENT_FINISH_SESSION = 102
const EVENT_SESSION_FINISHED = 152
const EVENT_SESSION_FAILED = 153
const EVENT_TASK_REQUEST = 200
const EVENT_TTS_RESPONSE = 352

/** 连接级事件（不携带 session_id） */
const CONNECTION_EVENTS = new Set<number>([
  EVENT_START_CONNECTION,
  EVENT_FINISH_CONNECTION,
  EVENT_CONNECTION_STARTED,
  EVENT_CONNECTION_FAILED,
])

/** 我方音频格式 → 火山引擎 ASR / TTS 容器格式 */
const DOUBAO_FORMAT: Record<AudioFormat, string> = {
  pcm16: 'pcm',
  wav: 'wav',
  mp3: 'mp3',
  opus: 'ogg_opus',
}

// ─── 二进制编解码 ───

/** 构造 4 字节协议头 */
function buildHeader(messageType: number, flags: number, serialization: number, compression: number): Buffer {
  return Buffer.from([
    (PROTOCOL_VERSION << 4) | HEADER_SIZE,
    (messageType << 4) | flags,
    (serialization << 4) | compression,
    0x00,
  ])
}

/** 大端 uint32 */
function uint32BE(value: number): Buffer {
  const b = Buffer.alloc(4)
  b.writeUInt32BE(value >>> 0, 0)
  return b
}

/** 大端 int32 */
function int32BE(value: number): Buffer {
  const b = Buffer.alloc(4)
  b.writeInt32BE(value, 0)
  return b
}

/** 编码 ASR full client request（4B 头 + payload_size + JSON payload） */
function encodeAsrConfig(config: object): Uint8Array {
  const payload = Buffer.from(JSON.stringify(config), 'utf8')
  return new Uint8Array(Buffer.concat([
    buildHeader(MSG_FULL_CLIENT, FLAG_NO_SEQ, SERIAL_JSON, COMPRESS_NONE),
    uint32BE(payload.length),
    payload,
  ]))
}

/** 编码 ASR audio only request（4B 头 + payload_size + 原始音频；`last` 标记最后一包） */
function encodeAsrAudio(audio: Uint8Array, last: boolean): Uint8Array {
  return new Uint8Array(Buffer.concat([
    buildHeader(MSG_AUDIO_ONLY_CLIENT, last ? FLAG_LAST_NO_SEQ : FLAG_NO_SEQ, SERIAL_NONE, COMPRESS_NONE),
    uint32BE(audio.length),
    Buffer.from(audio),
  ]))
}

/** 编码 TTS 事件帧（4B 头 + event + [session_id] + payload_size + JSON payload） */
function encodeTtsEvent(event: number, payload: object, sessionId?: string): Uint8Array {
  const parts: Buffer[] = [
    buildHeader(MSG_FULL_CLIENT, FLAG_WITH_EVENT, SERIAL_JSON, COMPRESS_NONE),
    int32BE(event),
  ]
  if (!CONNECTION_EVENTS.has(event) && sessionId !== undefined) {
    const sid = Buffer.from(sessionId, 'utf8')
    parts.push(uint32BE(sid.length), sid)
  }
  const body = Buffer.from(JSON.stringify(payload), 'utf8')
  parts.push(uint32BE(body.length), body)
  return new Uint8Array(Buffer.concat(parts))
}

/** 解析后的服务端帧 */
interface DecodedFrame {
  messageType: number
  /** 事件号（TTS 协议有效） */
  event?: number
  /** 序列号（ASR 协议有效，负值表示最后一包） */
  sequence?: number
  /** JSON 负载（消息为 JSON 序列化时） */
  json?: Record<string, unknown>
  /** 原始二进制负载（音频帧） */
  audio?: Uint8Array
  /** 错误码（错误帧有效） */
  errorCode?: number
  /** 错误消息（错误帧有效） */
  errorMessage?: string
}

/** 解压 payload（依据 compression 位） */
function maybeGunzip(payload: Buffer, compression: number): Buffer {
  return compression === COMPRESS_GZIP ? gunzipSync(payload) : payload
}

/** 解析服务端二进制帧 */
function decodeFrame(data: Uint8Array): DecodedFrame {
  const buf = Buffer.from(data)
  const messageType = (buf[1] >> 4) & 0x0F
  const flags = buf[1] & 0x0F
  const serialization = (buf[2] >> 4) & 0x0F
  const compression = buf[2] & 0x0F
  let offset = 4

  if (messageType === MSG_SERVER_ERROR) {
    const errorCode = buf.readUInt32BE(offset)
    offset += 4
    const size = buf.readUInt32BE(offset)
    offset += 4
    const msg = maybeGunzip(buf.subarray(offset, offset + size), compression).toString('utf8')
    return { messageType, errorCode, errorMessage: msg }
  }

  let event: number | undefined
  if (flags & FLAG_WITH_EVENT) {
    event = buf.readInt32BE(offset)
    offset += 4
    // 会话级事件携带 session_id
    if (event !== undefined && !CONNECTION_EVENTS.has(event)) {
      const sidSize = buf.readUInt32BE(offset)
      offset += 4 + sidSize
    }
  }

  let sequence: number | undefined
  if (!(flags & FLAG_WITH_EVENT) && messageType === MSG_FULL_SERVER) {
    // ASR 服务端响应携带 sequence（4B 有符号，负值表示最后一包）
    sequence = buf.readInt32BE(offset)
    offset += 4
  }

  const size = buf.readUInt32BE(offset)
  offset += 4
  const payload = buf.subarray(offset, offset + size)

  if (messageType === MSG_AUDIO_ONLY_SERVER)
    return { messageType, event, audio: new Uint8Array(payload) }

  const decompressed = maybeGunzip(payload, compression)
  if (serialization === SERIAL_JSON) {
    try {
      return { messageType, event, sequence, json: JSON.parse(decompressed.toString('utf8')) as Record<string, unknown> }
    }
    catch {
      return { messageType, event, sequence }
    }
  }
  return { messageType, event, sequence, audio: new Uint8Array(decompressed) }
}

// ─── Provider 实现 ───

/**
 * 创建豆包 / 火山引擎 Audio Provider
 *
 * @internal
 */
export function createDoubaoAudioProvider(): AudioProvider {
  function buildAuthHeaders(model: ResolvedAudioModel, isTts: boolean): Record<string, string> {
    const headers: Record<string, string> = {
      'X-Api-Resource-Id': model.resourceId,
      'X-Api-Connect-Id': globalThis.crypto.randomUUID(),
    }
    if (model.apiKey)
      headers['X-Api-Key'] = model.apiKey
    // 旧版控制台 ASR 使用 App-Key + Access-Key
    if (!isTts && model.appKey && model.accessKey) {
      headers['X-Api-App-Key'] = model.appKey
      headers['X-Api-Access-Key'] = model.accessKey
    }
    headers['X-Api-Request-Id'] = globalThis.crypto.randomUUID()
    return headers
  }

  // ─── ASR ───

  async function transcribe(request: ProviderTranscriptionRequest): Promise<HaiResult<TranscriptionResult>> {
    try {
      let finalText = ''
      for await (const event of transcribeStream({ model: request.model, audio: request.audio, language: request.language, contextHints: request.contextHints, signal: request.signal })) {
        if (event.type === 'transcript' && event.final)
          finalText = event.text
      }
      return ok({ text: finalText })
    }
    catch (error) {
      logger.debug('Doubao transcribe failed', { error: errorMessage(error) })
      return toAudioErrorResult(error)
    }
  }

  async function* transcribeStream(request: ProviderTranscriptionStreamRequest): AsyncIterable<TranscriptionEvent> {
    const { model, audio, language, contextHints, signal } = request
    const url = `${model.baseUrl}/api/v3/sauc/bigmodel`
    const conn = await openAudioWebSocket(url, buildAuthHeaders(model, false), { signal, timeout: model.timeout })
    try {
      const sampleRate = audio.sampleRate ?? 16000
      const channels = audio.channels ?? 1
      conn.send(encodeAsrConfig({
        user: { uid: 'hai' },
        audio: {
          format: DOUBAO_FORMAT[audio.format],
          rate: sampleRate,
          bits: 16,
          channel: channels,
          ...(language ? { language } : {}),
        },
        request: {
          model_name: 'bigmodel',
          enable_itn: true,
          enable_punc: true,
          result_type: 'full',
          // 领域提示词 → 热词（直传 context）
          ...(contextHints?.length ? { context: JSON.stringify({ hotwords: contextHints.map(word => ({ word })) }) } : {}),
        },
      }))

      const sendAudio = (async () => {
        if ('chunks' in audio) {
          // 持续输入：一包前瞻，末包打 last 标记
          let prev: Uint8Array | undefined
          for await (const part of audio.chunks) {
            if (prev !== undefined)
              conn.send(encodeAsrAudio(prev, false))
            prev = part
          }
          conn.send(encodeAsrAudio(prev ?? new Uint8Array(0), true))
        }
        else {
          conn.send(encodeAsrAudio(audio.data, true))
        }
      })()
      let sendError: unknown
      sendAudio.catch((e: unknown) => {
        sendError = e
      })

      for await (const message of conn.messages()) {
        if (!message.isBinary || !message.binary)
          continue
        const frame = decodeFrame(message.binary)
        if (frame.messageType === MSG_SERVER_ERROR)
          throw audioError(HaiAIError.AUDIO_PROTOCOL_ERROR, aiM('ai_audioProtocolError', { params: { error: `${frame.errorCode} ${frame.errorMessage ?? ''}`.trim() } }))

        const text = extractAsrText(frame.json)
        const isLast = frame.sequence !== undefined && frame.sequence < 0
        if (text !== undefined)
          yield { type: 'transcript', text, final: isLast }
        if (isLast) {
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

  // ─── TTS ───

  async function synthesize(request: ProviderSynthesisRequest): Promise<HaiResult<SynthesisResult>> {
    const out = resolveSynthesisOutput({ format: request.format, sampleRate: request.sampleRate })
    try {
      const chunks: Uint8Array[] = []
      for await (const audio of synthesizeStream({ model: request.model, text: request.text, voice: request.voice, format: out.format, sampleRate: request.sampleRate, signal: request.signal }))
        chunks.push(audio)
      return ok({ data: concatChunks(chunks), format: out.format, sampleRate: out.sampleRate, channels: out.channels })
    }
    catch (error) {
      logger.debug('Doubao synthesize failed', { error: errorMessage(error) })
      return toAudioErrorResult(error)
    }
  }

  async function* synthesizeStream(request: ProviderSynthesisStreamRequest): AsyncIterable<Uint8Array> {
    const { model, text, voice, format, sampleRate, signal } = request
    const outFormat = resolveSynthesisOutput({ format }).format
    const url = `${model.baseUrl}/api/v3/tts/bidirection`
    const conn = await openAudioWebSocket(url, buildAuthHeaders(model, true), { signal, timeout: model.timeout })
    const sessionId = globalThis.crypto.randomUUID()

    const reqParams = {
      speaker: voice ?? '',
      audio_params: { format: DOUBAO_FORMAT[outFormat], sample_rate: sampleRate ?? 24000 },
    }

    try {
      conn.send(encodeTtsEvent(EVENT_START_CONNECTION, {}))
      conn.send(encodeTtsEvent(EVENT_START_SESSION, { event: EVENT_START_SESSION, req_params: reqParams }, sessionId))

      const sendText = (async () => {
        if (typeof text === 'string') {
          conn.send(encodeTtsEvent(EVENT_TASK_REQUEST, { event: EVENT_TASK_REQUEST, req_params: { ...reqParams, text } }, sessionId))
        }
        else {
          for await (const part of text)
            conn.send(encodeTtsEvent(EVENT_TASK_REQUEST, { event: EVENT_TASK_REQUEST, req_params: { ...reqParams, text: part } }, sessionId))
        }
        conn.send(encodeTtsEvent(EVENT_FINISH_SESSION, { event: EVENT_FINISH_SESSION }, sessionId))
        conn.send(encodeTtsEvent(EVENT_FINISH_CONNECTION, { event: EVENT_FINISH_CONNECTION }))
      })()
      let sendError: unknown
      sendText.catch((e: unknown) => {
        sendError = e
      })

      for await (const message of conn.messages()) {
        const frame = decodeBinaryMessage(message)
        if (!frame)
          continue
        if (frame.messageType === MSG_SERVER_ERROR || frame.event === EVENT_SESSION_FAILED || frame.event === EVENT_CONNECTION_FAILED)
          throw audioError(HaiAIError.AUDIO_PROTOCOL_ERROR, aiM('ai_audioProtocolError', { params: { error: `${frame.errorCode ?? frame.event} ${frame.errorMessage ?? ''}`.trim() } }))

        if (frame.event === EVENT_TTS_RESPONSE && frame.audio) {
          yield frame.audio
        }
        else if (frame.event === EVENT_SESSION_FINISHED) {
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

  return { transcribe, transcribeStream, synthesize, synthesizeStream, resolveSynthesisOutput, capabilities: DOUBAO_CAPABILITIES }
}

/** 豆包未指定格式时默认 pcm16；pcm16 时补默认采样率 24000。 */
function resolveSynthesisOutput(request: { format?: AudioFormat, sampleRate?: number }): SynthesisOutputMeta {
  const format: AudioFormat = request.format ?? 'pcm16'
  return { format, sampleRate: format === 'pcm16' ? (request.sampleRate ?? 24000) : undefined, channels: 1 }
}

// ─── 内部辅助 ───

/** 从 ASR 响应 JSON 提取识别文本（`result.text`） */
function extractAsrText(json: Record<string, unknown> | undefined): string | undefined {
  if (!json)
    return undefined
  const result = json.result as { text?: string } | undefined
  return result?.text
}

/** 将 WebSocket 消息解析为二进制帧（非二进制返回 undefined） */
function decodeBinaryMessage(message: AudioWsMessage): DecodedFrame | undefined {
  if (!message.isBinary || !message.binary)
    return undefined
  return decodeFrame(message.binary)
}
