/**
 * @h-ai/ai — Store 存储抽象类型
 *
 * 定义统一的键值式 CRUD + 查询接口，所有需要状态持久化的子系统通过此接口存取数据。
 * @module ai-store-types
 */

// ─── 存储作用域 ───

/**
 * 存储作用域——用于索引列加速查询
 *
 * 在 save 时传入 scope，值将写入独立索引列（object_id / session_id），
 * 后续 query / removeBy 可通过 StoreFilter.objectId / sessionId 使用索引过滤。
 */
export interface StoreScope {
  /** 交互主体 ID（写入 object_id 索引列） */
  objectId?: string
  /** 会话 ID（写入 session_id 索引列） */
  sessionId?: string
  /** 状态（写入 status 索引列） */
  status?: string
  /** 引用 ID（写入 ref_id 索引列，关联外部实体） */
  refId?: string
}

// ─── 查询过滤 ───

/**
 * where 条件中单个字段的值——纯值表示等值匹配，对象表示操作符
 *
 * @example
 * ```ts
 * // 等值：type === 'fact'
 * { type: 'fact' }
 *
 * // IN：type ∈ ['fact', 'preference']
 * { type: { $in: ['fact', 'preference'] } }
 *
 * // 范围：importance >= 0.5
 * { importance: { $gte: 0.5 } }
 *
 * // 组合：objectId === 'user-1' AND type ∈ ['fact'] AND importance >= 0.3
 * { objectId: 'user-1', type: { $in: ['fact'] }, importance: { $gte: 0.3 } }
 * ```
 */
export interface WhereOperator<V> {
  /** 值在给定列表中（IN 语义） */
  $in?: V[]
  /** 大于等于 */
  $gte?: V
  /** 大于 */
  $gt?: V
  /** 小于等于 */
  $lte?: V
  /** 小于 */
  $lt?: V
}

/**
 * 单字段条件：纯值 = 等值匹配，WhereOperator 对象 = 操作符匹配
 */
export type WhereValue<V> = V | WhereOperator<V>

/**
 * where 子句类型——每个字段可以是等值匹配或操作符对象
 */
export type WhereClause<T> = {
  [K in keyof T]?: WhereValue<T[K]>
}

/**
 * 存储查询过滤条件
 *
 * @typeParam T - 记录类型
 *
 * @example
 * ```ts
 * // 等值匹配（兼容旧写法）
 * store.query({ where: { type: 'fact', objectId: 'user-1' } })
 *
 * // 操作符匹配
 * store.query({ where: { type: { $in: ['fact', 'preference'] }, importance: { $gte: 0.5 } } })
 * ```
 */
export interface StoreFilter<T> {
  /** 字段匹配条件（等值或操作符） */
  where?: WhereClause<T>
  /** 按 object_id 索引列过滤（需要 AIStoreOptions.hasObjectId 启用） */
  objectId?: string
  /** 按 session_id 索引列过滤（需要 AIStoreOptions.hasSessionId 启用） */
  sessionId?: string
  /** 按 status 索引列过滤（需要 AIStoreOptions.hasStatus 启用，支持单值或多值 IN 匹配） */
  status?: string | string[]
  /** 按 ref_id 索引列过滤（需要 AIStoreOptions.hasRefId 启用） */
  refId?: string
  /** 排序 */
  orderBy?: { field: keyof T, direction: 'asc' | 'desc' }
  /** 数量限制 */
  limit?: number
}

// ─── 分页结果 ───

/**
 * 分页查询结果
 */
export interface StorePage<T> {
  /** 当前页数据 */
  items: T[]
  /** 总记录数 */
  total: number
}

// ─── 存储适配器抽象 ───

/**
 * AI 通用存储适配器
 *
 * 提供统一的 KV 式 CRUD + 查询能力，基于 reldb 实现持久化。
 *
 * @typeParam T - 记录类型
 */
export interface AIStore<T> {
  /** 保存一条记录（upsert 语义） */
  save: (id: string, data: T, scope?: StoreScope) => Promise<void>
  /** 批量保存 */
  saveMany: (items: Array<{ id: string, data: T, scope?: StoreScope }>) => Promise<void>
  /** 按 ID 获取 */
  get: (id: string) => Promise<T | undefined>
  /** 按条件查询 */
  query: (filter: StoreFilter<T>) => Promise<T[]>
  /** 分页查询 */
  queryPage: (filter: StoreFilter<T>, page: { offset: number, limit: number }) => Promise<StorePage<T>>
  /** 删除一条记录 */
  remove: (id: string) => Promise<boolean>
  /** 按条件删除 */
  removeBy: (filter: StoreFilter<T>) => Promise<number>
  /** 计数 */
  count: (filter?: StoreFilter<T>) => Promise<number>
  /** 清空（可选按条件） */
  clear: (filter?: StoreFilter<T>) => Promise<void>
}

// ─── 向量存储适配器 ───

/**
 * AI 向量存储适配器
 *
 * 专用于需要向量检索的场景（如 Memory），基于 vecdb 实现。
 */
export interface AIVectorStore {
  /** 存储向量 */
  upsert: (id: string, vector: number[], metadata?: Record<string, unknown>) => Promise<void>
  /** 向量相似度检索 */
  search: (vector: number[], options?: { topK?: number, filter?: Record<string, unknown> }) => Promise<Array<{ id: string, score: number, metadata?: Record<string, unknown> }>>
  /** 删除向量 */
  remove: (id: string) => Promise<void>
  /** 批量删除 */
  removeBy: (filter: Record<string, unknown>) => Promise<number>
  /** 清空 */
  clear: (filter?: Record<string, unknown>) => Promise<void>
}

// ─── 交互作用域 ───

/**
 * 交互主体引用
 *
 * 代表"和谁"交互 — 可以是人、AI Agent、或系统自身。
 */
export interface ObjectRef {
  /** 主体唯一 ID */
  objectId: string
  /** 主体类型 */
  objectType?: 'human' | 'agent' | 'system'
}

/**
 * 完整的交互作用域 = Object + Session
 */
export interface InteractionScope {
  /** 交互主体 ID */
  objectId: string
  /** 会话 ID */
  sessionId: string
}

/**
 * 会话信息
 */
export interface SessionInfo {
  /** 会话 ID */
  sessionId: string
  /** 所属主体 ID */
  objectId: string
  /** 会话标题 */
  title?: string
  /** 创建时间（Unix 毫秒） */
  createdAt: number
  /** 更新时间（Unix 毫秒） */
  updatedAt: number
  /** 附加元数据 */
  metadata?: Record<string, unknown>
}
