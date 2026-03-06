/**
 * @h-ai/ai — Memory 子功能类型
 *
 * 定义记忆管理操作的类型接口：提取、存储、检索、注入。
 * 支持从对话中自动提取关键事实、偏好、事件等记忆，并在后续对话中检索注入。
 * @module ai-memory-types
 */

import type { Result } from '@h-ai/core'

import type { MemoryType } from '../ai-config.js'
import type { AIError } from '../ai-types.js'
import type { ChatMessage } from '../llm/ai-llm-types.js'

// ─── 记忆条目 ───

/**
 * 记忆条目输入（手动添加时使用）
 *
 * @example
 * ```ts
 * const input: MemoryEntryInput = {
 *   content: '用户偏好使用中文回复',
 *   type: 'preference',
 *   importance: 0.8,
 *   source: 'session-001',
 * }
 * ```
 */
export interface MemoryEntryInput {
  /** 记忆内容 */
  content: string
  /** 记忆类型 */
  type: MemoryType
  /** 重要性评分 [0, 1]（可选，默认 0.5） */
  importance?: number
  /** 来源标识（如会话 ID） */
  source?: string
  /** 附加元数据 */
  metadata?: Record<string, unknown>
}

/**
 * 完整的记忆条目
 */
export interface MemoryEntry {
  /** 记忆唯一标识 */
  id: string
  /** 记忆内容 */
  content: string
  /** 记忆类型 */
  type: MemoryType
  /** 重要性评分 [0, 1] */
  importance: number
  /** 来源标识 */
  source?: string
  /** 附加元数据 */
  metadata?: Record<string, unknown>
  /** 向量（embedding 已计算时填充） */
  vector?: number[]
  /** 创建时间（Unix 毫秒） */
  createdAt: number
  /** 最近访问时间（Unix 毫秒） */
  lastAccessedAt: number
  /** 被检索次数 */
  accessCount: number
}

// ─── 提取选项 ───

/**
 * 记忆提取选项
 */
export interface MemoryExtractOptions {
  /** 只提取指定类型 */
  types?: MemoryType[]
  /** 指定提取用的模型 */
  model?: string
  /** 过滤低重要性条目（默认 0） */
  minImportance?: number
  /** 来源标识（关联到提取结果） */
  source?: string
}

// ─── 检索选项 ───

/**
 * 记忆检索选项
 */
export interface MemoryRecallOptions {
  /** 返回数量（默认使用配置的 defaultTopK） */
  topK?: number
  /** 过滤类型 */
  types?: MemoryType[]
  /** 最低重要性 */
  minImportance?: number
  /** 时间衰减权重 [0, 1]（0 = 不考虑时间，1 = 仅按时间排序） */
  recencyWeight?: number
}

// ─── 注入选项 ───

/**
 * 记忆注入选项
 */
export interface MemoryInjectOptions {
  /** 注入的记忆数量（默认 5） */
  topK?: number
  /** 记忆占用的最大 token 预算（默认不限） */
  maxTokens?: number
  /** 注入位置：system = 追加到 system 消息末尾，before-last = 插入在最后一条用户消息之前 */
  position?: 'system' | 'before-last'
}

// ─── 列表与清空选项 ───

/**
 * 记忆列表选项
 */
export interface MemoryListOptions {
  /** 过滤类型 */
  types?: MemoryType[]
  /** 来源过滤 */
  source?: string
  /** 最大返回数 */
  limit?: number
}

/**
 * 记忆清空选项
 */
export interface MemoryClearOptions {
  /** 仅清空指定类型 */
  types?: MemoryType[]
  /** 仅清空指定来源 */
  source?: string
}

// ─── Memory 操作接口 ───

/**
 * Memory 操作接口（通过 `ai.memory` 访问）
 *
 * 管理对话中产生的关键事实、用户偏好、长期知识的提取、存储与检索。
 * 需要先调用 `ai.init()` 初始化后使用。
 *
 * @example
 * ```ts
 * // 从对话中自动提取记忆
 * const extracted = await ai.memory.extract(messages)
 *
 * // 手动添加记忆
 * await ai.memory.add({ content: '用户偏好中文', type: 'preference' })
 *
 * // 检索相关记忆
 * const memories = await ai.memory.recall('用户的语言偏好')
 *
 * // 将记忆注入消息列表
 * const enriched = await ai.memory.inject(newMessages)
 * const response = await ai.llm.chat({ messages: enriched.value })
 * ```
 */
export interface MemoryOperations {
  /**
   * 从对话消息中自动提取记忆条目
   *
   * 使用 LLM 分析对话内容，提取值得记住的事实、偏好、事件等。
   *
   * @param messages - 对话消息列表
   * @param options - 提取选项
   * @returns 提取到的记忆条目列表
   */
  extract: (messages: ChatMessage[], options?: MemoryExtractOptions) => Promise<Result<MemoryEntry[], AIError>>

  /**
   * 手动添加一条记忆
   *
   * @param entry - 记忆条目输入
   * @returns 存储后的完整记忆条目
   */
  add: (entry: MemoryEntryInput) => Promise<Result<MemoryEntry, AIError>>

  /**
   * 根据查询检索最相关的记忆
   *
   * 综合向量相似度、重要性、时间衰减进行排序。
   *
   * @param query - 查询文本
   * @param options - 检索选项
   * @returns 相关记忆列表
   */
  recall: (query: string, options?: MemoryRecallOptions) => Promise<Result<MemoryEntry[], AIError>>

  /**
   * 将相关记忆注入到消息列表中
   *
   * 根据最后一条用户消息检索相关记忆，格式化后注入 system prompt。
   *
   * @param messages - 原始消息列表
   * @param options - 注入选项
   * @returns 注入记忆后的消息列表
   */
  inject: (messages: ChatMessage[], options?: MemoryInjectOptions) => Promise<Result<ChatMessage[], AIError>>

  /**
   * 删除指定记忆
   *
   * @param memoryId - 记忆 ID
   * @returns 成功返回 ok(undefined)
   */
  remove: (memoryId: string) => Promise<Result<void, AIError>>

  /**
   * 列出记忆（支持过滤）
   *
   * @param options - 列表选项
   * @returns 记忆列表
   */
  list: (options?: MemoryListOptions) => Promise<Result<MemoryEntry[], AIError>>

  /**
   * 清空记忆
   *
   * @param options - 清空选项（不传则清空全部）
   * @returns 成功返回 ok(undefined)
   */
  clear: (options?: MemoryClearOptions) => Promise<Result<void, AIError>>
}
