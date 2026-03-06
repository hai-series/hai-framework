/**
 * @h-ai/vecdb — 向量数据库配置 Schema
 *
 * 本文件定义向量数据库模块的错误码常量、Zod Schema 和配置类型。
 * 支持 LanceDB（默认）、pgvector、Qdrant 三种后端。
 * @module vecdb-config
 */

import { z } from 'zod'

import { vecdbM } from './vecdb-i18n.js'

// ─── 错误码常量 ───

/**
 * 向量数据库错误码（数值范围 3500-3999）
 *
 * 用于标识向量数据库操作中的各类错误，便于错误处理和日志记录。
 *
 * @example
 * ```ts
 * import { VecdbErrorCode } from '@h-ai/vecdb'
 *
 * if (result.error?.code === VecdbErrorCode.CONNECTION_FAILED) {
 *     // 处理错误：向量数据库连接失败
 * }
 * ```
 */
export const VecdbErrorCode = {
  /** 连接失败 */
  CONNECTION_FAILED: 3500,
  /** 查询失败 */
  QUERY_FAILED: 3501,
  /** 集合不存在 */
  COLLECTION_NOT_FOUND: 3502,
  /** 集合已存在 */
  COLLECTION_ALREADY_EXISTS: 3503,
  /** 向量维度不匹配 */
  DIMENSION_MISMATCH: 3504,
  /** 插入失败 */
  INSERT_FAILED: 3505,
  /** 删除失败 */
  DELETE_FAILED: 3506,
  /** 更新失败 */
  UPDATE_FAILED: 3507,
  /** 索引构建失败 */
  INDEX_BUILD_FAILED: 3508,
  /** 数据库未初始化 */
  NOT_INITIALIZED: 3510,
  /** 配置错误 */
  CONFIG_ERROR: 3511,
  /** 不支持的向量数据库类型 */
  UNSUPPORTED_TYPE: 3512,
  /** 驱动加载失败（可选依赖缺失） */
  DRIVER_NOT_FOUND: 3513,
  /** 序列化/反序列化失败 */
  SERIALIZATION_FAILED: 3514,
} as const

/** 向量数据库错误码类型 */
export type VecdbErrorCodeType = typeof VecdbErrorCode[keyof typeof VecdbErrorCode]

// ─── 向量数据库类型枚举 ───

/**
 * 向量数据库类型枚举
 *
 * 支持的向量数据库类型：
 * - `lancedb` — LanceDB 嵌入式向量数据库（默认）
 * - `pgvector` — PostgreSQL + pgvector 扩展
 * - `qdrant` — Qdrant 向量搜索引擎
 */
export const VecdbTypeSchema = z.enum(['lancedb', 'pgvector', 'qdrant'])

/** 向量数据库类型 */
export type VecdbType = z.infer<typeof VecdbTypeSchema>

// ─── 距离度量 ───

/**
 * 距离度量类型
 *
 * - `cosine` — 余弦相似度（默认，适用于文本嵌入）
 * - `euclidean` — 欧氏距离（L2）
 * - `dot` — 内积（点积）
 */
export const DistanceMetricSchema = z.enum(['cosine', 'euclidean', 'dot']).default('cosine')

/** 距离度量类型 */
export type DistanceMetric = z.infer<typeof DistanceMetricSchema>

// ─── LanceDB 配置 ───

/**
 * LanceDB 配置 Schema
 *
 * @example
 * ```ts
 * { type: 'lancedb', path: './data/vecdb' }
 * ```
 */
export const LancedbConfigSchema = z.object({
  type: z.literal('lancedb'),
  /** 数据库存储路径（本地目录） */
  path: z.string().min(1, vecdbM('vecdb_configPathRequired')),
  /** 距离度量（默认 cosine） */
  metric: DistanceMetricSchema.optional(),
})

/** LanceDB 配置类型 */
export type LancedbConfig = z.infer<typeof LancedbConfigSchema>

// ─── pgvector 配置 ───

/**
 * pgvector 索引类型
 *
 * - `ivfflat` — IVFFlat 索引（适合中等规模数据）
 * - `hnsw` — HNSW 索引（适合大规模数据，检索速度更快）
 */
export const PgvectorIndexTypeSchema = z.enum(['ivfflat', 'hnsw']).default('hnsw')

/**
 * pgvector 配置 Schema
 *
 * @example
 * ```ts
 * // 使用连接字符串
 * { type: 'pgvector', url: 'postgres://user:pass@localhost:5432/mydb' }
 *
 * // 使用分开的字段
 * {
 *     type: 'pgvector',
 *     host: 'localhost',
 *     port: 5432,
 *     database: 'mydb',
 *     user: 'admin',
 *     password: 'secret'
 * }
 * ```
 */
export const PgvectorConfigSchema = z.object({
  type: z.literal('pgvector'),
  /** 连接字符串（可选，优先使用） */
  url: z.string().optional(),
  /** 数据库主机地址（默认 localhost） */
  host: z.string().default('localhost'),
  /** 端口号（默认 5432） */
  port: z.number().int().min(1).max(65535).default(5432),
  /** 数据库名称 */
  database: z.string().min(1, vecdbM('vecdb_configDatabaseRequired')),
  /** 用户名 */
  user: z.string().optional(),
  /** 密码 */
  password: z.string().optional(),
  /** 索引类型（默认 hnsw） */
  indexType: PgvectorIndexTypeSchema.optional(),
  /** 距离度量（默认 cosine） */
  metric: DistanceMetricSchema.optional(),
  /** 表名前缀（默认 'vec_'） */
  tablePrefix: z.string().default('vec_'),
})

/** pgvector 配置类型 */
export type PgvectorConfig = z.infer<typeof PgvectorConfigSchema>

// ─── Qdrant 配置 ───

/**
 * Qdrant 配置 Schema
 *
 * @example
 * ```ts
 * { type: 'qdrant', url: 'http://localhost:6333' }
 * ```
 */
export const QdrantConfigSchema = z.object({
  type: z.literal('qdrant'),
  /** Qdrant 服务器 URL */
  url: z.string().url().default('http://localhost:6333'),
  /** API Key（可选） */
  apiKey: z.string().optional(),
  /** 距离度量（默认 cosine） */
  metric: DistanceMetricSchema.optional(),
})

/** Qdrant 配置类型 */
export type QdrantConfig = z.infer<typeof QdrantConfigSchema>

// ─── 统一配置 ───

/**
 * 统一向量数据库配置 Schema（判别联合体）
 *
 * 根据 `type` 字段区分不同向量数据库类型的配置。
 */
export const VecdbConfigSchema = z.discriminatedUnion('type', [
  LancedbConfigSchema,
  PgvectorConfigSchema,
  QdrantConfigSchema,
])

/** 向量数据库配置类型（判别联合体） */
export type VecdbConfig = z.infer<typeof VecdbConfigSchema>

/**
 * 向量数据库配置输入类型（用于 init 等入口）
 *
 * 说明：Zod 的 default 会让输入端字段可省略，但输出端字段为必填。
 * 因此对外 API（如 vecdb.init）更适合接收 VecdbConfigInput。
 */
export type VecdbConfigInput = z.input<typeof VecdbConfigSchema>
