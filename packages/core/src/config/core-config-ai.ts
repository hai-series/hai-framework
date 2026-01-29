/**
 * =============================================================================
 * @hai/core - AI 配置 Schema
 * =============================================================================
 * 定义 AI 相关配置的 Zod schema
 *
 * 对应配置文件: _ai.yml
 * =============================================================================
 */

import { z } from 'zod'

// =============================================================================
// 错误码（AI 4000-4999）
// =============================================================================

/**
 * AI 错误码 (4000-4999)
 */
export const AIErrorCode = {
  API_ERROR: 4000,
  RATE_LIMIT: 4001,
  MODEL_NOT_FOUND: 4002,
  CONTEXT_TOO_LONG: 4003,
  CONTENT_FILTERED: 4004,
  INVALID_RESPONSE: 4005,
  STREAM_ERROR: 4006,
  TOOL_CALL_FAILED: 4007,
  MCP_CONNECTION_FAILED: 4008,
  MCP_PROTOCOL_ERROR: 4009,
  EMBEDDING_FAILED: 4010,
  QUOTA_EXCEEDED: 4011,
} as const
// eslint-disable-next-line ts/no-redeclare -- 同时导出 value/type，提供更直观的公共 API
export type AIErrorCode = typeof AIErrorCode[keyof typeof AIErrorCode]

// =============================================================================
// 配置类型
// =============================================================================

/**
 * LLM 提供商类型
 */
export const LLMProviderSchema = z.enum([
  'openai',
  'azure-openai',
  'anthropic',
  'deepseek',
  'moonshot',
  'qwen',
  'zhipu',
  'ollama',
  'custom',
])
export type LLMProvider = z.infer<typeof LLMProviderSchema>

/**
 * LLM 模型配置
 */
export const LLMModelConfigSchema = z.object({
  /** 模型 ID */
  id: z.string(),
  /** 显示名称 */
  name: z.string(),
  /** 提供商 */
  provider: LLMProviderSchema,
  /** API 端点 */
  endpoint: z.string().url().optional(),
  /** API 密钥（支持环境变量引用） */
  apiKey: z.string().optional(),
  /** 最大上下文长度 */
  maxContextLength: z.number().int().positive().default(4096),
  /** 最大输出长度 */
  maxOutputLength: z.number().int().positive().default(2048),
  /** 是否支持工具调用 */
  supportsTools: z.boolean().default(false),
  /** 是否支持视觉 */
  supportsVision: z.boolean().default(false),
  /** 是否支持流式输出 */
  supportsStreaming: z.boolean().default(true),
  /** 每 1K token 输入价格（美元） */
  inputPricePerK: z.number().nonnegative().optional(),
  /** 每 1K token 输出价格（美元） */
  outputPricePerK: z.number().nonnegative().optional(),
})
export type LLMModelConfig = z.infer<typeof LLMModelConfigSchema>

/**
 * 默认生成参数
 */
export const GenerationParamsSchema = z.object({
  /** 温度 */
  temperature: z.number().min(0).max(2).default(0.7),
  /** Top P */
  topP: z.number().min(0).max(1).default(1),
  /** Top K */
  topK: z.number().int().min(0).optional(),
  /** 频率惩罚 */
  frequencyPenalty: z.number().min(-2).max(2).default(0),
  /** 存在惩罚 */
  presencePenalty: z.number().min(-2).max(2).default(0),
  /** 停止序列 */
  stopSequences: z.array(z.string()).default([]),
})
export type GenerationParams = z.infer<typeof GenerationParamsSchema>

/**
 * AI 限流配置
 */
export const AIRateLimitSchema = z.object({
  /** 是否启用 */
  enabled: z.boolean().default(true),
  /** 每分钟请求数 */
  requestsPerMinute: z.number().int().positive().default(60),
  /** 每日请求数 */
  requestsPerDay: z.number().int().positive().default(1000),
  /** 每分钟 token 数 */
  tokensPerMinute: z.number().int().positive().default(100000),
  /** 每日 token 数 */
  tokensPerDay: z.number().int().positive().default(1000000),
})
export type AIRateLimit = z.infer<typeof AIRateLimitSchema>

/**
 * AI 配置
 */
export const AIConfigSchema = z.object({
  /** 是否启用 */
  enabled: z.boolean().default(true),
  /** 默认模型 ID */
  defaultModel: z.string().default('gpt-3.5-turbo'),
  /** 可用模型列表 */
  models: z.array(LLMModelConfigSchema).default([]),
  /** 默认生成参数 */
  defaultParams: GenerationParamsSchema.optional(),
  /** 限流配置 */
  rateLimit: AIRateLimitSchema.optional(),
  /** 系统提示词 */
  systemPrompt: z.string().optional(),
  /** 请求超时（毫秒） */
  timeout: z.number().int().positive().default(60000),
  /** 重试次数 */
  maxRetries: z.number().int().min(0).default(3),
  /** 是否记录请求日志 */
  logRequests: z.boolean().default(false),
  /** 是否启用内容过滤 */
  contentFilter: z.boolean().default(true),
})
export type AIConfig = z.infer<typeof AIConfigSchema>
