/**
 * @h-ai/ai — Knowledge 子功能类型
 *
 * 定义知识库操作的类型接口：文档导入、实体索引、信源追踪检索。
 * @module ai-knowledge-types
 */

import type { Result } from '@h-ai/core'
import type { AIError } from '../ai-types.js'
import type { ChatMessage } from '../llm/ai-llm-types.js'
import type { Citation } from '../retrieval/ai-retrieval-types.js'

import { z } from 'zod'

// ─── 实体类型枚举 ───

/**
 * 内置实体类型枚举（预设值，可通过配置 `entityTypes` 扩展）
 */
export const EntityTypeSchema = z.enum(['person', 'project', 'concept', 'organization', 'location', 'event', 'other'])

/** 实体类型（字符串，支持内置类型及用户自定义类型） */
export type EntityType = string

// ─── 实体 ───

/**
 * 知识实体
 *
 * 表示从文档中提取的命名实体（人名、项目名、概念等），
 * 存储在 reldb 中用于倒排索引查询。
 *
 * @example
 * ```ts
 * const entity: KnowledgeEntity = {
 *   id: 'ent-001',
 *   name: '张三',
 *   type: 'person',
 *   aliases: ['小张', 'Zhang San'],
 * }
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
 */
export interface EntityDocumentRelation {
  /** 实体 ID */
  entityId: string
  /** 文档 ID（对应 vecdb 中的 documentId） */
  documentId: string
  /** 分块 ID（对应 vecdb 中的向量记录 ID） */
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
 * const input: KnowledgeIngestInput = {
 *   documentId: 'doc-001',
 *   content: '# 项目文档\n\n张三负责了核心模块...',
 *   title: '项目文档',
 *   url: 'https://docs.example.com/project',
 *   metadata: { author: '李四' },
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
  /** 分块模式覆盖（可选） */
  chunkMode?: 'sentence' | 'paragraph' | 'markdown' | 'page'
  /** 分块最大大小覆盖（可选） */
  chunkMaxSize?: number
  /** 分块重叠覆盖（可选） */
  chunkOverlap?: number
}

/**
 * 文档导入结果
 */
export interface KnowledgeIngestResult {
  /** 文档 ID */
  documentId: string
  /** 生成的分块数量 */
  chunkCount: number
  /** 提取的实体列表（未启用实体提取时为空数组） */
  entities: KnowledgeEntity[]
  /** 处理耗时（毫秒） */
  duration: number
}

/**
 * 知识检索选项
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
  /** 元数据过滤条件 */
  filter?: Record<string, unknown>
}

/**
 * 知识检索结果项
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
 */
export interface EntityQueryOptions {
  /** 集合名（可选，默认使用配置中的 collection） */
  collection?: string
  /** 实体类型过滤 */
  type?: EntityType
}

/**
 * 实体关联文档结果
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
 */
export interface EntityListOptions {
  /** 实体类型过滤 */
  type?: EntityType
  /** 关键词搜索（模糊匹配实体名称和别名） */
  keyword?: string
  /** 最大返回数 */
  limit?: number
}

// ─── Knowledge 操作接口 ───

/**
 * Knowledge 操作接口（通过 `ai.knowledge` 访问）
 *
 * 知识库管理与检索的统一入口，编排 datapipe + vecdb + reldb + embedding + LLM。
 *
 * @example
 * ```ts
 * // 初始化知识库
 * await ai.knowledge.setup()
 *
 * // 导入文档
 * await ai.knowledge.ingest({
 *   documentId: 'doc-001',
 *   content: markdownContent,
 *   title: '项目文档',
 * })
 *
 * // 查询（带信源追踪）
 * const result = await ai.knowledge.retrieve('张三负责了哪些模块？')
 *
 * // 问答（RAG + 信源引用）
 * const answer = await ai.knowledge.ask('张三负责了哪些模块？')
 * ```
 */
export interface KnowledgeOperations {
  /**
   * 初始化知识库
   *
   * 创建 vecdb 集合和 reldb 实体表。
   *
   * @param options - 初始化选项
   * @returns 成功返回 ok(undefined)
   */
  setup: (options?: KnowledgeSetupOptions) => Promise<Result<void, AIError>>

  /**
   * 导入文档
   *
   * 执行流程：clean → chunk → embed → vecdb → 实体提取 → reldb
   *
   * @param input - 文档导入输入
   * @returns 导入结果（分块数、实体列表等）
   */
  ingest: (input: KnowledgeIngestInput) => Promise<Result<KnowledgeIngestResult, AIError>>

  /**
   * 知识检索（带实体增强 + 信源追踪）
   *
   * @param query - 查询文本
   * @param options - 检索选项
   * @returns 检索结果（带 citations）
   */
  retrieve: (query: string, options?: KnowledgeRetrieveOptions) => Promise<Result<KnowledgeRetrieveResult, AIError>>

  /**
   * 知识问答（RAG + 信源引用）
   *
   * @param query - 用户问题
   * @param options - 问答选项
   * @returns 问答结果（回答 + 信源）
   */
  ask: (query: string, options?: KnowledgeAskOptions) => Promise<Result<KnowledgeAskResult, AIError>>

  /**
   * 按实体查询关联文档
   *
   * @param entityName - 实体名称
   * @param options - 查询选项
   * @returns 实体关联文档列表
   */
  findByEntity: (entityName: string, options?: EntityQueryOptions) => Promise<Result<EntityDocumentResult[], AIError>>

  /**
   * 列出所有实体
   *
   * @param options - 列表选项
   * @returns 实体列表
   */
  listEntities: (options?: EntityListOptions) => Promise<Result<KnowledgeEntity[], AIError>>
}
