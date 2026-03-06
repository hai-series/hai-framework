/**
 * @h-ai/ai — Context 子功能类型
 *
 * 定义上下文管理操作的类型接口：消息压缩、摘要生成、Token 估算。
 * 在对话超出模型上下文窗口时，自动压缩历史消息以保持对话连续性。
 * @module ai-context-types
 */

import type { Result } from '@h-ai/core'

import type { AIError } from '../ai-types.js'
import type { ChatMessage } from '../llm/ai-llm-types.js'
import type { InteractionScope, SessionInfo } from '../store/ai-store-types.js'

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
export interface ContextCompressOptions {
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
export interface ContextCompressResult {
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

// ─── 摘要选项与结果 ───

/**
 * 上下文摘要选项
 */
export interface ContextSummarizeOptions {
  /** 摘要用的模型 */
  model?: string
  /** 温度覆盖 */
  temperature?: number
  /** 额外上下文（如已有的摘要，用于增量摘要） */
  previousSummary?: string
}

/**
 * 上下文摘要结果
 */
export interface ContextSummary {
  /** 摘要文本 */
  summary: string
  /** 摘要的估算 token 数 */
  tokenCount: number
  /** 覆盖的原始消息数 */
  coveredMessages: number
}

// ─── 有状态上下文管理器 ───

/**
 * 有状态上下文管理器配置
 */
export interface ContextManagerOptions {
  /** 交互作用域（objectId + sessionId） */
  scope?: InteractionScope
  /** Token 预算（默认使用配置的 defaultMaxTokens） */
  maxTokens?: number
  /** 压缩策略 */
  strategy?: CompressionStrategy
  /** 保留 system 消息（默认 true） */
  preserveSystem?: boolean
  /** 保留最近 N 条消息（默认使用配置的 preserveLastN） */
  preserveLastN?: number
  /** 是否自动触发压缩（默认 true） */
  autoCompress?: boolean
  /** 摘要用的模型 */
  summaryModel?: string
}

/**
 * 有状态上下文管理器接口
 *
 * 适用于多轮对话场景，追加消息并在超限时自动压缩。
 *
 * @example
 * ```ts
 * const managerResult = ai.context.createManager({
 *   scope: { objectId: 'user-001', sessionId: 'sess-001' },
 *   maxTokens: 8000,
 * })
 * const manager = managerResult.value
 *
 * await manager.addMessage({ role: 'user', content: userInput })
 * const messages = manager.getMessages().value
 * const response = await ai.llm.chat({ messages })
 * await manager.addMessage(response.value.choices[0].message)
 * ```
 */
export interface ContextManager {
  /** 当前作用域（如已配置） */
  readonly scope?: InteractionScope

  /**
   * 追加消息
   *
   * 自动在超限时触发压缩（如果启用了 autoCompress）。
   *
   * @param message - 要追加的消息
   * @returns 成功返回 ok(undefined)
   */
  addMessage: (message: ChatMessage) => Promise<Result<void, AIError>>

  /**
   * 获取当前消息列表（压缩后）
   *
   * @returns 当前消息列表
   */
  getMessages: () => Result<ChatMessage[], AIError>

  /**
   * 获取当前 token 使用量
   *
   * @returns 当前 token 数和预算
   */
  getTokenUsage: () => Result<{ current: number, budget: number }, AIError>

  /**
   * 获取历史摘要列表
   *
   * @returns 每次压缩产生的摘要
   */
  getSummaries: () => Result<ContextSummary[], AIError>

  /**
   * 持久化当前状态（需要 scope + 存储可用）
   */
  save: () => Promise<Result<void, AIError>>

  /**
   * 重置管理器（清空所有消息和摘要）
   */
  reset: () => void
}

// ─── Context 操作接口 ───

/**
 * Context 操作接口（通过 `ai.context` 访问）
 *
 * 管理对话上下文的压缩、摘要与 Token 控制。
 * 需要先调用 `ai.init()` 初始化后使用。
 *
 * @example
 * ```ts
 * // 压缩超长对话
 * const result = await ai.context.tryCompress(messages, { maxTokens: 4000 })
 * const response = await ai.llm.chat({ messages: result.value.messages })
 *
 * // 对消息生成摘要
 * const summary = await ai.context.summarize(oldMessages)
 *
 * // 估算 token 数
 * const tokens = ai.context.estimateTokens(messages)
 *
 * // 创建有状态管理器
 * const manager = ai.context.createManager({
 *   scope: { objectId: 'user-001', sessionId: 'sess-001' },
 *   maxTokens: 8000,
 * })
 *
 * // 从持久化恢复管理器
 * const restored = await ai.context.restoreManager({
 *   objectId: 'user-001',
 *   sessionId: 'sess-001',
 * })
 * ```
 */
export interface ContextOperations {
  /**
   * 压缩消息列表，使其不超过指定 Token 预算
   *
   * 如果当前 token 数未超限则直接返回（不压缩），因此命名为 tryCompress。
   *
   * @param messages - 消息列表
   * @param options - 压缩选项
   * @returns 压缩结果
   */
  tryCompress: (messages: ChatMessage[], options?: ContextCompressOptions) => Promise<Result<ContextCompressResult, AIError>>

  /**
   * 对一组消息生成摘要
   *
   * @param messages - 消息列表
   * @param options - 摘要选项
   * @returns 摘要结果
   */
  summarize: (messages: ChatMessage[], options?: ContextSummarizeOptions) => Promise<Result<ContextSummary, AIError>>

  /**
   * 估算消息列表的 Token 数
   *
   * @param messages - 消息列表
   * @returns Token 估算值
   */
  estimateTokens: (messages: ChatMessage[]) => Result<number, AIError>

  /**
   * 创建有状态上下文管理器
   *
   * @param options - 管理器配置
   * @returns 管理器实例
   */
  createManager: (options?: ContextManagerOptions) => Result<ContextManager, AIError>

  /**
   * 从持久化恢复上下文管理器
   *
   * @param scope - 交互作用域
   * @param options - 管理器配置覆盖
   * @returns 恢复的管理器实例
   */
  restoreManager: (scope: InteractionScope, options?: Omit<ContextManagerOptions, 'scope'>) => Promise<Result<ContextManager, AIError>>

  /**
   * 列出指定主体的所有会话
   *
   * @param objectId - 主体 ID
   * @returns 会话信息列表
   */
  listSessions: (objectId: string) => Promise<Result<SessionInfo[], AIError>>
}
