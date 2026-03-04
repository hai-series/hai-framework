/**
 * @h-ai/vecdb — LanceDB Provider
 *
 * 基于 LanceDB 的向量数据库 Provider 实现。
 * LanceDB 为嵌入式向量数据库，数据存储在本地文件系统中。
 * @module vecdb-provider-lancedb
 */

import type { Result } from '@h-ai/core'
import type { LancedbConfig } from '../vecdb-config.js'
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

const logger = core.logger.child({ module: 'vecdb', scope: 'lancedb' })

// ─── LanceDB 类型占位（动态 import 使用） ───

type LanceConnection = any
type LanceTable = any

/**
 * 集合元信息（内存维护，LanceDB 不存储维度等信息）
 */
interface CollectionMeta {
  /** 向量维度 */
  dimension: number
  /** 距离度量 */
  metric: string
}

/**
 * 创建 LanceDB Provider
 *
 * @returns VecdbProvider 实例
 */
export function createLancedbProvider(): VecdbProvider {
  let connection: LanceConnection | null = null
  let config: LancedbConfig | null = null

  /** 集合元信息缓存 */
  const collectionMetas = new Map<string, CollectionMeta>()

  // ─── 辅助函数 ───

  /**
   * 动态加载 @lancedb/lancedb
   */
  async function loadLancedb(): Promise<Result<typeof import('@lancedb/lancedb'), VecdbError>> {
    try {
      const mod = await import('@lancedb/lancedb')
      return ok(mod)
    }
    catch (error) {
      logger.error('Failed to load @lancedb/lancedb', { error })
      return err({
        code: VecdbErrorCode.DRIVER_NOT_FOUND,
        message: vecdbM('vecdb_driverNotFound', { params: { driver: '@lancedb/lancedb' } }),
        cause: error,
      })
    }
  }

  /**
   * 打开或创建 LanceDB Table
   */
  async function openTable(name: string): Promise<LanceTable | null> {
    if (!connection)
      return null
    try {
      const tableNames = await connection.tableNames()
      if (tableNames.includes(name)) {
        return await connection.openTable(name)
      }
      return null
    }
    catch {
      return null
    }
  }

  // ─── 集合操作 ───

  const collectionOps: CollectionOperations = {
    async create(name: string, options: CollectionCreateOptions): Promise<Result<void, VecdbError>> {
      if (!connection) {
        return err({ code: VecdbErrorCode.NOT_INITIALIZED, message: vecdbM('vecdb_notInitialized') })
      }

      try {
        const tableNames = await connection.tableNames()
        if (tableNames.includes(name)) {
          return err({
            code: VecdbErrorCode.COLLECTION_ALREADY_EXISTS,
            message: vecdbM('vecdb_collectionAlreadyExists', { params: { name } }),
          })
        }

        // 创建包含初始记录的表以确定 schema
        const dimension = options.dimension
        const metric = options.metric ?? config?.metric ?? 'cosine'
        const initRecord = {
          id: '__init__',
          vector: Array.from({ length: dimension }, () => 0),
          content: '',
          metadata: '{}',
        }

        const table = await connection.createTable(name, [initRecord])
        // 删除初始记录
        await table.delete('id = "__init__"')

        collectionMetas.set(name, { dimension, metric })

        logger.info('Collection created', { name, dimension, metric })
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
      if (!connection) {
        return err({ code: VecdbErrorCode.NOT_INITIALIZED, message: vecdbM('vecdb_notInitialized') })
      }

      try {
        const tableNames = await connection.tableNames()
        if (!tableNames.includes(name)) {
          return err({
            code: VecdbErrorCode.COLLECTION_NOT_FOUND,
            message: vecdbM('vecdb_collectionNotFound', { params: { name } }),
          })
        }

        await connection.dropTable(name)
        collectionMetas.delete(name)

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
      if (!connection) {
        return err({ code: VecdbErrorCode.NOT_INITIALIZED, message: vecdbM('vecdb_notInitialized') })
      }

      try {
        const tableNames = await connection.tableNames()
        return ok(tableNames.includes(name))
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
      if (!connection) {
        return err({ code: VecdbErrorCode.NOT_INITIALIZED, message: vecdbM('vecdb_notInitialized') })
      }

      try {
        const table = await openTable(name)
        if (!table) {
          return err({
            code: VecdbErrorCode.COLLECTION_NOT_FOUND,
            message: vecdbM('vecdb_collectionNotFound', { params: { name } }),
          })
        }

        const count = await table.countRows()
        const meta = collectionMetas.get(name)

        return ok({
          name,
          dimension: meta?.dimension ?? 0,
          metric: (meta?.metric ?? config?.metric ?? 'cosine') as CollectionInfo['metric'],
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
      if (!connection) {
        return err({ code: VecdbErrorCode.NOT_INITIALIZED, message: vecdbM('vecdb_notInitialized') })
      }

      try {
        const tableNames = await connection.tableNames()
        return ok(tableNames)
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
      if (!connection) {
        return err({ code: VecdbErrorCode.NOT_INITIALIZED, message: vecdbM('vecdb_notInitialized') })
      }

      try {
        const table = await openTable(collection)
        if (!table) {
          return err({
            code: VecdbErrorCode.COLLECTION_NOT_FOUND,
            message: vecdbM('vecdb_collectionNotFound', { params: { name: collection } }),
          })
        }

        const records = documents.map(doc => ({
          id: doc.id,
          vector: doc.vector,
          content: doc.content ?? '',
          metadata: JSON.stringify(doc.metadata ?? {}),
        }))

        await table.add(records)

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
      if (!connection) {
        return err({ code: VecdbErrorCode.NOT_INITIALIZED, message: vecdbM('vecdb_notInitialized') })
      }

      try {
        const table = await openTable(collection)
        if (!table) {
          return err({
            code: VecdbErrorCode.COLLECTION_NOT_FOUND,
            message: vecdbM('vecdb_collectionNotFound', { params: { name: collection } }),
          })
        }

        // LanceDB 支持 merge insert（upsert）
        const records = documents.map(doc => ({
          id: doc.id,
          vector: doc.vector,
          content: doc.content ?? '',
          metadata: JSON.stringify(doc.metadata ?? {}),
        }))

        // 先删除已存在的记录，再插入
        const ids = documents.map(d => `"${d.id}"`).join(', ')
        await table.delete(`id IN (${ids})`)
        await table.add(records)

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
      if (!connection) {
        return err({ code: VecdbErrorCode.NOT_INITIALIZED, message: vecdbM('vecdb_notInitialized') })
      }

      try {
        const table = await openTable(collection)
        if (!table) {
          return err({
            code: VecdbErrorCode.COLLECTION_NOT_FOUND,
            message: vecdbM('vecdb_collectionNotFound', { params: { name: collection } }),
          })
        }

        const idList = ids.map(id => `"${id}"`).join(', ')
        await table.delete(`id IN (${idList})`)

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
      if (!connection) {
        return err({ code: VecdbErrorCode.NOT_INITIALIZED, message: vecdbM('vecdb_notInitialized') })
      }

      try {
        const table = await openTable(collection)
        if (!table) {
          return err({
            code: VecdbErrorCode.COLLECTION_NOT_FOUND,
            message: vecdbM('vecdb_collectionNotFound', { params: { name: collection } }),
          })
        }

        const topK = options?.topK ?? 10
        const minScore = options?.minScore ?? 0

        let query = table.search(vector).limit(topK)

        // 应用元数据过滤
        if (options?.filter) {
          const filterParts: string[] = []
          for (const [key, value] of Object.entries(options.filter)) {
            // LanceDB 过滤基于 SQL WHERE 子句（metadata 为 JSON 字符串）
            filterParts.push(`metadata LIKE '%"${key}":"${String(value)}"%'`)
          }
          if (filterParts.length > 0) {
            query = query.where(filterParts.join(' AND '))
          }
        }

        const results = await query.toArray()

        const searchResults: VectorSearchResult[] = results
          .map((row: Record<string, unknown>) => {
            // LanceDB 返回 _distance（L2 距离），转换为相似度
            const distance = (row._distance as number) ?? 0
            const score = 1 / (1 + distance)

            return {
              id: row.id as string,
              score,
              content: (row.content as string) || undefined,
              metadata: row.metadata ? JSON.parse(row.metadata as string) as Record<string, unknown> : undefined,
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
      if (!connection) {
        return err({ code: VecdbErrorCode.NOT_INITIALIZED, message: vecdbM('vecdb_notInitialized') })
      }

      try {
        const table = await openTable(collection)
        if (!table) {
          return err({
            code: VecdbErrorCode.COLLECTION_NOT_FOUND,
            message: vecdbM('vecdb_collectionNotFound', { params: { name: collection } }),
          })
        }

        const count = await table.countRows()
        return ok(count)
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
      if (cfg.type !== 'lancedb') {
        return err({
          code: VecdbErrorCode.UNSUPPORTED_TYPE,
          message: vecdbM('vecdb_unsupportedType', { params: { type: cfg.type } }),
        })
      }

      const lanceConfig = cfg as LancedbConfig
      const loadResult = await loadLancedb()
      if (!loadResult.success)
        return loadResult

      const lancedb = loadResult.data

      try {
        connection = await lancedb.connect(lanceConfig.path)
        config = lanceConfig

        // 恢复已有集合的元信息
        const tableNames = await connection.tableNames()
        for (const name of tableNames) {
          // 尝试读取维度信息：打开表取第一条记录
          try {
            const table = await connection.openTable(name)
            const rows = await table.search(Array.from({ length: 1 }).fill(0)).limit(1).toArray()
            if (rows.length > 0 && rows[0].vector) {
              collectionMetas.set(name, {
                dimension: (rows[0].vector as number[]).length,
                metric: lanceConfig.metric ?? 'cosine',
              })
            }
          }
          catch {
            // 无法推断维度，跳过
          }
        }

        logger.info('LanceDB connected', { path: lanceConfig.path })
        return ok(undefined)
      }
      catch (error) {
        logger.error('Failed to connect to LanceDB', { error })
        return err({
          code: VecdbErrorCode.CONNECTION_FAILED,
          message: vecdbM('vecdb_connectionFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },

    async close(): Promise<Result<void, VecdbError>> {
      connection = null
      config = null
      collectionMetas.clear()
      logger.info('LanceDB connection closed')
      return ok(undefined)
    },

    isConnected(): boolean {
      return connection !== null
    },

    collection: collectionOps,
    vector: vectorOps,
  }
}
