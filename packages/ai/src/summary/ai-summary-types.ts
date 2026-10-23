/**
 * @h-ai/ai — Summary 子功能类型
 *
 * 定义摘要生成操作的类型接口：使用 LLM 对对话消息生成摘要，支持增量摘要。
 * @module ai-summary-types
 */

import type { HaiResult } from '@h-ai/core'

import type { ChatMessage } from '../llm/ai-llm-types.js'

// ─── 摘要选项与结果 ───

/**
 * 摘要生成选项
 *
 * @example
 * ```ts
 * import type { SummaryOptions } from '@h-ai/ai'
 *
 * const value: SummaryOptions = { previousSummary: '用户选择按周发布。', systemPrompt: '保留决策与未完成事项。', temperature: 0.2 }
 * ```
 */
export interface SummaryOptions {
  /** 摘要用的模型 */
  model?: string
  /** 温度覆盖 */
  temperature?: number
  /** 自定义摘要 systemPrompt（覆盖模块配置与内置默认提示词） */
  systemPrompt?: string
  /** 前序摘要文本（用于增量摘要） */
  previousSummary?: string
}

/**
 * 摘要生成结果
 *
 * @example
 * ```ts
 * import type { SummaryResult } from '@h-ai/ai'
 *
 * function describeCoverage(summary: SummaryResult): string {
 *   return `${summary.coveredMessages} 条消息，约 ${summary.tokenCount} tokens：${summary.summary}`
 * }
 * ```
 */
export interface SummaryResult {
  /** 摘要文本 */
  summary: string
  /** 摘要的估算 Token 数 */
  tokenCount: number
  /** 覆盖的原始消息数 */
  coveredMessages: number
}

// ─── Summary 操作接口 ───

/**
 * Summary 操作接口
 *
 * 使用 LLM 对消息列表生成摘要，支持全量摘要与增量摘要。
 *
 * @example
 * ```ts
 * import { ai } from '@h-ai/ai'
 *
 * // 应用启动已成功初始化 ai；这里是业务服务函数。
 * async function run() {
 *   const result = await ai.summary.summarize([{ role: 'user', content: '每周一发布周报。' }])
 *   if (!result.success)
 *     return result
 *   return result.data.summary
 * }
 * ```
 */
export interface SummaryOperations {
  /**
   * 生成摘要文本
   *
   * @param messages - 消息列表
   * @param options - 摘要选项
   * @returns 摘要文本
   */
  generate: (messages: ChatMessage[], options?: SummaryOptions) => Promise<HaiResult<string>>

  /**
   * 生成摘要（含元数据）
   *
   * @param messages - 消息列表
   * @param options - 摘要选项
   * @returns 摘要结果（含 Token 数、覆盖消息数）
   */
  summarize: (messages: ChatMessage[], options?: SummaryOptions) => Promise<HaiResult<SummaryResult>>
}
