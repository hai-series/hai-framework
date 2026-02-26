/**
 * @h-ai/ai — 错误码 + 配置 Schema
 *
 * 定义 AI 模块的错误码常量、Zod Schema 和配置类型。
 */

import { z } from 'zod'

// ─── 错误码 ───

/** AI 错误码（数值范围 7000-7999） */
export const AIErrorCode = {
  // 通用 (7000-7009)
  /** 内部错误 */
  INTERNAL_ERROR: 7000,

  // 初始化 (7010-7019)
  /** 服务未初始化 */
  NOT_INITIALIZED: 7010,
  /** 配置错误 */
  CONFIGURATION_ERROR: 7011,

  // LLM (7100-7199)
  /** API 调用错误 */
  API_ERROR: 7100,
  /** 无效请求 */
  INVALID_REQUEST: 7101,
  /** 速率限制 */
  RATE_LIMITED: 7102,
  /** 请求超时 */
  TIMEOUT: 7103,
  /** 模型未找到 */
  MODEL_NOT_FOUND: 7104,
  /** 上下文长度超限 */
  CONTEXT_LENGTH_EXCEEDED: 7105,

  // MCP (7200-7299)
  /** MCP 连接错误 */
  MCP_CONNECTION_ERROR: 7200,
  /** MCP 协议错误 */
  MCP_PROTOCOL_ERROR: 7201,
  /** MCP 工具错误 */
  MCP_TOOL_ERROR: 7202,
  /** MCP 资源错误 */
  MCP_RESOURCE_ERROR: 7203,
  /** MCP 服务器错误 */
  MCP_SERVER_ERROR: 7204,

  // 工具 (7400-7499)
  /** 工具未找到 */
  TOOL_NOT_FOUND: 7400,
  /** 工具验证失败 */
  TOOL_VALIDATION_FAILED: 7401,
  /** 工具执行失败 */
  TOOL_EXECUTION_FAILED: 7402,
  /** 工具超时 */
  TOOL_TIMEOUT: 7403,
} as const

/** 错误码值类型 */
export type AIErrorCodeType = (typeof AIErrorCode)[keyof typeof AIErrorCode]

// ─── 错误接口 ───

/** AI 错误接口，所有 AI 操作的错误统一遵循此结构 */
export interface AIError {
  /** 错误码（数值，参见 AIErrorCode） */
  code: AIErrorCodeType
  /** 错误消息 */
  message: string
  /** 原始错误（可选） */
  cause?: unknown
}

// ─── LLM 配置 Schema ───

/** LLM 配置 Schema */
export const LLMConfigSchema = z.object({
  /** API Key，未提供时回退到 `process.env.HAI_OPENAI_API_KEY` 或 `process.env.OPENAI_API_KEY` */
  apiKey: z.string().optional(),
  /** API 基础 URL，未提供时回退到 `process.env.HAI_OPENAI_BASE_URL` 或 `process.env.OPENAI_BASE_URL` 或 OpenAI 官方地址 */
  baseUrl: z.string().url().optional(),
  /** 默认模型名称（默认 `'gpt-4o-mini'`） */
  model: z.string().optional().default('gpt-4o-mini'),
  /** 单次请求最大 Token 数（默认 `4096`） */
  maxTokens: z.number().positive().optional().default(4096),
  /** 采样温度，范围 `[0, 2]`（默认 `0.7`） */
  temperature: z.number().min(0).max(2).optional().default(0.7),
  /** 请求超时时间（毫秒，默认 `60000`） */
  timeout: z.number().positive().optional().default(60000),
})

/** LLM 配置类型 */
export type LLMConfig = z.infer<typeof LLMConfigSchema>

// ─── MCP 配置 Schema ───

/** MCP 服务器能力 Schema */
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

/** MCP 服务器配置 Schema */
export const MCPServerConfigSchema = z.object({
  /** 服务器名称 */
  name: z.string(),
  /** 服务器版本（默认 `'1.0.0'`） */
  version: z.string().optional().default('1.0.0'),
  /** 服务器能力声明 */
  capabilities: MCPServerCapabilitiesSchema.optional(),
})

/** MCP 服务器配置类型 */
export type MCPServerConfig = z.infer<typeof MCPServerConfigSchema>

/** MCP 配置 Schema */
export const MCPConfigSchema = z.object({
  /** 服务器配置 */
  server: MCPServerConfigSchema.optional(),
})

/** MCP 配置类型 */
export type MCPConfig = z.infer<typeof MCPConfigSchema>

// ─── 统一 AI 配置 ───

/** AI 配置 Schema */
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
