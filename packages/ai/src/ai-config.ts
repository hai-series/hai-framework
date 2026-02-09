/**
 * =============================================================================
 * @hai/ai - AI 配置 Schema
 * =============================================================================
 *
 * 本文件定义 AI 模块的配置结构，使用 Zod 进行运行时校验。
 *
 * 包含：
 * - 错误码常量（4000-4999 范围）
 * - LLM 配置
 * - MCP 配置
 * - 统一的 AIConfig 配置结构
 *
 * @example
 * ```ts
 * import { AIConfigSchema, AIErrorCode } from '@hai/ai'
 *
 * const config = AIConfigSchema.parse({
 *     llm: {
 *         model: 'gpt-4o-mini',
 *         apiKey: 'sk-xxx',
 *     }
 * })
 * ```
 *
 * @module ai-config
 * =============================================================================
 */

import { z } from 'zod'

// =============================================================================
// 错误码常量
// =============================================================================

/**
 * AI 错误码（数值范围 4000-4999）
 *
 * 用于标识 AI 操作中的各类错误，便于错误处理和日志记录。
 *
 * @example
 * ```ts
 * import { AIErrorCode } from '@hai/ai'
 *
 * if (result.error?.code === AIErrorCode.NOT_INITIALIZED) {
 *     // 处理错误：服务未初始化
 * }
 * ```
 */
export const AIErrorCode = {
  // 通用错误 (4000-4099)
  /** 服务未初始化 */
  NOT_INITIALIZED: 4000,
  /** 配置错误 */
  CONFIGURATION_ERROR: 4001,
  /** 内部错误 */
  INTERNAL_ERROR: 4002,

  // LLM 错误 (4100-4199)
  /** API 调用错误 */
  API_ERROR: 4100,
  /** 无效请求 */
  INVALID_REQUEST: 4101,
  /** 速率限制 */
  RATE_LIMITED: 4102,
  /** 请求超时 */
  TIMEOUT: 4103,
  /** 模型未找到 */
  MODEL_NOT_FOUND: 4104,
  /** 上下文长度超限 */
  CONTEXT_LENGTH_EXCEEDED: 4105,

  // MCP 错误 (4200-4299)
  /** MCP 连接错误 */
  MCP_CONNECTION_ERROR: 4200,
  /** MCP 协议错误 */
  MCP_PROTOCOL_ERROR: 4201,
  /** MCP 工具错误 */
  MCP_TOOL_ERROR: 4202,
  /** MCP 资源错误 */
  MCP_RESOURCE_ERROR: 4203,
  /** MCP 服务器错误 */
  MCP_SERVER_ERROR: 4204,

  // 工具错误 (4400-4499)
  /** 工具未找到 */
  TOOL_NOT_FOUND: 4400,
  /** 工具验证失败 */
  TOOL_VALIDATION_FAILED: 4401,
  /** 工具执行失败 */
  TOOL_EXECUTION_FAILED: 4402,
  /** 工具超时 */
  TOOL_TIMEOUT: 4403,
} as const

/**
 * 错误码值类型（AIErrorCode 中所有数值的联合）
 *
 * 用于类型约束 `AIError.code` 字段。
 */
export type AIErrorCodeType = (typeof AIErrorCode)[keyof typeof AIErrorCode]

// =============================================================================
// LLM 配置
// =============================================================================

/**
 * LLM 配置 Schema
 *
 * 所有字段均为可选，未提供时使用默认值。
 * 运行时通过 Zod 进行校验（如 temperature 范围、URL 格式等），
 * 校验失败会导致 `ai.init()` 返回 `CONFIGURATION_ERROR`。
 */
export const LLMConfigSchema = z.object({
  /** API Key，未提供时回退到 `process.env.OPENAI_API_KEY` */
  apiKey: z.string().optional(),
  /** API 基础 URL（须为合法 URL），未提供时回退到 `process.env.OPENAI_BASE_URL` 或 OpenAI 官方地址 */
  baseUrl: z.string().url().optional(),
  /** 默认模型名称（默认 `'gpt-4o-mini'`） */
  model: z.string().optional().default('gpt-4o-mini'),
  /** 单次请求最大 Token 数，须为正整数（默认 `4096`） */
  maxTokens: z.number().positive().optional().default(4096),
  /** 采样温度，取值范围 `[0, 2]`（默认 `0.7`） */
  temperature: z.number().min(0).max(2).optional().default(0.7),
  /** 请求超时时间（毫秒），须为正数（默认 `60000`） */
  timeout: z.number().positive().optional().default(60000),
})

/** LLM 配置类型 */
export type LLMConfig = z.infer<typeof LLMConfigSchema>

// =============================================================================
// MCP 配置
// =============================================================================

/**
 * MCP 服务器能力 Schema
 *
 * 声明 MCP 服务器支持的协议能力，用于握手阶段通告客户端。
 * 所有能力默认开启（`true`）。
 */
export const MCPServerCapabilitiesSchema = z.object({
  /** 是否支持工具调用（默认 `true`） */
  tools: z.boolean().optional().default(true),
  /** 是否支持资源访问（默认 `true`） */
  resources: z.boolean().optional().default(true),
  /** 是否支持提示词模板（默认 `true`） */
  prompts: z.boolean().optional().default(true),
})

/** MCP 服务器能力类型 */
export type MCPServerCapabilities = z.infer<typeof MCPServerCapabilitiesSchema>

/**
 * MCP 服务器配置 Schema
 *
 * 定义 MCP 服务器的基本信息与能力声明。
 */
export const MCPServerConfigSchema = z.object({
  /** 服务器名称（必填，用于 MCP 握手标识） */
  name: z.string(),
  /** 服务器版本（默认 `'1.0.0'`） */
  version: z.string().optional().default('1.0.0'),
  /** 服务器能力声明，未提供时全部默认开启 */
  capabilities: MCPServerCapabilitiesSchema.optional(),
})

/** MCP 服务器配置类型 */
export type MCPServerConfig = z.infer<typeof MCPServerConfigSchema>

/**
 * MCP 配置 Schema
 */
export const MCPConfigSchema = z.object({
  /** 服务器配置 */
  server: MCPServerConfigSchema.optional(),
})

/** MCP 配置类型 */
export type MCPConfig = z.infer<typeof MCPConfigSchema>

// =============================================================================
// 统一 AI 配置
// =============================================================================

/**
 * AI 配置 Schema
 *
 * @example
 * ```ts
 * const config = AIConfigSchema.parse({
 *     llm: {
 *         model: 'gpt-4o-mini',
 *         apiKey: process.env.OPENAI_API_KEY,
 *     },
 *     mcp: {
 *         server: { name: 'my-server' }
 *     }
 * })
 * ```
 */
export const AIConfigSchema = z.object({
  /** LLM 配置 */
  llm: LLMConfigSchema.optional(),
  /** MCP 配置 */
  mcp: MCPConfigSchema.optional(),
})

/** AI 配置类型（校验后的完整类型） */
export type AIConfig = z.infer<typeof AIConfigSchema>

/** AI 配置输入类型（允许部分字段） */
export type AIConfigInput = z.input<typeof AIConfigSchema>
