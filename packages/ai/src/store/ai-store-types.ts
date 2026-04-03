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
  /** 按 object_id 索引列过滤（需要 AIRelStoreOptions.hasObjectId 启用） */
  objectId?: string
  /** 按 session_id 索引列过滤（需要 AIRelStoreOptions.hasSessionId 启用） */
  sessionId?: string
  /** 按 status 索引列过滤（需要 AIRelStoreOptions.hasStatus 启用，支持单值或多值 IN 匹配） */
  status?: string | string[]
  /** 按 ref_id 索引列过滤（需要 AIRelStoreOptions.hasRefId 启用） */
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

// ─── 关系存储配置 ───

/**
 * AIRelStore 配置选项
 *
 * 控制存储实例需要创建哪些索引列（object_id / session_id / status / ref_id）。
 */
export interface AIRelStoreOptions {
  /** 是否创建 object_id 索引列 */
  hasObjectId?: boolean
  /** 是否创建 session_id 索引列 */
  hasSessionId?: boolean
  /** 是否创建 status 索引列 */
  hasStatus?: boolean
  /** 是否创建 ref_id 索引列 */
  hasRefId?: boolean
}

// ─── 存储适配器抽象 ───

/**
 * AI 关系存储适配器
 *
 * 提供统一的 KV 式 CRUD + 查询能力，由 AIStoreProvider 创建具体实现。
 *
 * @typeParam T - 记录类型
 */
export interface AIRelStore<T> {
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
 * 专用于需要向量检索的场景（如 Memory），由 AIStoreProvider 创建具体实现。
 */
export interface AIVectorStore {
  /** 存储向量 */
  upsert: (id: string, vector: number[], metadata?: Record<string, unknown>) => Promise<void>
  /** 向量相似度检索 */
  search: (vector: number[], options?: { topK?: number, minScore?: number, filter?: Record<string, unknown> }) => Promise<Array<{ id: string, score: number, content?: string, metadata?: Record<string, unknown> }>>
  /** 删除向量 */
  remove: (id: string) => Promise<void>
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

// ─── Knowledge 存储抽象 ───

/**
 * Knowledge 专用存储接口
 *
 * 封装知识库的实体索引、文档元数据和向量操作。
 * 默认实现使用 reldb 归一化表 + vecdb 向量检索；
 * SaaS 实现可对接远端知识库 API。
 */
export interface KnowledgeStore {
  /** 初始化存储（建表 / 建集合 / 建索引，幂等） */
  initialize: (collection: string, dimension: number) => Promise<void>

  // ─── 实体 CRUD ───

  /** 插入或更新实体 */
  upsertEntity: (entity: { id: string, name: string, type: string, aliases?: string[], description?: string }) => Promise<void>
  /** 按名称模糊搜索实体（匹配 name 和 aliases） */
  findEntitiesByName: (keyword: string) => Promise<Array<{ id: string, name: string, type: string, aliases: string[] }>>
  /** 列出实体（支持类型过滤和关键词搜索） */
  listEntities: (options?: { type?: string, keyword?: string, limit?: number }) => Promise<Array<{ id: string, name: string, type: string, aliases: string[], description: string | null, createdAt: string | null, updatedAt: string | null }>>

  // ─── 文档-实体关联 ───

  /** 插入文档-实体关联 */
  insertEntityDocument: (relation: { entityId: string, documentId: string, chunkId?: string, collection: string, relevance?: number, context?: string }) => Promise<void>
  /** 按实体 ID 列表查询关联文档 */
  findDocumentsByEntityIds: (entityIds: string[], collection?: string) => Promise<Array<{ entityId: string, documentId: string, chunkId: string, collection: string, relevance: number, context: string | null }>>
  /** 按实体名称查询实体及其关联文档 */
  findByEntityName: (entityName: string, options?: { collection?: string, type?: string }) => Promise<Array<{ entity: { id: string, name: string, type: string, aliases: string[], description: string | null }, documents: Array<{ documentId: string, chunkId: string, collection: string, relevance: number, context: string | null }> }>>
  /** 删除文档相关的实体关联 */
  removeDocumentEntityRelations: (documentId: string, collection: string) => Promise<void>

  // ─── 文档元数据 ───

  /** 保存文档元数据 */
  upsertDocument: (doc: { documentId: string, collection: string, title?: string, url?: string, chunkCount: number, createdAt: number }) => Promise<void>
  /** 按 documentId + collection 获取单个文档元数据 */
  getDocument: (documentId: string, collection: string) => Promise<{ documentId: string, collection: string, title: string | null, url: string | null, chunkCount: number, createdAt: number } | undefined>
  /** 列出文档元数据 */
  listDocuments: (collection: string, options?: { offset?: number, limit?: number }) => Promise<Array<{ documentId: string, collection: string, title: string | null, url: string | null, chunkCount: number, createdAt: number }>>
  /** 查询每个文档的实体关联数 */
  listDocumentEntityCounts: (documentIds: string[], collection: string) => Promise<Map<string, number>>
  /** 删除文档元数据 */
  removeDocument: (documentId: string, collection: string) => Promise<void>

  // ─── 向量操作 ───

  /** 批量写入向量 */
  upsertVectors: (collection: string, vectors: Array<{ id: string, vector: number[], content?: string, metadata?: Record<string, unknown> }>) => Promise<void>
  /** 向量相似度检索 */
  searchVectors: (collection: string, vector: number[], options?: { topK?: number, minScore?: number, filter?: Record<string, unknown> }) => Promise<Array<{ id: string, score: number, content?: string, metadata?: Record<string, unknown> }>>
  /** 批量删除向量 */
  removeVectors: (collection: string, ids: string[]) => Promise<void>
  /** 确保向量集合存在 */
  ensureCollection: (collection: string, dimension: number) => Promise<void>

  // ─── Collection 注册表 ───

  /** 注册 collection（setup 时持久化，幂等） */
  registerCollection: (collection: string, dimension: number) => Promise<void>
  /** 检查 collection 是否已在注册表中存在（跨节点/重启后仍有效） */
  collectionExists: (collection: string) => Promise<boolean>
}

// ─── 存储 Provider ───

/**
 * AI 存储 Provider 接口
 *
 * 负责创建 AIRelStore / AIVectorStore 实例，并管理存储层生命周期。
 * 默认实现基于 reldb + vecdb；也可对接 SaaS API 或其他后端。
 *
 * @example
 * ```ts
 * // 使用默认 reldb+vecdb provider
 * ai.init({ store: { type: 'db' } })
 *
 * // 使用自定义 provider
 * ai.init({ store: { type: 'custom', provider: myProvider } })
 * ```
 */
export interface AIStoreProvider {
  /** Provider 名称（如 'db'、'api'） */
  readonly name: string

  /** 创建关系数据存储实例 */
  createRelStore: <T>(name: string, options?: AIRelStoreOptions) => AIRelStore<T>

  /** 创建向量数据存储实例 */
  createVectorStore: (name: string) => AIVectorStore

  /**
   * 创建 knowledge 专用存储（可选）
   *
   * 如果 Provider 不提供此方法，knowledge 子系统将不可用。
   * 默认 db Provider 提供基于 reldb 归一化表 + vecdb 的高效实现。
   */
  createKnowledgeStore?: () => KnowledgeStore

  /**
   * 初始化所有已创建的存储（建表、建连接等）
   *
   * 由 ai.init() 在创建完所有 store 实例后统一调用。
   */
  initialize: () => Promise<void>

  /** 关闭所有存储（释放连接等），由 ai.close() 调用 */
  close?: () => Promise<void>
}
