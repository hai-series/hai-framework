/**
 * @h-ai/ai — Embedding 子功能类型
 *
 * 定义向量嵌入操作的类型接口。
 * @module ai-embedding-types
 */

import type { HaiResult } from '@h-ai/core'

// ─── Embedding 请求与响应 ───

/**
 * Embedding 请求参数
 *
 * @example
 * ```ts
 * import type { EmbeddingRequest } from '@h-ai/ai'
 *
 * const value: EmbeddingRequest = { input: ['退款申请', '退款进度'], dimensions: 1024 }
 * ```
 */
export interface EmbeddingRequest {
  /** 输入文本（单条或批量） */
  input: string | string[]
  /** 模型名称（可选，未指定时使用配置中的默认模型） */
  model?: string
  /** 向量维度（可选，部分模型支持） */
  dimensions?: number
}

/**
 * 单条 Embedding 结果
 *
 * @example
 * ```ts
 * import type { EmbeddingItem } from '@h-ai/ai'
 *
 * const value: EmbeddingItem = { index: 0, embedding: [0.12, -0.08, 0.31] }
 * ```
 */
export interface EmbeddingItem {
  /** 在输入列表中的索引 */
  index: number
  /** 向量数据 */
  embedding: number[]
}

/**
 * Embedding 响应
 *
 * @example
 * ```ts
 * import type { EmbeddingResponse } from '@h-ai/ai'
 *
 * function firstVector(response: EmbeddingResponse): number[] | undefined {
 *   return response.data.find(item => item.index === 0)?.embedding
 * }
 * ```
 */
export interface EmbeddingResponse {
  /** 模型名称 */
  model: string
  /** Embedding 结果列表 */
  data: EmbeddingItem[]
  /** Token 使用统计 */
  usage: {
    prompt_tokens: number
    total_tokens: number
  }
}

// ─── Embedding 操作接口 ───

/**
 * Embedding 操作接口（通过 `ai.embedding` 访问）
 *
 * 需要先调用 `ai.init()` 初始化后使用。
 *
 * @example
 * ```ts
 * import { ai } from '@h-ai/ai'
 *
 * // 应用启动已成功初始化 ai；这里是业务服务函数。
 * async function run() {
 *   const result = await ai.embedding.embed({ input: ['退款申请', '退款进度'] })
 *   if (!result.success)
 *     return result
 *   return result.data.data.map(item => item.embedding)
 * }
 * ```
 */
export interface EmbeddingOperations {
  /**
   * 生成向量嵌入
   *
   * @param request - Embedding 请求
   * @returns Embedding 响应
   */
  embed: (request: EmbeddingRequest) => Promise<HaiResult<EmbeddingResponse>>

  /**
   * 便捷方法：嵌入单条文本，直接返回向量
   *
   * @param text - 输入文本
   * @returns 向量数组
   */
  embedText: (text: string) => Promise<HaiResult<number[]>>

  /**
   * 便捷方法：批量嵌入文本，返回向量列表
   *
   * @param texts - 输入文本列表
   * @returns 向量数组列表（与输入顺序一致）
   */
  embedBatch: (texts: string[]) => Promise<HaiResult<number[][]>>
}
