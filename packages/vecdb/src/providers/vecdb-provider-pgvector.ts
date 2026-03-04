/**
 * @h-ai/vecdb — pgvector Provider
 *
 * 基于 PostgreSQL + pgvector 扩展的向量数据库 Provider 实现。
 * 使用 pg 驱动连接，支持 IVFFlat 和 HNSW 索引。
 * @module vecdb-provider-pgvector
 */

import type { Result } from '@h-ai/core'
import type { PgvectorConfig } from '../vecdb-config.js'
import type {
  CollectionCreateOptions,
  CollectionInfo,
  CollectionOperations,
  VecdbError,
  VecdbProvider,
  VectorDocument,
  VectorOperations,
  VectorSearchOptions,
  VectorSearchResult,
} from '../vecdb-types.js'

import { core, err, ok } from '@h-ai/core'

import { VecdbErrorCode } from '../vecdb-config.js'
import { vecdbM } from '../vecdb-i18n.js'

const logger = core.logger.child({ module: 'vecdb', scope: 'pgvector' })

type PgPool = any

/**
 * 创建 pgvector Provider
 *
 * @returns VecdbProvider 实例
 */
export function createPgvectorProvider(): VecdbProvider {
  let pool: PgPool | null = null
  let config: PgvectorConfig | null = null

  // ─── 辅助函数 ───

  /** 获取完整表名（带前缀） */
  function tableName(collection: string): string {
    return `${config?.tablePrefix ?? 'vec_'}${collection}`
  }

  /** 双引号转义 SQL 标识符，支持含特殊字符的表名 */
  function quoteIdent(name: string): string {
    return `"${name.replace(/"/g, '""')}"`
  }

  /** 获取距离算符（pgvector 语法） */
  function distanceOp(): string {
    const metric = config?.metric ?? 'cosine'
    switch (metric) {
      case 'cosine': return '<=>'
      case 'euclidean': return '<->'
      case 'dot': return '<#>'
      default: return '<=>'
    }
  }

  /** 将距离转换为相似度得分 [0, 1] */
  function distanceToScore(distance: number): number {
    const metric = config?.metric ?? 'cosine'
    switch (metric) {
      case 'cosine':
        // cosine distance ∈ [0, 2]，相似度 = 1 - distance/2 → [0, 1]
        return 1 - distance / 2
      case 'euclidean':
        return 1 / (1 + distance)
      case 'dot':
        // 内积距离为负内积，得分 = -distance
        return -distance
      default:
        return 1 / (1 + distance)
    }
  }

  // ─── 集合操作 ───

  const collectionOps: CollectionOperations = {
    async create(name: string, options: CollectionCreateOptions): Promise<Result<void, VecdbError>> {
      if (!pool) {
        return err({ code: VecdbErrorCode.NOT_INITIALIZED, message: vecdbM('vecdb_notInitialized') })
      }

      const table = tableName(name)
      const dimension = options.dimension
      const metric = options.metric ?? config?.metric ?? 'cosine'
      const indexType = config?.indexType ?? 'hnsw'

      try {
        // 检查表是否已存在
        const checkResult = await pool.query(
          `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)`,
          [table],
        )
        if (checkResult.rows[0].exists) {
          return err({
            code: VecdbErrorCode.COLLECTION_ALREADY_EXISTS,
            message: vecdbM('vecdb_collectionAlreadyExists', { params: { name } }),
          })
        }

        // 创建表
        const qi = quoteIdent(table)
        await pool.query(`
          CREATE TABLE ${qi} (
            id TEXT PRIMARY KEY,
            vector vector(${dimension}),
            content TEXT,
            metadata JSONB DEFAULT '{}'::jsonb
          )
        `)

        // 创建向量索引
        const distOp = distanceOp()
        const opsClass = distOp === '<=>'
          ? 'vector_cosine_ops'
          : distOp === '<->'
            ? 'vector_l2_ops'
            : 'vector_ip_ops'

        if (indexType === 'hnsw') {
          await pool.query(`
            CREATE INDEX ON ${qi}
            USING hnsw (vector ${opsClass})
          `)
        }
        else {
          await pool.query(`
            CREATE INDEX ON ${qi}
            USING ivfflat (vector ${opsClass})
            WITH (lists = ${Math.max(1, Math.floor(Math.sqrt(100)))})
          `)
        }

        logger.info('Collection created', { name, dimension, metric, indexType })
        return ok(undefined)
      }
      catch (error) {
        logger.error('Failed to create collection', { name, error })
        return err({
          code: VecdbErrorCode.QUERY_FAILED,
          message: vecdbM('vecdb_queryFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },

    async drop(name: string): Promise<Result<void, VecdbError>> {
      if (!pool) {
        return err({ code: VecdbErrorCode.NOT_INITIALIZED, message: vecdbM('vecdb_notInitialized') })
      }

      const table = tableName(name)

      try {
        const checkResult = await pool.query(
          `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)`,
          [table],
        )
        if (!checkResult.rows[0].exists) {
          return err({
            code: VecdbErrorCode.COLLECTION_NOT_FOUND,
            message: vecdbM('vecdb_collectionNotFound', { params: { name } }),
          })
        }

        await pool.query(`DROP TABLE ${quoteIdent(table)}`)

        logger.info('Collection dropped', { name })
        return ok(undefined)
      }
      catch (error) {
        logger.error('Failed to drop collection', { name, error })
        return err({
          code: VecdbErrorCode.DELETE_FAILED,
          message: vecdbM('vecdb_deleteFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },

    async exists(name: string): Promise<Result<boolean, VecdbError>> {
      if (!pool) {
        return err({ code: VecdbErrorCode.NOT_INITIALIZED, message: vecdbM('vecdb_notInitialized') })
      }

      try {
        const result = await pool.query(
          `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)`,
          [tableName(name)],
        )
        return ok(result.rows[0].exists as boolean)
      }
      catch (error) {
        return err({
          code: VecdbErrorCode.QUERY_FAILED,
          message: vecdbM('vecdb_queryFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },

    async info(name: string): Promise<Result<CollectionInfo, VecdbError>> {
      if (!pool) {
        return err({ code: VecdbErrorCode.NOT_INITIALIZED, message: vecdbM('vecdb_notInitialized') })
      }

      const table = tableName(name)

      try {
        // 检查表是否存在
        const existsResult = await pool.query(
          `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)`,
          [table],
        )
        if (!existsResult.rows[0].exists) {
          return err({
            code: VecdbErrorCode.COLLECTION_NOT_FOUND,
            message: vecdbM('vecdb_collectionNotFound', { params: { name } }),
          })
        }

        // 获取文档数量
        const countResult = await pool.query(`SELECT COUNT(*) as count FROM ${quoteIdent(table)}`)
        const count = Number.parseInt(countResult.rows[0].count, 10)

        // 获取向量维度（从列定义中提取）
        const dimResult = await pool.query(`
          SELECT atttypmod FROM pg_attribute
          WHERE attrelid = $1::regclass AND attname = 'vector'
        `, [quoteIdent(table)])
        const dimension = dimResult.rows.length > 0 ? dimResult.rows[0].atttypmod : 0

        return ok({
          name,
          dimension,
          metric: config?.metric ?? 'cosine',
          count,
        })
      }
      catch (error) {
        return err({
          code: VecdbErrorCode.QUERY_FAILED,
          message: vecdbM('vecdb_queryFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },

    async list(): Promise<Result<string[], VecdbError>> {
      if (!pool) {
        return err({ code: VecdbErrorCode.NOT_INITIALIZED, message: vecdbM('vecdb_notInitialized') })
      }

      const prefix = config?.tablePrefix ?? 'vec_'

      try {
        const result = await pool.query(
          `SELECT table_name FROM information_schema.tables WHERE table_name LIKE $1 AND table_schema = 'public'`,
          [`${prefix}%`],
        )
        const names = result.rows.map((row: Record<string, string>) =>
          row.table_name.slice(prefix.length),
        )
        return ok(names)
      }
      catch (error) {
        return err({
          code: VecdbErrorCode.QUERY_FAILED,
          message: vecdbM('vecdb_queryFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },
  }

  // ─── 向量操作 ───

  const vectorOps: VectorOperations = {
    async insert(collection: string, documents: VectorDocument[]): Promise<Result<void, VecdbError>> {
      if (!pool) {
        return err({ code: VecdbErrorCode.NOT_INITIALIZED, message: vecdbM('vecdb_notInitialized') })
      }

      const table = tableName(collection)

      try {
        // 批量插入
        const qi = quoteIdent(table)
        for (const doc of documents) {
          const vectorStr = `[${doc.vector.join(',')}]`
          await pool.query(
            `INSERT INTO ${qi} (id, vector, content, metadata) VALUES ($1, $2::vector, $3, $4::jsonb)`,
            [doc.id, vectorStr, doc.content ?? '', JSON.stringify(doc.metadata ?? {})],
          )
        }

        logger.info('Vectors inserted', { collection, count: documents.length })
        return ok(undefined)
      }
      catch (error) {
        logger.error('Failed to insert vectors', { collection, error })
        return err({
          code: VecdbErrorCode.INSERT_FAILED,
          message: vecdbM('vecdb_insertFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },

    async upsert(collection: string, documents: VectorDocument[]): Promise<Result<void, VecdbError>> {
      if (!pool) {
        return err({ code: VecdbErrorCode.NOT_INITIALIZED, message: vecdbM('vecdb_notInitialized') })
      }

      const table = tableName(collection)

      try {
        const qi = quoteIdent(table)
        for (const doc of documents) {
          const vectorStr = `[${doc.vector.join(',')}]`
          await pool.query(
            `INSERT INTO ${qi} (id, vector, content, metadata)
             VALUES ($1, $2::vector, $3, $4::jsonb)
             ON CONFLICT (id) DO UPDATE SET
               vector = EXCLUDED.vector,
               content = EXCLUDED.content,
               metadata = EXCLUDED.metadata`,
            [doc.id, vectorStr, doc.content ?? '', JSON.stringify(doc.metadata ?? {})],
          )
        }

        logger.info('Vectors upserted', { collection, count: documents.length })
        return ok(undefined)
      }
      catch (error) {
        logger.error('Failed to upsert vectors', { collection, error })
        return err({
          code: VecdbErrorCode.UPDATE_FAILED,
          message: vecdbM('vecdb_updateFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },

    async delete(collection: string, ids: string[]): Promise<Result<void, VecdbError>> {
      if (!pool) {
        return err({ code: VecdbErrorCode.NOT_INITIALIZED, message: vecdbM('vecdb_notInitialized') })
      }

      const table = tableName(collection)

      try {
        const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ')
        await pool.query(`DELETE FROM ${quoteIdent(table)} WHERE id IN (${placeholders})`, ids)

        logger.info('Vectors deleted', { collection, count: ids.length })
        return ok(undefined)
      }
      catch (error) {
        logger.error('Failed to delete vectors', { collection, error })
        return err({
          code: VecdbErrorCode.DELETE_FAILED,
          message: vecdbM('vecdb_deleteFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },

    async search(
      collection: string,
      vector: number[],
      options?: VectorSearchOptions,
    ): Promise<Result<VectorSearchResult[], VecdbError>> {
      if (!pool) {
        return err({ code: VecdbErrorCode.NOT_INITIALIZED, message: vecdbM('vecdb_notInitialized') })
      }

      const table = tableName(collection)
      const topK = options?.topK ?? 10
      const minScore = options?.minScore ?? 0
      const op = distanceOp()

      try {
        const vectorStr = `[${vector.join(',')}]`

        // 构建过滤条件
        let filterSQL = ''
        const filterParams: unknown[] = [vectorStr, topK]
        let paramIndex = 3

        if (options?.filter) {
          const filterParts: string[] = []
          for (const [key, value] of Object.entries(options.filter)) {
            filterParts.push(`metadata->>'${key}' = $${paramIndex}`)
            filterParams.push(String(value))
            paramIndex++
          }
          if (filterParts.length > 0) {
            filterSQL = `WHERE ${filterParts.join(' AND ')}`
          }
        }

        const result = await pool.query(
          `SELECT id, content, metadata, vector ${op} $1::vector AS distance
           FROM ${quoteIdent(table)}
           ${filterSQL}
           ORDER BY vector ${op} $1::vector
           LIMIT $2`,
          filterParams,
        )

        const searchResults: VectorSearchResult[] = result.rows
          .map((row: Record<string, unknown>) => {
            const score = distanceToScore(row.distance as number)
            return {
              id: row.id as string,
              score,
              content: (row.content as string) || undefined,
              metadata: row.metadata as Record<string, unknown> | undefined,
            }
          })
          .filter((r: VectorSearchResult) => r.score >= minScore)

        return ok(searchResults)
      }
      catch (error) {
        logger.error('Failed to search vectors', { collection, error })
        return err({
          code: VecdbErrorCode.QUERY_FAILED,
          message: vecdbM('vecdb_queryFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },

    async count(collection: string): Promise<Result<number, VecdbError>> {
      if (!pool) {
        return err({ code: VecdbErrorCode.NOT_INITIALIZED, message: vecdbM('vecdb_notInitialized') })
      }

      const table = tableName(collection)

      try {
        const result = await pool.query(`SELECT COUNT(*) as count FROM ${quoteIdent(table)}`)
        return ok(Number.parseInt(result.rows[0].count, 10))
      }
      catch (error) {
        return err({
          code: VecdbErrorCode.QUERY_FAILED,
          message: vecdbM('vecdb_queryFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },
  }

  // ─── Provider 接口 ───

  return {
    async connect(cfg): Promise<Result<void, VecdbError>> {
      if (cfg.type !== 'pgvector') {
        return err({
          code: VecdbErrorCode.UNSUPPORTED_TYPE,
          message: vecdbM('vecdb_unsupportedType', { params: { type: cfg.type } }),
        })
      }

      const pgConfig = cfg as PgvectorConfig

      try {
        // 动态加载 pg
        const { Pool } = await import('pg')

        const poolConfig = pgConfig.url
          ? { connectionString: pgConfig.url }
          : {
              host: pgConfig.host,
              port: pgConfig.port,
              database: pgConfig.database,
              user: pgConfig.user,
              password: pgConfig.password,
            }

        pool = new Pool(poolConfig)

        // 确保 pgvector 扩展已启用
        await pool.query('CREATE EXTENSION IF NOT EXISTS vector')

        config = pgConfig

        logger.info('pgvector connected', { host: pgConfig.host, database: pgConfig.database })
        return ok(undefined)
      }
      catch (error) {
        logger.error('Failed to connect to pgvector', { error })
        return err({
          code: VecdbErrorCode.CONNECTION_FAILED,
          message: vecdbM('vecdb_connectionFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },

    async close(): Promise<Result<void, VecdbError>> {
      try {
        if (pool) {
          await pool.end()
        }
        pool = null
        config = null
        logger.info('pgvector connection closed')
        return ok(undefined)
      }
      catch (error) {
        logger.error('Failed to close pgvector connection', { error })
        return err({
          code: VecdbErrorCode.CONNECTION_FAILED,
          message: vecdbM('vecdb_closeFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },

    isConnected(): boolean {
      return pool !== null
    },

    collection: collectionOps,
    vector: vectorOps,
  }
}
