/**
 * @h-ai/ai — Memory 子功能类型
 *
 * 定义记忆管理操作的类型接口：提取、存储、检索、注入。
 * 支持从对话中自动提取关键事实、偏好、事件等记忆，并在后续对话中检索注入。
 * @module ai-memory-types
 */

import type { Result } from '@h-ai/core'

import type { AIError } from '../ai-types.js'
import type { ChatMessage } from '../llm/ai-llm-types.js'
import type { StorePage } from '../store/ai-store-types.js'

import { z } from 'zod'

// ─── 记忆类型枚举 ───

/**
 * 记忆类型枚举 Schema
 *
 * 定义系统支持的五种记忆类型，用于对提取和存储的记忆进行分类：
 * - `fact` — 客观事实（如「用户是后端工程师」「项目使用 TypeScript」）
 * - `preference` — 用户偏好（如「喜欢简洁的代码风格」「偏好中文回复」）
 * - `event` — 事件/时间线信息（如「上周部署了 v2.0」「昨天修复了登录 Bug」）
 * - `entity` — 命名实体（如人名、产品名、组织名等，便于后续实体关联）
 * - `instruction` — 用户给出的持久指令（如「以后都用函数式写法」「回复不超过 200 字」）
 *
 * @example
 * ```ts
 * import { MemoryTypeSchema } from '@h-ai/ai'
 *
 * // 校验字符串是否为合法记忆类型
 * const result = MemoryTypeSchema.safeParse('preference') // { success: true }
 *
 * // 用于配置或过滤
 * await ai.memory.recall('编程语言', { types: ['preference', 'fact'] })
 * ```
 */
export const MemoryTypeSchema = z.enum(['fact', 'preference', 'event', 'entity', 'instruction'])

/** 记忆类型 */
export type MemoryType = z.infer<typeof MemoryTypeSchema>

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
 *   objectId: 'user-001',
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
  /** 所属主体 ID（不指定时为全局记忆） */
  objectId?: string
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
  /** 所属主体 ID */
  objectId?: string
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
  /** 所属主体 ID（关联到提取结果） */
  objectId?: string
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
  /** 限定主体 ID */
  objectId?: string
}

// ─── 注入选项 ───

/**
 * 记忆注入选项（`injectMemories` 使用）
 *
 * 控制记忆注入行为：检索数量、Token 预算、注入位置等。
 */
export interface MemoryInjectionOptions {
  /** 注入的记忆数量（默认 5） */
  topK?: number
  /** 记忆占用的最大 token 预算（默认不限） */
  maxTokens?: number
  /** 注入位置：system = 追加到 system 消息末尾，before-last = 插入在最后一条用户消息之前 */
  position?: 'system' | 'before-last'
  /** 限定主体 ID */
  objectId?: string
}

// ─── 列表与清空选项 ───

/**
 * 记忆列表选项
 */
export interface MemoryListOptions {
  /** 过滤类型 */
  types?: MemoryType[]
  /** 限定主体 ID */
  objectId?: string
  /** 最大返回数 */
  limit?: number
}

/**
 * 记忆分页选项
 */
export interface MemoryListPageOptions {
  /** 过滤类型 */
  types?: MemoryType[]
  /** 限定主体 ID */
  objectId?: string
  /** 偏移量 */
  offset?: number
  /** 每页数量（默认 20） */
  limit?: number
}

/**
 * 记忆清空选项
 */
export interface MemoryClearOptions {
  /** 仅清空指定类型 */
  types?: MemoryType[]
  /** 仅清空指定主体 */
  objectId?: string
}

/**
 * 记忆条目更新输入
 *
 * 所有字段均为可选，仅传入需要更新的字段。
 */
export interface MemoryUpdateInput {
  /** 更新记忆内容（同时重新计算向量） */
  content?: string
  /** 更新记忆类型 */
  type?: MemoryType
  /** 更新重要性 */
  importance?: number
  /** 更新元数据 */
  metadata?: Record<string, unknown>
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
 * const extracted = await ai.memory.extract(messages, { objectId: 'user-001' })
 *
 * // 手动添加记忆
 * await ai.memory.add({ content: '用户偏好中文', type: 'preference', objectId: 'user-001' })
 *
 * // 检索相关记忆
 * const memories = await ai.memory.recall('用户的语言偏好', { objectId: 'user-001' })
 *
 * // 将记忆注入消息列表
 * const enriched = await ai.memory.injectMemories(newMessages, { objectId: 'user-001' })
 * const response = await ai.llm.chat({ messages: enriched.value })
 * ```
 */
export interface MemoryOperations {
  /**
   * 从对话消息中自动提取记忆条目
   *
   * 使用 LLM 分析对话内容，提取值得记住的事实、偏好、事件等。
   * 提取的记忆会自动持久化到 Store（含向量计算）。
   *
   * @param messages - 对话消息列表
   * @param options - 提取选项
   * @returns 提取到的记忆条目列表
   */
  extract: (messages: ChatMessage[], options?: MemoryExtractOptions) => Promise<Result<MemoryEntry[], AIError>>

  /**
   * 手动添加一条记忆
   *
   * 记忆会自动持久化到 Store（含向量计算）。
   *
   * @param entry - 记忆条目输入
   * @returns 存储后的完整记忆条目
   */
  add: (entry: MemoryEntryInput) => Promise<Result<MemoryEntry, AIError>>

  /**
   * 更新一条已有记忆
   *
   * 仅更新传入的字段，其余字段保持不变。
   * 若 content 被更新，会重新计算向量。
   * 更新结果自动持久化到 Store。
   *
   * @param memoryId - 记忆 ID
   * @param updates - 需要更新的字段
   * @returns 更新后的完整记忆条目
   */
  update: (memoryId: string, updates: MemoryUpdateInput) => Promise<Result<MemoryEntry, AIError>>

  /**
   * 按 ID 获取单条记忆
   *
   * @param memoryId - 记忆 ID
   * @returns 记忆条目，不存在时返回 MEMORY_NOT_FOUND
   */
  get: (memoryId: string) => Promise<Result<MemoryEntry, AIError>>

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
   * 工作流程：
   * 1. 从消息列表中提取最后一条用户消息作为检索查询
   * 2. 调用 `recall` 检索最相关的记忆条目
   * 3. 将记忆格式化为文本块，按指定位置注入消息列表
   *
   * @param messages - 原始消息列表
   * @param options - 注入选项（数量、位置、Token 预算等）
   * @returns 注入记忆后的新消息列表（不修改原数组）
   */
  injectMemories: (messages: ChatMessage[], options?: MemoryInjectionOptions) => Promise<Result<ChatMessage[], AIError>>

  /**
   * 删除单条记忆
   *
   * 同时从 Store 中移除持久化数据。
   *
   * @param memoryId - 记忆 ID
   * @returns 成功返回 ok(undefined)
   */
  remove: (memoryId: string) => Promise<Result<void, AIError>>

  /**
   * 获取记忆列表
   *
   * @param options - 列表选项
   * @returns 记忆条目列表
   */
  list: (options?: MemoryListOptions) => Promise<Result<MemoryEntry[], AIError>>

  /**
   * 分页获取记忆列表
   *
   * @param options - 分页选项
   * @returns 分页结果
   */
  listPage: (options?: MemoryListPageOptions) => Promise<Result<StorePage<MemoryEntry>, AIError>>

  /**
   * 清空记忆
   *
   * 同时从 Store 中移除持久化数据。
   *
   * @param options - 清空选项（可按类型/主体过滤）
   */
  clear: (options?: MemoryClearOptions) => Promise<Result<void, AIError>>
}
