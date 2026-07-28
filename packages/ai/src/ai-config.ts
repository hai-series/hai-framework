/**
 * @h-ai/ai — 错误码 + 配置 Schema
 *
 * 定义 AI 模块的错误码常量、Zod Schema 和配置类型。
 * @module ai-config
 */

import type { HaiResult } from '@h-ai/core'
import process from 'node:process'
import { err, ok } from '@h-ai/core'
import { ChunkOptionsSchema, CleanOptionsSchema } from '@h-ai/datapipe'
import { z } from 'zod'
import { aiM } from './ai-i18n.js'

import { HaiAIError } from './ai-types.js'
import { CompressionStrategySchema } from './compress/ai-compress-types.js'

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
 * LLM API 协议枚举
 *
 * 决定底层通过哪种 API 协议与模型交互（对使用方透明，公共请求/响应形状保持一致）：
 *
 * - `chat` — OpenAI Chat Completions API（`/v1/chat/completions`，默认，兼容绝大多数厂商）
 * - `responses` — OpenAI Responses API（`/v1/responses`，新一代有状态接口）
 * - `anthropic` — Anthropic Messages API（Claude 原生协议，需安装 `@anthropic-ai/sdk`）
 */
export const ApiTypeSchema = z.enum(['chat', 'responses', 'anthropic'])

/** LLM API 协议类型 */
export type ApiType = z.infer<typeof ApiTypeSchema>

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
  /** API 协议（可选，未指定时回退全局 `api`，再回退 `chat`；决定走 Chat Completions / Responses / Anthropic） */
  api: ApiTypeSchema.optional(),
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
 * 顶层 `apiKey`、`baseUrl`、`maxTokens`、`temperature`、`timeout` 作为全局默认值，
 * 当 `models` 条目中未指定对应字段时，自动回退到这些全局默认值。
 * 通过 `resolveModelEntry()` 统一解析。
 *
 * @example
 * ```ts
 * const llmConfig = {
 *   // 全局默认值（各模型未指定时回退到此处）
 *   apiKey: 'sk-xxx',
 *   baseUrl: 'https://api.openai.com/v1',
 *   model: 'gpt-4o-mini',
 *   maxTokens: 4096,
 *   temperature: 0.7,
 *   timeout: 60000,
 *   // 多模型注册（各字段可选，未指定时回退到全局默认值）
 *   models: [
 *     { id: 'fast', model: 'gpt-4o-mini', temperature: 0.3 },
 *     { id: 'strong', model: 'gpt-4o', maxTokens: 8192 },
 *     { id: 'rerank', model: 'rerank-english-v3.0', baseUrl: 'https://api.cohere.com' },
 *   ],
 *   // 场景映射（场景名 → 模型 ID 或模型名称）
 *   scenarios: { chat: 'fast', reasoning: 'strong', rerank: 'rerank' },
 * }
 * ```
 */
export const LLMConfigSchema = z.object({
  /** 全局 API Key（各模型 fallback；未提供时回退到 `process.env.HAI_AI_LLM_API_KEY` 或 `process.env.OPENAI_API_KEY`） */
  apiKey: z.string().optional(),
  /** 全局 API 基础 URL（各模型 fallback；未提供时回退到 `process.env.HAI_AI_LLM_BASE_URL` 或 `process.env.OPENAI_BASE_URL`） */
  baseUrl: z.url().optional(),
  /** 默认模型名称（默认 `'gpt-4o-mini'`） */
  model: z.string().optional().default('gpt-4o-mini'),
  /** 全局 API 协议（各模型 fallback，默认 `'chat'`；可选 `chat` / `responses` / `anthropic`） */
  api: ApiTypeSchema.optional().default('chat'),
  /** 全局最大 Token 数（各模型 fallback，默认 `4096`） */
  maxTokens: z.number().positive().optional().default(4096),
  /** 全局采样温度（各模型 fallback，范围 `[0, 2]`，默认 `0.7`） */
  temperature: z.number().min(0).max(2).optional().default(0.7),
  /** 全局请求超时时间（各模型 fallback，毫秒，默认 `60000`） */
  timeout: z.number().positive().optional().default(60000),
  /** 临时模型客户端缓存存活时间（毫秒，默认 `600000` = 10 分钟；超时后临时模型客户端实例失效并重建） */
  tempModelCacheTtl: z.number().positive().optional().default(600000),
  /** 多模型配置列表（各字段可选，未指定时回退到全局默认值） */
  models: z.array(ModelEntrySchema).optional(),
  /** 场景模型映射（场景名 → 模型 ID 或直接模型名称，各场景均可选） */
  scenarios: z.object(Object.fromEntries(ModelScenarioSchema.options.map(k => [k, z.string().optional()])) as Record<ModelScenario, z.ZodOptional<z.ZodString>>).optional(),
})

/** LLM 配置类型 */
export type LLMConfig = z.infer<typeof LLMConfigSchema>

/**
 * 已解析的模型配置
 *
 * 由 `resolveModelEntry()` 返回，包含模型名称和完整的参数配置（已合并全局默认值和环境变量）。
 */
export interface ResolvedModelConfig {
  /** 模型名称（传给 API 的实际模型名） */
  model: string
  /** API 协议（模型条目 > 全局配置 > `chat`） */
  api: ApiType
  /** API Key（模型条目 > 全局配置 > 环境变量） */
  apiKey: string | undefined
  /** API 基础 URL（模型条目 > 全局配置 > 环境变量 > 默认 OpenAI） */
  baseUrl: string
  /** 最大 Token 数（模型条目 > 全局配置） */
  maxTokens: number
  /** 采样温度（模型条目 > 全局配置） */
  temperature: number
  /** 请求超时时间（毫秒）（模型条目 > 全局配置） */
  timeout: number
}

/**
 * 必需模型解析选项
 */
export interface ResolveRequiredModelEntryOptions {
  /** 缺少 API Key 时的自定义错误消息 */
  missingApiKeyMessage?: string
}

/**
 * 根据场景解析完整模型配置，并要求必须存在 API Key
 *
 * 用于需要访问远程模型 API 的场景，避免各子模块重复编写
 * `if (!resolved.apiKey)` 之类的配置校验逻辑。
 *
 * @param llmConfig - LLM 配置
 * @param scenario - 使用场景
 * @param explicit - 调用方显式指定的模型名称（最高优先级）
 * @param options - 必需校验选项
 * @returns 成功返回已解析模型配置，失败返回 `CONFIGURATION_ERROR`
 */
export function resolveModelEntry(
  llmConfig: LLMConfig,
  scenario: ModelScenario,
  explicit?: string,
  options?: ResolveRequiredModelEntryOptions,
): HaiResult<ResolvedModelConfig> {
  let entry: ModelEntry | undefined
  let modelName: string

  if (explicit) {
    // 显式指定的模型名，尝试匹配 models 条目
    entry = llmConfig.models?.find(m => m.id === explicit || m.model === explicit)
    modelName = entry?.model ?? explicit
  }
  else {
    // 从场景映射查找
    const modelId = llmConfig.scenarios?.[scenario] ?? llmConfig.scenarios?.default
    if (modelId) {
      entry = llmConfig.models?.find(m => m.id === modelId)
      modelName = entry?.model ?? modelId
    }
    else {
      modelName = llmConfig.model ?? 'gpt-4o-mini'
    }
  }

  const resolved: ResolvedModelConfig = {
    model: modelName,
    api: entry?.api ?? llmConfig.api ?? 'chat',
    apiKey: entry?.apiKey ?? llmConfig.apiKey ?? process.env.HAI_AI_LLM_API_KEY ?? process.env.OPENAI_API_KEY,
    baseUrl: entry?.baseUrl ?? llmConfig.baseUrl ?? process.env.HAI_AI_LLM_BASE_URL ?? process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
    maxTokens: entry?.maxTokens ?? llmConfig.maxTokens ?? 4096,
    temperature: entry?.temperature ?? llmConfig.temperature ?? 0.7,
    timeout: entry?.timeout ?? llmConfig.timeout ?? 60000,
  }

  if (!resolved.apiKey) {
    return err(HaiAIError.CONFIGURATION_ERROR, options?.missingApiKeyMessage ?? aiM('ai_configMissingApiKey', { params: { scenario } }))
  }

  return ok(resolved)
}

/**
 * 解析某次 chat 请求应使用的 API 协议（不校验 API Key）
 *
 * 供 LLM Provider 路由层选择底层实现使用：优先取显式模型条目的 `api`，
 * 其次全局 `api`，最后回退 `chat`。临时模型的 `api` 由调用方单独传入优先。
 *
 * @param llmConfig - LLM 配置
 * @param explicitModel - 显式指定的模型名/ID（可选）
 * @param tempApi - 临时模型显式指定的 API 协议（可选，最高优先级）
 * @returns 解析出的 API 协议
 */
export function resolveModelApi(llmConfig: LLMConfig, explicitModel?: string, tempApi?: ApiType): ApiType {
  if (tempApi)
    return tempApi
  const entry = explicitModel
    ? llmConfig.models?.find(m => m.id === explicitModel || m.model === explicitModel)
    : undefined
  return entry?.api ?? llmConfig.api ?? 'chat'
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

export { CompressionStrategySchema } from './compress/ai-compress-types.js'
export type { CompressionStrategy } from './compress/ai-compress-types.js'

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
 *   enableEntityExtraction: true
 * }
 * ```
 */
export const KnowledgeConfigSchema = z.object({
  /** 默认向量集合名（默认 'hai_ai_knowledge'） */
  collection: z.string().default('hai_ai_knowledge'),
  /** 向量维度（默认 1536，需与 embedding 模型匹配） */
  dimension: z.number().int().positive().default(1536),
  /** 是否启用实体提取（默认 true） */
  enableEntityExtraction: z.boolean().default(true),
  /**
   * 默认文本清洗选项
   *
   * 字段含义与 @h-ai/datapipe CleanOptionsInput 完全一致，
   * 支持 removeHtml、removeUrls、normalizeWhitespace、customReplacements 等。
   */
  cleanOptions: CleanOptionsSchema.default(CleanOptionsSchema.parse({})),
  /**
   * 默认分块选项
   *
   * 字段含义与 @h-ai/datapipe ChunkOptionsInput 完全一致，
   * 支持 mode、maxSize、overlap、separator、markdownMinLevel 等完整选项。
   */
  chunkOptions: ChunkOptionsSchema.default(ChunkOptionsSchema.parse({
    mode: 'markdown',
    maxSize: 1500,
    overlap: 200,
  })),
  /** 实体查询命中的额外加权系数（默认 0.15，叠加到向量分数上） */
  entityBoostWeight: z.number().min(0).max(1).default(0.15),
  /** 自定义实体类型列表（不指定时使用内置默认类型） */
  entityTypes: z.array(z.string()).optional(),
  /** 自定义实体提取系统提示词（不指定时使用内置默认提示词） */
  systemPrompt: z.string().optional(),
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
 * 配置对话记忆的提取、存储与检索参数。两种 provider 均为嵌入式，复用同一套
 * vecdb / reldb / LLM / Embedding；模型通过 LLMConfigSchema.scenarios.extraction
 * 解析，apiKey / baseUrl 统一使用 LLM 配置。
 *
 * @example
 * ```ts
 * const memoryConfig = {
 *   provider: 'native',
 *   maxEntriesPerObject: 1000,
 *   maxEntriesGlobal: 100000,
 *   embeddingEnabled: true,
 *   recencyDecay: 0.95,
 *   defaultTopK: 10,
 * }
 * ```
 */
export const MemoryConfigSchema = z.object({
  /** 记忆后端：native = 逐条写回；mem0 = 批量 ADD/UPDATE/DELETE 合并（均为嵌入式，复用 HAI 组件） */
  provider: z.enum(['native', 'mem0']).default('native'),
  /**
   * 是否允许在配置了持久化向量后端但 mem0 无法映射时退回内存存储（默认 false）
   *
   * 仅影响 `provider='mem0'`：mem0 TS 仅支持 qdrant / pgvector。当底层 vecdb 是
   * lancedb / chroma / 未知后端时，默认 fail-fast（初始化失败），避免服务重启后记忆静默丢失；
   * 仅当显式设为 true 时才退回 mem0 自带 in-memory 存储（数据不持久）。
   */
  allowEphemeralFallback: z.boolean().default(false),
  /**
   * 单个主体（objectId）的最大记忆条数（默认 1000）
   *
   * native 淘汰按 objectId 分区触发：某个主体写入超过此上限时，只淘汰该主体自身
   * 最低优先级的条目，不会波及其他主体的记忆。
   */
  maxEntriesPerObject: z.number().int().positive().default(1000),
  /**
   * 全局最大记忆条数（默认 100000）
   *
   * 跨所有主体的总量上限，作为整体保护阈值；超过时淘汰全局最低优先级条目。
   */
  maxEntriesGlobal: z.number().int().positive().default(100000),
  /** 自定义记忆提取 systemPrompt（可选，覆盖内置默认提示词） */
  systemPrompt: z.string().optional(),
  /** 时间衰减系数（默认 0.95，每次检索乘以此系数调整 recency 权重） */
  recencyDecay: z.number().min(0).max(1).default(0.95),
  /** 是否启用向量检索（默认 true，关闭则仅使用关键词匹配） */
  embeddingEnabled: z.boolean().default(true),
  /** 检索时默认返回数量（默认 10） */
  defaultTopK: z.number().int().positive().default(10),
  /**
   * 候选池倍数（默认 5）
   *
   * 检索时先从向量后端取回 `topK × candidateMultiplier` 条候选，再按 scope / 重要性等
   * 条件在内存中过滤，最后截取 topK。用于修正「向量后端仅返回 topK，随后被 scope 过滤
   * 掉大部分、导致同一主体下特定主题/角色记忆漏召回」的问题：候选池越大，scope 命中越充分。
   *
   * native provider 会对全部候选评分，故此值仅影响向量预取宽度；mem0 provider 无法下推
   * scope，必须依赖更大的候选池才能保证 scope 内记忆被召回。
   */
  candidateMultiplier: z.number().int().positive().default(5),
  /** 写回 / 合并时检索相关记忆的数量（native 与 mem0 共用，默认 20） */
  writebackRelatedTopK: z.number().int().positive().default(20),
})

/** Memory 配置类型 */
export type MemoryConfig = z.infer<typeof MemoryConfigSchema>
// MemoryTypeSchema / MemoryType 定义在 memory/ai-memory-types.ts 中
export { MemoryTypeSchema } from './memory/ai-memory-types.js'
export type { MemoryType } from './memory/ai-memory-types.js'

/**
 * Token 配置 Schema
 *
 * 配置 Token 估算参数。
 *
 * @example
 * ```ts
 * const tokenConfig = { tokenRatio: 0.25 }
 * ```
 */
export const TokenConfigSchema = z.object({
  /** Token 估算每字符系数（默认 0.25，即 4 字符 ≈ 1 token） */
  tokenRatio: z.number().positive().default(0.25),
})

/** Token 配置类型 */
export type TokenConfig = z.infer<typeof TokenConfigSchema>

/**
 * Summary 配置 Schema
 *
 * 配置摘要生成参数。
 * 模型通过 LLMConfigSchema.scenarios.summary 解析，
 * apiKey / baseUrl 统一使用 LLM 配置。
 *
 * @example
 * ```ts
 * const summaryConfig = { systemPrompt: 'You are a summarizer.' }
 * ```
 */
export const SummaryConfigSchema = z.object({
  /** 自定义摘要 systemPrompt（可选，覆盖内置默认提示词） */
  systemPrompt: z.string().optional(),
})

/** Summary 配置类型 */
export type SummaryConfig = z.infer<typeof SummaryConfigSchema>

/**
 * Compress 配置 Schema
 *
 * 配置上下文压缩参数：压缩策略、Token 预算、保留消息数。
 *
 * @example
 * ```ts
 * const compressConfig = {
 *   defaultStrategy: 'hybrid',
 *   defaultMaxTokens: 4000,
 *   preserveLastN: 4,
 * }
 * ```
 */
export const CompressConfigSchema = z.object({
  /** 默认压缩策略（默认 'hybrid'） */
  defaultStrategy: CompressionStrategySchema.default('hybrid'),
  /** 默认 Token 预算（默认 0 表示取模型上限的 80%） */
  defaultMaxTokens: z.number().int().min(0).default(0),
  /** 默认保留最近消息数（默认 4） */
  preserveLastN: z.number().int().min(0).default(4),
})

/** Compress 配置类型 */
export type CompressConfig = z.infer<typeof CompressConfigSchema>

// ─── File 配置 Schema ───

/**
 * File 配置 Schema
 *
 * 配置文件解析参数：OCR 提示词。
 * OCR 使用的视觉模型通过 `llm.scenarios.ocr` 指定。
 */
export const FileConfigSchema = z.object({
  /** OCR 系统提示词（可选，覆盖内置默认提示词） */
  systemPrompt: z.string().optional(),
})

/** File 配置类型 */
export type FileConfig = z.infer<typeof FileConfigSchema>

// ─── Retrieval 配置 Schema ───

/**
 * 检索源配置 Schema
 *
 * 与 `RetrievalSource` 接口字段对齐，支持在 `ai.init()` 中预注册检索源。
 */
export const RetrievalSourceSchema = z.object({
  /** 来源唯一标识 */
  id: z.string(),
  /** vecdb collection 名称 */
  collection: z.string(),
  /** 信源显示名 */
  name: z.string().optional(),
  /** 信源 URL / 路径 */
  url: z.string().optional(),
  /** 最大返回条数（默认 5） */
  topK: z.number().int().positive().optional(),
  /** 最低相似度 0~1（低于此值的结果被过滤） */
  minScore: z.number().min(0).max(1).optional(),
  /** 元数据过滤条件 */
  filter: z.record(z.string(), z.unknown()).optional(),
})

/** 检索源配置类型 */
export type RetrievalSourceConfig = z.infer<typeof RetrievalSourceSchema>

/**
 * Retrieval 配置 Schema
 *
 * 在 `ai.init()` 时预注册检索源，等价于初始化后逐条调用 `ai.retrieval.addSource()`。
 *
 * @example
 * ```ts
 * ai.init({
 *   llm: { apiKey: 'sk-xxx', model: 'gpt-4o-mini' },
 *   retrieval: {
 *     sources: [
 *       { id: 'docs', collection: 'documentation', name: '产品文档', topK: 5, minScore: 0.7 },
 *       { id: 'faq',  collection: 'faq', name: '常见问题' },
 *     ],
 *   },
 * })
 * ```
 */
export const RetrievalConfigSchema = z.object({
  /** 预注册检索源列表 */
  sources: z.array(RetrievalSourceSchema).optional(),
})

/** Retrieval 配置类型 */
export type RetrievalConfig = z.infer<typeof RetrievalConfigSchema>

// ─── A2A 配置 Schema ───

/** A2A Agent Skill 配置 Schema */
export const A2ASkillConfigSchema = z.object({
  /** 技能 ID */
  id: z.string(),
  /** 技能名称 */
  name: z.string(),
  /** 技能描述 */
  description: z.string().optional(),
  /** 标签列表 */
  tags: z.array(z.string()).optional(),
})

/**
 * A2A 配置 Schema
 *
 * 配置 Agent-to-Agent 协议参数：Agent Card、认证等。
 *
 * @example
 * ```ts
 * ai.init({
 *   llm: { apiKey: 'sk-xxx', model: 'gpt-4o-mini' },
 *   a2a: {
 *     agentCard: {
 *       name: 'my-agent',
 *       description: 'An example agent',
 *       url: 'https://example.com',
 *       skills: [{ id: 'chat', name: 'General Chat' }],
 *     },
 *   },
 * })
 * ```
 */
export const A2AConfigSchema = z.object({
  /** Agent Card 配置 */
  agentCard: z.object({
    /** Agent 名称 */
    name: z.string(),
    /** Agent 描述 */
    description: z.string().optional(),
    /** Agent 对外 URL */
    url: z.string(),
    /** Agent 版本 */
    version: z.string().optional(),
    /** Agent 技能列表 */
    skills: z.array(A2ASkillConfigSchema).optional(),
  }),
  /** A2A 安全认证配置 */
  security: z.object({
    /** API Key 认证（通过 IAM apiKey.verifyApiKey 验证） */
    apiKey: z.object({
      /** API Key 的传递位置（默认 header） */
      in: z.enum(['header', 'query']).default('header'),
      /** 参数名（默认 x-api-key） */
      name: z.string().default('x-api-key'),
    }).optional(),
  }).optional(),
})

/** A2A 配置类型 */
export type A2AConfig = z.infer<typeof A2AConfigSchema>

// ─── Audio 配置 Schema ───

/**
 * 语音平台枚举
 *
 * 决定 `ai.audio` 底层调用哪个厂商（对使用方透明，公共请求/响应形状保持一致）：
 *
 * - `openai` — OpenAI Audio API（transcriptions / speech）
 * - `mimo` — 小米 MiMo（Chat Completions 风格 ASR / TTS）
 * - `qwen` — 阿里云百炼 Qwen Realtime（DashScope WebSocket ASR / TTS）
 * - `doubao` — 火山引擎豆包语音（二进制 WebSocket ASR / TTS）
 */
export const AudioProviderSchema = z.enum(['openai', 'mimo', 'qwen', 'doubao'])

/** 语音平台类型 */
export type AudioProviderName = z.infer<typeof AudioProviderSchema>

/**
 * 语音模型条目 Schema
 *
 * 定义单个语音模型：唯一 ID、所属平台、厂商模型名及凭据。凭据未提供时回退到对应平台的环境变量。
 *
 * @example
 * ```ts
 * const model = { id: 'asr', provider: 'qwen', model: 'qwen3-asr-flash-realtime', operations: ['transcribe'] }
 * ```
 */
export const AudioModelEntrySchema = z.object({
  /** 模型唯一标识（用于场景解析与请求显式指定） */
  id: z.string(),
  /** 所属语音平台 */
  provider: AudioProviderSchema,
  /** 厂商模型名（传给厂商 API 的实际模型名） */
  model: z.string(),
  /** 模型允许执行的操作；解析模型时会在调用厂商前校验 */
  operations: z.union([
    z.tuple([z.literal('transcribe')]),
    z.tuple([z.literal('synthesize')]),
    z.tuple([z.literal('transcribe'), z.literal('synthesize')]),
  ]),
  /** API Key 覆盖（未提供时回退对应平台环境变量） */
  apiKey: z.string().optional(),
  /** HTTP / WebSocket 端点覆盖（未提供时使用平台默认端点） */
  baseUrl: z.string().optional(),
  /** 火山引擎 App Key（`X-Api-App-Key`，旧版控制台 ASR 需要） */
  appKey: z.string().optional(),
  /** 火山引擎 Access Key（`X-Api-Access-Key`，旧版控制台 ASR 需要） */
  accessKey: z.string().optional(),
  /** 火山引擎资源 ID（`X-Api-Resource-Id`；未提供时使用平台默认资源 ID） */
  resourceId: z.string().optional(),
  /** 阿里云百炼业务空间 ID（`X-DashScope-WorkSpace`，可选） */
  workspaceId: z.string().optional(),
  /** 请求超时（毫秒，默认 60000） */
  timeout: z.number().positive().optional(),
})

/** 语音模型条目类型 */
export type AudioModelEntry = z.infer<typeof AudioModelEntrySchema>

/**
 * Audio 配置 Schema
 *
 * 注册语音模型并映射默认识别 / 合成模型。调用方通常无需指定模型，仅在临时切换时通过 `request.model` 覆盖。
 *
 * @example
 * ```ts
 * ai.init({
 *   audio: {
 *     models: [
 *       { id: 'asr', provider: 'qwen', model: 'qwen3-asr-flash-realtime', operations: ['transcribe'] },
 *       { id: 'tts', provider: 'qwen', model: 'qwen3-tts-flash-realtime', operations: ['synthesize'] },
 *     ],
 *     transcribeModel: 'asr',
 *     synthesizeModel: 'tts',
 *   },
 * })
 * ```
 */
export const AudioConfigSchema = z.object({
  /** 注册的语音模型列表 */
  models: z.array(AudioModelEntrySchema).optional(),
  /** 默认识别模型 ID（`ai.audio.transcribe*` 未指定 model 时使用） */
  transcribeModel: z.string().optional(),
  /** 默认合成模型 ID（`ai.audio.synthesize*` 未指定 model 时使用） */
  synthesizeModel: z.string().optional(),
  /** 单次音频字节上限（默认 10 MiB，防止资源耗尽） */
  maxAudioBytes: z.number().int().positive().default(10 * 1024 * 1024),
  /** 实时连接最长持续时间（毫秒，默认 5 分钟） */
  maxStreamDurationMs: z.number().int().positive().default(5 * 60 * 1000),
})

/** Audio 配置类型 */
export type AudioConfig = z.infer<typeof AudioConfigSchema>

/**
 * 已解析的语音模型配置
 *
 * 由 `resolveAudioModel()` 返回，凭据已合并环境变量、端点已应用平台默认值。
 */
export interface ResolvedAudioModel {
  /** 模型条目 ID */
  id: string
  /** 所属平台 */
  provider: AudioProviderName
  /** 厂商模型名 */
  model: string
  /** API Key（条目 > 平台环境变量） */
  apiKey: string | undefined
  /** 端点（条目 > 平台默认） */
  baseUrl: string
  /** 火山引擎 App Key */
  appKey: string | undefined
  /** 火山引擎 Access Key */
  accessKey: string | undefined
  /** 火山引擎资源 ID（条目 > 平台默认） */
  resourceId: string
  /** 阿里云百炼业务空间 ID */
  workspaceId: string | undefined
  /** 请求超时（毫秒） */
  timeout: number
}

/** 各平台默认端点 */
const AUDIO_PROVIDER_DEFAULT_BASE_URL: Record<AudioProviderName, string> = {
  openai: 'https://api.openai.com/v1',
  mimo: 'https://api.xiaomimimo.com/v1',
  qwen: 'wss://dashscope.aliyuncs.com/api-ws/v1/realtime',
  doubao: 'wss://openspeech.bytedance.com',
}

/** 火山引擎默认资源 ID（按操作类型区分 ASR / TTS） */
function doubaoDefaultResourceId(operation: 'transcribe' | 'synthesize'): string {
  return operation === 'transcribe' ? 'volc.bigasr.sauc.duration' : 'seed-tts-2.0'
}

/** 读取指定平台的 API Key 环境变量（凭据未在配置中提供时的回退） */
function audioProviderEnvApiKey(provider: AudioProviderName): string | undefined {
  switch (provider) {
    case 'openai':
      return process.env.HAI_AI_AUDIO_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY
    case 'mimo':
      return process.env.HAI_AI_AUDIO_MIMO_API_KEY ?? process.env.MIMO_API_KEY
    case 'qwen':
      return process.env.HAI_AI_AUDIO_QWEN_API_KEY ?? process.env.DASHSCOPE_API_KEY
    case 'doubao':
      return process.env.HAI_AI_AUDIO_DOUBAO_API_KEY ?? process.env.VOLC_API_KEY
  }
}

/**
 * 解析语音操作应使用的模型配置
 *
 * 解析优先级：请求显式 `model` > 场景默认（transcribe/synthesize）；凭据回退到平台环境变量。
 *
 * @param audioConfig - Audio 配置
 * @param operation - 操作类型（识别 / 合成），决定使用哪个默认模型
 * @param explicit - 请求显式指定的模型 ID（最高优先级）
 * @returns 成功返回已解析模型；无匹配模型返回 `AUDIO_MODEL_NOT_FOUND`；缺少凭据返回 `CONFIGURATION_ERROR`
 */
export function resolveAudioModel(
  audioConfig: AudioConfig,
  operation: 'transcribe' | 'synthesize',
  explicit?: string,
): HaiResult<ResolvedAudioModel> {
  const targetId = explicit ?? (operation === 'transcribe' ? audioConfig.transcribeModel : audioConfig.synthesizeModel)
  if (!targetId)
    return err(HaiAIError.AUDIO_MODEL_NOT_FOUND, aiM('ai_audioModelNotFound', { params: { model: `<${operation}>` } }))

  const entry = audioConfig.models?.find(m => m.id === targetId || m.model === targetId)
  if (!entry)
    return err(HaiAIError.AUDIO_MODEL_NOT_FOUND, aiM('ai_audioModelNotFound', { params: { model: targetId } }))

  const operations: readonly string[] = entry.operations
  if (!operations.includes(operation)) {
    return err(
      HaiAIError.AUDIO_UNSUPPORTED_INPUT,
      aiM('ai_audioUnsupportedInput', { params: { provider: entry.provider, reason: `model ${entry.id} does not support ${operation}` } }),
    )
  }

  const apiKey = entry.apiKey ?? audioProviderEnvApiKey(entry.provider)
  const hasDoubaoLegacy = Boolean(entry.appKey && entry.accessKey)
  if (!apiKey && !(entry.provider === 'doubao' && hasDoubaoLegacy))
    return err(HaiAIError.CONFIGURATION_ERROR, aiM('ai_audioMissingApiKey', { params: { provider: entry.provider } }))

  return ok({
    id: entry.id,
    provider: entry.provider,
    model: entry.model,
    apiKey,
    baseUrl: entry.baseUrl ?? AUDIO_PROVIDER_DEFAULT_BASE_URL[entry.provider],
    appKey: entry.appKey ?? process.env.VOLC_APP_KEY,
    accessKey: entry.accessKey ?? process.env.VOLC_ACCESS_KEY,
    resourceId: entry.resourceId ?? (entry.provider === 'doubao' ? doubaoDefaultResourceId(operation) : ''),
    workspaceId: entry.workspaceId,
    timeout: entry.timeout ?? 60000,
  })
}

// ─── Image 配置 Schema ───

/**
 * 文生图平台枚举
 *
 * - `openai` — OpenAI GPT Image（Image API）
 * - `google` — Google Gemini Image / Nano Banana（Generate Content API）
 * - `qwen` — 阿里云百炼 Qwen-Image 2.0 / 3.0
 * - `seedream` — 火山方舟 Seedream 4.x / 5.x
 * - `pollinations` — Pollinations 免费额度图片 API
 */
export const ImageProviderSchema = z.enum(['openai', 'google', 'qwen', 'seedream', 'pollinations'])

/** 文生图平台类型 */
export type ImageProviderName = z.infer<typeof ImageProviderSchema>

/** 文生图模型条目 Schema */
export const ImageModelEntrySchema = z.object({
  /** 模型唯一标识（供请求选择） */
  id: z.string(),
  /** 所属文生图平台 */
  provider: ImageProviderSchema,
  /** 厂商模型名 */
  model: z.string(),
  /** API Key 覆盖；未提供时回退厂商环境变量 */
  apiKey: z.string().optional(),
  /** API 基础 URL 覆盖 */
  baseUrl: z.url().optional(),
  /** 阿里云百炼业务空间 ID（可选） */
  workspaceId: z.string().optional(),
  /** 请求超时（毫秒，默认 120000） */
  timeout: z.number().int().positive().default(120000),
})

/** 文生图模型条目类型 */
export type ImageModelEntry = z.infer<typeof ImageModelEntrySchema>

/** 文生图配置 Schema */
export const ImageConfigSchema = z.object({
  /** 注册的文生图模型 */
  models: z.array(ImageModelEntrySchema).optional(),
  /** 默认文生图模型 ID */
  generateModel: z.string().optional(),
})

/** 文生图配置类型 */
export type ImageConfig = z.infer<typeof ImageConfigSchema>

/** 已解析的文生图模型 */
export interface ResolvedImageModel {
  id: string
  provider: ImageProviderName
  model: string
  apiKey: string
  baseUrl: string
  workspaceId?: string
  timeout: number
}

const IMAGE_PROVIDER_DEFAULT_BASE_URL: Record<ImageProviderName, string> = {
  openai: 'https://api.openai.com/v1',
  google: 'https://generativelanguage.googleapis.com',
  qwen: 'https://dashscope.aliyuncs.com/api/v1',
  seedream: 'https://ark.cn-beijing.volces.com/api/v3',
  pollinations: 'https://gen.pollinations.ai',
}

function imageProviderEnvApiKey(provider: ImageProviderName): string | undefined {
  switch (provider) {
    case 'openai':
      return process.env.HAI_AI_IMAGE_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY
    case 'google':
      return process.env.HAI_AI_IMAGE_GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY
    case 'qwen':
      return process.env.HAI_AI_IMAGE_QWEN_API_KEY ?? process.env.DASHSCOPE_API_KEY
    case 'seedream':
      return process.env.HAI_AI_IMAGE_SEEDREAM_API_KEY ?? process.env.ARK_API_KEY ?? process.env.VOLC_API_KEY
    case 'pollinations':
      return process.env.HAI_AI_IMAGE_POLLINATIONS_API_KEY ?? process.env.POLLINATIONS_API_KEY
  }
}

/**
 * 解析文生图模型配置
 *
 * @param imageConfig - 文生图配置
 * @param explicit - 请求显式模型 ID 或厂商模型名
 * @returns 已解析模型；模型或凭据缺失时返回 HaiResult 错误
 */
export function resolveImageModel(imageConfig: ImageConfig, explicit?: string): HaiResult<ResolvedImageModel> {
  const target = explicit ?? imageConfig.generateModel
  if (!target)
    return err(HaiAIError.IMAGE_MODEL_NOT_FOUND, aiM('ai_imageModelNotFound', { params: { model: '<generate>' } }))
  const entry = imageConfig.models?.find(model => model.id === target || model.model === target)
  if (!entry)
    return err(HaiAIError.IMAGE_MODEL_NOT_FOUND, aiM('ai_imageModelNotFound', { params: { model: target } }))
  const apiKey = entry.apiKey ?? imageProviderEnvApiKey(entry.provider)
  if (!apiKey)
    return err(HaiAIError.CONFIGURATION_ERROR, aiM('ai_imageMissingApiKey', { params: { provider: entry.provider } }))
  return ok({
    id: entry.id,
    provider: entry.provider,
    model: entry.model,
    apiKey,
    baseUrl: (entry.baseUrl ?? IMAGE_PROVIDER_DEFAULT_BASE_URL[entry.provider]).replace(/\/+$/, ''),
    workspaceId: entry.workspaceId,
    timeout: entry.timeout,
  })
}

/**
 * AI 配置 Schema
 *
 * 统一 AI 模块配置：LLM、MCP、Embedding、Knowledge、Retrieval、Memory、Token、Summary、Compress、File。
 * 模型通过 LLM.scenarios 映射场景，子系统不再独立配置 apiKey / baseUrl / model。
 *
 * @example
 * ```ts
 * ai.init({
 *   llm: {
 *     apiKey: 'sk-xxx',
 *     model: 'gpt-4o-mini',
 *     maxTokens: 4096,
 *     models: [
 *       { id: 'rerank', model: 'rerank-english-v3.0', baseUrl: 'https://api.cohere.com' },
 *     ],
 *     scenarios: {
 *       extraction: 'gpt-4o',
 *       summary: 'gpt-4o-mini',
 *       embedding: 'text-embedding-3-small',
 *       rerank: 'rerank',
 *       ocr: 'gpt-4o',
 *     },
 *   },
 *   embedding: { dimensions: 1536 },
 *   knowledge: {
 *     collection: 'docs',
 *     enableEntityExtraction: true,
 *     cleanOptions: { removeHtml: true },
 *     chunkOptions: { mode: 'markdown', maxSize: 1500, overlap: 200 },
 *   },
 *   retrieval: {
 *     sources: [
 *       { id: 'docs', collection: 'documentation', name: '产品文档', topK: 5, minScore: 0.7 },
 *     ],
 *   },
 *   memory: { maxEntriesPerObject: 500, embeddingEnabled: true },
 *   token: { tokenRatio: 0.25 },
 *   summary: { systemPrompt: 'You are a summarizer.' },
 *   compress: { defaultStrategy: 'hybrid', preserveLastN: 4 },
 * })
 * ```
 */
export const AIConfigSchema = z.object({
  /** LLM 配置（可选，所有字段有默认值） */
  llm: LLMConfigSchema.default({
    model: 'gpt-4o-mini',
    api: 'chat',
    maxTokens: 4096,
    temperature: 0.7,
    timeout: 60000,
    tempModelCacheTtl: 600000,
  }),
  /** MCP 配置 */
  mcp: MCPConfigSchema.optional(),
  /** Embedding 配置 */
  embedding: EmbeddingConfigSchema.optional(),
  /** Knowledge 配置 */
  knowledge: KnowledgeConfigSchema.optional(),
  /** Memory 配置 */
  memory: MemoryConfigSchema.optional(),
  /** Token 配置 */
  token: TokenConfigSchema.optional(),
  /** Summary 配置 */
  summary: SummaryConfigSchema.optional(),
  /** Compress 配置 */
  compress: CompressConfigSchema.optional(),
  /** Retrieval 配置（预注册检索源） */
  retrieval: RetrievalConfigSchema.optional(),
  /** File 解析配置 */
  file: FileConfigSchema.optional(),
  /** A2A 配置（Agent-to-Agent 协议） */
  a2a: A2AConfigSchema.optional(),
  /** Audio 配置（语音识别 / 语音合成） */
  audio: AudioConfigSchema.optional(),
  /** Image 配置（文生图） */
  image: ImageConfigSchema.optional(),
})

/** AI 配置类型（校验后的完整类型） */
export type AIConfig = z.infer<typeof AIConfigSchema>

/** AI 配置输入类型（允许部分字段） */
export type AIConfigInput = z.input<typeof AIConfigSchema>
