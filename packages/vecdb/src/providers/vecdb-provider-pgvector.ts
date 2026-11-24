/**
 * @h-ai/vecdb — pgvector Provider
 *
 * 基于 PostgreSQL + pgvector 扩展的向量数据库 Provider 实现。
 * 使用 pg 驱动连接，支持 IVFFlat 和 HNSW 索引。
 * @module vecdb-provider-pgvector
 */

import type { HaiResult } from '@h-ai/core'
import type { Pool as PgPool } from 'pg'
import type { DistanceMetric, PgvectorConfig } from '../vecdb-config.js'
import type {
  VectorDocument,
  VectorSearchResult,
} from '../vecdb-types.js'

import type { CollectionDriver, VecdbProvider, VectorDriver } from './vecdb-provider-base.js'
import { Buffer } from 'node:buffer'
import { core } from '@h-ai/core'
import { DistanceMetricSchema } from '../vecdb-config.js'
import { vecdbM } from '../vecdb-i18n.js'
import { HaiVecdbError } from '../vecdb-types.js'

import { createBaseCollectionOps, createBaseVectorOps, vectorScoreFromDistance } from './vecdb-provider-base.js'
import { providerPool } from './vecdb-provider-pool.js'
import { packVectors, preparePgvectorRows, useVectorWorker } from './vecdb-vector-buffer.js'

const logger = core.logger.child({ module: 'vecdb', scope: 'pgvector' })

async function prepareRows(documents: VectorDocument[], dimension: number) {
  if (!useVectorWorker(documents.length, dimension))
    return preparePgvectorRows(documents)
  const batch = packVectors(documents, dimension)
  const prepared = await providerPool.run({ kind: 'pgvector', batch }, [batch.vectors.buffer])
  if (!prepared.success || prepared.data.kind !== 'pgvector')
    throw new Error('Vector batch preparation failed')
  return prepared.data.value
}

/** 仅保留格式安全的 SQLSTATE 或网络错误码，日志不输出驱动错误的原文。 */
function pgErrorCode(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error
    && typeof error.code === 'string' && /^[A-Z0-9_]{1,32}$/.test(error.code)
    ? error.code
    : undefined
}

/** 生成集合不存在的统一错误，避免暴露物理表名。 */
function collectionNotFound(name: string): HaiResult<never> {
  return core.err(HaiVecdbError.COLLECTION_NOT_FOUND, vecdbM('vecdb_collectionNotFound', {
    params: { name },
  }))
}

/** 创建集合时，已经存在的可见关系占用同一个逻辑名称。 */
function collectionAlreadyExists(name: string): HaiResult<never> {
  return core.err(HaiVecdbError.COLLECTION_ALREADY_EXISTS, vecdbM('vecdb_collectionAlreadyExists', {
    params: { name },
  }))
}

/**
 * 创建 pgvector Provider
 *
 * @returns VecdbProvider 实例
 * @example 模块内部上下文
 * ```ts
 * const provider = createPgvectorProvider()
 * // 连接由模块 init 发布；独立内部调用者必须检查 connect 并回收 close。
 * const closed = await provider.close()
 * if (!closed.success) throw new Error(closed.error.message)
 * ```
 */
export function createPgvectorProvider(): VecdbProvider {
  let pool: PgPool | null = null
  let config: PgvectorConfig | null = null
  let maxIdentifierBytes = 0
  let checkEncodedLength = false

  // ─── 辅助函数 ───

  /** 先校验物理标识符，避免 PostgreSQL 自动截断而定位到其它集合。 */
  async function collectionIdentifier(collection: string): Promise<HaiResult<string>> {
    const name = `${config?.tablePrefix ?? 'vec_'}${collection}`
    if (name.length !== 0 && !name.includes('\0') && !/\p{Surrogate}/u.test(name)) {
      // pg 默认收发 UTF-8。其它服务端编码由数据库计算转换后的字节数，保留合法的旧表名。
      const length = checkEncodedLength
        ? (await pool!.query<{ bytes: number }>('SELECT pg_catalog.octet_length($1::text) AS bytes', [name])).rows[0].bytes
        : Buffer.byteLength(name)
      if (length <= maxIdentifierBytes)
        return core.ok(`"${name.replace(/"/g, '""')}"`)
    }
    return core.err(HaiVecdbError.CONFIG_ERROR, vecdbM('vecdb_invalidPgvectorIdentifier', {
      params: {
        limit: String(maxIdentifierBytes),
      },
    }))
  }

  /** 获取距离算符（pgvector 语法） */
  function distanceOp(metric: DistanceMetric): string {
    switch (metric) {
      case 'cosine': return '<=>'
      case 'euclidean': return '<->'
      case 'dot': return '<#>'
      default: return '<=>'
    }
  }

  /** 将距离转换为相似度得分 [0, 1] */
  function distanceToScore(distance: number, metric: DistanceMetric): number {
    return vectorScoreFromDistance(distance, metric)
  }

  /** 判断动态 import 是否因缺少驱动失败 */
  function isMissingModuleError(error: unknown, packageName: string): boolean {
    const message = error instanceof Error
      ? error.message
      : String(error)
    return message.includes(`'${packageName}'`) || message.includes(`\"${packageName}\"`) || message.includes(packageName)
  }

  /** 动态加载 pg 驱动 */
  async function loadPg(): Promise<HaiResult<typeof import('pg')>> {
    try {
      const mod = await import('pg')
      if (typeof mod.Pool !== 'function') {
        const error = new Error('pg driver module does not export Pool')
        logger.error('Failed to load pg driver', { error: error.message })
        return core.err(HaiVecdbError.DRIVER_NOT_FOUND, vecdbM('vecdb_driverNotFound', {
          params: { driver: 'pg' },
        }), error)
      }

      return core.ok(mod)
    }
    catch (error) {
      if (isMissingModuleError(error, 'pg')) {
        logger.error('Failed to load pg driver', {
          error: error instanceof Error
            ? error.message
            : String(error),
        })
        return core.err(HaiVecdbError.DRIVER_NOT_FOUND, vecdbM('vecdb_driverNotFound', {
          params: { driver: 'pg' },
        }), error)
      }
      throw error
    }
  }

  /** 通过同一 search_path 解析表和维度，避免其它 schema 的同名表被误判。 */
  async function getCollectionDimension(name: string, identifier: string): Promise<HaiResult<number>> {
    const result = await pool!.query<{ dimension: number | null }>(`
      SELECT a.atttypmod AS dimension
      FROM pg_catalog.pg_class c
      LEFT JOIN pg_catalog.pg_attribute a
        ON a.attrelid = c.oid AND a.attname = 'vector' AND NOT a.attisdropped
      WHERE c.oid = pg_catalog.to_regclass($1) AND c.relkind IN ('r', 'p', 'f')
    `, [identifier])
    return result.rows[0]
      ? core.ok(result.rows[0].dimension ?? 0)
      : collectionNotFound(name)
  }

  /** 集合算法保存在向量列注释；旧集合从实际索引恢复，不受连接默认值变化影响。 */
  async function getCollectionMetric(identifier: string): Promise<HaiResult<DistanceMetric>> {
    const result = await pool!.query<{ definition: string | null, operator: string | null }>(`
      SELECT pg_catalog.col_description(a.attrelid, a.attnum) AS definition,
        (SELECT opc.opcname FROM pg_catalog.pg_index i JOIN pg_catalog.pg_opclass opc ON opc.oid = ANY(i.indclass)
         WHERE i.indrelid = a.attrelid AND opc.opcname IN ('vector_cosine_ops', 'vector_l2_ops', 'vector_ip_ops') LIMIT 1) AS operator
      FROM pg_catalog.pg_attribute a WHERE a.attrelid = pg_catalog.to_regclass($1) AND a.attname = 'vector' AND NOT a.attisdropped
    `, [identifier])
    const row = result.rows[0]
    const stored = typeof row?.definition === 'string' && row.definition.startsWith('hai.vecdb.metric=')
      ? row.definition.slice('hai.vecdb.metric='.length)
      : undefined
    const inherited = row?.operator === 'vector_cosine_ops'
      ? 'cosine'
      : row?.operator === 'vector_l2_ops'
        ? 'euclidean'
        : row?.operator === 'vector_ip_ops'
          ? 'dot'
          : undefined
    const metric = stored ?? inherited
    const parsed = DistanceMetricSchema.safeParse(metric)
    if (metric === undefined || !parsed.success)
      return core.err(HaiVecdbError.CONFIG_ERROR, vecdbM('vecdb_collectionMetricMissing'))
    return core.ok(parsed.data)
  }

  /** 校验查询向量维度 */
  function validateVectorDimension<T>(expected: number, actual: number): HaiResult<T> | null {
    if (expected === actual) {
      return null
    }

    return core.err(
      HaiVecdbError.DIMENSION_MISMATCH,
      vecdbM('vecdb_dimensionMismatch', {
        params: {
          expected: String(expected),
          actual: String(actual),
        },
      }),
    )
  }

  /** 校验批量文档维度 */
  function validateDocumentsDimension(expected: number, documents: VectorDocument[]): HaiResult<void> | null {
    for (const document of documents) {
      const validation = validateVectorDimension<void>(expected, document.vector.length)
      if (validation) {
        return validation
      }
    }

    return null
  }

  // ─── 操作上下文 ───

  const ctx = {
    isConnected: () => pool !== null,
    logger,
    operationLog: () => config?.operationLog,
  }

  // ─── 集合操作适配器 ───

  const collectionDriver: CollectionDriver = {
    async create(name, options) {
      const identifier = await collectionIdentifier(name)
      if (!identifier.success)
        return identifier
      const qi = identifier.data
      const dimension = options.dimension
      const metric = DistanceMetricSchema.parse(options.metric ?? config?.metric ?? 'cosine')
      const indexType = config?.indexType ?? 'hnsw'
      const distOp = distanceOp(metric)
      const opsClass = distOp === '<=>'
        ? 'vector_cosine_ops'
        : distOp === '<->'
          ? 'vector_l2_ops'
          : 'vector_ip_ops'
      // IVFFlat 在空表按通用默认值建立 100 个列表。
      const indexOptions = indexType === 'ivfflat'
        ? 'WITH (lists = 100)'
        : ''

      logger.debug('Creating collection', { name, dimension, metric, indexType })

      const client = await pool!.connect()
      let discardClient = false
      try {
        // 获取事务锁后用新的快照读取已发布关系，随后原子提交表、索引与距离定义。
        await client.query('BEGIN ISOLATION LEVEL READ COMMITTED')
        await client.query(
          'SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(\'hai.vecdb.collection:\' || $1::text, 0))',
          [qi],
        )
        const occupied = await client.query<{ exists: boolean }>(
          'SELECT pg_catalog.to_regclass($1) IS NOT NULL AS exists',
          [qi],
        )
        if (occupied.rows[0]?.exists) {
          await client.query('COMMIT')
          return collectionAlreadyExists(name)
        }

        await client.query(`
          CREATE TABLE ${qi} (
            id TEXT PRIMARY KEY,
            vector vector(${dimension}),
            content TEXT,
            metadata JSONB DEFAULT '{}'::jsonb
          )
        `)
        await client.query(`CREATE INDEX ON ${qi} USING ${indexType} (vector ${opsClass}) ${indexOptions}`)
        // metric 和 indexType 取自已校验的枚举，不能拼接任意配置文本。
        await client.query(`COMMENT ON COLUMN ${qi}.vector IS 'hai.vecdb.metric=${metric}'`)
        await client.query('COMMIT')
      }
      catch (error) {
        try {
          await client.query('ROLLBACK')
        }
        catch (rollbackError) {
          discardClient = true
          logger.warn('Failed to roll back pgvector collection creation', {
            code: pgErrorCode(rollbackError),
          })
        }
        if (pgErrorCode(error) === '42P07')
          return collectionAlreadyExists(name)
        throw error
      }
      finally {
        client.release(discardClient)
      }

      logger.info('Collection created', { name, dimension, metric, indexType })
      return core.ok(undefined)
    },

    async drop(name) {
      const identifier = await collectionIdentifier(name)
      if (!identifier.success)
        return identifier

      logger.debug('Dropping collection', { name })
      try {
        await pool!.query(`DROP TABLE ${identifier.data}`)
      }
      catch (error) {
        if (pgErrorCode(error) === '42P01')
          return collectionNotFound(name)
        throw error
      }

      logger.info('Collection dropped', { name })
      return core.ok(undefined)
    },

    async exists(name) {
      const identifier = await collectionIdentifier(name)
      if (!identifier.success)
        return identifier
      logger.debug('Checking collection exists', { name })

      const result = await pool!.query<{ exists: boolean }>(
        `SELECT EXISTS (SELECT FROM pg_catalog.pg_class
          WHERE oid = pg_catalog.to_regclass($1) AND relkind IN ('r', 'p', 'f'))`,
        [identifier.data],
      )
      return core.ok(result.rows[0].exists)
    },

    async info(name) {
      logger.debug('Getting collection info', { name })

      const identifier = await collectionIdentifier(name)
      if (!identifier.success)
        return identifier
      const dimensionResult = await getCollectionDimension(name, identifier.data)
      if (!dimensionResult.success) {
        return dimensionResult
      }

      const metric = await getCollectionMetric(identifier.data)
      if (!metric.success)
        return metric
      // 获取文档数量
      const countResult = await pool!.query<{ count: string }>(`SELECT COUNT(*) as count FROM ${identifier.data}`)
      const count = Number.parseInt(String(countResult.rows[0].count), 10)

      return core.ok({
        name,
        dimension: dimensionResult.data,
        metric: metric.data,
        count,
      })
    },

    async list() {
      const prefix = config?.tablePrefix ?? 'vec_'

      logger.debug('Listing collections')

      const result = await pool!.query<{ name: string }>(`
        SELECT table_name::text AS name
        FROM information_schema.tables
        WHERE table_type IN ('BASE TABLE', 'FOREIGN', 'LOCAL TEMPORARY')
          AND pg_catalog.starts_with(table_name::text, $1)
          AND pg_catalog.pg_table_is_visible(pg_catalog.to_regclass(pg_catalog.format('%I.%I', table_schema, table_name)))
        ORDER BY table_name
      `, [prefix])
      return core.ok(result.rows.map(row => row.name.slice(prefix.length)))
    },
  }

  // ─── 向量操作适配器 ───

  const vectorDriver: VectorDriver = {
    async insert(collection, documents) {
      const identifier = await collectionIdentifier(collection)
      if (!identifier.success)
        return identifier

      logger.debug('Inserting vectors', { collection, count: documents.length })

      const dimensionResult = await getCollectionDimension(collection, identifier.data)
      if (!dimensionResult.success) {
        return dimensionResult
      }

      const dimensionValidation = validateDocumentsDimension(dimensionResult.data, documents)
      if (dimensionValidation) {
        return dimensionValidation
      }

      // 构建多值 INSERT（单条 SQL，避免 await-in-loop N+1 问题）
      // 注意：PostgreSQL 参数上限为 65535，每条文档占 4 个参数，单批最多 ~16383 条
      const { placeholders, params } = await prepareRows(documents, dimensionResult.data)

      await pool!.query(
        `INSERT INTO ${identifier.data} (id, vector, content, metadata) VALUES ${placeholders}`,
        params,
      )

      logger.info('Vectors inserted', { collection, count: documents.length })
      return core.ok(undefined)
    },

    async upsert(collection, documents) {
      const identifier = await collectionIdentifier(collection)
      if (!identifier.success)
        return identifier

      logger.debug('Upserting vectors', { collection, count: documents.length })

      const dimensionResult = await getCollectionDimension(collection, identifier.data)
      if (!dimensionResult.success) {
        return dimensionResult
      }

      const dimensionValidation = validateDocumentsDimension(dimensionResult.data, documents)
      if (dimensionValidation) {
        return dimensionValidation
      }

      // 构建多值 INSERT ON CONFLICT（单条 SQL，避免 await-in-loop N+1 问题）
      const { placeholders, params } = await prepareRows(documents, dimensionResult.data)

      await pool!.query(
        `INSERT INTO ${identifier.data} (id, vector, content, metadata) VALUES ${placeholders}
         ON CONFLICT (id) DO UPDATE SET
           vector = EXCLUDED.vector,
           content = EXCLUDED.content,
           metadata = EXCLUDED.metadata`,
        params,
      )

      logger.info('Vectors upserted', { collection, count: documents.length })
      return core.ok(undefined)
    },

    async delete(collection, ids) {
      const identifier = await collectionIdentifier(collection)
      if (!identifier.success)
        return identifier

      logger.debug('Deleting vectors', { collection, count: ids.length })

      const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ')
      await pool!.query(`DELETE FROM ${identifier.data} WHERE id IN (${placeholders})`, ids)

      logger.info('Vectors deleted', { collection, count: ids.length })
      return core.ok(undefined)
    },

    async search(collection, vector, options) {
      const identifier = await collectionIdentifier(collection)
      if (!identifier.success)
        return identifier
      const topK = options?.topK ?? 10
      const minScore = options?.minScore ?? 0

      logger.debug('Searching vectors', { collection, topK, hasFilter: !!options?.filter })

      const dimensionResult = await getCollectionDimension(collection, identifier.data)
      if (!dimensionResult.success) {
        return dimensionResult
      }

      const dimensionValidation = validateVectorDimension<VectorSearchResult[]>(dimensionResult.data, vector.length)
      if (dimensionValidation) {
        return dimensionValidation
      }

      const metric = await getCollectionMetric(identifier.data)
      if (!metric.success)
        return metric
      const op = distanceOp(metric.data)

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
         FROM ${identifier.data}
         ${filterSQL}
         ORDER BY vector ${op} $1::vector
         LIMIT $2`,
        filterParams,
      )

      const searchResults: VectorSearchResult[] = result.rows
        .map((row: Record<string, unknown>) => {
          const score = distanceToScore(row.distance as number, metric.data)
          return {
            id: row.id as string,
            score,
            content: (row.content as string) || undefined,
            metadata: row.metadata as Record<string, unknown> | undefined,
          }
        })
        .filter((r: VectorSearchResult) => r.score >= minScore)

      return core.ok(searchResults)
    },

    async count(collection) {
      const identifier = await collectionIdentifier(collection)
      if (!identifier.success)
        return identifier

      logger.debug('Counting vectors', { collection })

      const result = await pool!.query(`SELECT COUNT(*) as count FROM ${identifier.data}`)
      return core.ok(Number.parseInt(String(result.rows[0].count), 10))
    },

    async scan(collection, limit, cursor) {
      const identifier = await collectionIdentifier(collection)
      if (!identifier.success)
        return identifier
      const request = cursor === undefined
        ? pool!.query<{ id: string }>(`SELECT id FROM ${identifier.data} ORDER BY id LIMIT $1`, [limit + 1])
        : pool!.query<{ id: string }>(`SELECT id FROM ${identifier.data} WHERE id > $1 ORDER BY id LIMIT $2`, [cursor, limit + 1])
      const page = await request.catch((error: unknown) => {
        if (pgErrorCode(error) === '42P01')
          return undefined
        throw error
      })
      if (!page)
        return collectionNotFound(collection)
      const items = page.rows.slice(0, limit).map(row => ({ id: row.id }))
      return core.ok({
        items,
        nextCursor: page.rows.length > limit
          ? items.at(-1)?.id
          : undefined,
      })
    },
  }

  // ─── Provider 接口 ───

  return {
    name: 'pgvector',

    async connect(cfg): Promise<HaiResult<void>> {
      if (cfg.type !== 'pgvector') {
        return core.err(HaiVecdbError.UNSUPPORTED_TYPE, vecdbM('vecdb_unsupportedType', {
          params: { type: cfg.type },
        }))
      }

      const pgConfig = cfg as PgvectorConfig

      try {
        const loadResult = await loadPg()
        if (!loadResult.success) {
          return loadResult
        }

        const { Pool } = loadResult.data

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
        // pg-pool 会移除已损坏的空闲连接；处理后台事件，避免 EventEmitter 终止进程。
        pool.on('error', (error: unknown) => {
          logger.warn('PostgreSQL idle connection error; pool will replace connection', {
            code: pgErrorCode(error),
            name: error instanceof Error
              ? 'Error'
              : 'UnknownError',
          })
        })

        // 确保 pgvector 扩展已启用
        await pool.query('CREATE EXTENSION IF NOT EXISTS vector')
        const serverSettings = await pool.query<{ identifier_limit: number, encoding: string }>(`
          SELECT pg_catalog.current_setting('max_identifier_length')::int AS identifier_limit,
            pg_catalog.current_setting('server_encoding') AS encoding
        `)
        const { identifier_limit: identifierLimit, encoding } = serverSettings.rows[0]
        maxIdentifierBytes = identifierLimit
        checkEncodedLength = encoding !== 'UTF8' && encoding !== 'SQL_ASCII'

        config = pgConfig

        logger.info('pgvector connected', { host: pgConfig.host, database: pgConfig.database })
        return core.ok(undefined)
      }
      catch (error) {
        // 仅提取错误消息，避免 error 对象中的连接字符串泄漏密码
        logger.error('Failed to connect to pgvector', {
          error: error instanceof Error
            ? error.message
            : String(error),
        })
        return core.err(HaiVecdbError.CONNECTION_FAILED, vecdbM('vecdb_connectionFailed', {
          params: {
            error: error instanceof Error
              ? error.message
              : String(error),
          },
        }), error)
      }
    },

    async close(): Promise<HaiResult<void>> {
      try {
        if (pool) {
          await pool.end()
        }
        pool = null
        config = null
        maxIdentifierBytes = 0
        checkEncodedLength = false
        logger.info('pgvector connection closed')
        return core.ok(undefined)
      }
      catch (error) {
        logger.error('Failed to close pgvector connection', {
          error: error instanceof Error
            ? error.message
            : String(error),
        })
        return core.err(HaiVecdbError.CONNECTION_FAILED, vecdbM('vecdb_closeFailed', {
          params: {
            error: String(error),
          },
        }), error)
      }
    },

    isConnected(): boolean {
      return pool !== null
    },

    collection: createBaseCollectionOps(ctx, collectionDriver),
    vector: createBaseVectorOps(ctx, vectorDriver),
  }
}
