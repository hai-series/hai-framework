/**
 * @h-ai/ai — 错误码 + 配置 Schema
 *
 * 定义 AI 模块的错误码常量、Zod Schema 和配置类型。
 * @module ai-config
 */

import { z } from 'zod'

// ─── Context 配置 Schema ───

// CompressionStrategySchema / CompressionStrategy 定义在 context/ai-context-types.ts 中
import { CompressionStrategySchema } from './context/ai-context-types.js'

// ─── 错误码 ───

/** AI 错误码（数值范围 12000-12999） */
export const AIErrorCode = {
  // 通用 (12000-12009)
  /** 内部错误 */
  INTERNAL_ERROR: 12000,

  // 初始化 (12010-12019)
  /** 服务未初始化 */
  NOT_INITIALIZED: 12010,
  /** 配置错误 */
  CONFIGURATION_ERROR: 12011,

  // LLM (12100-12199)
  /** API 调用错误 */
  API_ERROR: 12100,
  /** 无效请求 */
  INVALID_REQUEST: 12101,
  /** 速率限制 */
  RATE_LIMITED: 12102,
  /** 请求超时 */
  TIMEOUT: 12103,
  /** 模型未找到 */
  MODEL_NOT_FOUND: 12104,
  /** 上下文长度超限 */
  CONTEXT_LENGTH_EXCEEDED: 12105,
  /** 对话记录保存失败 */
  LLM_RECORD_FAILED: 12106,
  /** 对话历史查询失败 */
  LLM_HISTORY_FAILED: 12107,

  // MCP (12200-12299)
  /** MCP 连接错误 */
  MCP_CONNECTION_ERROR: 12200,
  /** MCP 协议错误 */
  MCP_PROTOCOL_ERROR: 12201,
  /** MCP 工具错误 */
  MCP_TOOL_ERROR: 12202,
  /** MCP 资源错误 */
  MCP_RESOURCE_ERROR: 12203,
  /** MCP 服务器错误 */
  MCP_SERVER_ERROR: 12204,

  // Embedding (12300-12399)
  /** Embedding API 调用错误 */
  EMBEDDING_API_ERROR: 12300,
  /** Embedding 模型未找到 */
  EMBEDDING_MODEL_NOT_FOUND: 12301,
  /** Embedding 输入过长 */
  EMBEDDING_INPUT_TOO_LONG: 12302,

  // 工具 (12400-12499)
  /** 工具未找到 */
  TOOL_NOT_FOUND: 12400,
  /** 工具验证失败 */
  TOOL_VALIDATION_FAILED: 12401,
  /** 工具执行失败 */
  TOOL_EXECUTION_FAILED: 12402,
  /** 工具超时 */
  TOOL_TIMEOUT: 12403,

  // Reasoning (12500-12599)
  /** 推理执行失败 */
  REASONING_FAILED: 12500,
  /** 推理轮次超限 */
  REASONING_MAX_ROUNDS: 12501,
  /** 推理策略未找到 */
  REASONING_STRATEGY_NOT_FOUND: 12502,

  // Retrieval (12600-12699)
  /** 检索执行失败 */
  RETRIEVAL_FAILED: 12600,
  /** 检索源未配置 */
  RETRIEVAL_SOURCE_NOT_FOUND: 12601,

  // RAG (12700-12799)
  /** RAG 执行失败 */
  RAG_FAILED: 12700,
  /** RAG 上下文构建失败 */
  RAG_CONTEXT_BUILD_FAILED: 12701,

  // Knowledge (12800-12899)
  /** 知识库初始化失败 */
  KNOWLEDGE_SETUP_FAILED: 12800,
  /** 知识入库失败 */
  KNOWLEDGE_INGEST_FAILED: 12801,
  /** 知识检索失败 */
  KNOWLEDGE_RETRIEVE_FAILED: 12802,
  /** 实体提取失败 */
  KNOWLEDGE_ENTITY_EXTRACT_FAILED: 12803,
  /** 知识库未初始化 */
  KNOWLEDGE_NOT_SETUP: 12804,
  /** 集合不存在 */
  KNOWLEDGE_COLLECTION_NOT_FOUND: 12805,

  // Memory (12900-12949)
  /** 记忆提取失败 */
  MEMORY_EXTRACT_FAILED: 12900,
  /** 记忆存储失败 */
  MEMORY_STORE_FAILED: 12901,
  /** 记忆检索失败 */
  MEMORY_RECALL_FAILED: 12902,
  /** 记忆不存在 */
  MEMORY_NOT_FOUND: 12903,
  /** 记忆注入失败 */
  MEMORY_ENRICH_FAILED: 12904,

  // Context (12950-12999)
  /** 上下文压缩失败 */
  CONTEXT_COMPRESS_FAILED: 12950,
  /** 摘要生成失败 */
  CONTEXT_SUMMARIZE_FAILED: 12951,
  /** Token 估算失败 */
  CONTEXT_TOKEN_ESTIMATE_FAILED: 12952,
  /** 超出 Token 预算 */
  CONTEXT_BUDGET_EXCEEDED: 12953,

  // Rerank (12020-12029)
  /** Rerank API 调用错误 */
  RERANK_API_ERROR: 12020,
  /** Rerank 请求参数无效 */
  RERANK_INVALID_REQUEST: 12021,

  // File (12030-12049)
  /** 文件解析失败 */
  FILE_PARSE_FAILED: 12030,
  /** 不支持的文件格式 */
  FILE_UNSUPPORTED_FORMAT: 12031,
  /** OCR 识别失败 */
  FILE_OCR_FAILED: 12032,
  /** 文件内容无效 */
  FILE_INVALID_CONTENT: 12033,

  // Store (13000-13049)
  /** 存储操作失败 */
  STORE_FAILED: 13000,
  /** 存储后端不可用 */
  STORE_NOT_AVAILABLE: 13001,

  // Session (13050-13099)
  /** 会话未找到 */
  SESSION_NOT_FOUND: 13050,
  /** 会话操作失败 */
  SESSION_FAILED: 13051,
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
 * - `default` — 默认场景（兜底）
 * - `chat` — 对话场景
 * - `reasoning` — 推理场景（ReAct、CoT，需要强逻辑能力）
 * - `plan` — Plan-Execute 规划阶段（需要强推理）
 * - `execute` — Plan-Execute 执行阶段（需要工具调用能力）
 * - `extraction` — 信息提取场景（记忆提取、实体抽取）
 * - `summary` — 摘要/压缩场景（上下文摘要）
 * - `embedding` — 向量嵌入场景
 * - `rerank` — 文档重排序场景
 * - `ocr` — 图片 OCR 识别场景（视觉模型）
 * - `fast` — 快速响应场景（低延迟优先）
 */
export const ModelScenarioSchema = z.enum(['default', 'chat', 'reasoning', 'plan', 'execute', 'extraction', 'summary', 'embedding', 'rerank', 'ocr', 'fast'])

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
  baseUrl: z.url().optional(),
  /** 最大 Token 数覆盖（可选） */
  maxTokens: z.number().positive().optional(),
  /** 温度覆盖（可选） */
  temperature: z.number().min(0).max(2).optional(),
  /** 超时覆盖（可选，毫秒） */
  timeout: z.number().positive().optional(),
})

/** 模型条目类型 */
export type ModelEntry = z.infer<typeof ModelEntrySchema>

/**
 * LLM 配置 Schema
 *
 * 配置大模型调用参数：模型名称、API Key、Base URL、温度等。
 * 支持多模型注册和场景映射。
 *
 * @example
 * ```ts
 * const llmConfig = {
 *   apiKey: 'sk-xxx',
 *   baseUrl: 'https://api.openai.com/v1',
 *   model: 'gpt-4o-mini',
 *   maxTokens: 4096,
 *   temperature: 0.7,
 *   timeout: 60000,
 *   models: [
 *     { id: 'fast', model: 'gpt-4o-mini', temperature: 0.3 },
 *     { id: 'strong', model: 'gpt-4o', maxTokens: 8192 },
 *   ],
 *   scenarios: { chat: 'fast', reasoning: 'strong' },
 * }
 * ```
 */
export const LLMConfigSchema = z.object({
  /** API Key，未提供时回退到 `process.env.HAI_OPENAI_API_KEY` 或 `process.env.OPENAI_API_KEY` */
  apiKey: z.string().optional(),
  /** API 基础 URL，未提供时回退到 `process.env.HAI_OPENAI_BASE_URL` 或 `process.env.OPENAI_BASE_URL` 或 OpenAI 官方地址 */
  baseUrl: z.url().optional(),
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
  /** 场景模型映射（场景名 → 模型 ID，各场景均可选） */
  scenarios: z.object(Object.fromEntries(ModelScenarioSchema.options.map(k => [k, z.string().optional()])) as Record<ModelScenario, z.ZodOptional<z.ZodString>>).optional(),
})

/** LLM 配置类型 */
export type LLMConfig = z.infer<typeof LLMConfigSchema>

/**
 * 根据场景解析模型名称
 *
 * 解析优先级：`显式参数 > 场景映射 (scenarios) > 全局默认 (llm.model) > 'gpt-4o-mini'`
 *
 * 若 `scenarios` 映射的值在 `models` 列表中存在对应 `id`，返回该条目的 `model` 字段；
 * 否则直接将映射值作为模型名称返回。
 *
 * @param llmConfig - LLM 配置（可选）
 * @param scenario - 使用场景
 * @param explicit - 调用方显式指定的模型名称（最高优先级）
 * @returns 解析后的模型名称
 */
export function resolveModel(
  llmConfig: Partial<LLMConfig> | undefined,
  scenario: ModelScenario,
  explicit?: string,
): string {
  // 显式指定的模型优先
  if (explicit)
    return explicit

  // 从场景映射查找
  const modelId = llmConfig?.scenarios?.[scenario] ?? llmConfig?.scenarios?.default
  if (modelId) {
    // 尝试从 models 列表中匹配条目
    const entry = llmConfig?.models?.find(m => m.id === modelId)
    return entry?.model ?? modelId
  }

  // 全局默认模型
  return llmConfig?.model ?? 'gpt-4o-mini'
}

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

/**
 * MCP 配置 Schema
 *
 * 配置 MCP（Model Context Protocol）服务器参数。
 *
 * @example
 * ```ts
 * const mcpConfig = {
 *   server: {
 *     name: 'my-app',
 *     version: '1.0.0',
 *     capabilities: { tools: true, resources: true, prompts: true },
 *   },
 * }
 * ```
 */
export const MCPConfigSchema = z.object({
  /** 服务器配置 */
  server: MCPServerConfigSchema.optional(),
})

/** MCP 配置类型 */
export type MCPConfig = z.infer<typeof MCPConfigSchema>

// ─── 统一 AI 配置 ───

/**
 * Embedding 配置 Schema
 *
 * 配置文本向量化参数。
 * 模型通过 LLMConfigSchema.scenarios.embedding 解析，
 * apiKey / baseUrl 统一使用 LLM 配置。
 *
 * @example
 * ```ts
 * const embeddingConfig = {
 *   dimensions: 1536,
 *   batchSize: 100,
 * }
 * ```
 */
export const EmbeddingConfigSchema = z.object({
  /** 向量维度（可选，部分模型支持指定维度） */
  dimensions: z.number().int().positive().optional(),
  /** 批量大小（单次请求最多处理的文本数，默认 100） */
  batchSize: z.number().int().positive().default(100),
})

/** Embedding 配置类型 */
export type EmbeddingConfig = z.infer<typeof EmbeddingConfigSchema>

// ─── Knowledge 配置 Schema ───

export { CompressionStrategySchema } from './context/ai-context-types.js'
export type { CompressionStrategy } from './context/ai-context-types.js'

/**
 * Knowledge 配置 Schema
 *
 * 配置知识库管理参数：向量集合、分块策略、实体提取等。
 * 模型通过 LLMConfigSchema.scenarios 解析，
 * apiKey / baseUrl 统一使用 LLM 配置。
 *
 * @example
 * ```ts
 * const knowledgeConfig = {
 *   collection: 'my-knowledge',
 *   dimension: 1536,
 *   enableEntityExtraction: true,
 *   chunkMode: 'markdown',
 *   chunkMaxSize: 1500,
 *   chunkOverlap: 200,
 * }
 * ```
 */
export const KnowledgeConfigSchema = z.object({
  /** 默认向量集合名（默认 'knowledge'） */
  collection: z.string().default('knowledge'),
  /** 向量维度（默认 1536，需与 embedding 模型匹配） */
  dimension: z.number().int().positive().default(1536),
  /** 是否启用实体提取（默认 true） */
  enableEntityExtraction: z.boolean().default(true),
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

// ─── Memory 配置 Schema ───

// EntityTypeSchema / EntityType 定义在 knowledge/ai-knowledge-types.ts 中
export { EntityTypeSchema } from './knowledge/ai-knowledge-types.js'
export type { EntityType } from './knowledge/ai-knowledge-types.js'

/**
 * Memory 配置 Schema
 *
 * 配置对话记忆的提取、存储与检索参数。
 * 模型通过 LLMConfigSchema.scenarios.extraction 解析，
 * apiKey / baseUrl 统一使用 LLM 配置。
 *
 * @example
 * ```ts
 * const memoryConfig = {
 *   maxEntries: 1000,
 *   embeddingEnabled: true,
 *   recencyDecay: 0.95,
 *   defaultTopK: 10,
 * }
 * ```
 */
export const MemoryConfigSchema = z.object({
  /** 最大记忆条数（默认 1000） */
  maxEntries: z.number().int().positive().default(1000),
  /** 自定义记忆提取 systemPrompt（可选，覆盖内置默认提示词） */
  systemPrompt: z.string().optional(),
  /** 时间衰减系数（默认 0.95，每次检索乘以此系数调整 recency 权重） */
  recencyDecay: z.number().min(0).max(1).default(0.95),
  /** 是否启用向量检索（默认 true，关闭则仅使用关键词匹配） */
  embeddingEnabled: z.boolean().default(true),
  /** 检索时默认返回数量（默认 10） */
  defaultTopK: z.number().int().positive().default(10),
})

/** Memory 配置类型 */
export type MemoryConfig = z.infer<typeof MemoryConfigSchema>
// MemoryTypeSchema / MemoryType 定义在 memory/ai-memory-types.ts 中
export { MemoryTypeSchema } from './memory/ai-memory-types.js'
export type { MemoryType } from './memory/ai-memory-types.js'

/**
 * Context 配置 Schema
 *
 * 配置对话上下文管理参数：压缩策略、Token 预算、摘要生成等。
 * 模型通过 LLMConfigSchema.scenarios.summary 解析，
 * apiKey / baseUrl 统一使用 LLM 配置。
 *
 * @example
 * ```ts
 * const contextConfig = {
 *   defaultStrategy: 'hybrid',
 *   defaultMaxTokens: 4000,
 *   preserveLastN: 4,
 *   tokenRatio: 0.25,
 * }
 * ```
 */
export const ContextConfigSchema = z.object({
  /** 默认压缩策略（默认 'hybrid'） */
  defaultStrategy: CompressionStrategySchema.default('hybrid'),
  /** 默认 Token 预算（默认 0 表示取模型上限的 80%） */
  defaultMaxTokens: z.number().int().min(0).default(0),
  /** 默认保留最近消息数（默认 4） */
  preserveLastN: z.number().int().min(0).default(4),
  /** 自定义摘要 systemPrompt（可选，覆盖内置默认提示词） */
  systemPrompt: z.string().optional(),
  /** Token 估算每字符系数（默认 0.25，即 4 字符 ≈ 1 token） */
  tokenRatio: z.number().positive().default(0.25),
})

/** Context 配置类型 */
export type ContextConfig = z.infer<typeof ContextConfigSchema>

// ─── Store 配置 Schema ───

/**
 * Store 配置 Schema
 *
 * 配置存储后端模式：`memory`（开发/测试用）或 `persistent`（生产用，需 reldb + vecdb）。
 * `persistent` 模式不可用时自动降级为 `memory` 并输出 warn 日志。
 *
 * @example
 * ```ts
 * const storeConfig = {
 *   mode: 'persistent', // 使用 reldb + vecdb
 * }
 * ```
 */
export const StoreConfigSchema = z.object({
  /** 存储模式（默认 `'memory'`） */
  mode: z.enum(['memory', 'persistent']).default('memory'),
})

/** Store 配置类型 */
export type StoreConfig = z.infer<typeof StoreConfigSchema>

// ─── Rerank 配置 Schema ───

/**
 * Rerank 配置 Schema
 *
 * 配置文档重排序 API 参数。
 * apiKey / baseUrl 未配置时回退到 LLM 配置。
 * 模型通过 `llm.scenarios.rerank` 指定。
 */
export const RerankConfigSchema = z.object({
  /** Rerank API Key（未配置时回退到 LLM apiKey） */
  apiKey: z.string().optional(),
  /** Rerank API Base URL（未配置时回退到 LLM baseUrl，默认 Cohere） */
  baseUrl: z.url().optional(),
})

/** Rerank 配置类型 */
export type RerankConfig = z.infer<typeof RerankConfigSchema>

// ─── File 配置 Schema ───

/**
 * File 配置 Schema
 *
 * 配置文件解析参数：OCR 提示词。
 * OCR 使用的视觉模型通过 `llm.scenarios.ocr` 指定。
 */
export const FileConfigSchema = z.object({
  /** OCR 系统提示词（可选，覆盖内置默认提示词） */
  ocrPrompt: z.string().optional(),
})

/** File 配置类型 */
export type FileConfig = z.infer<typeof FileConfigSchema>

/**
 * AI 配置 Schema
 *
 * 统一 AI 模块配置：LLM、MCP、Embedding、Knowledge、Memory、Context、Store。
 * 模型通过 LLM.scenarios 映射场景，子系统不再独立配置 apiKey / baseUrl / model。
 *
 * @example
 * ```ts
 * ai.init({
 *   llm: {
 *     apiKey: 'sk-xxx',
 *     model: 'gpt-4o-mini',
 *     maxTokens: 4096,
 *     scenarios: {
 *       extraction: 'gpt-4o',
 *       summary: 'gpt-4o-mini',
 *       embedding: 'text-embedding-3-small',
 *       rerank: 'rerank-english-v3.0',
 *       ocr: 'gpt-4o',
 *     },
 *   },
 *   embedding: { dimensions: 1536 },
 *   rerank: { baseUrl: 'https://api.cohere.com' },
 *   knowledge: { collection: 'docs', enableEntityExtraction: true },
 *   memory: { maxEntries: 500, embeddingEnabled: true },
 *   context: { defaultStrategy: 'hybrid', preserveLastN: 4 },
 *   store: { mode: 'persistent' },
 * })
 * ```
 */
export const AIConfigSchema = z.object({
  /** LLM 配置 */
  llm: LLMConfigSchema.optional(),
  /** MCP 配置 */
  mcp: MCPConfigSchema.optional(),
  /** Embedding 配置 */
  embedding: EmbeddingConfigSchema.optional(),
  /** Knowledge 配置 */
  knowledge: KnowledgeConfigSchema.optional(),
  /** Memory 配置 */
  memory: MemoryConfigSchema.optional(),
  /** Context 配置 */
  context: ContextConfigSchema.optional(),
  /** Store 配置 */
  store: StoreConfigSchema.optional(),
  /** Rerank 配置 */
  rerank: RerankConfigSchema.optional(),
  /** File 解析配置 */
  file: FileConfigSchema.optional(),
})

/** AI 配置类型（校验后的完整类型） */
export type AIConfig = z.infer<typeof AIConfigSchema>

/** AI 配置输入类型（允许部分字段） */
export type AIConfigInput = z.input<typeof AIConfigSchema>
