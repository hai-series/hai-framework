/**
 * @h-ai/ai — Rerank 子功能类型
 *
 * 定义文档重排序操作的类型接口。
 * @module ai-rerank-types
 */

import type { Result } from '@h-ai/core'
import type { AIError } from '../ai-types.js'

// ─── Rerank 请求与响应 ───

/**
 * 单条待排序文档
 */
export interface RerankDocument {
  /** 文档唯一标识（可选，便于结果追踪） */
  id?: string
  /** 文档文本内容 */
  text: string
}

/**
 * Rerank 请求参数
 */
export interface RerankRequest {
  /** 查询文本 */
  query: string
  /** 待排序文档列表（字符串数组或带 id 的文档对象数组） */
  documents: string[] | RerankDocument[]
  /** 模型名称（可选，未指定时使用配置中的默认模型） */
  model?: string
  /** 返回结果数量（可选，默认返回全部文档） */
  topN?: number
  /** 是否在结果中返回文档原文（默认 false） */
  returnDocuments?: boolean
}

/**
 * 单条 Rerank 结果
 */
export interface RerankItem {
  /** 文档在原始输入中的索引 */
  index: number
  /** 文档 ID（当输入为带 id 的文档对象时） */
  id?: string
  /** 相关性分数（越高越相关） */
  relevanceScore: number
  /** 文档原文（当 returnDocuments 为 true 时） */
  document?: string
}

/**
 * Rerank 响应
 */
export interface RerankResponse {
  /** 使用的模型名称 */
  model: string
  /** 重排序结果列表（按相关性分数降序排列） */
  results: RerankItem[]
}

// ─── Rerank 操作接口 ───

/**
 * Rerank 操作接口（通过 `ai.rerank` 访问）
 *
 * 需要先调用 `ai.init()` 初始化后使用。
 * 通过专用 Rerank API（兼容 Cohere 格式）对文档进行相关性重排序。
 *
 * @example
 * ```ts
 * // 对检索结果重排序
 * const result = await ai.rerank.rerank({
 *   query: '机器学习入门',
 *   documents: [
 *     '深度学习是机器学习的一个分支',
 *     '今天天气真好',
 *     '神经网络是深度学习的基础',
 *   ],
 *   topN: 2,
 * })
 *
 * // 便捷方法：直接传入文本数组
 * const items = await ai.rerank.rerankTexts('query', ['doc1', 'doc2'])
 * ```
 */
export interface RerankOperations {
  /**
   * 对文档列表进行相关性重排序
   *
   * @param request - Rerank 请求
   * @returns 重排序响应，结果按相关性分数降序排列
   */
  rerank: (request: RerankRequest) => Promise<Result<RerankResponse, AIError>>

  /**
   * 便捷方法：对文本数组重排序，直接返回结果列表
   *
   * @param query - 查询文本
   * @param texts - 待排序文本列表
   * @param topN - 返回条数（可选）
   * @returns RerankItem 列表，按相关性分数降序排列
   */
  rerankTexts: (query: string, texts: string[], topN?: number) => Promise<Result<RerankItem[], AIError>>
}
