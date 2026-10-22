/**
 * @h-ai/ai — Knowledge 子功能类型
 *
 * 定义知识库操作的类型接口：文档导入、实体索引、信源追踪检索。
 * @module ai-knowledge-types
 */

import type { HaiError, HaiResult } from '@h-ai/core'
import type { ChunkOptionsInput, CleanOptionsInput } from '@h-ai/datapipe'

import type { ChatMessage } from '../llm/ai-llm-types.js'
import type { Citation } from '../retrieval/ai-retrieval-types.js'

import { z } from 'zod'

// ─── 实体类型枚举 ───

/**
 * 内置实体类型枚举（预设值，可通过配置 `entityTypes` 扩展）
 *
 * @example
 * ```ts
 * import { EntityTypeSchema } from '@h-ai/ai'
 * const parsed = EntityTypeSchema.safeParse('project')
 * if (!parsed.success) throw parsed.error
 * const builtIn = parsed.data
 * ```
 */
export const EntityTypeSchema = z.enum(['person', 'project', 'concept', 'organization', 'location', 'event', 'other'])

/**
 * 实体类型（字符串，支持内置类型及用户自定义类型）
 *
 * @example
 * ```ts
 * import type { EntityType } from '@h-ai/ai'
 * const value: EntityType = 'product'
 * const output = value.toLowerCase()
 * ```
 */
export type EntityType = string

// ─── 实体 ───

/**
 * 知识实体
 *
 * 表示从文档中提取的命名实体（人名、项目名、概念等），
 * 存储在 KnowledgeStore 中用于倒排索引查询。
 *
 * @example
 * ```ts
 * import type { KnowledgeEntity } from '@h-ai/ai'
 * const value: KnowledgeEntity = { id: 'entity-1', name: 'HAI', type: 'project', aliases: ['hai-framework'] }
 * const output = [value.name, ...(value.aliases ?? [])].join(', ')
 * ```
 */
export interface KnowledgeEntity {
  /** 实体唯一标识 */
  id: string
  /** 实体名称 */
  name: string
  /** 实体类型 */
  type: EntityType
  /** 别名列表（可选） */
  aliases?: string[]
  /** 描述（可选） */
  description?: string
  /** 创建时间 */
  createdAt?: string
  /** 更新时间 */
  updatedAt?: string
}

/**
 * 文档-实体关联记录
 *
 * 倒排索引中的一条记录，记录实体与文档/分块的关联关系。
 *
 * @example
 * ```ts
 * import type { EntityDocumentRelation } from '@h-ai/ai'
 * const value: EntityDocumentRelation = { entityId: 'entity-1', documentId: 'guide', chunkId: 'guide-1', collection: 'docs', relevance: 1 }
 * const output = `${value.collection}/${value.documentId}`
 * ```
 */
export interface EntityDocumentRelation {
  /** 实体 ID */
  entityId: string
  /** 文档 ID（对应向量存储中的 documentId） */
  documentId: string
  /** 分块 ID（对应向量存储中的向量记录 ID） */
  chunkId?: string
  /** 集合名 */
  collection: string
  /** 关联强度 [0, 1]（默认 1.0） */
  relevance?: number
  /** 实体在该文档中的上下文片段（可选） */
  context?: string
  /** 创建时间 */
  createdAt?: string
}

// ─── 知识库操作输入/输出 ───

/**
 * 知识库初始化选项
 *
 * @example
 * ```ts
 * import { ai, type KnowledgeSetupOptions } from '@h-ai/ai'
 * // 应用启动已成功初始化 ai，且目标知识集合已 setup。
 * async function run(options: KnowledgeSetupOptions) {
 *   const result = await ai.knowledge.setup(options)
 *   if (!result.success) throw new Error(result.error.message)
 *   return result.data
 * }
 * ```
 */
export interface KnowledgeSetupOptions {
  /** 集合名（可选，默认使用配置中的 collection） */
  collection?: string
  /** 向量维度（可选，默认使用配置中的 dimension） */
  dimension?: number
}

/**
 * 文档导入输入
 *
 * @example
 * ```ts
 * import { ai, type KnowledgeIngestInput } from '@h-ai/ai'
 * // 应用启动已成功初始化 ai，且目标知识集合已 setup。
 * async function run(options: KnowledgeIngestInput) {
 *   const result = await ai.knowledge.ingest(options)
 *   if (!result.success) throw new Error(result.error.message)
 *   return result.data
 * }
 * ```
 */
export interface KnowledgeIngestInput {
  /** 文档唯一标识（必填，用于关联信源和实体） */
  documentId: string
  /** 文档原始内容文本 */
  content: string
  /** 文档标题（可选，存入 metadata 用于信源展示） */
  title?: string
  /** 文档 URL / 路径（可选，存入 metadata 用于信源展示） */
  url?: string
  /** 集合名（可选，默认使用配置中的 collection） */
  collection?: string
  /** 附加元数据（可选，合并到每个 chunk 的 metadata 中） */
  metadata?: Record<string, unknown>
  /** 是否启用实体提取（可选，覆盖全局配置） */
  enableEntityExtraction?: boolean
  /**
   * 文本清洗选项（可选，覆盖全局配置默认值）
   *
   * 字段含义与 @h-ai/datapipe CleanOptionsInput 完全一致，
   * 支持 removeHtml、removeUrls、normalizeWhitespace、customReplacements 等。
   */
  cleanOptions?: CleanOptionsInput
  /**
   * 分块选项（可选，覆盖全局配置默认值）
   *
   * 字段含义与 @h-ai/datapipe ChunkOptionsInput 完全一致，
   * 支持 mode、maxSize、overlap、separator、markdownMinLevel 等完整选项。
   */
  chunkOptions?: ChunkOptionsInput
}

/**
 * 文档导入结果
 *
 * @example
 * ```ts
 * import type { KnowledgeIngestResult, KnowledgeOperations } from '@h-ai/ai'
 * async function reconcile(knowledge: KnowledgeOperations, value: KnowledgeIngestResult) {
 *   if (!value.cleanupPending) return value.revision
 *   let offset = 0
 *   while (true) {
 *     const repaired = await knowledge.repair({ offset, limit: 100 })
 *     if (!repaired.success) throw new Error(repaired.error.message)
 *     offset += repaired.data.processed
 *     if (offset >= repaired.data.total || repaired.data.processed === 0) break
 *   }
 *   return value.revision
 * }
 * ```
 */
export interface KnowledgeIngestResult {
  /** 文档 ID */
  documentId: string
  /** 已完整发布的唯一文档版本；分块 ID 也包含此版本。 */
  revision: string
  /** 新版本已可见，但旧向量删除失败；调用 repair 重试，不能忽略此标志。 */
  cleanupPending: boolean
  /** 生成的分块数量 */
  chunkCount: number
  /** 提取的实体列表（未启用实体提取时为空数组） */
  entities: KnowledgeEntity[]
  /** 处理耗时（毫秒） */
  duration: number
}

/**
 * 分页恢复暂存和向量清理；删除集合后也允许调用。
 *
 * @example
 * ```ts
 * import { ai, type KnowledgeRepairOptions } from '@h-ai/ai'
 * // 应用启动已成功初始化 ai，且目标知识集合已 setup。
 * async function run(options: KnowledgeRepairOptions) {
 *   const result = await ai.knowledge.repair(options)
 *   if (!result.success) throw new Error(result.error.message)
 *   return result.data
 * }
 * ```
 */
export interface KnowledgeRepairOptions {
  /** 集合名，默认使用 knowledge.collection。 */
  collection?: string
  /** 清单偏移，包含已删除文档的墓碑，默认 0。 */
  offset?: number
  /** 本页最多检查 1–1000 份清单，默认 100。 */
  limit?: number
}

/**
 * 本页补偿扫描进度；失败以 HaiResult 返回，补偿记录仍保留。
 *
 * @example
 * ```ts
 * import type { KnowledgeRepairResult } from '@h-ai/ai'
 * const value: KnowledgeRepairResult = { processed: 50, total: 120 }
 * const output = value.processed < value.total
 * ```
 */
export interface KnowledgeRepairResult {
  /** 本页检查的清单数量。 */
  processed: number
  /** 集合内清单总数，包含永久补偿墓碑。 */
  total: number
}

/**
 * 知识检索选项
 *
 * @example
 * ```ts
 * import { ai, type KnowledgeRetrieveOptions } from '@h-ai/ai'
 * // 应用启动已成功初始化 ai，且目标知识集合已 setup。
 * async function run(options: KnowledgeRetrieveOptions) {
 *   const result = await ai.knowledge.retrieve('部署要求', options)
 *   if (!result.success) throw new Error(result.error.message)
 *   return result.data
 * }
 * ```
 */
export interface KnowledgeRetrieveOptions {
  /** 集合名（可选，默认使用配置中的 collection） */
  collection?: string
  /** 返回的最大结果数（默认 10） */
  topK?: number
  /** 最低相似度（默认无限制） */
  minScore?: number
  /** 是否启用实体增强检索（默认 true） */
  enableEntityBoost?: boolean
  /**
   * 透传给向量 Provider 的元数据过滤条件；LanceDB 仅支持顶层 string/有限 number/boolean/null 的 AND 匹配，null 不匹配缺失字段。
   * 对象、数组及 undefined 不受 LanceDB 支持，过滤失败返回 KNOWLEDGE_RETRIEVE_FAILED；其它后端语义须单独核对。
   */
  filter?: Record<string, unknown>
}

/**
 * 知识检索结果项
 *
 * @example
 * ```ts
 * import type { KnowledgeRetrieveItem } from '@h-ai/ai'
 * const value: KnowledgeRetrieveItem = { id: 'chunk-1', content: '共享数据库', score: 0.9, citation: { documentId: 'guide', chunkId: 'chunk-1' }, matchedEntities: ['HAI'] }
 * const output = value.citation.documentId
 * ```
 */
export interface KnowledgeRetrieveItem {
  /** 分块 ID */
  id: string
  /** 分块内容 */
  content: string
  /** 综合得分（向量相似度 + 实体加权） */
  score: number
  /** 结构化信源引用 */
  citation: Citation
  /** 元数据 */
  metadata?: Record<string, unknown>
  /** 命中的实体名称列表（实体增强检索时填充） */
  matchedEntities?: string[]
}

/**
 * 知识检索结果
 *
 * @example
 * ```ts
 * import type { KnowledgeRetrieveResult } from '@h-ai/ai'
 * const value: KnowledgeRetrieveResult = { items: [], citations: [], query: '部署要求', duration: 12 }
 * const output = value.items.map(item => item.content)
 * ```
 */
export interface KnowledgeRetrieveResult {
  /** 检索结果列表（按综合分数降序） */
  items: KnowledgeRetrieveItem[]
  /** 去重后的信源引用列表 */
  citations: Citation[]
  /** 查询文本 */
  query: string
  /** 查询耗时（毫秒） */
  duration: number
}

/**
 * 知识问答选项
 *
 * @example
 * ```ts
 * import { ai, type KnowledgeAskOptions } from '@h-ai/ai'
 * // 应用启动已成功初始化 ai，且目标知识集合已 setup。
 * async function run(options: KnowledgeAskOptions) {
 *   const result = await ai.knowledge.ask('如何部署？', options)
 *   if (!result.success) throw new Error(result.error.message)
 *   return result.data
 * }
 * ```
 */
export interface KnowledgeAskOptions extends KnowledgeRetrieveOptions {
  /** LLM 模型名称覆盖 */
  model?: string
  /** 系统提示词覆盖 */
  systemPrompt?: string
  /** 温度覆盖 */
  temperature?: number
  /** 消息历史（多轮对话） */
  messages?: ChatMessage[]
}

/**
 * 知识问答结果
 *
 * @example
 * ```ts
 * import type { KnowledgeAskResult } from '@h-ai/ai'
 * const value: KnowledgeAskResult = { answer: '使用共享数据库', context: [], citations: [], query: '部署要求', model: 'configured-model' }
 * const output = value.answer
 * ```
 */
export interface KnowledgeAskResult {
  /** LLM 生成的回答 */
  answer: string
  /** 使用的上下文 */
  context: KnowledgeRetrieveItem[]
  /** 去重后的信源引用列表 */
  citations: Citation[]
  /** 查询文本 */
  query: string
  /** 使用的模型 */
  model: string
  /** Token 使用统计 */
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

/**
 * 实体查询选项
 *
 * @example
 * ```ts
 * import { ai, type EntityQueryOptions } from '@h-ai/ai'
 * // 应用启动已成功初始化 ai，且目标知识集合已 setup。
 * async function run(options: EntityQueryOptions) {
 *   const result = await ai.knowledge.findByEntity('HAI', options)
 *   if (!result.success) throw new Error(result.error.message)
 *   return result.data
 * }
 * ```
 */
export interface EntityQueryOptions {
  /** 集合名（可选，默认使用配置中的 collection） */
  collection?: string
  /** 实体类型过滤 */
  type?: EntityType
}

/**
 * 实体关联文档结果
 *
 * @example
 * ```ts
 * import type { EntityDocumentResult } from '@h-ai/ai'
 * const value: EntityDocumentResult = { entity: { id: 'entity-1', name: 'HAI', type: 'project' }, documents: [{ documentId: 'guide', collection: 'docs', relevance: 1 }] }
 * const output = value.documents.map(document => document.documentId)
 * ```
 */
export interface EntityDocumentResult {
  /** 实体信息 */
  entity: KnowledgeEntity
  /** 关联文档列表 */
  documents: Array<{
    documentId: string
    chunkId?: string
    collection: string
    relevance: number
    context?: string
  }>
}

/**
 * 实体列表查询选项
 *
 * @example
 * ```ts
 * import { ai, type EntityListOptions } from '@h-ai/ai'
 * // 应用启动已成功初始化 ai，且目标知识集合已 setup。
 * async function run(options: EntityListOptions) {
 *   const result = await ai.knowledge.listEntities(options)
 *   if (!result.success) throw new Error(result.error.message)
 *   return result.data
 * }
 * ```
 */
export interface EntityListOptions {
  /** 集合名过滤（不指定则返回所有 collection 的实体） */
  collection?: string
  /** 实体类型过滤 */
  type?: EntityType
  /** 关键词搜索（模糊匹配实体名称和别名） */
  keyword?: string
  /** 最大返回数 */
  limit?: number
}

// ─── 文件导入类型 ───

/**
 * 文件导入输入（从文件路径读取内容后自动 ingest）
 *
 * 仅 Node.js 端可用。
 *
 * @example
 * ```ts
 * import { ai, type KnowledgeIngestFileInput } from '@h-ai/ai'
 * // 应用启动已成功初始化 ai，且目标知识集合已 setup。
 * async function run(options: KnowledgeIngestFileInput) {
 *   const result = await ai.knowledge.ingestFile(options)
 *   if (!result.success) throw new Error(result.error.message)
 *   return result.data
 * }
 * ```
 */
export interface KnowledgeIngestFileInput {
  /** 文件路径（绝对路径或相对路径） */
  filePath: string
  /** 文档唯一标识（可选，默认从文件名派生） */
  documentId?: string
  /** 文档标题（可选，默认为文件名） */
  title?: string
  /** 文件编码（默认 'utf-8'） */
  encoding?: BufferEncoding
  /** 集合名（可选，默认使用配置中的 collection） */
  collection?: string
  /** 附加元数据 */
  metadata?: Record<string, unknown>
  /** 是否启用实体提取 */
  enableEntityExtraction?: boolean
  /** 清洗选项 */
  cleanOptions?: CleanOptionsInput
  /** 分块选项 */
  chunkOptions?: ChunkOptionsInput
}

// ─── 文档管理类型 ───

/**
 * 文档信息（列表展示用）
 *
 * @example
 * ```ts
 * import type { KnowledgeDocumentInfo } from '@h-ai/ai'
 * const value: KnowledgeDocumentInfo = { documentId: 'guide', revision: 'revision-1', title: '指南', chunkCount: 2, entityCount: 1, createdAt: Date.now() }
 * const output = `${value.title}: ${value.chunkCount}`
 * ```
 */
export interface KnowledgeDocumentInfo {
  /** 当前完整发布版本。 */
  revision: string
  /** 文档 ID */
  documentId: string
  /** 文档标题 */
  title?: string
  /** 文档来源 URL / 路径 */
  url?: string
  /** 分块数量 */
  chunkCount: number
  /** 关联实体数 */
  entityCount: number
  /** 创建时间（Unix 毫秒） */
  createdAt: number
}

/**
 * 文档列表查询选项
 *
 * @example
 * ```ts
 * import { ai, type KnowledgeDocumentListOptions } from '@h-ai/ai'
 * // 应用启动已成功初始化 ai，且目标知识集合已 setup。
 * async function run(options: KnowledgeDocumentListOptions) {
 *   const result = await ai.knowledge.listDocuments(options)
 *   if (!result.success) throw new Error(result.error.message)
 *   return result.data
 * }
 * ```
 */
export interface KnowledgeDocumentListOptions {
  /** 集合名覆盖（不指定则使用配置中的 default） */
  collection?: string
  /** 偏移量 */
  offset?: number
  /** 每页数量（默认 20） */
  limit?: number
}

/**
 * 文档删除选项
 *
 * @example
 * ```ts
 * import { ai, type KnowledgeDocumentRemoveOptions } from '@h-ai/ai'
 * // 应用启动已成功初始化 ai，且目标知识集合已 setup。
 * async function run(options: KnowledgeDocumentRemoveOptions) {
 *   const result = await ai.knowledge.removeDocument('guide', options)
 *   if (!result.success) throw new Error(result.error.message)
 *   return result.data
 * }
 * ```
 */
export interface KnowledgeDocumentRemoveOptions {
  /** 集合名覆盖 */
  collection?: string
}

// ─── 批量导入类型 ───

/**
 * 批量导入进度回调参数
 *
 * @example
 * ```ts
 * import type { KnowledgeIngestBatchProgress } from '@h-ai/ai'
 * function progress(value: KnowledgeIngestBatchProgress): string {
 *   if (value.error) return `${value.currentDocumentId}: ${value.error.message}`
 *   return `${value.completed}/${value.total}`
 * }
 * ```
 */
export interface KnowledgeIngestBatchProgress {
  /** 已完成数量 */
  completed: number
  /** 总数量 */
  total: number
  /** 当前文档 ID */
  currentDocumentId: string
  /** 当前文档导入结果（失败时为 undefined） */
  result?: KnowledgeIngestResult
  /** 当前文档导入错误（成功时为 undefined） */
  error?: HaiError
}

/**
 * 批量导入结果
 *
 * @example
 * ```ts
 * import type { KnowledgeIngestBatchResult } from '@h-ai/ai'
 * function failedDocuments(value: KnowledgeIngestBatchResult): string[] {
 *   return value.results.filter(item => item.error !== undefined).map(item => item.documentId)
 * }
 * ```
 */
export interface KnowledgeIngestBatchResult {
  /** 成功导入的文档数 */
  successCount: number
  /** 失败的文档数 */
  failureCount: number
  /** 各文档导入结果 */
  results: Array<{ documentId: string, result?: KnowledgeIngestResult, error?: HaiError }>
  /** 总耗时（毫秒） */
  duration: number
}

// ─── Knowledge 操作接口 ───

/**
 * Knowledge 操作接口（通过 `ai.knowledge` 访问）。
 *
 * 每个 collection 使用前须独立 setup。导入以版本清单原子发布；成功中的 cleanupPending
 * 表示仍需分页 repair 清理旧向量，不能把补偿失败视作已清理。业务授权由调用层按主体执行。
 *
 * @example
 * ```ts
 * import { ai } from '@h-ai/ai'
 * // 应用启动已成功初始化 ai。每个逻辑集合先单独 setup。
 * const ready = await ai.knowledge.setup({ collection: 'docs' })
 * if (!ready.success) throw new Error(ready.error.message)
 * const published = await ai.knowledge.ingest({ collection: 'docs', documentId: 'guide', content: '# 部署指南\n使用共享数据库。' })
 * if (!published.success) throw new Error(published.error.message)
 * if (published.data.cleanupPending) {
 *   // 生产维护任务须按 processed/total 分页扫描，失败保留清单供重试。
 *   const repaired = await ai.knowledge.repair({ collection: 'docs', offset: 0, limit: 100 })
 *   if (!repaired.success) throw new Error(repaired.error.message)
 * }
 * const answer = await ai.knowledge.ask('部署需要什么？', { collection: 'docs' })
 * if (!answer.success) throw new Error(answer.error.message)
 * ```
 */
export interface KnowledgeOperations {
  /**
   * 初始化知识库（幂等，支持多次调用以初始化不同 collection）
   *
   * 创建向量集合和文档版本清单。每个 collection 需独立调用本方法，
   * 未 setup 的 collection 执行以下操作时均会返回 `KNOWLEDGE_NOT_SETUP` 错误：
   * `ingest` / `ingestFile` / `ingestBatch` / `retrieve` / `ask` /
   * `findByEntity` / `listDocuments` / `removeDocument`。
   *
   * @param options - 初始化选项（collection 名称、向量维度）
   * @returns 成功返回 ok(undefined)
   */
  setup: (options?: KnowledgeSetupOptions) => Promise<HaiResult<void>>

  /**
   * 导入文档
   *
   * 执行流程：clean → chunk → embed/实体准备 → 持久暂存 → 写入向量 → CAS 发布完整版本。
   * 成功包含 revision 与 cleanupPending；旧数据清理失败时检查标志并安排 repair。
   *
   * @param input - 文档导入输入
   * @returns 导入结果（分块数、实体列表等）
   */
  ingest: (input: KnowledgeIngestInput) => Promise<HaiResult<KnowledgeIngestResult>>

  /**
   * 知识检索（带实体增强 + 信源追踪）
   *
   * @param query - 查询文本
   * @param options - 检索选项
   * @returns 检索结果（带 citations）
   */
  retrieve: (query: string, options?: KnowledgeRetrieveOptions) => Promise<HaiResult<KnowledgeRetrieveResult>>

  /**
   * 知识问答（RAG + 信源引用）
   *
   * @param query - 用户问题
   * @param options - 问答选项
   * @returns 问答结果（回答 + 信源）
   */
  ask: (query: string, options?: KnowledgeAskOptions) => Promise<HaiResult<KnowledgeAskResult>>

  /**
   * 按实体查询关联文档
   *
   * @param entityName - 实体名称
   * @param options - 查询选项
   * @returns 实体关联文档列表
   */
  findByEntity: (entityName: string, options?: EntityQueryOptions) => Promise<HaiResult<EntityDocumentResult[]>>

  /**
   * 列出所有实体
   *
   * @param options - 列表选项
   * @returns 实体列表
   */
  listEntities: (options?: EntityListOptions) => Promise<HaiResult<KnowledgeEntity[]>>

  /**
   * 列出已导入的文档列表
   *
   * @param options - 列表选项
   * @returns 文档信息列表
   */
  listDocuments: (options?: KnowledgeDocumentListOptions) => Promise<HaiResult<KnowledgeDocumentInfo[]>>

  /**
   * 删除已导入的文档（同时删除向量和实体关联）
   *
   * @param documentId - 文档 ID
   * @param options - 删除选项
   * @returns 成功返回 ok(undefined)
   */
  removeDocument: (documentId: string, options?: KnowledgeDocumentRemoveOptions) => Promise<HaiResult<void>>

  /**
   * 有界恢复过期暂存、重试失败的旧向量清理。setup 自动扫描前 100 份清单，大集合需定期分页调用。
   * 暂存租约为存储端时钟的 5 分钟；过期 owner 即使恢复也不能发布。
   * 被遗弃写入的补偿墓碑永久保留，重复扫描用于清理迟到的外部写入。
   */
  repair: (options?: KnowledgeRepairOptions) => Promise<HaiResult<KnowledgeRepairResult>>

  /**
   * 从文件路径导入文档（仅 Node.js 端可用）
   *
   * 读取文件内容后自动调用 ingest() 完成导入。
   *
   * @param input - 文件导入输入
   * @returns 导入结果
   */
  ingestFile: (input: KnowledgeIngestFileInput) => Promise<HaiResult<KnowledgeIngestResult>>

  /**
   * 批量导入文档
   *
   * 依次执行 ingest()，通过 onProgress 回调报告进度，单个文档失败不中断整体流程。
   *
   * @param inputs - 文档导入输入列表
   * @param onProgress - 每完成一个文档后的回调
   * @returns 批量导入汇总结果
   */
  ingestBatch: (
    inputs: KnowledgeIngestInput[],
    onProgress?: (progress: KnowledgeIngestBatchProgress) => void,
  ) => Promise<HaiResult<KnowledgeIngestBatchResult>>

  /**
   * 删除整个 collection（幂等）
   *
   * 先撤销整个代际的可见性，再清理已登记向量，保留物理集合与补偿墓碑。
   * 内部按页清理，失败返回错误后可用 repair 恢复；重新 setup 使用新代际。
   *
   * @param collection - 要删除的 collection 名称，默认使用 config.collection
   * @returns 成功返回 ok(undefined)；store 不可用时返回 `KNOWLEDGE_SETUP_FAILED`
   */
  deleteCollection: (collection?: string) => Promise<HaiResult<void>>
}
