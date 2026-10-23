/**
 * @h-ai/ai — 统一语音 WebSocket 协议
 *
 * 定义浏览器 / 远程客户端与 `@h-ai/serv` 语音入口之间的统一 WebSocket 消息协议。
 * 客户端与服务端共享此协议，客户端不接收任何厂商原生事件；音频以二进制帧传输，
 * 控制与文本以 JSON 帧传输。
 * @module audio/ai-audio-ws-protocol
 */

import type { AudioFormat } from './ai-audio-types.js'

import {
  AUDIO_WS_PATH as CONTRACT_AUDIO_WS_PATH,
  AudioFormatSchema as ContractAudioFormatSchema,
  AudioWsClientMessageSchema as ContractAudioWsClientMessageSchema,
  AudioWsDoneMessageSchema as ContractAudioWsDoneMessageSchema,
  AudioWsStartMessageSchema as ContractAudioWsStartMessageSchema,
  AudioWsTextMessageSchema as ContractAudioWsTextMessageSchema,
} from '@h-ai/api-contract'

/**
 * 统一语音入口的默认路径（相对 API 前缀）
 *
 * @example
 * ```ts
 * import { AUDIO_WS_PATH } from '@h-ai/ai'
 * const url = new URL('/api/v1' + AUDIO_WS_PATH, 'https://example.com')
 * url.protocol = 'wss:'
 * ```
 */
export const AUDIO_WS_PATH = CONTRACT_AUDIO_WS_PATH

// ─── 客户端 → 服务端 ───

/**
 * 会话起始消息（客户端首个 JSON 帧）
 *
 * 表达本次语音操作：识别或合成，及可选的模型 / 语言 / 音色 / 格式等参数。
 *
 * @example
 * ```ts
 * import type { AudioWsStartMessage } from '@h-ai/ai'
 * const start: AudioWsStartMessage = { type: 'start', operation: 'transcribe', stream: true, format: 'pcm16', sampleRate: 16000 }
 * const frame = JSON.stringify(start)
 * ```
 */
export interface AudioWsStartMessage {
  type: 'start'
  /** 操作类型 */
  operation: 'transcribe' | 'synthesize'
  /**
   * 是否流式返回增量结果
   *
   * 识别操作：`true` 时服务端桥接为持续音频输入并流式返回临时结果；
   * `false`（默认）时服务端缓冲完整音频后返回单条最终结果。
   */
  stream?: boolean
  /** 模型 ID（不传时使用服务端默认模型） */
  model?: string
  /** 识别语言提示 */
  language?: string
  /** 领域提示词 / 热词（识别） */
  contextHints?: string[]
  /** 合成音色 */
  voice?: string
  /** 合成自然语言风格指令 */
  instruction?: string
  /** 音频格式（识别时为输入格式，合成时为输出格式） */
  format?: AudioFormat
  /** 采样率 */
  sampleRate?: number
  /** 声道数 */
  channels?: 1 | 2
}

/**
 * 文本输入帧（合成操作时携带待合成文本）
 *
 * @example
 * ```ts
 * import type { AudioWsTextMessage } from '@h-ai/ai'
 * const input: AudioWsTextMessage = { type: 'text', segmentId: 'segment-1', text: '你好' }
 * const frame = JSON.stringify(input)
 * ```
 */
export interface AudioWsTextMessage {
  type: 'text'
  /** 调用方分配的稳定文本段 ID */
  segmentId: string
  /** 待合成文本片段 */
  text: string
}

/**
 * 输入结束帧（音频 / 文本输入全部发送完毕）
 *
 * @example
 * ```ts
 * import type { AudioWsDoneMessage } from '@h-ai/ai'
 * const done: AudioWsDoneMessage = { type: 'done' }
 * const frame = JSON.stringify(done) // 所有输入发送完毕后发送一次。
 * ```
 */
export interface AudioWsDoneMessage {
  type: 'done'
}

/**
 * 客户端 JSON 控制消息（音频输入以二进制帧发送，不走 JSON）
 *
 * @example
 * ```ts
 * import { AudioWsClientMessageSchema } from '@h-ai/ai'
 * import type { AudioWsClientMessage } from '@h-ai/ai'
 * function validate(input: unknown): AudioWsClientMessage | undefined {
 *   const result = AudioWsClientMessageSchema.safeParse(input)
 *   return result.success ? result.data : undefined
 * }
 * ```
 */
export type AudioWsClientMessage = AudioWsStartMessage | AudioWsTextMessage | AudioWsDoneMessage

// ─── 运行时校验 Schema（客户端与服务端共享） ───
//
// TypeScript 类型在网络运行时不生效：不可信客户端可发送任意 JSON。以下 Zod schema
// 在协议边界对每一帧做运行时结构校验，非法帧在进入业务逻辑前即被拒绝。

/**
 * 合法音频格式
 *
 * @example
 * ```ts
 * import { AudioFormatSchema } from '@h-ai/ai'
 * const result = AudioFormatSchema.safeParse('pcm16')
 * if (result.success) {
 *   const message = result.data
 * }
 * ```
 */
export const AudioFormatSchema = ContractAudioFormatSchema

/**
 * 会话起始帧 Schema
 *
 * @example
 * ```ts
 * import { AudioWsStartMessageSchema } from '@h-ai/ai'
 * const result = AudioWsStartMessageSchema.safeParse({ type: 'start', operation: 'synthesize', format: 'mp3' })
 * if (result.success) {
 *   const message = result.data
 * }
 * ```
 */
export const AudioWsStartMessageSchema = ContractAudioWsStartMessageSchema

/**
 * 文本输入帧 Schema（segmentId 非空且长度受限）
 *
 * @example
 * ```ts
 * import { AudioWsTextMessageSchema } from '@h-ai/ai'
 * const result = AudioWsTextMessageSchema.safeParse({ type: 'text', segmentId: 'segment-1', text: '你好' })
 * if (result.success) {
 *   const message = result.data
 * }
 * ```
 */
export const AudioWsTextMessageSchema = ContractAudioWsTextMessageSchema

/**
 * 输入结束帧 Schema
 *
 * @example
 * ```ts
 * import { AudioWsDoneMessageSchema } from '@h-ai/ai'
 * const result = AudioWsDoneMessageSchema.safeParse({ type: 'done' })
 * if (result.success) {
 *   const message = result.data
 * }
 * ```
 */
export const AudioWsDoneMessageSchema = ContractAudioWsDoneMessageSchema

/**
 * 客户端 JSON 控制消息 Schema（按 type 判别）
 *
 * @example
 * ```ts
 * import { AudioWsClientMessageSchema } from '@h-ai/ai'
 * const result = AudioWsClientMessageSchema.safeParse({ type: 'start', operation: 'transcribe', format: 'pcm16', sampleRate: 16000 })
 * if (result.success) {
 *   const message = result.data
 * }
 * ```
 */
export const AudioWsClientMessageSchema = ContractAudioWsClientMessageSchema

// ─── 服务端 → 客户端 ───

/**
 * 语音起止事件（识别操作时服务端 VAD 检测到语音开始 / 结束）
 *
 * @example
 * ```ts
 * import type { AudioWsSpeechMessage } from '@h-ai/ai'
 * function isSpeaking(event: AudioWsSpeechMessage) {
 *   return event.type === 'speech_started'
 * }
 * ```
 */
export interface AudioWsSpeechMessage {
  type: 'speech_started' | 'speech_stopped'
}

/**
 * 识别结果帧（识别操作时返回当前语句的完整文本）
 *
 * @example
 * ```ts
 * import type { AudioWsTranscriptMessage } from '@h-ai/ai'
 * function transcript(event: AudioWsTranscriptMessage) {
 *   return { text: event.text, complete: event.final } // text 替换上一条临时识别文本。
 * }
 * ```
 */
export interface AudioWsTranscriptMessage {
  type: 'transcript'
  /** 当前语句的完整识别文本 */
  text: string
  /** 是否为该语句的最终结果 */
  final: boolean
}

/**
 * 合成文本段开始；后续二进制帧均属于该段，直到收到对应的 `segment_done`。
 *
 * 携带服务端解析 Provider 后的真实输出音频参数，供浏览器正确标注音频格式。
 *
 * @example
 * ```ts
 * import type { AudioWsSegmentStartedMessage } from '@h-ai/ai'
 * function decoderOptions(event: AudioWsSegmentStartedMessage) {
 *   return { format: event.format, sampleRate: event.sampleRate, channels: event.channels ?? 1 }
 * }
 * ```
 */
export interface AudioWsSegmentStartedMessage {
  type: 'segment_started'
  segmentId: string
  text: string
  /** 真实输出音频格式（来自服务端解析后的 Provider 输出，非客户端请求参数） */
  format: AudioFormat
  /** 采样率（Hz）；pcm16 等裸音频必填 */
  sampleRate?: number
  /** 声道数（默认单声道） */
  channels?: 1 | 2
}

/**
 * 合成文本段的音频已全部发送。
 *
 * @example
 * ```ts
 * import type { AudioWsSegmentDoneMessage } from '@h-ai/ai'
 * function generated(event: AudioWsSegmentDoneMessage) {
 *   return event.segmentId // 仅标记生成完成；播放完成由终端另行确认。
 * }
 * ```
 */
export interface AudioWsSegmentDoneMessage {
  type: 'segment_done'
  segmentId: string
}

/**
 * 错误帧（领域语义错误码，不暴露厂商协议细节）
 *
 * @example
 * ```ts
 * import type { AudioWsErrorMessage } from '@h-ai/ai'
 * function failure(event: AudioWsErrorMessage) {
 *   return { code: event.code, message: event.message }
 * }
 * ```
 */
export interface AudioWsErrorMessage {
  type: 'error'
  /** 领域错误码（如 `hai:ai:054`） */
  code: string
  /** 错误消息 */
  message: string
}

/**
 * 结束帧（服务端已发送全部结果，随后关闭连接）
 *
 * @example
 * ```ts
 * import type { AudioWsEndMessage } from '@h-ai/ai'
 * const end: AudioWsEndMessage = { type: 'end' }
 * const frame = JSON.stringify(end) // 服务端结果发送结束，随后关闭连接。
 * ```
 */
export interface AudioWsEndMessage {
  type: 'end'
}

/**
 * 服务端 JSON 消息（合成音频以二进制帧返回，不走 JSON）
 *
 * @example
 * ```ts
 * import type { AudioWsServerMessage } from '@h-ai/ai'
 * function result(event: AudioWsServerMessage) {
 *   if (event.type === 'error') throw new Error(event.message)
 *   if (event.type === 'transcript') return event.text
 *   return undefined
 * }
 * ```
 */
export type AudioWsServerMessage
  = | AudioWsSpeechMessage
    | AudioWsTranscriptMessage
    | AudioWsSegmentStartedMessage
    | AudioWsSegmentDoneMessage
    | AudioWsErrorMessage
    | AudioWsEndMessage
