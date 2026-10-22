/**
 * @h-ai/ai — Rerank 子功能类型
 *
 * 定义文档重排序操作的类型接口。
 * @module ai-rerank-types
 */

import type { HaiResult } from '@h-ai/core'

// ─── Rerank 请求与响应 ───

/**
 * 单条待排序文档
 *
 * @example
 * ```ts
 * import type { RerankDocument } from '@h-ai/ai'
 *
 * const value: RerankDocument = { id: 'refund-policy', text: '订单完成后七天内可申请退款。' }
 * ```
 */
export interface RerankDocument {
  /** 文档唯一标识（可选，便于结果追踪） */
  id?: string
  /** 文档文本内容 */
  text: string
}

/**
 * Rerank 请求参数
 *
 * @example
 * ```ts
 * import type { RerankRequest } from '@h-ai/ai'
 *
 * const value: RerankRequest = { query: '如何退款', documents: [{ id: 'refund-policy', text: '七天内申请退款。' }], topN: 1, returnDocuments: true }
 * ```
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
 *
 * @example
 * ```ts
 * import type { RerankItem } from '@h-ai/ai'
 *
 * const value: RerankItem = { index: 0, id: 'refund-policy', relevanceScore: 0.92, document: '七天内申请退款。' }
 * ```
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
 *
 * @example
 * ```ts
 * import type { RerankResponse } from '@h-ai/ai'
 *
 * function winningDocument(response: RerankResponse) {
 *   return response.results[0]?.document
 * }
 * ```
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
 * import { ai } from '@h-ai/ai'
 *
 * // 应用启动已成功初始化 ai；这里是业务服务函数。
 * async function run() {
 *   const result = await ai.rerank.rerank({ query: '如何退款', documents: ['七天内申请退款。', '支持信用卡付款。'], topN: 1 })
 *   if (!result.success)
 *     return result
 *   return result.data.results
 * }
 * ```
 */
export interface RerankOperations {
  /**
   * 对文档列表进行相关性重排序
   *
   * @param request - Rerank 请求
   * @returns 重排序响应，结果按相关性分数降序排列
   */
  rerank: (request: RerankRequest) => Promise<HaiResult<RerankResponse>>

  /**
   * 便捷方法：对文本数组重排序，直接返回结果列表
   *
   * @param query - 查询文本
   * @param texts - 待排序文本列表
   * @param topN - 返回条数（可选）
   * @returns RerankItem 列表，按相关性分数降序排列
   */
  rerankTexts: (query: string, texts: string[], topN?: number) => Promise<HaiResult<RerankItem[]>>
}
