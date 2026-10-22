/**
 * @h-ai/vecdb — 向量数据库配置 Schema
 *
 * 本文件定义向量数据库模块的 Zod Schema 和配置类型；错误码见 vecdb-types。
 * 支持 LanceDB（默认）、pgvector、Qdrant、Chroma 四种后端。
 * @module vecdb-config
 */

import { z } from 'zod'
import { vecdbM } from './vecdb-i18n.js'
// ─── 向量数据库类型枚举 ───

/**
 * 向量数据库类型
 * @example
 * ```ts
 * import type { VecdbType } from '@h-ai/vecdb'
 *
 * const value: VecdbType = 'qdrant'
 * void value
 * ```
 */
export type VecdbType = 'lancedb' | 'pgvector' | 'qdrant' | 'chroma'

// ─── 距离度量 ───

/**
 * 距离度量类型
 *
 * - `cosine` — 余弦相似度（默认，适用于文本嵌入）
 * - `euclidean` — 欧氏距离（L2）
 * - `dot` — 内积（点积）
 * @example
 * ```ts
 * import { DistanceMetricSchema } from '@h-ai/vecdb'
 *
 * const value = DistanceMetricSchema.parse('cosine')
 * void value
 * ```
 */
export const DistanceMetricSchema = z.enum(['cosine', 'euclidean', 'dot']).default('cosine')

/**
 * 距离度量类型
 * @example
 * ```ts
 * import type { DistanceMetric } from '@h-ai/vecdb'
 *
 * const value: DistanceMetric = 'cosine'
 * void value
 * ```
 */
export type DistanceMetric = z.infer<typeof DistanceMetricSchema>

/**
 * 操作日志配置；read/write 默认关闭，长度和级别由 Schema 校验。
 * @example
 * ```ts
 * import { VecdbOperationLogConfigSchema } from '@h-ai/vecdb'
 *
 * const value = VecdbOperationLogConfigSchema.parse({ read: false, write: true, maxLength: 500, level: 'debug' })
 * void value
 * ```
 */
export const VecdbOperationLogConfigSchema = z.object({
  read: z.boolean().default(false),
  write: z.boolean().default(false),
  maxLength: z.number().int().min(0).default(1000),
  level: z.enum(['info', 'debug', 'trace']).default('debug'),
})

/**
 * 已解析的操作日志配置，单位和默认值与 Schema 保持一致。
 * @example
 * ```ts
 * import { VecdbOperationLogConfigSchema, type VecdbOperationLogConfig } from '@h-ai/vecdb'
 *
 * const value: VecdbOperationLogConfig = VecdbOperationLogConfigSchema.parse({})
 * void value
 * ```
 */
export type VecdbOperationLogConfig = z.infer<typeof VecdbOperationLogConfigSchema>

const OperationLogConfigFieldSchema = {
  operationLog: VecdbOperationLogConfigSchema.optional(),
}

// ─── LanceDB 配置 ───

/**
 * LanceDB 配置 Schema
 *
 */
const LancedbConfigSchema = z.object({
  type: z.literal('lancedb'),
  /** 持久化本地目录；独立节点的同名路径不会自动共享，分布式部署优先使用服务端后端。 */
  path: z.string().min(1, vecdbM('vecdb_configPathRequired')),
  /** 新建集合的默认距离度量；已有集合使用 Arrow schema 中的持久定义。 */
  metric: DistanceMetricSchema.optional(),
  ...OperationLogConfigFieldSchema,
})

/**
 * LanceDB 配置类型
 * @example
 * ```ts
 * import { VecdbConfigSchema, type LancedbConfig } from '@h-ai/vecdb'
 *
 * const parsed = VecdbConfigSchema.parse({ type: 'lancedb', path: './data/vecdb' })
 * if (parsed.type === 'lancedb') {
 *   const config: LancedbConfig = parsed
 *   void config
 * }
 * ```
 */
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

/**
 * pgvector 配置类型
 * @example
 * ```ts
 * import { VecdbConfigSchema, type PgvectorConfig } from '@h-ai/vecdb'
 *
 * const parsed = VecdbConfigSchema.parse({ type: 'pgvector', host: 'db', database: 'shop' })
 * if (parsed.type === 'pgvector') {
 *   const config: PgvectorConfig = parsed
 *   void config
 * }
 * ```
 */
export type PgvectorConfig = z.infer<typeof PgvectorConfigSchema>

// ─── Qdrant 配置 ───

/**
 * Qdrant 配置 Schema
 *
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

/**
 * Qdrant 配置类型
 * @example
 * ```ts
 * import { VecdbConfigSchema, type QdrantConfig } from '@h-ai/vecdb'
 *
 * const parsed = VecdbConfigSchema.parse({ type: 'qdrant', url: 'http://localhost:6333' })
 * if (parsed.type === 'qdrant') {
 *   const config: QdrantConfig = parsed
 *   void config
 * }
 * ```
 */
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
 */
const ChromaConfigSchema = z.object({
  type: z.literal('chroma'),
  /** 本地持久化路径（嵌入式模式：提供且无 url 时自动拉起本地服务） */
  path: z.string().optional(),
  /** Chroma HTTP(S) 根端点；不可包含凭据、路径前缀、query 或 fragment；提供时优先于 host/port。 */
  url: z.string().url().refine((value) => {
    try {
      const endpoint = new URL(value)
      return ['http:', 'https:'].includes(endpoint.protocol)
        && !endpoint.username && !endpoint.password && endpoint.pathname === '/'
        && !endpoint.search && !endpoint.hash
    }
    catch {
      return false
    }
  }, { error: () => vecdbM('vecdb_chromaEndpointInvalid') }).optional(),
  /** 主机（默认 localhost） */
  host: z.string().default('localhost'),
  /** 端口（默认 8000） */
  port: z.number().int().min(1).max(65535).default(8000),
  /** 可选 Bearer token，发送 Authorization 请求头；用于采用此协议的自托管服务/网关，不是 Chroma Cloud 配置。空串表示未配置。 */
  apiKey: z.string().regex(/^[\x21-\x7E]*$/, { error: () => vecdbM('vecdb_chromaTokenInvalid') }).optional(),
  /** 拉起本地服务的可执行命令（默认 'chroma'，可指定绝对路径） */
  serverCommand: z.string().default('chroma'),
  /** 拉起本地服务的就绪等待超时（毫秒，默认 30000） */
  startupTimeout: z.number().int().positive().default(30_000),
  /** 距离度量（默认 cosine） */
  metric: DistanceMetricSchema.optional(),
  ...OperationLogConfigFieldSchema,
})

/**
 * Chroma 配置类型
 * @example
 * ```ts
 * import { VecdbConfigSchema, type ChromaConfig } from '@h-ai/vecdb'
 *
 * const parsed = VecdbConfigSchema.parse({ type: 'chroma', url: 'http://localhost:8000' })
 * if (parsed.type === 'chroma') {
 *   const config: ChromaConfig = parsed
 *   void config
 * }
 * ```
 */
export type ChromaConfig = z.infer<typeof ChromaConfigSchema>

// ─── 统一配置 ───

/**
 * 统一向量数据库配置 Schema（判别联合体）
 *
 * 根据 `type` 字段区分不同向量数据库类型的配置。
 * @example
 * ```ts
 * import { VecdbConfigSchema } from '@h-ai/vecdb'
 *
 * const value = VecdbConfigSchema.parse({ type: 'qdrant', url: 'http://localhost:6333' })
 * void value
 * ```
 */
export const VecdbConfigSchema = z.discriminatedUnion('type', [
  LancedbConfigSchema,
  PgvectorConfigSchema,
  QdrantConfigSchema,
  ChromaConfigSchema,
])

/**
 * 向量数据库配置类型（判别联合体）
 * @example
 * ```ts
 * import { VecdbConfigSchema, type VecdbConfig } from '@h-ai/vecdb'
 *
 * const parsed = VecdbConfigSchema.parse({ type: 'qdrant', url: 'http://localhost:6333' })
 * const config: VecdbConfig = parsed
 * void config
 * ```
 */
export type VecdbConfig = z.infer<typeof VecdbConfigSchema>

/**
 * 向量数据库配置输入类型（用于 init 等入口）
 *
 * 说明：Zod 的 default 会让输入端字段可省略，但输出端字段为必填。
 * 因此对外 API（如 vecdb.init）更适合接收 VecdbConfigInput。
 * @example
 * ```ts
 * import type { VecdbConfigInput } from '@h-ai/vecdb'
 *
 * const value: VecdbConfigInput = { type: 'qdrant', url: 'http://localhost:6333' }
 * void value
 * ```
 */
export type VecdbConfigInput = z.input<typeof VecdbConfigSchema>
