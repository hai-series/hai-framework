/**
 * =============================================================================
 * @hai/ai - AI 配置 Schema
 * =============================================================================
 *
 * 本文件定义 AI 模块的配置结构，使用 Zod 进行运行时校验。
 *
 * 包含：
 * - 错误码常量（4000-4999 范围）
 * - AI 提供者类型枚举
 * - LLM 配置
 * - MCP 配置
 * - 统一的 AIConfig 配置结构
 *
 * @example
 * ```ts
 * import { AIConfigSchema, AIErrorCode } from '@hai/ai'
 *
 * // 校验配置
 * const config = AIConfigSchema.parse({
 *     provider: 'hai',
 *     llm: {
 *         model: 'gpt-4o-mini',
 *         apiKey: 'sk-xxx',
 *     }
 * })
 *
 * // 使用错误码
 * if (error.code === AIErrorCode.NOT_INITIALIZED) {
 *     // 处理错误：请先调用 ai.init()
 * }
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

  // 技能错误 (4300-4399)
  /** 技能未找到 */
  SKILL_NOT_FOUND: 4300,
  /** 技能执行错误 */
  SKILL_EXECUTION_ERROR: 4301,
  /** 技能验证错误 */
  SKILL_VALIDATION_ERROR: 4302,

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

/** 错误码类型 */
export type AIErrorCodeType = (typeof AIErrorCode)[keyof typeof AIErrorCode]

// =============================================================================
// AI 提供者类型
// =============================================================================

/**
 * AI 提供者类型 Schema
 */
export const AIProviderSchema = z.enum([
  'hai',
  'openai',
  'azure',
  'anthropic',
  'google',
  'custom',
])

/** AI 提供者类型 */
export type AIProvider = z.infer<typeof AIProviderSchema>

// =============================================================================
// LLM 配置
// =============================================================================

/**
 * LLM 配置 Schema
 */
export const LLMConfigSchema = z.object({
  /** 提供者 */
  provider: AIProviderSchema.optional().default('hai'),
  /** API Key */
  apiKey: z.string().optional(),
  /** API 基础 URL */
  baseUrl: z.string().url().optional(),
  /** 默认模型 */
  model: z.string().optional().default('gpt-4o-mini'),
  /** 最大 Token 数 */
  maxTokens: z.number().positive().optional().default(4096),
  /** 温度参数 */
  temperature: z.number().min(0).max(2).optional().default(0.7),
  /** 请求超时（毫秒） */
  timeout: z.number().positive().optional().default(60000),
})

/** LLM 配置类型 */
export type LLMConfig = z.infer<typeof LLMConfigSchema>

/** LLM 配置输入类型（允许部分字段） */
export type LLMConfigInput = z.input<typeof LLMConfigSchema>

// =============================================================================
// MCP 配置
// =============================================================================

/**
 * MCP 服务器能力 Schema
 */
export const MCPServerCapabilitiesSchema = z.object({
  /** 是否支持工具 */
  tools: z.boolean().optional().default(true),
  /** 是否支持资源 */
  resources: z.boolean().optional().default(true),
  /** 是否支持提示词 */
  prompts: z.boolean().optional().default(true),
})

/** MCP 服务器能力类型 */
export type MCPServerCapabilities = z.infer<typeof MCPServerCapabilitiesSchema>

/**
 * MCP 服务器配置 Schema
 */
export const MCPServerConfigSchema = z.object({
  /** 服务器名称 */
  name: z.string(),
  /** 服务器版本 */
  version: z.string().optional().default('1.0.0'),
  /** 服务器能力 */
  capabilities: MCPServerCapabilitiesSchema.optional(),
})

/** MCP 服务器配置类型 */
export type MCPServerConfig = z.infer<typeof MCPServerConfigSchema>

/**
 * MCP 客户端配置 Schema
 */
export const MCPClientConfigSchema = z.object({
  /** 服务器 URL */
  serverUrl: z.string().url().optional(),
  /** 请求超时（毫秒） */
  timeout: z.number().positive().optional().default(30000),
})

/** MCP 客户端配置类型 */
export type MCPClientConfig = z.infer<typeof MCPClientConfigSchema>

/**
 * MCP 配置 Schema
 */
export const MCPConfigSchema = z.object({
  /** 服务器配置 */
  server: MCPServerConfigSchema.optional(),
  /** 客户端配置 */
  client: MCPClientConfigSchema.optional(),
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
 *     provider: 'hai',
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
  /** AI 提供者 */
  provider: AIProviderSchema.optional().default('hai'),
  /** LLM 配置 */
  llm: LLMConfigSchema.optional(),
  /** MCP 配置 */
  mcp: MCPConfigSchema.optional(),
})

/** AI 配置类型（校验后的完整类型） */
export type AIConfig = z.infer<typeof AIConfigSchema>

/** AI 配置输入类型（允许部分字段） */
export type AIConfigInput = z.input<typeof AIConfigSchema>
