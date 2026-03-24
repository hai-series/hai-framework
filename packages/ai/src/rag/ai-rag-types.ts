/**
 * @h-ai/ai — RAG（Retrieval-Augmented Generation）子功能类型
 *
 * 定义 RAG 操作的类型接口：检索 + 生成。
 * @module ai-rag-types
 */

import type { HaiResult } from '@h-ai/core'

import type { ChatMessage } from '../llm/ai-llm-types.js'
import type { Citation } from '../retrieval/ai-retrieval-types.js'

// ─── RAG 配置 ───

/**
 * RAG 选项
 */
export interface RagOptions {
  /** 交互主体 ID */
  objectId?: string
  /** 会话 ID */
  sessionId?: string
  /** 使用的检索源（不指定则使用全部已注册源） */
  sources?: string[]
  /** 返回的上下文条数（默认 5） */
  topK?: number
  /** 最低相似度 */
  minScore?: number
  /** 是否启用 Rerank 重排序 */
  enableRerank?: boolean
  /** Rerank 使用的模型名称覆盖 */
  rerankModel?: string
  /** LLM 模型名称覆盖 */
  model?: string
  /** 系统提示词（可选，会自动注入检索上下文） */
  systemPrompt?: string
  /** 温度覆盖 */
  temperature?: number
  /** 自定义上下文格式化函数 */
  formatContext?: (items: RagContextItem[]) => string
  /** 是否保留消息历史（用于多轮对话） */
  messages?: ChatMessage[]
  /** 是否启用内部 LLM 调用的持久化（默认 true；Context 层调用时传 false 避免重复记录） */
  enablePersist?: boolean
}

/**
 * RAG 上下文项
 */
export interface RagContextItem {
  /** 文档内容 */
  content: string
  /** 相似度分数 */
  score: number
  /** 来源 */
  sourceId: string
  /** 元数据 */
  metadata?: Record<string, unknown>
  /** 结构化信源引用 */
  citation?: Citation
}

/**
 * RAG 结果
 */
export interface RagResult {
  /** LLM 生成的回答 */
  answer: string
  /** 使用的上下文 */
  context: RagContextItem[]
  /** 去重后的信源引用列表（方便 UI 展示引用栏） */
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

// ─── RAG 流式事件 ───

/**
 * RAG 流式事件
 *
 * queryStream 产出的事件序列：
 * 1. `context` — 检索结果就绪，携带上下文列表
 * 2. `delta` — LLM 增量文本
 * 3. `done` — 生成完成，携带完整结果汇总
 */
export type RagStreamEvent
  = | { type: 'context', items: RagContextItem[], citations: Citation[] }
    | { type: 'delta', text: string }
    | { type: 'done', answer: string, model: string, usage?: { prompt_tokens: number, completion_tokens: number, total_tokens: number } }

// ─── RAG 操作 ───

/**
 * RAG 操作接口
 */
export interface RagOperations {
  /**
   * 执行 RAG（检索增强生成）
   *
   * 1. 将查询文本向量化
   * 2. 从已注册的检索源中检索相关文档
   * 3. 将检索上下文注入 LLM 提示词
   * 4. 调用 LLM 生成回答
   *
   * @param query - 用户查询文本
   * @param options - RAG 选项
   * @returns RAG 结果
   */
  query: (query: string, options?: RagOptions) => Promise<HaiResult<RagResult>>

  /**
   * 流式 RAG 查询
   *
   * 产出事件序列：context → delta* → done
   *
   * @param query - 用户查询文本
   * @param options - RAG 选项
   * @returns 异步可迭代的 RagStreamEvent
   */
  queryStream: (query: string, options?: RagOptions) => AsyncIterable<RagStreamEvent>
}
