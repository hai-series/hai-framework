/**
 * AI 实验台共享类型与输入校验 Schema
 *
 * 定义前后端共用的请求/响应类型，以及 API 边界的 Zod 校验规则（防止非法输入进入业务层）。
 * @module ai-lab-types
 */

import type { MemoryEntry, MemoryType } from '@h-ai/ai'
import { z } from 'zod'

/** 单次对话请求携带的最大历史消息条数 */
export const CHAT_HISTORY_LIMIT = 20
/** 语音识别上传音频的最大字节数（10 MiB） */
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024
/** 单张参考图的最大字节数（10 MiB） */
export const MAX_REFERENCE_IMAGE_BYTES = 10 * 1024 * 1024

/** 文生图请求：提示词与输出像素尺寸 */
export const ImageRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(4000),
  width: z.number().int().min(512).max(4096).default(1024),
  height: z.number().int().min(512).max(4096).default(1024),
})

/** 对话消息（仅 user / assistant，system 由服务端注入） */
export const LabMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(4000),
})

/** 对话请求：主体 ID、会话 ID、历史消息与是否启用记忆 */
export const ChatRequestSchema = z.object({
  profileId: z.string().trim().min(1).max(64),
  sessionId: z.string().trim().min(1).max(64),
  messages: z.array(LabMessageSchema).min(1).max(CHAT_HISTORY_LIMIT),
  useMemory: z.boolean().default(true),
})

/** 记忆提取请求：从一轮 user + assistant 消息中提取长期记忆（与对话解耦，避免阻塞回复） */
export const RememberRequestSchema = z.object({
  profileId: z.string().trim().min(1).max(64),
  userMessage: z.string().trim().min(1).max(4000),
  assistantMessage: z.string().trim().min(1).max(4000),
})

/** 语音合成请求：文本、可选音色与风格指令 */
export const TtsRequestSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  voice: z.string().trim().min(1).max(64).optional(),
  instruction: z.string().trim().max(1000).optional(),
})

/** 记忆类型枚举（事实 / 偏好 / 事件 / 实体 / 指令） */
export const MemoryTypeInputSchema = z.enum(['fact', 'preference', 'event', 'entity', 'instruction'])

/** 手动添加记忆请求 */
export const MemoryAddRequestSchema = z.object({
  profileId: z.string().trim().min(1).max(64),
  content: z.string().trim().min(1).max(2000),
  type: MemoryTypeInputSchema,
  importance: z.number().min(0).max(1).default(0.7),
})

/** 记忆检索请求：留空 query 时列出全部 */
export const MemoryQuerySchema = z.object({
  profileId: z.string().trim().min(1).max(64),
  query: z.string().trim().max(1000).default(''),
})

/** 对话消息 */
export interface LabMessage {
  role: 'user' | 'assistant'
  content: string
}

/** 对话回复（仅回复文本；记忆提取结果由 RememberResult 单独返回） */
export interface ChatReply {
  reply: string
}

/** 记忆提取结果：本轮新增/更新的记忆条数 */
export interface RememberResult {
  remembered: number
}

/** 能力状态：连接、模型、可用音色与记忆模式，用于首页状态卡片 */
export interface LabStatus {
  ready: boolean
  provider: string
  llmModel: string
  ttsModel: string
  asrModel: string
  imageProvider: string
  imageModel: string
  ttsVoices: string[]
  memoryMode: 'ephemeral'
}

/** 记忆视图（暴露给前端的记忆条目子集） */
export interface MemoryView extends Pick<MemoryEntry, 'id' | 'content' | 'importance' | 'createdAt'> {
  type: MemoryType
}
