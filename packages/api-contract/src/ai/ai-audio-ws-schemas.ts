/**
 * Audio WebSocket 传输协议的运行时 Schema。
 *
 * 该协议同时被 AI 客户端与 Serv 服务端消费，因此由 api-contract 维护单一事实源，
 * 避免 Serv 根入口为了校验可选 Audio 消息而静态加载整个 `@h-ai/ai` 包。
 */
import { z } from 'zod'

/** 统一语音入口的默认路径（相对 API 前缀）。 */
export const AUDIO_WS_PATH = '/ai/audio'

/** 合法音频格式。 */
export const AudioFormatSchema = z.enum(['pcm16', 'wav', 'mp3', 'opus'])

const MAX_CONTROL_FIELD_LEN = 512
const MAX_HINT_LEN = 256
const MAX_HINTS = 64
const MAX_SEGMENT_ID_LEN = 128
const MIN_SAMPLE_RATE = 8000
const MAX_SAMPLE_RATE = 192000

/** 会话起始帧 Schema。 */
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

/** 文本输入帧 Schema。 */
export const AudioWsTextMessageSchema = z.object({
  type: z.literal('text'),
  segmentId: z.string().min(1).max(MAX_SEGMENT_ID_LEN),
  text: z.string(),
})

/** 输入结束帧 Schema。 */
export const AudioWsDoneMessageSchema = z.object({
  type: z.literal('done'),
})

/** 客户端 JSON 控制消息 Schema。 */
export const AudioWsClientMessageSchema = z.discriminatedUnion('type', [
  AudioWsStartMessageSchema,
  AudioWsTextMessageSchema,
  AudioWsDoneMessageSchema,
])
