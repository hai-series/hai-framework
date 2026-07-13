/**
 * @h-ai/vecdb — 向量数据库配置 Schema
 *
 * 本文件定义向量数据库模块的错误码常量、Zod Schema 和配置类型。
 * 支持 LanceDB（默认）、pgvector、Qdrant、Chroma 四种后端。
 * @module vecdb-config
 */

import { z } from 'zod'
import { vecdbM } from './vecdb-i18n.js'
// ─── 向量数据库类型枚举 ───

/**
 * 向量数据库类型枚举
 *
 * 支持的向量数据库类型：
 * - `lancedb` — LanceDB 嵌入式向量数据库（默认）
 * - `pgvector` — PostgreSQL + pgvector 扩展
 * - `qdrant` — Qdrant 向量搜索引擎
 * - `chroma` — Chroma 向量数据库（支持嵌入式自动拉起本地服务）
 */
/** 向量数据库类型 */
export type VecdbType = 'lancedb' | 'pgvector' | 'qdrant' | 'chroma'

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

export const VecdbOperationLogConfigSchema = z.object({
  read: z.boolean().default(false),
  write: z.boolean().default(false),
  maxLength: z.number().int().min(0).default(1000),
  level: z.enum(['info', 'debug', 'trace']).default('debug'),
})

export type VecdbOperationLogConfig = z.infer<typeof VecdbOperationLogConfigSchema>

const OperationLogConfigFieldSchema = {
  operationLog: VecdbOperationLogConfigSchema.optional(),
}

// ─── LanceDB 配置 ───

/**
 * LanceDB 配置 Schema
 *
 * @example
 * ```ts
 * { type: 'lancedb', path: './data/vecdb' }
 * ```
 */
const LancedbConfigSchema = z.object({
  type: z.literal('lancedb'),
  /** 数据库存储路径（本地目录） */
  path: z.string().min(1, vecdbM('vecdb_configPathRequired')),
  /** 距离度量（默认 cosine） */
  metric: DistanceMetricSchema.optional(),
  ...OperationLogConfigFieldSchema,
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
const PgvectorIndexTypeSchema = z.enum(['ivfflat', 'hnsw']).default('hnsw')

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
const PgvectorConfigSchema = z.object({
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
  ...OperationLogConfigFieldSchema,
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
const QdrantConfigSchema = z.object({
  type: z.literal('qdrant'),
  /** Qdrant 服务器 URL */
  url: z.string().url().default('http://localhost:6333'),
  /** API Key（可选） */
  apiKey: z.string().optional(),
  /** 距离度量（默认 cosine） */
  metric: DistanceMetricSchema.optional(),
  ...OperationLogConfigFieldSchema,
})

/** Qdrant 配置类型 */
export type QdrantConfig = z.infer<typeof QdrantConfigSchema>

// ─── Chroma 配置 ───

/**
 * Chroma 配置 Schema
 *
 * Chroma 在 Node 端只有 HTTP 客户端（无进程内嵌入式）。本 Provider 支持两种模式：
 * - **嵌入式**：提供 `path` 且不提供 `url` 时，init 自动拉起本地 `chroma run` 服务
 *   （持久化到 `path`），close 时关闭；数据落地本地目录，无需手动启动服务。
 * - **直连**：提供 `url`（或已运行的 host:port）时，直接连接已有 Chroma 服务，不拉起进程。
 *
 * @example
 * ```ts
 * // 嵌入式（自动拉起本地服务）
 * { type: 'chroma', path: './data/chroma' }
 *
 * // 直连已有服务
 * { type: 'chroma', url: 'http://localhost:8000' }
 * ```
 */
const ChromaConfigSchema = z.object({
  type: z.literal('chroma'),
  /** 本地持久化路径（嵌入式模式：提供且无 url 时自动拉起本地服务） */
  path: z.string().optional(),
  /** 已有 Chroma 服务 URL（提供时直连，不自动拉起进程） */
  url: z.string().url().optional(),
  /** 主机（默认 localhost） */
  host: z.string().default('localhost'),
  /** 端口（默认 8000） */
  port: z.number().int().min(1).max(65535).default(8000),
  /** API Key（可选，连接受保护的 Chroma 服务时使用） */
  apiKey: z.string().optional(),
  /** 拉起本地服务的可执行命令（默认 'chroma'，可指定绝对路径） */
  serverCommand: z.string().default('chroma'),
  /** 拉起本地服务的就绪等待超时（毫秒，默认 30000） */
  startupTimeout: z.number().int().positive().default(30_000),
  /** 距离度量（默认 cosine） */
  metric: DistanceMetricSchema.optional(),
  ...OperationLogConfigFieldSchema,
})

/** Chroma 配置类型 */
export type ChromaConfig = z.infer<typeof ChromaConfigSchema>

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
  ChromaConfigSchema,
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
