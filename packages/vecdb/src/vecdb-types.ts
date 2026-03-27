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
 */
export const HaiVecdbError = core.error.buildHaiErrorsDef('vecdb', VecdbErrorInfo)

// ─── 向量文档 ───

/**
 * 向量文档接口
 *
 * 表示一条存入向量数据库的记录，包含向量、文本内容和元数据。
 *
 * @example
 * ```ts
 * const doc: VectorDocument = {
 *   id: 'doc-001',
 *   vector: [0.1, 0.2, 0.3, ...],
 *   content: '这是文档内容',
 *   metadata: { source: 'wiki', page: 1 },
 * }
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
 *
 * @example
 * ```ts
 * const options: VectorSearchOptions = {
 *   topK: 10,
 *   filter: { source: 'wiki' },
 *   minScore: 0.7,
 * }
 * ```
 */
export interface VectorSearchOptions {
  /** 返回的最大结果数（默认 10） */
  topK?: number
  /** 元数据过滤条件（键值对，精确匹配） */
  filter?: Record<string, unknown>
  /** 最低相似度阈值（0-1，低于此值的结果将被过滤） */
  minScore?: number
}

/**
 * 向量搜索结果
 *
 * 包含匹配的文档和相似度得分。
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
 *
 * @example
 * ```ts
 * // 创建集合
 * await vecdb.collection.create('my-docs', { dimension: 1536 })
 *
 * // 列出集合
 * const result = await vecdb.collection.list()
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
 *
 * @example
 * ```ts
 * // 插入向量
 * await vecdb.vector.insert('my-docs', [
 *   { id: 'doc-1', vector: [...], content: '文档1' },
 *   { id: 'doc-2', vector: [...], content: '文档2' },
 * ])
 *
 * // 搜索向量
 * const result = await vecdb.vector.search('my-docs', queryVector, { topK: 5 })
 * ```
 */
export interface VectorOperations {
  /**
   * 插入向量文档
   *
   * @param collection - 集合名称
   * @param documents - 文档列表
   * @returns 成功返回 ok(undefined)
   */
  insert: (collection: string, documents: VectorDocument[]) => Promise<HaiResult<void>>

  /**
   * 更新向量文档（按 id 匹配，整体替换）
   *
   * @param collection - 集合名称
   * @param documents - 待更新的文档（id 必须已存在）
   * @returns 成功返回 ok(undefined)
   */
  upsert: (collection: string, documents: VectorDocument[]) => Promise<HaiResult<void>>

  /**
   * 删除向量文档
   *
   * @param collection - 集合名称
   * @param ids - 文档 ID 列表
   * @returns 成功返回 ok(undefined)
   */
  delete: (collection: string, ids: string[]) => Promise<HaiResult<void>>

  /**
   * 向量搜索
   *
   * @param collection - 集合名称
   * @param vector - 查询向量
   * @param options - 搜索选项
   * @returns 搜索结果列表（按相似度降序排列）
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
   */
  count: (collection: string) => Promise<HaiResult<number>>
}

// ─── VecdbFunctions 接口 ───

/**
 * 向量数据库服务接口（通过 `vecdb` 对象访问）
 *
 * @example
 * ```ts
 * import { vecdb } from '@h-ai/vecdb'
 *
 * // 初始化（LanceDB）
 * await vecdb.init({ type: 'lancedb', path: './data/vecdb' })
 *
 * // 创建集合
 * await vecdb.collection.create('docs', { dimension: 1536 })
 *
 * // 插入向量
 * await vecdb.vector.insert('docs', [{ id: '1', vector: [...], content: '...' }])
 *
 * // 搜索
 * const result = await vecdb.vector.search('docs', queryVector, { topK: 5 })
 *
 * // 关闭
 * await vecdb.close()
 * ```
 */
export interface VecdbFunctions {
  /** 初始化向量数据库连接 */
  init: (config: VecdbConfigInput) => Promise<HaiResult<void>>
  /** 关闭连接 */
  close: () => Promise<HaiResult<void>>
  /** 当前配置（未初始化时为 null） */
  readonly config: VecdbConfig | null
  /** 是否已初始化 */
  readonly isInitialized: boolean
  /** 集合管理操作 */
  readonly collection: CollectionOperations
  /** 向量操作 */
  readonly vector: VectorOperations
}
