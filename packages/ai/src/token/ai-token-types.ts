/**
 * @h-ai/ai — Token 子功能类型
 *
 * 定义 Token 估算操作的类型接口：文本与消息级别的 Token 数估算。
 * 使用 CJK 感知的字符级估算算法，无需外部分词库依赖。
 * @module ai-token-types
 */

import type { ChatMessage } from '../llm/ai-llm-types.js'

// ─── Token 操作接口 ───

/**
 * Token 操作接口
 *
 * 提供 Token 估算能力，使用配置的 `tokenRatio` 做估算。
 *
 * @example
 * ```ts
 * const tokens = tokenOps.estimateText('Hello 世界')
 * const total = tokenOps.estimateMessages(messages)
 * ```
 */
export interface TokenOperations {
  /**
   * 估算单条文本的 Token 数
   *
   * 使用字符级估算：中文约每字 1.5 token，英文约每 4 字符 1 token。
   *
   * @param text - 文本内容
   * @returns 估算 Token 数
   */
  estimateText: (text: string) => number

  /**
   * 估算消息列表的总 Token 数
   *
   * 包含消息结构开销（每条消息约 4 token 用于角色标记和分隔）。
   *
   * @param messages - 消息列表
   * @returns 估算 Token 总数
   */
  estimateMessages: (messages: ChatMessage[]) => number
}
