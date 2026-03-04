/**
 * @h-ai/ai/api — AI API 契约 Schema
 *
 * 入参/出参 Schema，客户端和服务端共享的唯一真相源。
 * @module ai-api-schemas
 */

import { z } from 'zod'

// ─── 消息 Schema ───

/** 消息角色 */
const MessageRoleSchema = z.enum(['system', 'user', 'assistant', 'tool'])

/** 文本消息内容 */
const TextContentSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
})

/** 图片消息内容 */
const ImageContentSchema = z.object({
  type: z.literal('image_url'),
  image_url: z.object({
    url: z.string(),
    detail: z.enum(['auto', 'low', 'high']).optional(),
  }),
})

/** 消息内容（字符串或结构化数组） */
const MessageContentSchema = z.union([
  z.string(),
  z.array(z.union([TextContentSchema, ImageContentSchema])),
])

/** 工具调用 */
const ToolCallSchema = z.object({
  id: z.string(),
  type: z.literal('function'),
  function: z.object({
    name: z.string(),
    arguments: z.string(),
  }),
})

/** 聊天消息 */
export const ChatMessageSchema = z.object({
  role: MessageRoleSchema,
  content: MessageContentSchema.optional(),
  name: z.string().optional(),
  tool_calls: z.array(ToolCallSchema).optional(),
  tool_call_id: z.string().optional(),
})

// ─── 工具定义 ───

/** 工具参数 Schema */
const ToolParameterSchema = z.object({
  type: z.string(),
  description: z.string().optional(),
  enum: z.array(z.string()).optional(),
})

/** 工具定义 */
const ToolDefinitionSchema = z.object({
  type: z.literal('function'),
  function: z.object({
    name: z.string(),
    description: z.string().optional(),
    parameters: z.object({
      type: z.literal('object'),
      properties: z.record(z.string(), ToolParameterSchema).optional(),
      required: z.array(z.string()).optional(),
    }).optional(),
  }),
})

// ─── 请求/响应 Schema ───

/** 聊天完成请求入参 */
export const ChatCompletionInputSchema = z.object({
  model: z.string().optional(),
  messages: z.array(ChatMessageSchema).min(1),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  max_tokens: z.number().int().min(1).optional(),
  stream: z.boolean().optional(),
  tools: z.array(ToolDefinitionSchema).optional(),
  tool_choice: z.union([
    z.literal('auto'),
    z.literal('none'),
    z.object({ type: z.literal('function'), function: z.object({ name: z.string() }) }),
  ]).optional(),
})

/** Token 使用统计 */
const TokenUsageSchema = z.object({
  prompt_tokens: z.number(),
  completion_tokens: z.number(),
  total_tokens: z.number(),
})

/** 助手消息 */
const AssistantMessageSchema = z.object({
  role: z.literal('assistant'),
  content: z.string().nullable().optional(),
  tool_calls: z.array(ToolCallSchema).optional(),
})

/** 聊天完成选择 */
const ChatCompletionChoiceSchema = z.object({
  index: z.number(),
  message: AssistantMessageSchema,
  finish_reason: z.enum(['stop', 'length', 'tool_calls', 'content_filter']),
})

/** 聊天完成响应出参 */
export const ChatCompletionOutputSchema = z.object({
  id: z.string(),
  object: z.literal('chat.completion'),
  created: z.number(),
  model: z.string(),
  choices: z.array(ChatCompletionChoiceSchema),
  usage: TokenUsageSchema,
})

/** 简单消息请求入参（便捷接口） */
export const SendMessageInputSchema = z.object({
  message: z.string().min(1),
  systemPrompt: z.string().optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
})

/** 简单消息响应出参 */
export const SendMessageOutputSchema = z.object({
  content: z.string(),
  model: z.string(),
  usage: TokenUsageSchema.optional(),
})

// ─── 推导类型 ───

export type ChatCompletionInput = z.infer<typeof ChatCompletionInputSchema>
export type ChatCompletionOutput = z.infer<typeof ChatCompletionOutputSchema>
export type SendMessageInput = z.infer<typeof SendMessageInputSchema>
export type SendMessageOutput = z.infer<typeof SendMessageOutputSchema>
