/**
 * @h-ai/vecdb — pgvector Provider
 *
 * 基于 PostgreSQL + pgvector 扩展的向量数据库 Provider 实现。
 * 使用 pg 驱动连接，支持 IVFFlat 和 HNSW 索引。
 * @module vecdb-provider-pgvector
 */

import type { HaiResult } from '@h-ai/core'
import type { PgvectorConfig } from '../vecdb-config.js'
import type {
  VectorSearchResult,
} from '../vecdb-types.js'
import type { CollectionDriver, VecdbProvider, VectorDriver } from './vecdb-provider-base.js'

import { core, err, ok } from '@h-ai/core'
import { vecdbM } from '../vecdb-i18n.js'
import { HaiVecdbError } from '../vecdb-types.js'

import { createBaseCollectionOps, createBaseVectorOps } from './vecdb-provider-base.js'

const logger = core.logger.child({ module: 'vecdb', scope: 'pgvector' })

/** pg Pool 的最小接口定义（避免强依赖可选包） */
interface PgPool {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
  end: () => Promise<void>
}

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

  // ─── 操作上下文 ───

  const ctx = { isConnected: () => pool !== null, logger }

  // ─── 集合操作适配器 ───

  const collectionDriver: CollectionDriver = {
    async create(name, options) {
      const table = tableName(name)
      const dimension = options.dimension
      const metric = options.metric ?? config?.metric ?? 'cosine'
      const indexType = config?.indexType ?? 'hnsw'

      logger.debug('Creating collection', { name, dimension, metric, indexType })

      // 检查表是否已存在
      const checkResult = await pool!.query(
        `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)`,
        [table],
      )
      if (checkResult.rows[0].exists) {
        return err(HaiVecdbError.COLLECTION_ALREADY_EXISTS, vecdbM('vecdb_collectionAlreadyExists', { params: { name } }))
      }

      // 创建表
      const qi = quoteIdent(table)
      await pool!.query(`
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
        await pool!.query(`
          CREATE INDEX ON ${qi}
          USING hnsw (vector ${opsClass})
        `)
      }
      else {
        // IVFFlat lists 参数：建表时数据为空，使用 100 作为通用默认值
        // 适用于 100 万行以内的数据集；超大数据集应在数据增长后重建索引
        await pool!.query(`
          CREATE INDEX ON ${qi}
          USING ivfflat (vector ${opsClass})
          WITH (lists = 100)
        `)
      }

      logger.info('Collection created', { name, dimension, metric, indexType })
      return ok(undefined)
    },

    async drop(name) {
      const table = tableName(name)

      logger.debug('Dropping collection', { name })

      const checkResult = await pool!.query(
        `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)`,
        [table],
      )
      if (!checkResult.rows[0].exists) {
        return err(HaiVecdbError.COLLECTION_NOT_FOUND, vecdbM('vecdb_collectionNotFound', { params: { name } }))
      }

      await pool!.query(`DROP TABLE ${quoteIdent(table)}`)

      logger.info('Collection dropped', { name })
      return ok(undefined)
    },

    async exists(name) {
      logger.debug('Checking collection exists', { name })

      const result = await pool!.query(
        `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)`,
        [tableName(name)],
      )
      return ok(result.rows[0].exists as boolean)
    },

    async info(name) {
      const table = tableName(name)

      logger.debug('Getting collection info', { name })

      // 检查表是否存在
      const existsResult = await pool!.query(
        `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)`,
        [table],
      )
      if (!existsResult.rows[0].exists) {
        return err(HaiVecdbError.COLLECTION_NOT_FOUND, vecdbM('vecdb_collectionNotFound', { params: { name } }))
      }

      // 获取文档数量
      const countResult = await pool!.query(`SELECT COUNT(*) as count FROM ${quoteIdent(table)}`)
      const count = Number.parseInt(String(countResult.rows[0].count), 10)

      // 获取向量维度（从列定义中提取）
      const dimResult = await pool!.query(`
        SELECT atttypmod FROM pg_attribute
        WHERE attrelid = $1::regclass AND attname = 'vector'
      `, [quoteIdent(table)])
      const dimension = dimResult.rows.length > 0 ? Number(dimResult.rows[0].atttypmod) : 0

      return ok({
        name,
        dimension,
        metric: config?.metric ?? 'cosine',
        count,
      })
    },

    async list() {
      const prefix = config?.tablePrefix ?? 'vec_'

      logger.debug('Listing collections')

      const result = await pool!.query(
        `SELECT table_name FROM information_schema.tables WHERE table_name LIKE $1 AND table_schema = 'public'`,
        [`${prefix}%`],
      )
      const names = result.rows.map((row: Record<string, unknown>) =>
        String(row.table_name).slice(prefix.length),
      )
      return ok(names)
    },
  }

  // ─── 向量操作适配器 ───

  const vectorDriver: VectorDriver = {
    async insert(collection, documents) {
      const table = tableName(collection)

      logger.debug('Inserting vectors', { collection, count: documents.length })

      // 构建多值 INSERT（单条 SQL，避免 await-in-loop N+1 问题）
      // 注意：PostgreSQL 参数上限为 65535，每条文档占 4 个参数，单批最多 ~16383 条
      const qi = quoteIdent(table)
      const values: string[] = []
      const params: unknown[] = []
      for (let i = 0; i < documents.length; i++) {
        const base = i * 4
        values.push(`($${base + 1}, $${base + 2}::vector, $${base + 3}, $${base + 4}::jsonb)`)
        const doc = documents[i]
        params.push(doc.id, `[${doc.vector.join(',')}]`, doc.content ?? '', JSON.stringify(doc.metadata ?? {}))
      }

      await pool!.query(
        `INSERT INTO ${qi} (id, vector, content, metadata) VALUES ${values.join(', ')}`,
        params,
      )

      logger.info('Vectors inserted', { collection, count: documents.length })
      return ok(undefined)
    },

    async upsert(collection, documents) {
      const table = tableName(collection)

      logger.debug('Upserting vectors', { collection, count: documents.length })

      const qi = quoteIdent(table)
      // 构建多值 INSERT ON CONFLICT（单条 SQL，避免 await-in-loop N+1 问题）
      const values: string[] = []
      const params: unknown[] = []
      for (let i = 0; i < documents.length; i++) {
        const base = i * 4
        values.push(`($${base + 1}, $${base + 2}::vector, $${base + 3}, $${base + 4}::jsonb)`)
        const doc = documents[i]
        params.push(doc.id, `[${doc.vector.join(',')}]`, doc.content ?? '', JSON.stringify(doc.metadata ?? {}))
      }

      await pool!.query(
        `INSERT INTO ${qi} (id, vector, content, metadata) VALUES ${values.join(', ')}
         ON CONFLICT (id) DO UPDATE SET
           vector = EXCLUDED.vector,
           content = EXCLUDED.content,
           metadata = EXCLUDED.metadata`,
        params,
      )

      logger.info('Vectors upserted', { collection, count: documents.length })
      return ok(undefined)
    },

    async delete(collection, ids) {
      const table = tableName(collection)

      logger.debug('Deleting vectors', { collection, count: ids.length })

      const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ')
      await pool!.query(`DELETE FROM ${quoteIdent(table)} WHERE id IN (${placeholders})`, ids)

      logger.info('Vectors deleted', { collection, count: ids.length })
      return ok(undefined)
    },

    async search(collection, vector, options) {
      const table = tableName(collection)
      const topK = options?.topK ?? 10
      const minScore = options?.minScore ?? 0
      const op = distanceOp()

      logger.debug('Searching vectors', { collection, topK, hasFilter: !!options?.filter })

      const vectorStr = `[${vector.join(',')}]`

      // 构建过滤条件
      let filterSQL = ''
      const filterParams: unknown[] = [vectorStr, topK]
      let paramIndex = 3

      if (options?.filter) {
        const filterParts: string[] = []
        for (const [key, value] of Object.entries(options.filter)) {
          filterParts.push(`metadata->>$${paramIndex} = $${paramIndex + 1}`)
          filterParams.push(key, String(value))
          paramIndex += 2
        }
        if (filterParts.length > 0) {
          filterSQL = `WHERE ${filterParts.join(' AND ')}`
        }
      }

      const result = await pool!.query(
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
    },

    async count(collection) {
      const table = tableName(collection)

      logger.debug('Counting vectors', { collection })

      const result = await pool!.query(`SELECT COUNT(*) as count FROM ${quoteIdent(table)}`)
      return ok(Number.parseInt(String(result.rows[0].count), 10))
    },
  }

  // ─── Provider 接口 ───

  return {
    name: 'pgvector',

    async connect(cfg): Promise<HaiResult<void>> {
      if (cfg.type !== 'pgvector') {
        return err(HaiVecdbError.UNSUPPORTED_TYPE, vecdbM('vecdb_unsupportedType', { params: { type: cfg.type } }))
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
        // 仅提取错误消息，避免 error 对象中的连接字符串泄漏密码
        logger.error('Failed to connect to pgvector', { error: error instanceof Error ? error.message : String(error) })
        return err(HaiVecdbError.CONNECTION_FAILED, vecdbM('vecdb_connectionFailed', { params: { error: error instanceof Error ? error.message : String(error) } }), error)
      }
    },

    async close(): Promise<HaiResult<void>> {
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
        logger.error('Failed to close pgvector connection', { error: error instanceof Error ? error.message : String(error) })
        return err(HaiVecdbError.CONNECTION_FAILED, vecdbM('vecdb_closeFailed', { params: { error: String(error) } }), error)
      }
    },

    isConnected(): boolean {
      return pool !== null
    },

    collection: createBaseCollectionOps(ctx, collectionDriver),
    vector: createBaseVectorOps(ctx, vectorDriver),
  }
}
