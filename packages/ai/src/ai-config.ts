/**
 * @h-ai/ai — 错误码 + 配置 Schema
 *
 * 定义 AI 模块的错误码常量、Zod Schema 和配置类型。
 * @module ai-config
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

  // Embedding (7300-7399)
  /** Embedding API 调用错误 */
  EMBEDDING_API_ERROR: 7300,
  /** Embedding 模型未找到 */
  EMBEDDING_MODEL_NOT_FOUND: 7301,
  /** Embedding 输入过长 */
  EMBEDDING_INPUT_TOO_LONG: 7302,

  // 工具 (7400-7499)
  /** 工具未找到 */
  TOOL_NOT_FOUND: 7400,
  /** 工具验证失败 */
  TOOL_VALIDATION_FAILED: 7401,
  /** 工具执行失败 */
  TOOL_EXECUTION_FAILED: 7402,
  /** 工具超时 */
  TOOL_TIMEOUT: 7403,

  // Reasoning (7500-7599)
  /** 推理执行失败 */
  REASONING_FAILED: 7500,
  /** 推理轮次超限 */
  REASONING_MAX_ROUNDS: 7501,
  /** 推理策略未找到 */
  REASONING_STRATEGY_NOT_FOUND: 7502,

  // Retrieval (7600-7699)
  /** 检索执行失败 */
  RETRIEVAL_FAILED: 7600,
  /** 检索源未配置 */
  RETRIEVAL_SOURCE_NOT_FOUND: 7601,

  // RAG (7700-7799)
  /** RAG 执行失败 */
  RAG_FAILED: 7700,
  /** RAG 上下文构建失败 */
  RAG_CONTEXT_BUILD_FAILED: 7701,

  // Knowledge (7800-7899)
  /** 知识库初始化失败 */
  KNOWLEDGE_SETUP_FAILED: 7800,
  /** 知识入库失败 */
  KNOWLEDGE_INGEST_FAILED: 7801,
  /** 知识检索失败 */
  KNOWLEDGE_RETRIEVE_FAILED: 7802,
  /** 实体提取失败 */
  KNOWLEDGE_ENTITY_EXTRACT_FAILED: 7803,
  /** 知识库未初始化 */
  KNOWLEDGE_NOT_SETUP: 7804,
  /** 集合不存在 */
  KNOWLEDGE_COLLECTION_NOT_FOUND: 7805,
} as const

/** 错误码值类型 */
export type AIErrorCodeType = (typeof AIErrorCode)[keyof typeof AIErrorCode]

// ─── LLM 配置 Schema ───

// ─── 多模型配置 ───

/**
 * 模型场景枚举
 *
 * 预定义的模型使用场景，用于自动选择合适的模型。
 *
 * - `default` — 默认场景
 * - `chat` — 对话场景
 * - `reasoning` — 推理场景（需要强逻辑能力）
 * - `embedding` — 向量嵌入场景
 * - `fast` — 快速响应场景（低延迟优先）
 */
export const ModelScenarioSchema = z.enum(['default', 'chat', 'reasoning', 'embedding', 'fast'])

/** 模型场景类型 */
export type ModelScenario = z.infer<typeof ModelScenarioSchema>

/**
 * 模型条目 Schema
 *
 * 定义单个模型的配置信息，包含唯一 ID、模型名称和可选参数覆盖。
 *
 * @example
 * ```ts
 * const model = {
 *   id: 'gpt-4o',
 *   model: 'gpt-4o',
 *   maxTokens: 8192,
 *   temperature: 0.3,
 * }
 * ```
 */
export const ModelEntrySchema = z.object({
  /** 模型唯一标识（用于 ModelResolver 解析） */
  id: z.string(),
  /** 模型名称（传给 API 的实际模型名） */
  model: z.string(),
  /** API Key 覆盖（可选，未提供时使用全局配置） */
  apiKey: z.string().optional(),
  /** Base URL 覆盖（可选） */
  baseUrl: z.string().url().optional(),
  /** 最大 Token 数覆盖（可选） */
  maxTokens: z.number().positive().optional(),
  /** 温度覆盖（可选） */
  temperature: z.number().min(0).max(2).optional(),
  /** 超时覆盖（可选，毫秒） */
  timeout: z.number().positive().optional(),
})

/** 模型条目类型 */
export type ModelEntry = z.infer<typeof ModelEntrySchema>

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
  /** 多模型配置列表（可选，配置多个模型及其参数） */
  models: z.array(ModelEntrySchema).optional(),
  /** 场景默认模型映射（场景名 → 模型 ID） */
  defaults: z.record(ModelScenarioSchema, z.string()).optional(),
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

/** Embedding 配置 Schema */
export const EmbeddingConfigSchema = z.object({
  /** 嵌入模型名称（默认 `'text-embedding-3-small'`） */
  model: z.string().default('text-embedding-3-small'),
  /** API Key 覆盖（可选，默认使用 LLM 配置的 apiKey） */
  apiKey: z.string().optional(),
  /** Base URL 覆盖（可选，默认使用 LLM 配置的 baseUrl） */
  baseUrl: z.string().url().optional(),
  /** 向量维度（可选，部分模型支持指定维度） */
  dimensions: z.number().int().positive().optional(),
  /** 批量大小（单次请求最多处理的文本数，默认 100） */
  batchSize: z.number().int().positive().default(100),
})

/** Embedding 配置类型 */
export type EmbeddingConfig = z.infer<typeof EmbeddingConfigSchema>

// ─── Knowledge 配置 Schema ───

/**
 * 实体类型枚举
 *
 * 预定义的实体类型，用于实体提取和倒排索引分类。
 */
export const EntityTypeSchema = z.enum(['person', 'project', 'concept', 'organization', 'location', 'event', 'other'])

/** 实体类型 */
export type EntityType = z.infer<typeof EntityTypeSchema>

/** Knowledge 配置 Schema */
export const KnowledgeConfigSchema = z.object({
  /** 默认向量集合名（默认 'knowledge'） */
  collection: z.string().default('knowledge'),
  /** 向量维度（默认 1536，需与 embedding 模型匹配） */
  dimension: z.number().int().positive().default(1536),
  /** 是否启用实体提取（默认 true） */
  enableEntityExtraction: z.boolean().default(true),
  /** 实体提取使用的模型（可选，默认使用 LLM 配置中的默认模型） */
  entityExtractionModel: z.string().optional(),
  /** 默认分块模式（默认 'markdown'） */
  chunkMode: z.enum(['sentence', 'paragraph', 'markdown', 'page']).default('markdown'),
  /** 默认分块最大大小（默认 1500） */
  chunkMaxSize: z.number().int().positive().default(1500),
  /** 默认分块重叠（默认 200） */
  chunkOverlap: z.number().int().min(0).default(200),
  /** 实体查询命中的额外加权系数（默认 0.15，叠加到向量分数上） */
  entityBoostWeight: z.number().min(0).max(1).default(0.15),
})

/** Knowledge 配置类型 */
export type KnowledgeConfig = z.infer<typeof KnowledgeConfigSchema>

/** AI 配置 Schema */
export const AIConfigSchema = z.object({
  /** LLM 配置 */
  llm: LLMConfigSchema.optional(),
  /** MCP 配置 */
  mcp: MCPConfigSchema.optional(),
  /** Embedding 配置 */
  embedding: EmbeddingConfigSchema.optional(),
  /** Knowledge 配置 */
  knowledge: KnowledgeConfigSchema.optional(),
})

/** AI 配置类型（校验后的完整类型） */
export type AIConfig = z.infer<typeof AIConfigSchema>

/** AI 配置输入类型（允许部分字段） */
export type AIConfigInput = z.input<typeof AIConfigSchema>
