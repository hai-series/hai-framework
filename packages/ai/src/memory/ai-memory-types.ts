/**
 * @h-ai/ai — Memory 子功能类型
 *
 * 定义记忆管理操作的类型接口：提取、存储、检索、注入。
 * 支持从对话中自动提取关键事实、偏好、事件等记忆，并在后续对话中检索注入。
 * @module ai-memory-types
 */

import type { HaiResult } from '@h-ai/core'

import type { ChatMessage, TempModelConfig } from '../llm/ai-llm-types.js'
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
  /** 作用域（JSON 对象，key-value 匹配过滤。用于子 session 记忆隔离等场景） */
  scope?: Record<string, unknown>
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
  /** 作用域（JSON 对象，key-value 匹配过滤。用于子 session 记忆隔离等场景） */
  scope?: Record<string, unknown>
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
  /** 自定义提取 systemPrompt（覆盖模块配置与内置默认提示词） */
  systemPrompt?: string
  /** 过滤低重要性条目（默认 0） */
  minImportance?: number
  /** 所属主体 ID（关联到提取结果） */
  objectId?: string
  /** 作用域（JSON 对象，提取的记忆将关联此 scope） */
  scope?: Record<string, unknown>
  /**
   * 临时模型配置（携带凭据的模型请求）。
   *
   * 用于传递运行时解析的 apiKey / baseUrl 等凭证，
   * 避免回退到全局 .env 配置。优先级高于全局 config.models 查找。
   */
  tempModel?: TempModelConfig
  /** 取消整条记忆提取链（包括事实抽取与 native 对账 LLM 调用） */
  signal?: AbortSignal
}

// ─── 检索选项 ───

/**
 * 记忆检索选项
 */
export interface MemoryRecallOptions {
  /** 返回数量（默认使用配置的 defaultTopK） */
  topK?: number
  /**
   * 候选池倍数（覆盖配置的 candidateMultiplier）
   *
   * 检索时先取回 `topK × candidateMultiplier` 条候选再按 scope / 类型 / 重要性过滤，
   * 最后截取 topK。scope 过滤较严（如按 topic / persona 隔离）时应调大，避免漏召回。
   */
  candidateMultiplier?: number
  /** 过滤类型 */
  types?: MemoryType[]
  /** 最低重要性 */
  minImportance?: number
  /** 时间衰减权重 [0, 1]（0 = 不考虑时间，1 = 仅按时间排序） */
  recencyWeight?: number
  /** 限定主体 ID */
  objectId?: string
  /** 限定作用域（key-value 匹配过滤，用于子 session 记忆隔离等场景） */
  scope?: Record<string, unknown>
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
  /**
   * 候选池倍数（覆盖配置的 candidateMultiplier）
   *
   * 透传给底层 `recall`，scope 过滤较严时应调大以避免漏召回。
   */
  candidateMultiplier?: number
  /** 记忆占用的最大 token 预算（默认不限） */
  maxTokens?: number
  /** 注入位置：system = 追加到 system 消息末尾，before-last = 插入在最后一条用户消息之前 */
  position?: 'system' | 'before-last'
  /** 限定主体 ID */
  objectId?: string
  /** 限定作用域（key-value 匹配过滤，用于子 session 记忆隔离等场景） */
  scope?: Record<string, unknown>
  /** 限定记忆类型 */
  types?: MemoryType[]
  /** 最低重要性阈值 */
  minImportance?: number
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
  /** 限定作用域（key-value 匹配过滤，用于子 session / 主题 / 角色记忆隔离等场景） */
  scope?: Record<string, unknown>
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
  /** 限定作用域（key-value 匹配过滤，用于子 session / 主题 / 角色记忆隔离等场景） */
  scope?: Record<string, unknown>
  /** 偏移量 */
  offset?: number
  /** 每页数量（默认 20） */
  limit?: number
}

/**
 * 记忆清空选项
 *
 * 安全语义：未传任何过滤条件时清空全部；传入 objectId / types / scope 时
 * 仅删除同时匹配所有给定条件的记忆，避免误删其他主体或类型的记忆。
 */
export interface MemoryClearOptions {
  /** 仅清空指定类型 */
  types?: MemoryType[]
  /** 仅清空指定主体 */
  objectId?: string
  /** 仅清空匹配指定作用域的记忆（key-value 匹配过滤） */
  scope?: Record<string, unknown>
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
 * const extracted = await ai.memory.extract(messages, {
 *   objectId: 'user-001',
 *   systemPrompt: 'Only extract durable user preferences and explicit long-term instructions.',
 * })
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

/**
 * 按 ID 访问单条记忆（get / update / remove）时的归属校验作用域。
 *
 * 传入后，Provider 先读取记忆再校验：`entry.objectId` 必须等于 `objectId`，且 `entry.scope`
 * 包含 `scope` 的全部 key-value；不匹配时统一返回 `MEMORY_NOT_FOUND`（避免通过错误差异
 * 枚举其他主体的记忆）。不传时不做归属校验（向后兼容）；处理不可信输入的 memoryId 时必须传入。
 */
export interface MemoryAccessScope {
  /** 归属主体 ID（必须与记忆 entry.objectId 一致） */
  objectId: string
  /** 业务作用域（entry.scope 必须包含这些 key-value） */
  scope?: Record<string, unknown>
}

/**
 * 记忆作用域绑定（`ai.memory.scoped()` 使用）
 *
 * 绑定后，所有操作自动携带 `objectId` 与 `scope`，无需每次手动传入，
 * 从根本上避免「忘记传 objectId 导致跨租户越权」的安全隐患。
 */
export interface ScopedMemoryBinding {
  /** 归属主体 ID（所有操作自动绑定） */
  objectId: string
  /** 业务作用域（所有操作自动绑定并作为归属校验的一部分，如 `{ topicId, personaId }`） */
  scope?: Record<string, unknown>
}

/**
 * 全局清空选项（`ai.memory.admin.clearAll()` 使用）
 *
 * 危险操作：清空整个记忆后端的全部数据。必须显式传入 `confirm: true`，
 * 防止误调用；普通 `clear()` 不再支持通过省略参数隐式清空全局。
 */
export interface MemoryClearAllOptions {
  /** 必须显式为 `true`，否则拒绝执行 */
  confirm: true
}

/**
 * 记忆管理接口（`ai.memory.admin`）
 *
 * 承载危险的全局操作，与业务作用域操作明确分离。
 */
export interface MemoryAdminOperations {
  /**
   * 清空整个记忆后端的全部数据（跨所有主体 / 作用域）
   *
   * @param options - 必须传入 `{ confirm: true }`
   * @returns 成功返回 ok(undefined)；未确认返回 MEMORY_STORE_FAILED
   */
  clearAll: (options: MemoryClearAllOptions) => Promise<HaiResult<void>>
}

/**
 * 记忆核心操作（Provider 实现层）
 *
 * 各 Provider（native / mem0）实现这一组操作。公共入口 `ai.memory` 在其基础上
 * 叠加作用域绑定（`scoped`）与管理接口（`admin`），并对 `clear` 施加空过滤保护。
 */
export interface MemoryCoreOperations {
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
  extract: (messages: ChatMessage[], options?: MemoryExtractOptions) => Promise<HaiResult<MemoryEntry[]>>

  /**
   * 根据查询检索最相关的记忆
   *
   * 综合向量相似度、重要性、时间衰减进行排序。
   *
   * @param query - 查询文本
   * @param options - 检索选项
   * @returns 相关记忆列表
   */
  recall: (query: string, options?: MemoryRecallOptions) => Promise<HaiResult<MemoryEntry[]>>

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
  injectMemories: (messages: ChatMessage[], options?: MemoryInjectionOptions) => Promise<HaiResult<ChatMessage[]>>

  /**
   * 手动添加一条记忆
   *
   * 记忆会自动持久化到 Store（含向量计算）。
   *
   * @param entry - 记忆条目输入
   * @returns 存储后的完整记忆条目
   */
  add: (entry: MemoryEntryInput) => Promise<HaiResult<MemoryEntry>>

  /**
   * 更新一条已有记忆
   *
   * 仅更新传入的字段，其余字段保持不变。
   * 若 content 被更新，会重新计算向量。
   * 更新结果自动持久化到 Store。
   *
   * @param memoryId - 记忆 ID
   * @param updates - 需要更新的字段
   * @param accessScope - 可选归属校验（不匹配返回 MEMORY_NOT_FOUND）
   * @returns 更新后的完整记忆条目
   */
  update: (memoryId: string, updates: MemoryUpdateInput, accessScope?: MemoryAccessScope) => Promise<HaiResult<MemoryEntry>>

  /**
   * 按 ID 获取单条记忆
   *
   * @param memoryId - 记忆 ID
   * @param accessScope - 可选归属校验（不匹配返回 MEMORY_NOT_FOUND）
   * @returns 记忆条目，不存在时返回 MEMORY_NOT_FOUND
   */
  get: (memoryId: string, accessScope?: MemoryAccessScope) => Promise<HaiResult<MemoryEntry>>

  /**
   * 删除单条记忆
   *
   * 同时从 Store 中移除持久化数据。
   *
   * @param memoryId - 记忆 ID
   * @param accessScope - 可选归属校验（不匹配返回 MEMORY_NOT_FOUND）
   * @returns 成功返回 ok(undefined)
   */
  remove: (memoryId: string, accessScope?: MemoryAccessScope) => Promise<HaiResult<void>>

  /**
   * 获取记忆列表
   *
   * @param options - 列表选项
   * @returns 记忆条目列表
   */
  list: (options?: MemoryListOptions) => Promise<HaiResult<MemoryEntry[]>>

  /**
   * 分页获取记忆列表
   *
   * @param options - 分页选项
   * @returns 分页结果
   */
  listPage: (options?: MemoryListPageOptions) => Promise<HaiResult<StorePage<MemoryEntry>>>

  /**
   * 清空记忆
   *
   * 同时从 Store 中移除持久化数据。
   *
   * @param options - 清空选项（可按类型/主体过滤）
   */
  clear: (options?: MemoryClearOptions) => Promise<HaiResult<void>>
}

/**
 * 作用域绑定的记忆操作（`ai.memory.scoped()` 返回）
 *
 * 所有操作自动携带绑定的 `objectId` 与 `scope`，无需重复传入；`get` / `update` / `remove`
 * 自动施加归属校验（跨租户访问返回 `MEMORY_NOT_FOUND`）；`clear` 仅清空绑定作用域内的记忆，
 * 永远不会误清全局。
 */
export interface ScopedMemoryOperations {
  /** 从对话中提取记忆（自动绑定 objectId / scope） */
  extract: (messages: ChatMessage[], options?: Omit<MemoryExtractOptions, 'objectId' | 'scope'>) => Promise<HaiResult<MemoryEntry[]>>
  /** 检索相关记忆（自动绑定 objectId / scope） */
  recall: (query: string, options?: Omit<MemoryRecallOptions, 'objectId' | 'scope'>) => Promise<HaiResult<MemoryEntry[]>>
  /** 注入相关记忆（自动绑定 objectId / scope） */
  injectMemories: (messages: ChatMessage[], options?: Omit<MemoryInjectionOptions, 'objectId' | 'scope'>) => Promise<HaiResult<ChatMessage[]>>
  /** 添加记忆（自动绑定 objectId / scope） */
  add: (entry: Omit<MemoryEntryInput, 'objectId' | 'scope'>) => Promise<HaiResult<MemoryEntry>>
  /** 更新记忆（自动施加归属校验） */
  update: (memoryId: string, updates: MemoryUpdateInput) => Promise<HaiResult<MemoryEntry>>
  /** 按 ID 获取记忆（自动施加归属校验） */
  get: (memoryId: string) => Promise<HaiResult<MemoryEntry>>
  /** 删除记忆（自动施加归属校验） */
  remove: (memoryId: string) => Promise<HaiResult<void>>
  /** 列出记忆（自动绑定 objectId / scope） */
  list: (options?: Omit<MemoryListOptions, 'objectId' | 'scope'>) => Promise<HaiResult<MemoryEntry[]>>
  /** 分页列出记忆（自动绑定 objectId / scope） */
  listPage: (options?: Omit<MemoryListPageOptions, 'objectId' | 'scope'>) => Promise<HaiResult<StorePage<MemoryEntry>>>
  /** 清空绑定作用域内的记忆（自动绑定 objectId / scope，不会误清全局） */
  clear: (options?: Omit<MemoryClearOptions, 'objectId' | 'scope'>) => Promise<HaiResult<void>>
}

/**
 * 公共记忆操作接口（通过 `ai.memory` 访问）
 *
 * 在核心操作基础上增加：
 * - `scoped(binding)`：返回自动绑定 objectId / scope 的安全实例（多租户推荐入口）；
 * - `admin`：承载危险的全局操作（如 `clearAll`）；
 * - `clear`：拒绝空过滤调用（无 objectId / types / scope 时返回错误），防止误清全局。
 */
export interface MemoryOperations extends MemoryCoreOperations {
  /**
   * 创建绑定作用域的记忆实例
   *
   * @param binding - 作用域绑定（objectId + 可选 scope）
   * @returns 所有操作自动携带该作用域的记忆实例
   */
  scoped: (binding: ScopedMemoryBinding) => ScopedMemoryOperations
  /** 管理接口（危险的全局操作，需显式确认） */
  admin: MemoryAdminOperations
}
