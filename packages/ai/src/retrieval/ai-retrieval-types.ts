/**
 * @h-ai/ai — Retrieval 子功能类型
 *
 * 定义检索操作的类型接口，支持向量检索和混合检索。
 * @module ai-retrieval-types
 */

import type { HaiResult } from '@h-ai/core'

// ─── 信源引用 ───

/**
 * 信源引用——结构化描述检索结果的来源信息
 *
 * 用于在 RAG 回答中追踪每段内容的出处。
 *
 * @example
 * ```ts
 * const citation: Citation = {
 *   documentId: 'doc-001',
 *   title: '项目文档',
 *   url: 'https://docs.example.com/project',
 *   position: 'section:2',
 *   chunkId: 'chunk-003',
 * }
 * ```
 */
export interface Citation {
  /** 原始文档 ID（入库时的文档级唯一标识） */
  documentId?: string
  /** 原始文档标题 */
  title?: string
  /** 原始文档 URL / 路径 */
  url?: string
  /** 位置信息（页码、段落、section 等） */
  position?: string
  /** 分块 ID（对应 vecdb 中的向量记录 ID） */
  chunkId?: string
  /** 信源集合名 */
  collection?: string
}

// ─── 检索源 ───

/**
 * 检索源——描述一个可查询的知识来源
 */
export interface RetrievalSource {
  /** 来源唯一标识 */
  id: string
  /** collection / table 名称 */
  collection: string
  /** 信源显示名（用于 UI 展示） */
  name?: string
  /** 信源 URL / 路径 */
  url?: string
  /** 最大返回条数（默认 5） */
  topK?: number
  /** 最低相似度（低于此值的结果被过滤） */
  minScore?: number
  /** 元数据过滤条件 */
  filter?: Record<string, unknown>
}

/**
 * 检索请求参数
 */
export interface RetrievalRequest {
  /** 查询文本 */
  query: string
  /** 使用的检索源（不指定则使用全部已注册源） */
  sources?: string[]
  /** 全局 topK 覆盖 */
  topK?: number
  /** 全局 minScore 覆盖 */
  minScore?: number
  /** 是否启用 Rerank 重排序（需要已初始化 ai.rerank） */
  enableRerank?: boolean
  /** Rerank 使用的模型名称覆盖 */
  rerankModel?: string
}

/**
 * 单条检索结果
 */
export interface RetrievalResultItem {
  /** 文档 ID */
  id: string
  /** 内容文本 */
  content: string
  /** 相似度分数 [0, 1] */
  score: number
  /** 来源 id */
  sourceId: string
  /** 元数据 */
  metadata?: Record<string, unknown>
  /** 结构化信源引用 */
  citation?: Citation
}

/**
 * 检索结果
 */
export interface RetrievalResult {
  /** 检索结果列表（按分数降序） */
  items: RetrievalResultItem[]
  /** 查询文本 */
  query: string
  /** 查询耗时（毫秒） */
  duration: number
}

// ─── 检索操作 ───

/**
 * 检索操作接口
 */
export interface RetrievalOperations {
  /**
   * 注册一个检索源（持久化到 DB）
   *
   * @param source - 检索源配置
   * @returns 成功返回 ok，重复 id 返回错误
   */
  addSource: (source: RetrievalSource) => Promise<HaiResult<void>>

  /**
   * 移除一个检索源（从 DB 删除）
   *
   * @param sourceId - 检索源 ID
   * @returns 成功返回 ok，未找到返回错误
   */
  removeSource: (sourceId: string) => Promise<HaiResult<void>>

  /**
   * 列出所有已注册的检索源（从 DB 读取，分布式一致）
   */
  listSources: () => Promise<RetrievalSource[]>

  /**
   * 执行检索
   *
   * @param request - 检索请求
   * @returns 检索结果
   */
  retrieve: (request: RetrievalRequest) => Promise<HaiResult<RetrievalResult>>
}
