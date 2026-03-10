/**
 * @h-ai/ai — Compress 子功能类型
 *
 * 定义上下文压缩操作的类型接口：滑动窗口、摘要、混合三种策略。
 * 在对话超出模型上下文窗口时，自动压缩历史消息以保持对话连续性。
 * @module ai-compress-types
 */

import type { Result } from '@h-ai/core'

import type { AIError } from '../ai-types.js'
import type { ChatMessage } from '../llm/ai-llm-types.js'

import { z } from 'zod'

// ─── 压缩策略枚举 ───

/** 压缩策略枚举 */
export const CompressionStrategySchema = z.enum(['summary', 'sliding-window', 'hybrid'])

/** 压缩策略类型 */
export type CompressionStrategy = z.infer<typeof CompressionStrategySchema>

// ─── 压缩选项与结果 ───

/**
 * 上下文压缩选项
 */
export interface CompressOptions {
  /** 压缩策略（默认使用配置的 defaultStrategy） */
  strategy?: CompressionStrategy
  /** 目标 token 数（默认使用配置的 defaultMaxTokens，0 表示取模型 maxTokens 的 80%） */
  maxTokens?: number
  /** 保留 system 消息（默认 true） */
  preserveSystem?: boolean
  /** 保留最近 N 条消息不压缩（默认使用配置的 preserveLastN） */
  preserveLastN?: number
  /** 摘要用的模型 */
  summaryModel?: string
}

/**
 * 上下文压缩结果
 */
export interface CompressResult {
  /** 压缩后的消息列表 */
  messages: ChatMessage[]
  /** 原始消息的估算 token 数 */
  originalTokens: number
  /** 压缩后的估算 token 数 */
  compressedTokens: number
  /** 被移除/合并的消息数 */
  removedCount: number
  /** 生成的摘要文本（仅 summary/hybrid 策略有值） */
  summary?: string
}

// ─── Compress 操作接口 ───

/**
 * Compress 操作接口
 *
 * 管理对话消息的压缩，支持三种策略：
 * - `sliding-window`：移除最旧的消息，保留最近 N 条
 * - `summary`：使用 LLM 生成摘要替换旧消息
 * - `hybrid`：先滑动窗口，不够则回退到摘要
 *
 * @example
 * ```ts
 * const result = await compressOps.tryCompress(messages, {
 *   strategy: 'hybrid',
 *   maxTokens: 4000,
 * })
 * if (result.success) {
 *   const compressed = result.data.messages
 * }
 * ```
 */
export interface CompressOperations {
  /**
   * 尝试压缩消息列表，使其不超过指定 Token 预算
   *
   * 如果当前 token 数未超限则直接返回（不压缩），因此命名为 tryCompress。
   *
   * @param messages - 消息列表
   * @param options - 压缩选项
   * @returns 压缩结果
   */
  tryCompress: (messages: ChatMessage[], options?: CompressOptions) => Promise<Result<CompressResult, AIError>>
}
