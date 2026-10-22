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

/**
 * 消息角色 Schema。
 * @example
 * ```ts
 * import { AiMessageRoleSchema } from '@h-ai/api-contract'
 *
 * const value = AiMessageRoleSchema.parse('system')
 * void value
 * ```
 */
export const AiMessageRoleSchema = z.enum(['system', 'user', 'assistant', 'tool'])

/**
 * 文本内容 Schema。
 * @example
 * ```ts
 * import { AiTextContentSchema } from '@h-ai/api-contract'
 *
 * const value = AiTextContentSchema.parse({
 *   type: 'text',
 *   text: 'Hello'
 * })
 * void value
 * ```
 */
export const AiTextContentSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
}).strict()

/**
 * 图片内容 Schema。
 * @example
 * ```ts
 * import { AiImageContentSchema } from '@h-ai/api-contract'
 *
 * const value = AiImageContentSchema.parse({
 *   type: 'image_url',
 *   image_url: {
 *     url: 'https://example.com/resource'
 *   }
 * })
 * void value
 * ```
 */
export const AiImageContentSchema = z.object({
  type: z.literal('image_url'),
  image_url: z.object({
    url: z.string(),
    detail: z.enum(['auto', 'low', 'high']).optional(),
  }).strict(),
}).strict()

/**
 * 消息内容 Schema。
 * @example
 * ```ts
 * import { AiMessageContentSchema } from '@h-ai/api-contract'
 *
 * const value = AiMessageContentSchema.parse('example')
 * void value
 * ```
 */
export const AiMessageContentSchema = z.union([
  z.string(),
  z.array(z.union([AiTextContentSchema, AiImageContentSchema])),
])

/**
 * 工具调用 Schema。
 * @example
 * ```ts
 * import { AiToolCallSchema } from '@h-ai/api-contract'
 *
 * const value = AiToolCallSchema.parse({
 *   id: 'call_1',
 *   type: 'function',
 *   function: {
 *     name: 'lookupOrder',
 *     arguments: '{\'id\':\'order_1\'}'
 *   }
 * })
 * void value
 * ```
 */
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
 * @example
 * ```ts
 * import { AiChatMessageSchema } from '@h-ai/api-contract'
 *
 * const value = AiChatMessageSchema.parse({
 *   role: 'system',
 *   content: 'Hello'
 * })
 * void value
 * ```
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
 * @example
 * ```ts
 * import { AiToolDefinitionSchema } from '@h-ai/api-contract'
 *
 * const value = AiToolDefinitionSchema.parse({
 *   type: 'function',
 *   function: {
 *     name: 'lookupOrder',
 *     description: 'Look up an order',
 *     parameters: {
 *       type: 'object',
 *       properties: {
 *         id: {
 *           type: 'string'
 *         }
 *       },
 *       required: [
 *         'id'
 *       ]
 *     }
 *   }
 * })
 * void value
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
 * @example
 * ```ts
 * import { AiChatCompletionInputSchema } from '@h-ai/api-contract'
 *
 * const value = AiChatCompletionInputSchema.parse({
 *   messages: [
 *     {
 *       role: 'user',
 *       content: 'Say hello'
 *     }
 *   ]
 * })
 * void value
 * ```
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

/**
 * Token 使用统计 Schema。
 * @example
 * ```ts
 * import { AiTokenUsageSchema } from '@h-ai/api-contract'
 *
 * const value = AiTokenUsageSchema.parse({
 *   prompt_tokens: 0,
 *   completion_tokens: 0,
 *   total_tokens: 0
 * })
 * void value
 * ```
 */
export const AiTokenUsageSchema = z.object({
  prompt_tokens: z.number(),
  completion_tokens: z.number(),
  total_tokens: z.number(),
})

/**
 * 助手消息 Schema。
 * @example
 * ```ts
 * import { AiAssistantMessageSchema } from '@h-ai/api-contract'
 *
 * const value = AiAssistantMessageSchema.parse({
 *   role: 'assistant',
 *   content: 'Hello'
 * })
 * void value
 * ```
 */
export const AiAssistantMessageSchema = z.object({
  role: z.literal('assistant'),
  content: z.string().nullable().optional(),
  tool_calls: z.array(AiToolCallSchema).optional(),
})

/**
 * 聊天完成选择 Schema。
 * @example
 * ```ts
 * import { AiChatCompletionChoiceSchema } from '@h-ai/api-contract'
 *
 * const value = AiChatCompletionChoiceSchema.parse({
 *   index: 0,
 *   message: {
 *     role: 'assistant',
 *     content: 'Hello'
 *   },
 *   finish_reason: 'stop'
 * })
 * void value
 * ```
 */
export const AiChatCompletionChoiceSchema = z.object({
  index: z.number(),
  message: AiAssistantMessageSchema,
  finish_reason: z.enum(['stop', 'length', 'tool_calls', 'content_filter']),
})

/**
 * 聊天完成业务数据 Schema。
 * @example
 * ```ts
 * import { AiChatCompletionDataSchema } from '@h-ai/api-contract'
 *
 * const value = AiChatCompletionDataSchema.parse({
 *   id: 'example-1',
 *   object: 'chat.completion',
 *   created: 0,
 *   model: 'example',
 *   choices: [
 *     {
 *       index: 0,
 *       message: {
 *         role: 'assistant',
 *         content: 'Hello'
 *       },
 *       finish_reason: 'stop'
 *     }
 *   ],
 *   usage: {
 *     prompt_tokens: 0,
 *     completion_tokens: 0,
 *     total_tokens: 0
 *   }
 * })
 * void value
 * ```
 */
export const AiChatCompletionDataSchema = z.object({
  id: z.string(),
  object: z.literal('chat.completion'),
  created: z.number(),
  model: z.string(),
  choices: z.array(AiChatCompletionChoiceSchema),
  usage: AiTokenUsageSchema,
})

/**
 * 简单消息入参 Schema。
 * @example
 * ```ts
 * import { AiSendMessageInputSchema } from '@h-ai/api-contract'
 *
 * const value = AiSendMessageInputSchema.parse({
 *   message: 'example'
 * })
 * void value
 * ```
 */
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

/**
 * 简单消息业务数据 Schema。
 * @example
 * ```ts
 * import { AiSendMessageDataSchema } from '@h-ai/api-contract'
 *
 * const value = AiSendMessageDataSchema.parse({
 *   content: 'Hello',
 *   model: 'example'
 * })
 * void value
 * ```
 */
export const AiSendMessageDataSchema = z.object({
  content: z.string(),
  model: z.string(),
  usage: AiTokenUsageSchema.optional(),
})

/**
 * 记忆类型 Schema。
 * @example
 * ```ts
 * import { AiMemoryTypeSchema } from '@h-ai/api-contract'
 *
 * const value = AiMemoryTypeSchema.parse('fact')
 * void value
 * ```
 */
export const AiMemoryTypeSchema = z.enum(['fact', 'preference', 'event', 'entity', 'instruction'])

/**
 * 记忆条目 Schema。
 * @example
 * ```ts
 * import { AiMemoryEntrySchema } from '@h-ai/api-contract'
 *
 * const value = AiMemoryEntrySchema.parse({
 *   id: 'example-1',
 *   content: 'Hello',
 *   type: 'fact',
 *   importance: 0,
 *   createdAt: 0,
 *   lastAccessedAt: 0,
 *   accessCount: 0
 * })
 * void value
 * ```
 */
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

/**
 * 记忆检索入参 Schema。
 * @example
 * ```ts
 * import { AiMemoryRecallInputSchema } from '@h-ai/api-contract'
 *
 * const value = AiMemoryRecallInputSchema.parse({
 *   query: 'example'
 * })
 * void value
 * ```
 */
export const AiMemoryRecallInputSchema = z.object({
  query: z.string().min(1),
  topK: z.number().int().min(1).optional(),
  types: z.array(AiMemoryTypeSchema).optional(),
  minImportance: z.number().min(0).max(1).optional(),
  objectId: z.string().min(1).optional(),
})

/**
 * 记忆检索业务数据 Schema。
 * @example
 * ```ts
 * import { AiMemoryRecallDataSchema } from '@h-ai/api-contract'
 *
 * const value = AiMemoryRecallDataSchema.parse({
 *   items: [
 *     {
 *       id: 'example-1',
 *       content: 'Hello',
 *       type: 'fact',
 *       importance: 0,
 *       createdAt: 0,
 *       lastAccessedAt: 0,
 *       accessCount: 0
 *     }
 *   ]
 * })
 * void value
 * ```
 */
export const AiMemoryRecallDataSchema = z.object({
  items: z.array(AiMemoryEntrySchema),
})

/**
 * 记忆列表入参 Schema。
 * @example
 * ```ts
 * import { AiMemoryListInputSchema } from '@h-ai/api-contract'
 *
 * const value = AiMemoryListInputSchema.parse({})
 * void value
 * ```
 */
export const AiMemoryListInputSchema = z.object({
  types: z.array(AiMemoryTypeSchema).optional(),
  objectId: z.string().min(1).optional(),
  offset: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).max(100).optional(),
})

/**
 * 记忆列表业务数据 Schema。
 * @example
 * ```ts
 * import { AiMemoryListDataSchema } from '@h-ai/api-contract'
 *
 * const value = AiMemoryListDataSchema.parse({
 *   items: [
 *     {
 *       id: 'example-1',
 *       content: 'Hello',
 *       type: 'fact',
 *       importance: 0,
 *       createdAt: 0,
 *       lastAccessedAt: 0,
 *       accessCount: 0
 *     }
 *   ],
 *   total: 0
 * })
 * void value
 * ```
 */
export const AiMemoryListDataSchema = z.object({
  items: z.array(AiMemoryEntrySchema),
  total: z.number(),
})

/**
 * 会话信息 Schema。
 * @example
 * ```ts
 * import { AiSessionInfoSchema } from '@h-ai/api-contract'
 *
 * const value = AiSessionInfoSchema.parse({
 *   objectId: 'example',
 *   sessionId: 'example',
 *   createdAt: 0,
 *   updatedAt: 0
 * })
 * void value
 * ```
 */
export const AiSessionInfoSchema = z.object({
  objectId: z.string(),
  sessionId: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

/**
 * 会话列表入参 Schema。
 * @example
 * ```ts
 * import { AiSessionListInputSchema } from '@h-ai/api-contract'
 *
 * const value = AiSessionListInputSchema.parse({})
 * void value
 * ```
 */
export const AiSessionListInputSchema = z.object({
  /** 省略时由服务端绑定认证用户，不能据客户端参数推断身份。 */
  objectId: z.string().min(1).optional(),
})

/**
 * 会话列表业务数据 Schema。
 * @example
 * ```ts
 * import { AiSessionListDataSchema } from '@h-ai/api-contract'
 *
 * const value = AiSessionListDataSchema.parse({
 *   items: [
 *     {
 *       objectId: 'example',
 *       sessionId: 'example',
 *       createdAt: 0,
 *       updatedAt: 0
 *     }
 *   ]
 * })
 * void value
 * ```
 */
export const AiSessionListDataSchema = z.object({
  items: z.array(AiSessionInfoSchema),
})

/**
 * 对话记录 Schema。
 * @example
 * ```ts
 * import { AiChatRecordSchema } from '@h-ai/api-contract'
 *
 * const value = AiChatRecordSchema.parse({
 *   id: 'example-1',
 *   objectId: 'example',
 *   sessionId: 'example',
 *   request: {
 *     model: 'example',
 *     messages: [
 *       {
 *         role: 'system',
 *         content: 'Hello'
 *       }
 *     ]
 *   },
 *   response: {
 *     content: 'Hello',
 *     finishReason: 'example',
 *     usage: {
 *       prompt_tokens: 0,
 *       completion_tokens: 0,
 *       total_tokens: 0
 *     }
 *   },
 *   createdAt: 0,
 *   duration: 0
 * })
 * void value
 * ```
 */
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

/**
 * 对话历史入参 Schema。
 * @example
 * ```ts
 * import { AiChatHistoryInputSchema } from '@h-ai/api-contract'
 *
 * const value = AiChatHistoryInputSchema.parse({
 *   sessionId: 'example'
 * })
 * void value
 * ```
 */
export const AiChatHistoryInputSchema = z.object({
  /** 省略时由服务端绑定认证用户，跨主体访问需显式授权。 */
  objectId: z.string().min(1).optional(),
  sessionId: z.string().min(1),
  limit: z.number().int().min(1).max(200).optional(),
  order: z.enum(['asc', 'desc']).optional(),
})

/**
 * 对话历史业务数据 Schema。
 * @example
 * ```ts
 * import { AiChatHistoryDataSchema } from '@h-ai/api-contract'
 *
 * const value = AiChatHistoryDataSchema.parse({
 *   items: [
 *     {
 *       id: 'example-1',
 *       objectId: 'example',
 *       sessionId: 'example',
 *       request: {
 *         model: 'example',
 *         messages: [
 *           {
 *             role: 'system',
 *             content: 'Hello'
 *           }
 *         ]
 *       },
 *       response: {
 *         content: 'Hello',
 *         finishReason: 'example',
 *         usage: {
 *           prompt_tokens: 0,
 *           completion_tokens: 0,
 *           total_tokens: 0
 *         }
 *       },
 *       createdAt: 0,
 *       duration: 0
 *     }
 *   ]
 * })
 * void value
 * ```
 */
export const AiChatHistoryDataSchema = z.object({
  items: z.array(AiChatRecordSchema),
})

/**
 * 聊天补全请求，含消息、模型和生成参数。
 * @example
 * ```ts
 * import type { AiChatCompletionInput } from '@h-ai/api-contract'
 * import { AiChatCompletionInputSchema } from '@h-ai/api-contract'
 *
 * const value: AiChatCompletionInput = AiChatCompletionInputSchema.parse({
 *   messages: [
 *     {
 *       role: 'user',
 *       content: 'Say hello'
 *     }
 *   ]
 * })
 * void value
 * ```
 */
export type AiChatCompletionInput = z.infer<typeof AiChatCompletionInputSchema>
/**
 * 聊天补全业务数据，含候选消息与用量。
 * @example
 * ```ts
 * import type { AiChatCompletionData } from '@h-ai/api-contract'
 * import { AiChatCompletionDataSchema } from '@h-ai/api-contract'
 *
 * const value: AiChatCompletionData = AiChatCompletionDataSchema.parse({
 *   id: 'example-1',
 *   object: 'chat.completion',
 *   created: 0,
 *   model: 'example',
 *   choices: [
 *     {
 *       index: 0,
 *       message: {
 *         role: 'assistant',
 *         content: 'Hello'
 *       },
 *       finish_reason: 'stop'
 *     }
 *   ],
 *   usage: {
 *     prompt_tokens: 0,
 *     completion_tokens: 0,
 *     total_tokens: 0
 *   }
 * })
 * void value
 * ```
 */
export type AiChatCompletionData = z.infer<typeof AiChatCompletionDataSchema>
/**
 * 以 HaiResult 区分成功业务数据和公共错误的 AiChatCompletionOutput 响应。
 * @example
 * ```ts
 * import type { AiChatCompletionOutput } from '@h-ai/api-contract'
 * import { AiChatCompletionDataSchema } from '@h-ai/api-contract'
 * import { ok } from '@h-ai/core'
 *
 * const response: AiChatCompletionOutput = ok(AiChatCompletionDataSchema.parse({
 *   id: 'example-1',
 *   object: 'chat.completion',
 *   created: 0,
 *   model: 'example',
 *   choices: [
 *     {
 *       index: 0,
 *       message: {
 *         role: 'assistant',
 *         content: 'Hello'
 *       },
 *       finish_reason: 'stop'
 *     }
 *   ],
 *   usage: {
 *     prompt_tokens: 0,
 *     completion_tokens: 0,
 *     total_tokens: 0
 *   }
 * }))
 * if (response.success) void response.data
 * ```
 */
export type AiChatCompletionOutput = HaiResult<AiChatCompletionData>
/**
 * 会话消息发送请求。
 * @example
 * ```ts
 * import type { AiSendMessageInput } from '@h-ai/api-contract'
 * import { AiSendMessageInputSchema } from '@h-ai/api-contract'
 *
 * const value: AiSendMessageInput = AiSendMessageInputSchema.parse({
 *   message: 'example'
 * })
 * void value
 * ```
 */
export type AiSendMessageInput = z.infer<typeof AiSendMessageInputSchema>
/**
 * 会话消息写入后的业务数据。
 * @example
 * ```ts
 * import type { AiSendMessageData } from '@h-ai/api-contract'
 * import { AiSendMessageDataSchema } from '@h-ai/api-contract'
 *
 * const value: AiSendMessageData = AiSendMessageDataSchema.parse({
 *   content: 'Hello',
 *   model: 'example'
 * })
 * void value
 * ```
 */
export type AiSendMessageData = z.infer<typeof AiSendMessageDataSchema>
/**
 * 以 HaiResult 区分成功业务数据和公共错误的 AiSendMessageOutput 响应。
 * @example
 * ```ts
 * import type { AiSendMessageOutput } from '@h-ai/api-contract'
 * import { AiSendMessageDataSchema } from '@h-ai/api-contract'
 * import { ok } from '@h-ai/core'
 *
 * const response: AiSendMessageOutput = ok(AiSendMessageDataSchema.parse({
 *   content: 'Hello',
 *   model: 'example'
 * }))
 * if (response.success) void response.data
 * ```
 */
export type AiSendMessageOutput = HaiResult<AiSendMessageData>
/**
 * 按主体和条件检索记忆的请求。
 * @example
 * ```ts
 * import type { AiMemoryRecallInput } from '@h-ai/api-contract'
 * import { AiMemoryRecallInputSchema } from '@h-ai/api-contract'
 *
 * const value: AiMemoryRecallInput = AiMemoryRecallInputSchema.parse({
 *   query: 'example'
 * })
 * void value
 * ```
 */
export type AiMemoryRecallInput = z.infer<typeof AiMemoryRecallInputSchema>
/**
 * 按主体查询记忆列表的分页请求。
 * @example
 * ```ts
 * import type { AiMemoryListInput } from '@h-ai/api-contract'
 * import { AiMemoryListInputSchema } from '@h-ai/api-contract'
 *
 * const value: AiMemoryListInput = AiMemoryListInputSchema.parse({})
 * void value
 * ```
 */
export type AiMemoryListInput = z.infer<typeof AiMemoryListInputSchema>
/**
 * 按主体列出会话的分页请求。
 * @example
 * ```ts
 * import type { AiSessionListInput } from '@h-ai/api-contract'
 * import { AiSessionListInputSchema } from '@h-ai/api-contract'
 *
 * const value: AiSessionListInput = AiSessionListInputSchema.parse({})
 * void value
 * ```
 */
export type AiSessionListInput = z.infer<typeof AiSessionListInputSchema>
/**
 * 读取指定会话历史的请求。
 * @example
 * ```ts
 * import type { AiChatHistoryInput } from '@h-ai/api-contract'
 * import { AiChatHistoryInputSchema } from '@h-ai/api-contract'
 *
 * const value: AiChatHistoryInput = AiChatHistoryInputSchema.parse({
 *   sessionId: 'example'
 * })
 * void value
 * ```
 */
export type AiChatHistoryInput = z.infer<typeof AiChatHistoryInputSchema>
/**
 * 会话持久化消息记录。
 * @example
 * ```ts
 * import type { AiChatRecord } from '@h-ai/api-contract'
 * import { AiChatRecordSchema } from '@h-ai/api-contract'
 *
 * const value: AiChatRecord = AiChatRecordSchema.parse({
 *   id: 'example-1',
 *   objectId: 'example',
 *   sessionId: 'example',
 *   request: {
 *     model: 'example',
 *     messages: [
 *       {
 *         role: 'system',
 *         content: 'Hello'
 *       }
 *     ]
 *   },
 *   response: {
 *     content: 'Hello',
 *     finishReason: 'example',
 *     usage: {
 *       prompt_tokens: 0,
 *       completion_tokens: 0,
 *       total_tokens: 0
 *     }
 *   },
 *   createdAt: 0,
 *   duration: 0
 * })
 * void value
 * ```
 */
export type AiChatRecord = z.infer<typeof AiChatRecordSchema>
