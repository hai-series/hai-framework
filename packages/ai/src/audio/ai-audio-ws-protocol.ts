/**
 * @h-ai/ai — 统一语音 WebSocket 协议
 *
 * 定义浏览器 / 远程客户端与 `@h-ai/serv` 语音入口之间的统一 WebSocket 消息协议。
 * 客户端与服务端共享此协议，客户端不接收任何厂商原生事件；音频以二进制帧传输，
 * 控制与文本以 JSON 帧传输。
 * @module audio/ai-audio-ws-protocol
 */

import type { AudioFormat } from './ai-audio-types.js'

import { z } from 'zod'

/** 统一语音入口的默认路径（相对 API 前缀） */
export const AUDIO_WS_PATH = '/ai/audio'

// ─── 客户端 → 服务端 ───

/**
 * 会话起始消息（客户端首个 JSON 帧）
 *
 * 表达本次语音操作：识别或合成，及可选的模型 / 语言 / 音色 / 格式等参数。
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

/** 文本输入帧（合成操作时携带待合成文本） */
export interface AudioWsTextMessage {
  type: 'text'
  /** 调用方分配的稳定文本段 ID */
  segmentId: string
  /** 待合成文本片段 */
  text: string
}

/** 输入结束帧（音频 / 文本输入全部发送完毕） */
export interface AudioWsDoneMessage {
  type: 'done'
}

/** 客户端 JSON 控制消息（音频输入以二进制帧发送，不走 JSON） */
export type AudioWsClientMessage = AudioWsStartMessage | AudioWsTextMessage | AudioWsDoneMessage

// ─── 运行时校验 Schema（客户端与服务端共享） ───
//
// TypeScript 类型在网络运行时不生效：不可信客户端可发送任意 JSON。以下 Zod schema
// 在协议边界对每一帧做运行时结构校验，非法帧在进入业务逻辑前即被拒绝。

/** 合法音频格式 */
export const AudioFormatSchema = z.enum(['pcm16', 'wav', 'mp3', 'opus'])

/** 单个字符串控制字段最大长度（model / language / voice / instruction 等） */
const MAX_CONTROL_FIELD_LEN = 512
/** contextHints 单条最大长度与最大条数 */
const MAX_HINT_LEN = 256
const MAX_HINTS = 64
/** segmentId 最大长度 */
const MAX_SEGMENT_ID_LEN = 128
/** 合法采样率范围（Hz） */
const MIN_SAMPLE_RATE = 8000
const MAX_SAMPLE_RATE = 192000

/** 会话起始帧 Schema */
export const AudioWsStartMessageSchema = z.object({
  type: z.literal('start'),
  operation: z.enum(['transcribe', 'synthesize']),
  stream: z.boolean().optional(),
  model: z.string().max(MAX_CONTROL_FIELD_LEN).optional(),
  language: z.string().max(MAX_CONTROL_FIELD_LEN).optional(),
  contextHints: z.array(z.string().max(MAX_HINT_LEN)).max(MAX_HINTS).optional(),
  voice: z.string().max(MAX_CONTROL_FIELD_LEN).optional(),
  instruction: z.string().max(MAX_CONTROL_FIELD_LEN).optional(),
  format: AudioFormatSchema.optional(),
  sampleRate: z.number().int().min(MIN_SAMPLE_RATE).max(MAX_SAMPLE_RATE).optional(),
  channels: z.union([z.literal(1), z.literal(2)]).optional(),
})

/** 文本输入帧 Schema（segmentId 非空且长度受限） */
export const AudioWsTextMessageSchema = z.object({
  type: z.literal('text'),
  segmentId: z.string().min(1).max(MAX_SEGMENT_ID_LEN),
  text: z.string(),
})

/** 输入结束帧 Schema */
export const AudioWsDoneMessageSchema = z.object({
  type: z.literal('done'),
})

/** 客户端 JSON 控制消息 Schema（按 type 判别） */
export const AudioWsClientMessageSchema = z.discriminatedUnion('type', [
  AudioWsStartMessageSchema,
  AudioWsTextMessageSchema,
  AudioWsDoneMessageSchema,
])

// ─── 服务端 → 客户端 ───

/** 语音起止事件（识别操作时服务端 VAD 检测到语音开始 / 结束） */
export interface AudioWsSpeechMessage {
  type: 'speech_started' | 'speech_stopped'
}

/** 识别结果帧（识别操作时返回当前语句的完整文本） */
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

/** 合成文本段的音频已全部发送。 */
export interface AudioWsSegmentDoneMessage {
  type: 'segment_done'
  segmentId: string
}

/** 错误帧（领域语义错误码，不暴露厂商协议细节） */
export interface AudioWsErrorMessage {
  type: 'error'
  /** 领域错误码（如 `hai:ai:054`） */
  code: string
  /** 错误消息 */
  message: string
}

/** 结束帧（服务端已发送全部结果，随后关闭连接） */
export interface AudioWsEndMessage {
  type: 'end'
}

/** 服务端 JSON 消息（合成音频以二进制帧返回，不走 JSON） */
export type AudioWsServerMessage
  = | AudioWsSpeechMessage
    | AudioWsTranscriptMessage
    | AudioWsSegmentStartedMessage
    | AudioWsSegmentDoneMessage
    | AudioWsErrorMessage
    | AudioWsEndMessage
