/**
 * @h-ai/vecdb — LanceDB Provider
 *
 * 基于 LanceDB 的向量数据库 Provider 实现。
 * LanceDB 为嵌入式向量数据库，数据存储在本地文件系统中。
 * @module vecdb-provider-lancedb
 */

import type { HaiResult } from '@h-ai/core'
import type { Connection, Table } from '@lancedb/lancedb'
import type { DistanceMetric, LancedbConfig } from '../vecdb-config.js'
import type {
  VectorDocument,
  VectorSearchResult,
} from '../vecdb-types.js'
import type { CollectionDriver, VecdbProvider, VectorDriver } from './vecdb-provider-base.js'

import { createRequire } from 'node:module'
import { core, err, ok } from '@h-ai/core'
import { DistanceMetricSchema } from '../vecdb-config.js'
import { vecdbM } from '../vecdb-i18n.js'
import { HaiVecdbError } from '../vecdb-types.js'

import { createBaseCollectionOps, createBaseVectorOps } from './vecdb-provider-base.js'

// @lancedb/lancedb 为可选原生依赖，用 require 运行时加载（见 loadLancedb）
const require = createRequire(import.meta.url)

const logger = core.logger.child({ module: 'vecdb', scope: 'lancedb' })

/** 集合 metric 与 Arrow schema 原子持久化；禁止按连接默认值猜测已有集合。 */
const COLLECTION_METRIC_KEY = 'hai.vecdb.metric'
/** Lance 13 公布的主键字段 metadata；merge 的 ON 字段匹配主键时启用严格键冲突检测。 */
const PRIMARY_KEY_FLAG = 'lance-schema:unenforced-primary-key'
const PRIMARY_KEY_POSITION = 'lance-schema:unenforced-primary-key:position'

/** SQL 字符串字面量使用单引号，ID 中的引号按标准 SQL 转义，保留其他字符。 */
function escapeLanceSqlValue(value: string): string {
  return value.replace(/'/g, '\'\'')
}

/** 仅支持顶层 JSON 标量的 AND 精确匹配；未知类型不能静默丢弃过滤条件。 */
function buildMetadataPredicate(filter: Record<string, unknown>): HaiResult<string> {
  if (typeof filter !== 'object' || filter === null || Array.isArray(filter)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(filter))
    || Reflect.ownKeys(filter).some(key => typeof key !== 'string')) {
    return err(HaiVecdbError.CONFIG_ERROR, vecdbM('vecdb_invalidMetadataFilter'))
  }
  const predicates: string[] = []
  for (const [key, value] of Object.entries(filter)) {
    if (value !== null && typeof value !== 'string' && typeof value !== 'boolean'
      && !(typeof value === 'number' && Number.isFinite(value))) {
      return err(HaiVecdbError.CONFIG_ERROR, vecdbM('vecdb_invalidMetadataFilter'))
    }
    // json_get 只接受字面量顶层键（包括空键）；不把用户键解释为 JSONPath。
    const extracted = `json_extract(json_get(metadata, '${escapeLanceSqlValue(key)}'), '$')`
    // JSON 字符串仍含引号，TRY_CAST 不会把字符串/布尔/null 强转成数字。
    // 两侧均按 JS number 的 IEEE-754 比较，避免 JSON 指数/小数文本规范化造成误拒。
    predicates.push(typeof value === 'number'
      ? `TRY_CAST(${extracted} AS DOUBLE) = CAST(${value} AS DOUBLE)`
      : `${extracted} = '${escapeLanceSqlValue(JSON.stringify(value))}'`)
  }
  return ok(predicates.join(' AND '))
}

/**
 * 从持久化 Arrow schema 读取的集合定义，不在进程内缓存。
 */
interface CollectionMeta {
  /** 向量维度 */
  dimension: number
  /** 距离度量 */
  metric: DistanceMetric
  /** id 必须是不可空的唯一主键字段，且引擎支持原子 merge。 */
  atomicWrites: boolean
  /** 原生 JSONB 需以 Arrow JSON 文本 schema 输入，不能把字符串按二进制原样写入。 */
  inputSchema?: Awaited<ReturnType<Table['schema']>>
}

/**
 * 创建 LanceDB Provider
 *
 * @returns VecdbProvider 实例
 * @example const provider = createLancedbProvider()
 */
export function createLancedbProvider(): VecdbProvider {
  let connection: Connection | null = null
  let config: LancedbConfig | null = null

  // ─── 辅助函数 ───

  /**
   * 加载 @lancedb/lancedb。
   *
   * 用 require 而非 import()：import() 会被打包器（如 SvelteKit adapter-node）静态跟随并尝试
   * 内联原生 .node 二进制导致构建失败；require 为运行时调用，打包器不跟随，消费方无需将
   * @lancedb/lancedb 声明为直接依赖（与 @h-ai/reldb 加载 better-sqlite3 的方式一致）。
   */
  function loadLancedb(): HaiResult<typeof import('@lancedb/lancedb')> {
    try {
      const mod = require('@lancedb/lancedb') as typeof import('@lancedb/lancedb')
      return ok(mod)
    }
    catch (error) {
      logger.error('Failed to load @lancedb/lancedb', { error })
      return err(HaiVecdbError.DRIVER_NOT_FOUND, vecdbM('vecdb_driverNotFound', { params: { driver: '@lancedb/lancedb' } }), error)
    }
  }

  /** 每次读取最新表定义；空表、外部重建与其它连接写入都不依赖进程缓存。 */
  async function withCollection<T>(name: string, action: (table: Table, meta: CollectionMeta) => Promise<HaiResult<T>>): Promise<HaiResult<T>> {
    if (!(await connection!.tableNames()).includes(name))
      return err(HaiVecdbError.COLLECTION_NOT_FOUND, vecdbM('vecdb_collectionNotFound', { params: { name } }))
    const table = await connection!.openTable(name)
    try {
      const schema = await table.schema()
      const vectorType = schema.fields.find(field => field.name === 'vector')?.type
      const metric = DistanceMetricSchema.safeParse(schema.metadata.get(COLLECTION_METRIC_KEY) ?? null)
      if (!vectorType || !('listSize' in vectorType) || typeof vectorType.listSize !== 'number'
        || !Number.isInteger(vectorType.listSize) || vectorType.listSize <= 0 || !metric.success) {
        return err(HaiVecdbError.CONFIG_ERROR, vecdbM('vecdb_invalidCollectionSchema', { params: { name } }))
      }
      const primaryKeys = schema.fields.filter(field => field.metadata.has(PRIMARY_KEY_POSITION)
        || ['true', '1', 'yes'].includes(field.metadata.get(PRIMARY_KEY_FLAG)?.toLowerCase() ?? ''))
      const idField = primaryKeys[0]
      // position 只表示排序，不能替代官方的主键参与标志；缺失/false 必须失败关闭。
      const atomicWrites = primaryKeys.length === 1 && idField.name === 'id' && !idField.nullable
        && ['true', '1', 'yes'].includes(idField.metadata.get(PRIMARY_KEY_FLAG)?.toLowerCase() ?? '')
        && idField.metadata.get(PRIMARY_KEY_POSITION) === '1' && typeof table.mergeInsert === 'function'
      const driver = loadLancedb()
      if (!driver.success)
        return driver
      const jsonMetadata = schema.fields.find(field => field.name === 'metadata')?.metadata.get('ARROW:extension:name') === 'lance.json'
      const inputSchema = jsonMetadata ? schema.assign([driver.data.makeJsonField('metadata', false)]) : undefined
      return await action(table, { dimension: vectorType.listSize, metric: metric.data, atomicWrites, inputSchema })
    }
    finally {
      table.close()
    }
  }

  /** 创建统一的维度不匹配错误结果 */
  function createDimensionMismatchResult<T>(expected: number, actual: number): HaiResult<T> {
    return err(
      HaiVecdbError.DIMENSION_MISMATCH,
      vecdbM('vecdb_dimensionMismatch', {
        params: { expected: String(expected), actual: String(actual) },
      }),
    )
  }

  /** 校验查询向量维度 */
  function validateVectorDimension<T>(expected: number, vector: number[]): HaiResult<T> | null {
    if (vector.length === expected) {
      return null
    }

    return createDimensionMismatchResult<T>(expected, vector.length)
  }

  /** 校验批量文档维度 */
  function validateDocumentsDimension(expected: number, documents: VectorDocument[]): HaiResult<void> | null {
    for (const document of documents) {
      if (document.vector.length !== expected) {
        return createDimensionMismatchResult<void>(expected, document.vector.length)
      }
    }

    return null
  }

  /** 所有新增写入都参与原生主键冲突检测；源批内重复 ID 的 merge 语义未定义，必须先拒绝。 */
  function validateAtomicWrite(meta: CollectionMeta, documents: VectorDocument[]): HaiResult<void> | null {
    if (!meta.inputSchema)
      return err(HaiVecdbError.CONFIG_ERROR, vecdbM('vecdb_jsonMetadataRequired'))
    if (!meta.atomicWrites)
      return err(HaiVecdbError.CONFIG_ERROR, vecdbM('vecdb_atomicUpsertUnavailable'))
    if (new Set(documents.map(document => document.id)).size !== documents.length)
      return err(HaiVecdbError.CONFIG_ERROR, vecdbM('vecdb_duplicateDocumentIds'))
    return null
  }

  // ─── 操作上下文 ───

  const ctx = { isConnected: () => connection !== null, logger, operationLog: () => config?.operationLog }

  // ─── 集合操作适配器 ───

  const collectionDriver: CollectionDriver = {
    async create(name, options) {
      logger.debug('Creating collection', { name, dimension: options.dimension, metric: options.metric })

      const tableNames = await connection!.tableNames()
      if (tableNames.includes(name)) {
        return err(HaiVecdbError.COLLECTION_ALREADY_EXISTS, vecdbM('vecdb_collectionAlreadyExists', { params: { name } }))
      }

      const dimension = options.dimension
      const parsedMetric = DistanceMetricSchema.safeParse(options.metric ?? config?.metric)
      if (!parsedMetric.success)
        return err(HaiVecdbError.CONFIG_ERROR, vecdbM('vecdb_invalidCollectionSchema', { params: { name } }))
      const metric = parsedMetric.data
      const driver = loadLancedb()
      if (!driver.success)
        return driver
      // 仅在内存推导 Arrow 字段；空表与 metric 一次创建，没有占位记录可见窗口。
      const inferred = driver.data.makeArrowTable([{
        id: '',
        vector: Array.from({ length: dimension }).fill(0),
        content: '',
        metadata: '{}',
      }], {}, new Map([[COLLECTION_METRIC_KEY, metric]])).schema
      // 官方 Arrow 字段 metadata 可在初始 manifest 声明主键，避免 create/setPK 的可见窗口。
      const schema = inferred.assign(inferred.fields.map(field => field.name === 'id'
        ? field.clone({ nullable: false, metadata: new Map([...field.metadata, [PRIMARY_KEY_FLAG, 'true'], [PRIMARY_KEY_POSITION, '1']]) })
        : field.name === 'metadata' ? driver.data.makeJsonField('metadata', false) : field))
      const table = await connection!.createEmptyTable(name, schema)
      table.close()

      logger.info('Collection created', { name, dimension, metric })
      return ok(undefined)
    },

    async drop(name) {
      logger.debug('Dropping collection', { name })

      const tableNames = await connection!.tableNames()
      if (!tableNames.includes(name)) {
        return err(HaiVecdbError.COLLECTION_NOT_FOUND, vecdbM('vecdb_collectionNotFound', { params: { name } }))
      }

      await connection!.dropTable(name)

      logger.info('Collection dropped', { name })
      return ok(undefined)
    },

    async exists(name) {
      logger.debug('Checking collection exists', { name })

      const tableNames = await connection!.tableNames()
      return ok(tableNames.includes(name))
    },

    async info(name) {
      logger.debug('Getting collection info', { name })

      return withCollection(name, async (table, meta) => ok({ name, dimension: meta.dimension, metric: meta.metric, count: await table.countRows() }))
    },

    async list() {
      logger.debug('Listing collections')

      const tableNames = await connection!.tableNames()
      return ok(tableNames)
    },
  }

  // ─── 向量操作适配器 ───

  const vectorDriver: VectorDriver = {
    async insert(collection, documents) {
      logger.debug('Inserting vectors', { collection, count: documents.length })

      return withCollection(collection, async (table, meta) => {
        const atomicValidation = validateAtomicWrite(meta, documents)
        if (atomicValidation)
          return atomicValidation
        const dimensionValidation = validateDocumentsDimension(meta.dimension, documents)
        if (dimensionValidation) {
          return dimensionValidation
        }

        const records = documents.map(doc => ({
          id: doc.id,
          vector: doc.vector,
          content: doc.content ?? '',
          metadata: JSON.stringify(doc.metadata ?? {}),
        }))

        // insert 保留已有 ID，不覆盖；不得用 add 绕过并发键冲突检测。
        const driver = loadLancedb()
        if (!driver.success)
          return driver
        await table.mergeInsert('id').whenNotMatchedInsertAll().execute(driver.data.makeArrowTable(records, { schema: meta.inputSchema }))

        logger.info('Vectors inserted', { collection, count: documents.length })
        return ok(undefined)
      })
    },

    async upsert(collection, documents) {
      logger.debug('Upserting vectors', { collection, count: documents.length })

      return withCollection(collection, async (table, meta) => {
        const atomicValidation = validateAtomicWrite(meta, documents)
        if (atomicValidation)
          return atomicValidation
        const dimensionValidation = validateDocumentsDimension(meta.dimension, documents)
        if (dimensionValidation) {
          return dimensionValidation
        }

        const records = documents.map(doc => ({
          id: doc.id,
          vector: doc.vector,
          content: doc.content ?? '',
          metadata: JSON.stringify(doc.metadata ?? {}),
        }))

        const driver = loadLancedb()
        if (!driver.success)
          return driver
        await table
          .mergeInsert('id')
          .whenMatchedUpdateAll()
          .whenNotMatchedInsertAll()
          .execute(driver.data.makeArrowTable(records, { schema: meta.inputSchema }))

        logger.info('Vectors upserted', { collection, count: documents.length })
        return ok(undefined)
      })
    },

    async delete(collection, ids) {
      logger.debug('Deleting vectors', { collection, count: ids.length })

      return withCollection(collection, async (table) => {
        const idList = ids.map(id => `'${escapeLanceSqlValue(id)}'`).join(', ')
        await table.delete(`id IN (${idList})`)

        logger.info('Vectors deleted', { collection, count: ids.length })
        return ok(undefined)
      })
    },

    async search(collection, vector, options) {
      logger.debug('Searching vectors', { collection, topK: options?.topK, hasFilter: !!options?.filter })

      return withCollection(collection, async (table, meta) => {
        const dimensionValidation = validateVectorDimension<VectorSearchResult[]>(meta.dimension, vector)
        if (dimensionValidation) {
          return dimensionValidation
        }

        const topK = options?.topK ?? 10
        const minScore = options?.minScore ?? 0

        let query = table.vectorSearch(vector).distanceType(meta.metric === 'euclidean' ? 'l2' : meta.metric).limit(topK)

        if (options?.filter !== undefined) {
          if (!meta.inputSchema)
            return err(HaiVecdbError.CONFIG_ERROR, vecdbM('vecdb_jsonMetadataRequired'))
          const predicate = buildMetadataPredicate(options.filter)
          if (!predicate.success)
            return predicate
          // LanceDB 默认 prefilter：先限定候选集合，再求 topK，禁止改成后过滤。
          if (predicate.data)
            query = query.where(predicate.data)
        }

        const results = await query.toArray()

        const searchResults: VectorSearchResult[] = results
          .map((row: Record<string, unknown>) => {
            // 距离按集合 metric 解释；dot 距离为 1 - 内积，不能套用 L2 公式。
            const distance = (row._distance as number) ?? 0
            const score = meta.metric === 'cosine'
              ? Math.max(0, Math.min(1, 1 - distance / 2))
              : meta.metric === 'dot' ? 1 / (1 + Math.exp(distance - 1)) : 1 / (1 + Math.max(0, distance))

            return {
              id: row.id as string,
              score,
              content: (row.content as string) || undefined,
              metadata: row.metadata ? JSON.parse(row.metadata as string) as Record<string, unknown> : undefined,
            }
          })
          .filter((r: VectorSearchResult) => r.score >= minScore)

        return ok(searchResults)
      })
    },

    async count(collection) {
      logger.debug('Counting vectors', { collection })

      return withCollection(collection, async (table) => {
        const count = await table.countRows()
        return ok(count)
      })
    },
  }

  // ─── Provider 接口 ───

  return {
    name: 'lancedb',

    async connect(cfg): Promise<HaiResult<void>> {
      if (cfg.type !== 'lancedb') {
        return err(HaiVecdbError.UNSUPPORTED_TYPE, vecdbM('vecdb_unsupportedType', { params: { type: cfg.type } }))
      }

      const lanceConfig = cfg
      const loadResult = loadLancedb()
      if (!loadResult.success)
        return loadResult

      const lancedb = loadResult.data

      try {
        // 每次读检查最新 manifest；仅共享相同持久路径的连接能看到彼此的提交。
        connection = await lancedb.connect(lanceConfig.path, { readConsistencyInterval: 0 })
        config = lanceConfig

        logger.info('LanceDB connected', { path: lanceConfig.path })
        return ok(undefined)
      }
      catch (error) {
        connection?.close()
        connection = null
        config = null
        logger.error('Failed to connect to LanceDB', { error })
        return err(HaiVecdbError.CONNECTION_FAILED, vecdbM('vecdb_connectionFailed', { params: { error: String(error) } }), error)
      }
    },

    async close(): Promise<HaiResult<void>> {
      connection?.close()
      connection = null
      config = null
      logger.info('LanceDB connection closed')
      return ok(undefined)
    },

    isConnected(): boolean {
      return connection !== null
    },

    collection: createBaseCollectionOps(ctx, collectionDriver),
    vector: createBaseVectorOps(ctx, vectorDriver),
  }
}
