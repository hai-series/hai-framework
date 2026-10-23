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
 *
 * @example
 * ```ts
 * import type { AIRelStore, StoreScope } from '@h-ai/ai'
 * async function saveOwned(store: AIRelStore<{ title: string }>, userId: string) {
 *   const scope: StoreScope = { objectId: userId, sessionId: 'session-1' }
 *   await store.save('record-1', { title: '指南' }, scope)
 * }
 * ```
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
 * import type { WhereOperator } from '@h-ai/ai'
 * const condition: WhereOperator<number> = { $gte: 0.5, $lt: 1 }
 * const filter = { condition }
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
 *
 * @example
 * ```ts
 * import type { WhereValue } from '@h-ai/ai'
 * const condition: WhereValue<string> = { $in: ['fact', 'preference'] }
 * const filter = { condition }
 * ```
 */
export type WhereValue<V> = V | WhereOperator<V>

/**
 * where 子句类型——每个字段可以是等值匹配或操作符对象
 *
 * @example
 * ```ts
 * import type { WhereClause } from '@h-ai/ai'
 * const condition: WhereClause<{ importance: number }> = { importance: { $gte: 0.5 } }
 * const filter = { condition }
 * ```
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
 * import type { AIRelStore, StoreFilter } from '@h-ai/ai'
 * async function queryOwned(store: AIRelStore<{ importance: number }>, userId: string) {
 *   const filter: StoreFilter<{ importance: number }> = { objectId: userId, where: { importance: { $gte: 0.5 } }, limit: 20 }
 *   return await store.query(filter)
 * }
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
  /**
   * 按业务作用域过滤（`data.scope` JSON 字段的 key-value 包含匹配）。
   *
   * 仅在 PostgreSQL 上下推为 `data @> ?::jsonb`（配合 GIN 索引加速）；
   * SQLite / MySQL 上为 no-op（不影响结果，由调用方在内存中完成 scope 匹配）。
   */
  scope?: Record<string, unknown>
  /** 排序 */
  orderBy?: { field: keyof T, direction: 'asc' | 'desc' }
  /** 数量限制 */
  limit?: number
}

// ─── 分页结果 ───

/**
 * 分页查询结果
 *
 * @example
 * ```ts
 * import type { StorePage } from '@h-ai/ai'
 * const page: StorePage<{ title: string }> = { items: [{ title: '指南' }], total: 1 }
 * const titles = page.items.map(item => item.title)
 * ```
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
 *
 * @example
 * ```ts
 * import type { AIStoreProvider, AIRelStoreOptions } from '@h-ai/ai'
 * async function prepare(provider: AIStoreProvider) {
 *   const options: AIRelStoreOptions = { hasObjectId: true, hasSessionId: true }
 *   const store = provider.createRelStore<{ title: string }>('documents', options)
 *   await provider.initialize()
 *   return store
 * }
 * ```
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
  /**
   * 是否为业务作用域（记录内 `data.scope` JSON 字段）建立索引以加速 scope 过滤。
   *
   * 仅 PostgreSQL 生效：在 JSONB `data` 列上建 GIN 索引，配合 `StoreFilter.scope`
   * 的 `data @> ?::jsonb` 包含查询下推，避免加载全部候选再在内存过滤。
   * SQLite / MySQL 不建索引，`scope` 过滤退回调用方内存匹配（当前行为不变）。
   */
  hasScopeIndex?: boolean
}

// ─── 存储适配器抽象 ───

/**
 * 同一次读取的记录及不可复用的存储版本。
 *
 * @example
 * ```ts
 * import type { AIVersionedRecord } from '@h-ai/ai'
 * function nextVersion(snapshot: AIVersionedRecord<{ count: number }>) {
 *   return { expectedVersion: snapshot.version, data: { count: snapshot.data.count + 1 } }
 * }
 * ```
 */
export interface AIVersionedRecord<T> {
  /** 每次写入都会更换的版本；不得把业务 ID 或时间戳用作版本。 */
  version: string
  /** 该版本的独立数据快照，修改它不会隐式写入 Store。 */
  data: T
}

/**
 * 单记录的原子条件写入；不跨表承诺事务。
 *
 * @example
 * ```ts
 * import type { AIRelStore, AIRelStoreCompareAndSwap } from '@h-ai/ai'
 * async function increment(store: AIRelStore<{ count: number }>, id: string) {
 *   const previous = await store.readVersioned(id)
 *   const change: AIRelStoreCompareAndSwap<{ count: number }> = { expectedVersion: previous?.version, data: { count: (previous?.data.count ?? 0) + 1 }, notAfter: await store.currentTime() + 1000 }
 *   const version = await store.compareAndSwap(id, change)
 *   if (!version) throw new Error('Conflict or deadline expired')
 *   return version
 * }
 * ```
 */
export interface AIRelStoreCompareAndSwap<T> {
  /** undefined 只允许新建；已有记录必须精确匹配读取到的版本。 */
  expectedVersion: string | undefined
  /** 成功时替换的数据；需要撤销时持久化业务墓碑，避免删除后 missing ABA。 */
  data: T
  /** 与数据同一次条件提交的索引列；未传时保留已有索引。 */
  scope?: StoreScope
  /** 可选 Unix 毫秒截止时间；执行写入时由存储端时钟原子检查，等于截止时间也拒绝。 */
  notAfter?: number
}

/**
 * AI 关系存储适配器
 *
 * 提供统一的 KV 式 CRUD + 查询能力，由 AIStoreProvider 创建具体实现。
 * 这是内部适配边界：读取/写入故障抛错，不能伪装为缺失、空结果或完成；
 * 最近的非流式业务 API 负责转换为失败 HaiResult，流迭代保留抛错契约。
 *
 * @typeParam T - 记录类型
 *
 * @example
 * ```ts
 * import type { AIRelStore } from '@h-ai/ai'
 * // 存储异常保留抛错；业务边界负责转 HaiResult，不能当作缺失。
 * async function claim(store: AIRelStore<{ owner: string }>, id: string, owner: string) {
 *   const current = await store.readVersioned(id)
 *   const deadline = await store.currentTime() + 30_000
 *   return await store.compareAndSwap(id, { expectedVersion: current?.version, data: { owner }, notAfter: deadline })
 * }
 * ```
 */
export interface AIRelStore<T> {
  /**
   * 存储端 Unix 毫秒时钟；共享租约以它计算期限，不依赖各节点墙钟同步。
   */
  currentTime: () => Promise<number>
  /**
   * 读取记录与版本的同一快照；失败抛错，不能把故障当作缺失。
   */
  readVersioned: (id: string) => Promise<AIVersionedRecord<T> | undefined>
  /**
   * 原子条件替换；成功返回新版本，冲突/截止返回 undefined，存储故障抛错。
   */
  compareAndSwap: (id: string, input: AIRelStoreCompareAndSwap<T>) => Promise<string | undefined>
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
 *
 * @example
 * ```ts
 * import type { AIVectorStore } from '@h-ai/ai'
 * async function searchTenant(store: AIVectorStore, vector: number[], tenant: string) {
 *   // 向量维度须与集合一致，Provider 过滤能力也须满足部署后端契约。
 *   return await store.search(vector, { topK: 5, filter: { tenant } })
 * }
 * ```
 */
export interface AIVectorStore {
  /** 存储向量 */
  upsert: (id: string, vector: number[], metadata?: Record<string, unknown>) => Promise<void>
  /**
   * 向量相似度检索。默认 DB Store 的 filter 透传底层 Provider，失败抛错，由领域 API 转为 HaiResult。
   * LanceDB 只支持顶层 string/有限 number/boolean/null 的 AND 匹配，不支持嵌套结构。
   */
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
 *
 * @example
 * ```ts
 * import type { ObjectRef } from '@h-ai/ai'
 * const value: ObjectRef = { objectId: 'agent-1', objectType: 'agent' }
 * const output = value.objectId
 * ```
 */
export interface ObjectRef {
  /** 主体唯一 ID */
  objectId: string
  /** 主体类型 */
  objectType?: 'human' | 'agent' | 'system'
}

/**
 * 完整的交互作用域 = Object + Session
 *
 * @example
 * ```ts
 * import type { InteractionScope } from '@h-ai/ai'
 * const value: InteractionScope = { objectId: 'user-1', sessionId: 'session-1' }
 * const output = `${value.objectId}/${value.sessionId}`
 * ```
 */
export interface InteractionScope {
  /** 交互主体 ID */
  objectId: string
  /** 会话 ID */
  sessionId: string
}

/**
 * 会话信息；目录更新必须保留并发标题及删除标记。
 *
 * @example
 * ```ts
 * import type { SessionInfo } from '@h-ai/ai'
 * const value: SessionInfo = { objectId: 'user-1', sessionId: 'session-1', title: '部署咨询', createdAt: Date.now(), updatedAt: Date.now() }
 * const output = value.deleted ? undefined : value.title
 * ```
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
  /** 永久删除标记；同一主体的 sessionId 不再复用，迟到生成不得重建目录。 */
  deleted?: boolean
}

// ─── Knowledge 存储抽象 ───

/**
 * 一次完整准备、尚未发布的文档版本；chunk 和实体关联必须使用本版本的唯一 ID。
 *
 * @example
 * ```ts
 * import type { KnowledgeDocumentRevision } from '@h-ai/ai'
 * const value: KnowledgeDocumentRevision = { documentId: 'guide', collection: 'docs', revision: crypto.randomUUID(), chunks: [{ id: 'revision-chunk-1', content: '共享数据库', vector: [0.1, 0.2], metadata: { documentId: 'guide' } }], entities: [], createdAt: Date.now() }
 * const output = value.chunks.map(chunk => chunk.id)
 * ```
 */
export interface KnowledgeDocumentRevision {
  /** 业务文档 ID。 */
  documentId: string
  /** 逻辑集合名。 */
  collection: string
  /** 每次导入生成的不可复用版本。 */
  revision: string
  /** 标题。 */
  title?: string
  /** 信源地址。 */
  url?: string
  /** 本次版本的创建时间，Unix 毫秒。 */
  createdAt: number
  /** 本版本全部分块；向量只在暂存阶段写入，发布快照不保留向量数组。 */
  chunks: Array<{ id: string, vector: number[], content: string, metadata: Record<string, unknown> }>
  /** 本版本全部实体及命中分块，不与其他文档共享可变实体行。 */
  entities: Array<{ id: string, name: string, type: string, aliases: string[], description?: string, chunkIds: string[] }>
}

/**
 * 有界补偿扫描的进度；调用方以 offset + processed 继续，直到覆盖 total。
 *
 * @example
 * ```ts
 * import type { KnowledgeRepairProgress } from '@h-ai/ai'
 * const value: KnowledgeRepairProgress = { processed: 100, total: 250 }
 * const output = value.processed < value.total
 * ```
 */
export interface KnowledgeRepairProgress {
  /** 本页检查的文档墓碑/清单数。 */
  processed: number
  /** 集合内清单总数，包含已删除文档的补偿墓碑。 */
  total: number
}

/**
 * 来自同一已发布快照的文档摘要，实体数不会与另一个 revision 拼接。
 *
 * @example
 * ```ts
 * import type { KnowledgeDocumentMetadata } from '@h-ai/ai'
 * const value: KnowledgeDocumentMetadata = { documentId: 'guide', collection: 'docs', revision: 'revision-1', title: '指南', url: null, chunkCount: 2, entityCount: 1, createdAt: Date.now() }
 * const output = value.title ?? value.documentId
 * ```
 */
export interface KnowledgeDocumentMetadata {
  /** 业务文档 ID。 */
  documentId: string
  /** 逻辑集合名。 */
  collection: string
  /** 当前发布版本。 */
  revision: string
  /** 可选标题，缺失为 null。 */
  title: string | null
  /** 可选信源地址，缺失为 null。 */
  url: string | null
  /** 同版本分块数。 */
  chunkCount: number
  /** 同版本实体数。 */
  entityCount: number
  /** 版本创建时间，Unix 毫秒。 */
  createdAt: number
}

/**
 * Knowledge 专用存储接口
 *
 * 封装知识库的实体索引、文档元数据和向量操作。
 * 默认实现使用 reldb 单文档版本清单 CAS + vecdb 向量检索；
 * SaaS 实现可对接远端知识库 API。
 *
 * @example
 * ```ts
 * import type { KnowledgeStore, KnowledgeDocumentRevision } from '@h-ai/ai'
 * async function publish(store: KnowledgeStore, document: KnowledgeDocumentRevision) {
 *   await store.initialize(document.collection, document.chunks[0]?.vector.length ?? 2)
 *   const result = await store.replaceDocument(document)
 *   if (result.cleanupPending) {
 *     let offset = 0
 *     while (true) {
 *       const progress = await store.repair(document.collection, { offset, limit: 100 })
 *       offset += progress.processed
 *       if (offset >= progress.total || progress.processed === 0) break
 *     }
 *   }
 * }
 * ```
 */
export interface KnowledgeStore {
  /** 初始化存储（建表 / 建集合 / 建索引，幂等） */
  initialize: (collection: string, dimension: number) => Promise<void>

  /**
   * 先持久化暂存清单，再写向量，最后原子发布完整版本；失败保留原可见版本和补偿记录。
   * 同一文档正在导入时拒绝并发写入。cleanupPending 表示发布成功但旧数据清理需重试。
   */
  replaceDocument: (document: KnowledgeDocumentRevision) => Promise<{ cleanupPending: boolean }>
  /**
   * 恢复过期暂存并清理记录在案的旧向量；故障抛错，不以空结果伪装成功。
   * 被遗弃暂存的墓碑保留，重复扫描可清理旧节点迟到的外部写入。
   */
  repair: (collection: string, options?: { offset?: number, limit?: number }) => Promise<KnowledgeRepairProgress>

  // ─── 实体 CRUD ───

  /** 按名称模糊搜索实体（匹配 name 和 aliases，可按 collection 过滤） */
  findEntitiesByName: (keyword: string, collection?: string) => Promise<Array<{ id: string, name: string, type: string, aliases: string[] }>>
  /** 列出实体（支持 collection / 类型 / 关键词搜索） */
  listEntities: (options?: { collection?: string, type?: string, keyword?: string, limit?: number }) => Promise<Array<{ id: string, name: string, type: string, aliases: string[], description: string | null, createdAt: string | null, updatedAt: string | null }>>

  // ─── 文档-实体关联 ───

  /** 按实体 ID 列表查询关联文档 */
  findDocumentsByEntityIds: (entityIds: string[], collection?: string) => Promise<Array<{ entityId: string, documentId: string, chunkId: string, collection: string, relevance: number, context: string | null }>>
  /** 按实体名称查询实体及其关联文档 */
  findByEntityName: (entityName: string, options?: { collection?: string, type?: string }) => Promise<Array<{ entity: { id: string, name: string, type: string, aliases: string[], description: string | null }, documents: Array<{ documentId: string, chunkId: string, collection: string, relevance: number, context: string | null }> }>>

  // ─── 文档元数据 ───

  /** 按 documentId + collection 获取单个文档元数据 */
  getDocument: (documentId: string, collection: string) => Promise<KnowledgeDocumentMetadata | undefined>
  /** 列出文档元数据 */
  listDocuments: (collection: string, options?: { offset?: number, limit?: number }) => Promise<KnowledgeDocumentMetadata[]>
  /** 原子撤销文档版本并删除清单中向量；清理失败抛错，持久墓碑允许 repair 重试。 */
  removeDocument: (documentId: string, collection: string) => Promise<void>

  // ─── 向量操作 ───

  /**
   * 向量相似度检索。默认 DB Store 将 filter 透传底层 Provider，校验/查询失败抛错，不当作空结果。
   * LanceDB 仅支持顶层 string/有限 number/boolean/null 的 AND 匹配，null 与字段缺失不同。
   */
  searchVectors: (collection: string, vector: number[], options?: { topK?: number, minScore?: number, filter?: Record<string, unknown> }) => Promise<Array<{ id: string, score: number, content?: string, metadata?: Record<string, unknown> }>>
  /** 确保向量集合存在 */
  ensureCollection: (collection: string, dimension: number) => Promise<void>

  // ─── Collection 注册表 ───

  /** 注册 collection（setup 时持久化，幂等） */
  registerCollection: (collection: string, dimension: number) => Promise<void>
  /** 检查 collection 是否已在注册表中存在（跨节点/重启后仍有效） */
  collectionExists: (collection: string) => Promise<boolean>
  /**
   * 撤销 collection 可见代际并清理向量，保留物理集合与补偿墓碑供迟到写入的重复清理。
   * 内部按页清理，失败抛错后由 repair 恢复；collection 不存在时幂等成功。
   */
  deleteCollection: (collection: string) => Promise<void>
}

// ─── 存储 Provider ───

/**
 * 向量库后端连接信息
 *
 * 由 Provider 暴露底层向量库的原始连接，供需要复用同一后端的外部引擎（如 mem0 OSS）
 * 直连。字段按后端类型填充；包含凭证，仅供同进程内集成使用。
 *
 * @example
 * ```ts
 * import type { AIVectorBackend } from '@h-ai/ai'
 * const value: AIVectorBackend = { type: 'qdrant', url: 'https://vector.example.com:6333' }
 * const output = value.type
 * ```
 */
export interface AIVectorBackend {
  /** 后端类型（如 'qdrant'、'pgvector'、'lancedb'、'chroma'） */
  type: string
  /** 服务 URL（qdrant / chroma） */
  url?: string
  /** API Key（qdrant / chroma） */
  apiKey?: string
  /** 主机（pgvector） */
  host?: string
  /** 端口（pgvector / chroma） */
  port?: number
  /** 数据库名（pgvector） */
  database?: string
  /** 用户名（pgvector） */
  user?: string
  /** 密码（pgvector） */
  password?: string
  /** 连接串（pgvector） */
  connectionString?: string
  /** 本地路径（lancedb / chroma 嵌入式） */
  path?: string
}

/**
 * AI 存储 Provider 接口
 *
 * 负责创建 AIRelStore / AIVectorStore 实例，并管理存储层生命周期。
 * reldb + vecdb 已初始化时默认使用 DB 实现；仅开发或明确 E2E 可使用临时实现，生产要求 shared；
 * 也可对接 SaaS API 或其他后端。
 *
 * @example
 * ```ts
 * import { ai, type AIStoreProvider, type AIConfigInput } from '@h-ai/ai'
 * // provider 的 shared 声明必须由真实共享后端支撑；AI 关闭时调用其 close。
 * async function start(config: AIConfigInput, provider: AIStoreProvider) {
 *   const result = await ai.init(config, { storeProvider: provider })
 *   if (!result.success) throw new Error(result.error.message)
 * }
 * ```
 */
export interface AIStoreProvider {
  /** 关系状态与向量后端是否跨主机共享；自定义Provider必须如实声明，生产拒绝local。 */
  readonly stateScope: 'local' | 'shared'
  /** Provider 名称（如 'db'、'api'） */
  readonly name: string

  /** 创建关系数据存储实例 */
  createRelStore: <T>(name: string, options?: AIRelStoreOptions) => AIRelStore<T>

  /** 创建向量数据存储实例 */
  createVectorStore: (name: string) => AIVectorStore

  /**
   * 暴露底层向量库后端连接（可选）
   *
   * 供需要直连同一向量库的外部引擎（如 mem0 OSS）复用后端。未初始化或不支持时返回
   * `undefined`。返回值含凭证，仅供同进程内集成使用，禁止写入日志。
   */
  getVectorBackend?: () => AIVectorBackend | undefined

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
