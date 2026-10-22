/**
 * @h-ai/api-contract — AI 领域 Schema
 *
 * 包含聊天补全、消息占位、记忆召回与历史会话相关的 input/output Zod Schema。
 * 默认聊天补全为非流式 JSON，支持 function tool calling；未声明字段在边界拒绝。
 * 仅保留跨接口、跨层复用的数据结构；一次性输出包装在 contract 中内联。
 * @module ai-schemas
 */

import type { HaiResult } from '@h-ai/core'
import { z } from 'zod'

/** 消息角色 Schema。 */
export const AiMessageRoleSchema = z.enum(['system', 'user', 'assistant', 'tool'])

/** 文本内容 Schema。 */
export const AiTextContentSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
}).strict()

/** 图片内容 Schema。 */
export const AiImageContentSchema = z.object({
  type: z.literal('image_url'),
  image_url: z.object({
    url: z.string(),
    detail: z.enum(['auto', 'low', 'high']).optional(),
  }).strict(),
}).strict()

/** 消息内容 Schema。 */
export const AiMessageContentSchema = z.union([
  z.string(),
  z.array(z.union([AiTextContentSchema, AiImageContentSchema])),
])

/** 工具调用 Schema。 */
export const AiToolCallSchema = z.object({
  id: z.string().min(1),
  type: z.literal('function'),
  function: z.object({
    name: z.string().min(1),
    arguments: z.string(),
  }).strict(),
}).strict()

/** system、assistant 和 tool 只接收文本，不把图片 URL 静默转换为文本。 */
const AiTextMessageContentSchema = z.union([z.string(), z.array(AiTextContentSchema)])

/**
 * 按角色校验聊天消息；工具结果必须携带非空 tool_call_id。
 *
 * @example `AiChatMessageSchema.parse({ role: 'tool', tool_call_id: 'call_1', content: '42' })`
 */
export const AiChatMessageSchema = z.discriminatedUnion('role', [
  z.object({
    role: z.literal('system'),
    content: AiTextMessageContentSchema,
    name: z.string().optional(),
  }).strict(),
  z.object({
    role: z.literal('user'),
    content: AiMessageContentSchema,
    name: z.string().optional(),
  }).strict(),
  z.object({
    role: z.literal('assistant'),
    content: AiTextMessageContentSchema.nullable().optional(),
    name: z.string().optional(),
    tool_calls: z.array(AiToolCallSchema).min(1).optional(),
  }).strict().refine(message => message.content != null || message.tool_calls !== undefined),
  z.object({
    role: z.literal('tool'),
    content: AiTextMessageContentSchema,
    tool_call_id: z.string().min(1),
  }).strict(),
])

/**
 * 完整的 function 工具定义；parameters 保留嵌套 JSON Schema，不裁剪其关键字。
 *
 * @example
 * ```ts
 * AiToolDefinitionSchema.parse({ type: 'function', function: {
 *   name: 'lookup', strict: true,
 *   parameters: { type: 'object', properties: { ids: { type: 'array', items: { type: 'integer' } } }, additionalProperties: false },
 * } })
 * ```
 */
export const AiToolDefinitionSchema = z.object({
  type: z.literal('function'),
  function: z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    parameters: z.record(z.string(), z.json()).optional(),
    strict: z.boolean().nullable().optional(),
  }).strict(),
}).strict()

/**
 * 非流式聊天补全入参；stream 等未声明字段明确拒绝。
 *
 * @example `AiChatCompletionInputSchema.parse({ messages: [{ role: 'user', content: 'Hello' }] })`
 */
export const AiChatCompletionInputSchema = z.object({
  /** 默认绑定认证用户；跨主体访问需服务端显式授权。 */
  objectId: z.string().min(1).optional(),
  /** 用户主体内的会话 ID，省略时为 default。 */
  sessionId: z.string().min(1).optional(),
  model: z.string().optional(),
  messages: z.array(AiChatMessageSchema).min(1),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  max_tokens: z.number().int().min(1).optional(),
  tools: z.array(AiToolDefinitionSchema).min(1).optional(),
  tool_choice: z.union([
    z.literal('auto'),
    z.literal('none'),
    z.literal('required'),
    z.object({ type: z.literal('function'), function: z.object({ name: z.string().min(1) }).strict() }).strict(),
  ]).optional(),
}).strict().superRefine((input, context) => {
  const choice = input.tool_choice
  if (choice === 'required' && !input.tools?.length)
    context.addIssue({ code: 'custom', path: ['tool_choice'] })
  if (typeof choice === 'object' && !input.tools?.some(tool => tool.function.name === choice.function.name))
    context.addIssue({ code: 'custom', path: ['tool_choice'] })
})

/** Token 使用统计 Schema。 */
export const AiTokenUsageSchema = z.object({
  prompt_tokens: z.number(),
  completion_tokens: z.number(),
  total_tokens: z.number(),
})

/** 助手消息 Schema。 */
export const AiAssistantMessageSchema = z.object({
  role: z.literal('assistant'),
  content: z.string().nullable().optional(),
  tool_calls: z.array(AiToolCallSchema).optional(),
})

/** 聊天完成选择 Schema。 */
export const AiChatCompletionChoiceSchema = z.object({
  index: z.number(),
  message: AiAssistantMessageSchema,
  finish_reason: z.enum(['stop', 'length', 'tool_calls', 'content_filter']),
})

/** 聊天完成业务数据 Schema。 */
export const AiChatCompletionDataSchema = z.object({
  id: z.string(),
  object: z.literal('chat.completion'),
  created: z.number(),
  model: z.string(),
  choices: z.array(AiChatCompletionChoiceSchema),
  usage: AiTokenUsageSchema,
})

/** 简单消息入参 Schema。 */
export const AiSendMessageInputSchema = z.object({
  /** 默认绑定认证用户；跨主体访问需服务端显式授权。 */
  objectId: z.string().min(1).optional(),
  /** 用户主体内的会话 ID，省略时为 default。 */
  sessionId: z.string().min(1).optional(),
  message: z.string().min(1),
  systemPrompt: z.string().optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
})

/** 简单消息业务数据 Schema。 */
export const AiSendMessageDataSchema = z.object({
  content: z.string(),
  model: z.string(),
  usage: AiTokenUsageSchema.optional(),
})

/** 记忆类型 Schema。 */
export const AiMemoryTypeSchema = z.enum(['fact', 'preference', 'event', 'entity', 'instruction'])

/** 记忆条目 Schema。 */
export const AiMemoryEntrySchema = z.object({
  id: z.string(),
  content: z.string(),
  type: AiMemoryTypeSchema,
  importance: z.number(),
  objectId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.number(),
  lastAccessedAt: z.number(),
  accessCount: z.number(),
})

/** 记忆检索入参 Schema。 */
export const AiMemoryRecallInputSchema = z.object({
  query: z.string().min(1),
  topK: z.number().int().min(1).optional(),
  types: z.array(AiMemoryTypeSchema).optional(),
  minImportance: z.number().min(0).max(1).optional(),
  objectId: z.string().min(1).optional(),
})

/** 记忆检索业务数据 Schema。 */
export const AiMemoryRecallDataSchema = z.object({
  items: z.array(AiMemoryEntrySchema),
})

/** 记忆列表入参 Schema。 */
export const AiMemoryListInputSchema = z.object({
  types: z.array(AiMemoryTypeSchema).optional(),
  objectId: z.string().min(1).optional(),
  offset: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).max(100).optional(),
})

/** 记忆列表业务数据 Schema。 */
export const AiMemoryListDataSchema = z.object({
  items: z.array(AiMemoryEntrySchema),
  total: z.number(),
})

/** 会话信息 Schema。 */
export const AiSessionInfoSchema = z.object({
  objectId: z.string(),
  sessionId: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

/** 会话列表入参 Schema。 */
export const AiSessionListInputSchema = z.object({
  /** 省略时由服务端绑定认证用户，不能据客户端参数推断身份。 */
  objectId: z.string().min(1).optional(),
})

/** 会话列表业务数据 Schema。 */
export const AiSessionListDataSchema = z.object({
  items: z.array(AiSessionInfoSchema),
})

/** 对话记录 Schema。 */
export const AiChatRecordSchema = z.object({
  id: z.string(),
  objectId: z.string(),
  sessionId: z.string(),
  request: z.object({
    model: z.string(),
    messages: z.array(AiChatMessageSchema),
  }),
  response: z.object({
    content: z.string(),
    toolCalls: z.array(AiToolCallSchema).optional(),
    finishReason: z.string(),
    usage: AiTokenUsageSchema,
  }),
  createdAt: z.number(),
  duration: z.number(),
})

/** 对话历史入参 Schema。 */
export const AiChatHistoryInputSchema = z.object({
  /** 省略时由服务端绑定认证用户，跨主体访问需显式授权。 */
  objectId: z.string().min(1).optional(),
  sessionId: z.string().min(1),
  limit: z.number().int().min(1).max(200).optional(),
  order: z.enum(['asc', 'desc']).optional(),
})

/** 对话历史业务数据 Schema。 */
export const AiChatHistoryDataSchema = z.object({
  items: z.array(AiChatRecordSchema),
})

export type AiChatCompletionInput = z.infer<typeof AiChatCompletionInputSchema>
export type AiChatCompletionData = z.infer<typeof AiChatCompletionDataSchema>
export type AiChatCompletionOutput = HaiResult<AiChatCompletionData>
export type AiSendMessageInput = z.infer<typeof AiSendMessageInputSchema>
export type AiSendMessageData = z.infer<typeof AiSendMessageDataSchema>
export type AiSendMessageOutput = HaiResult<AiSendMessageData>
export type AiMemoryRecallInput = z.infer<typeof AiMemoryRecallInputSchema>
export type AiMemoryListInput = z.infer<typeof AiMemoryListInputSchema>
export type AiSessionListInput = z.infer<typeof AiSessionListInputSchema>
export type AiChatHistoryInput = z.infer<typeof AiChatHistoryInputSchema>
export type AiChatRecord = z.infer<typeof AiChatRecordSchema>
