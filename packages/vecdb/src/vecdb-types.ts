/**
 * @h-ai/vecdb — 类型定义
 *
 * 本文件定义向量数据库模块的核心接口和类型（非配置相关）。
 * 配置相关类型请从 vecdb-config.ts 导入。
 * @module vecdb-types
 */

import type { ErrorInfo, HaiResult } from '@h-ai/core'
import type { DistanceMetric, VecdbConfig, VecdbConfigInput } from './vecdb-config.js'
import { core } from '@h-ai/core'

// ─── 错误定义（照 @h-ai/core 范式） ───

/**
 * 向量数据库错误信息映射（错误码:HTTP状态码）。
 *
 * 完整错误码将自动生成为：`hai:vecdb:NNN`
 */
const VecdbErrorInfo = {
  CONNECTION_FAILED: '001:500',
  QUERY_FAILED: '002:500',
  COLLECTION_NOT_FOUND: '003:404',
  COLLECTION_ALREADY_EXISTS: '004:409',
  DIMENSION_MISMATCH: '005:400',
  INSERT_FAILED: '006:500',
  DELETE_FAILED: '007:500',
  UPDATE_FAILED: '008:500',
  INDEX_BUILD_FAILED: '009:500',
  NOT_INITIALIZED: '010:500',
  CONFIG_ERROR: '011:500',
  UNSUPPORTED_TYPE: '012:400',
  DRIVER_NOT_FOUND: '013:500',
  SERIALIZATION_FAILED: '014:500',
} as const satisfies ErrorInfo

/**
 * Vecdb 模块标准错误定义对象。
 * @example
 * ```ts
 * import { HaiVecdbError } from '@h-ai/vecdb'
 * import { err } from '@h-ai/core'
 *
 * const result = err(HaiVecdbError.COLLECTION_NOT_FOUND, 'Collection missing')
 * if (!result.success) void result.error.code
 * ```
 */
export const HaiVecdbError = core.error.buildHaiErrorsDef('vecdb', VecdbErrorInfo)

// ─── 向量文档 ───

/**
 * 向量文档接口
 *
 * 表示一条存入向量数据库的记录，包含向量、文本内容和元数据。
 * @example
 * ```ts
 * import type { VectorDocument } from '@h-ai/vecdb'
 *
 * const value: VectorDocument = { id: 'doc_1', vector: [0.1, 0.2, 0.3], content: 'Example text', metadata: { tenant: 'shop' } }
 * void value
 * ```
 */
export interface VectorDocument {
  /** 文档唯一标识 */
  id: string
  /** 向量数据（浮点数组） */
  vector: number[]
  /** 文本内容（可选，用于存储原始文本） */
  content?: string
  /** 元数据（可选，用于存储附加信息） */
  metadata?: Record<string, unknown>
}

/**
 * 向量搜索选项
 * @example
 * ```ts
 * import type { VectorSearchOptions } from '@h-ai/vecdb'
 *
 * const value: VectorSearchOptions = { topK: 5, filter: { tenant: 'shop' }, minScore: 0.7 }
 * void value
 * ```
 */
export interface VectorSearchOptions {
  /** 返回的最大结果数（默认 10） */
  topK?: number
  /**
   * 元数据过滤，具体能力以 Provider 为准。
   * LanceDB：顶层字面量键的 AND 精确匹配，仅支持 string、有限 number、boolean、null；
   * 类型严格区分，null 不匹配缺失字段；空对象不筛选，不支持对象/数组/undefined。
   * 条件在 topK 前执行，不支持的值返回 CONFIG_ERROR。其它后端不保证相同 null/复杂值语义。
   * @example { tenant: 'acme', active: true, page: 1, removedAt: null }
   */
  filter?: Record<string, unknown>
  /** 最低相似度阈值（0-1，低于此值的结果将被过滤） */
  minScore?: number
}

/**
 * 向量搜索结果
 *
 * 包含匹配的文档和相似度得分。
 * @example
 * ```ts
 * import type { VectorSearchResult } from '@h-ai/vecdb'
 *
 * const value: VectorSearchResult = { id: 'doc_1', score: 0.95, content: 'Example text', metadata: { tenant: 'shop' } }
 * void value
 * ```
 */
export interface VectorSearchResult {
  /** 文档唯一标识 */
  id: string
  /** 相似度得分（0-1，越高越相似） */
  score: number
  /** 文本内容（如果存储时包含） */
  content?: string
  /** 元数据（如果存储时包含） */
  metadata?: Record<string, unknown>
  /** 原始向量（可选，默认不返回以节省传输） */
  vector?: number[]
}

// ─── 集合信息 ───

/**
 * 集合信息接口
 *
 * 描述一个向量集合的元信息。
 * @example
 * ```ts
 * import type { CollectionInfo } from '@h-ai/vecdb'
 *
 * const value: CollectionInfo = { name: 'docs', dimension: 3, metric: 'cosine', count: 1 }
 * void value
 * ```
 */
export interface CollectionInfo {
  /** 集合名称 */
  name: string
  /** 向量维度 */
  dimension: number
  /** 距离度量类型 */
  metric: DistanceMetric
  /** 集合中的文档数量 */
  count: number
}

// ─── 操作接口 ───

/**
 * 集合管理操作接口
 *
 * 通过 `vecdb.collection` 访问，管理向量集合的创建、删除和查询。
 * @example
 * ```ts
 * import type { CollectionOperations } from '@h-ai/vecdb'
 *
 * async function read(operations: CollectionOperations) {
 *   const result = await operations.list()
 *   if (!result.success) return result.error.message
 *   return result.data
 * }
 * ```
 */
export interface CollectionOperations {
  /**
   * 创建集合
   *
   * @param name - 集合名称
   * @param options - 创建选项
   * @returns 成功返回 ok(undefined)；集合已存在返回 COLLECTION_ALREADY_EXISTS
   */
  create: (name: string, options: CollectionCreateOptions) => Promise<HaiResult<void>>

  /**
   * 删除集合
   *
   * @param name - 集合名称
   * @returns 成功返回 ok(undefined)；集合不存在返回 COLLECTION_NOT_FOUND
   */
  drop: (name: string) => Promise<HaiResult<void>>

  /**
   * 判断集合是否存在
   *
   * @param name - 集合名称
   * @returns 存在返回 true，不存在返回 false
   */
  exists: (name: string) => Promise<HaiResult<boolean>>

  /**
   * 获取集合信息
   *
   * @param name - 集合名称
   * @returns 集合信息
   */
  info: (name: string) => Promise<HaiResult<CollectionInfo>>

  /**
   * 列出所有集合
   *
   * @returns 集合名称列表
   */
  list: () => Promise<HaiResult<string[]>>
}

/**
 * 集合创建选项
 * @example
 * ```ts
 * import type { CollectionCreateOptions } from '@h-ai/vecdb'
 *
 * const value: CollectionCreateOptions = { dimension: 3, metric: 'cosine' }
 * void value
 * ```
 */
export interface CollectionCreateOptions {
  /** 向量维度（必填） */
  dimension: number
  /** 距离度量（可选，默认使用全局配置中的 metric） */
  metric?: DistanceMetric
}

/**
 * 向量操作接口
 *
 * 通过 `vecdb.vector` 访问，管理向量文档的增删改查和搜索。
 * @example
 * ```ts
 * import type { VectorOperations } from '@h-ai/vecdb'
 *
 * async function read(operations: VectorOperations) {
 *   const result = await operations.search('docs', [0.1, 0.2, 0.3], { topK: 5 })
 *   if (!result.success) return result.error.message
 *   return result.data
 * }
 * ```
 */
export interface VectorOperations {
  /**
   * 插入向量文档
   *
   * @param collection - 集合名称
   * @param documents - 文档列表
   * @returns 成功返回 ok(undefined)；LanceDB 已有 ID 保留不覆盖，同批重复 ID 返回 CONFIG_ERROR。
   * Qdrant 成功前等待服务端应用写入。
   * @example await vecdb.vector.insert('docs', [{ id: 'doc-1', vector: [1, 0] }])
   */
  insert: (collection: string, documents: VectorDocument[]) => Promise<HaiResult<void>>

  /**
   * 插入或更新向量文档（按 id 匹配，整体替换）
   *
   * @param collection - 集合名称
   * @param documents - 待写入文档；已有 ID 更新，不存在的 ID 插入
   * @returns 成功返回 ok(undefined)；LanceDB 缺少原子主键能力或同批重复 ID 返回 CONFIG_ERROR。
   * Qdrant 成功前等待服务端应用写入。
   * @example await vecdb.vector.upsert('docs', [{ id: 'doc-1', vector: [1, 0], content: 'updated' }])
   */
  upsert: (collection: string, documents: VectorDocument[]) => Promise<HaiResult<void>>

  /**
   * 删除向量文档
   *
   * @param collection - 集合名称
   * @param ids - 文档 ID 列表
   * @returns 成功返回 ok(undefined)
   * Qdrant 成功前等待服务端应用删除。
   */
  delete: (collection: string, ids: string[]) => Promise<HaiResult<void>>

  /**
   * 向量搜索
   *
   * @param collection - 集合名称
   * @param vector - 查询向量
   * @param options - 搜索选项
   * @returns 搜索结果列表（按相似度降序排列）
   * @example await vecdb.vector.search('docs', [1, 0], { topK: 5, filter: { tenant: 'acme', active: true } })
   */
  search: (
    collection: string,
    vector: number[],
    options?: VectorSearchOptions,
  ) => Promise<HaiResult<VectorSearchResult[]>>

  /**
   * 获取集合中的文档数量
   *
   * @param collection - 集合名称
   * @returns 文档数量
   * Qdrant 使用精确 count，不依赖集合信息的近似统计。
   */
  count: (collection: string) => Promise<HaiResult<number>>
}

// ─── VecdbFunctions 接口 ───

/**
 * 向量数据库服务接口（通过 `vecdb` 对象访问）
 * @example
 * ```ts
 * import { vecdb } from '@h-ai/vecdb'
 *
 * const initialized = await vecdb.init({ type: 'qdrant', url: 'http://localhost:6333' })
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const result = await vecdb.collection.list()
 *   if (!result.success) throw new Error(result.error.message)
 *   void result.data
 * } finally {
 *   const closed = await vecdb.close()
 *   if (!closed.success) throw new Error(closed.error.message)
 * }
 * ```
 */
export interface VecdbFunctions {
  /** 初始化向量数据库连接 */
  init: (config: VecdbConfigInput) => Promise<HaiResult<void>>
  /** 关闭连接 */
  close: () => Promise<HaiResult<void>>
  /** 当前脱敏配置快照（未初始化时为 null） */
  readonly config: VecdbConfig | null
  /**
   * 获取底层后端的原始连接信息（含凭证，未初始化时为 null）
   *
   * 供需要直连同一向量库的外部引擎（如 mem0 OSS）复用后端。返回值包含未脱敏的凭证，
   * 仅供同进程内集成使用，禁止写入日志或返回给外部调用方。
   */
  readonly rawConnection: VecdbConnection | null
  /** 是否已初始化 */
  readonly isInitialized: boolean
  /** 集合管理操作 */
  readonly collection: CollectionOperations
  /** 向量操作 */
  readonly vector: VectorOperations
}

/**
 * 向量库原始连接信息
 *
 * 由 `vecdb.rawConnection` 暴露，字段按后端类型填充。包含凭证，仅供同进程内集成使用。
 * @example
 * ```ts
 * import type { VecdbConnection } from '@h-ai/vecdb'
 *
 * const value: VecdbConnection = { type: 'qdrant', url: 'http://localhost:6333' }
 * void value
 * ```
 */
export interface VecdbConnection {
  /** 后端类型 */
  type: VecdbConfig['type']
  /** 服务 URL（qdrant、chroma；Chroma 内嵌模式含实际本地端口） */
  url?: string
  /** API Key / Bearer token（qdrant、chroma） */
  apiKey?: string
  /** 主机（pgvector、chroma） */
  host?: string
  /** 端口（pgvector、chroma） */
  port?: number
  /** 数据库名（pgvector） */
  database?: string
  /** 用户名（pgvector） */
  user?: string
  /** 密码（pgvector） */
  password?: string
  /** 连接串（pgvector） */
  connectionString?: string
  /** 本地持久化路径（lancedb 或内嵌 chroma） */
  path?: string
}
