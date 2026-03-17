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
  CollectionInfo,
  VecdbError,
  VectorSearchResult,
} from '../vecdb-types.js'
import type { CollectionDriver, VecdbProvider, VectorDriver } from './vecdb-provider-base.js'

import { core, err, ok } from '@h-ai/core'

import { VecdbErrorCode } from '../vecdb-config.js'
import { vecdbM } from '../vecdb-i18n.js'
import { createBaseCollectionOps, createBaseVectorOps } from './vecdb-provider-base.js'

const logger = core.logger.child({ module: 'vecdb', scope: 'lancedb' })

// ─── LanceDB 类型接口（动态 import 使用，避免强依赖可选包） ───

/** LanceDB 连接的最小接口定义 */
interface LanceConnection {
  tableNames: () => Promise<string[]>
  openTable: (name: string) => Promise<LanceTable>
  createTable: (name: string, data: Record<string, unknown>[]) => Promise<LanceTable>
  dropTable: (name: string) => Promise<void>
}

/** LanceDB Table 的最小接口定义 */
interface LanceTable {
  add: (data: Record<string, unknown>[]) => Promise<void>
  delete: (filter: string) => Promise<void>
  countRows: () => Promise<number>
  search: (...args: unknown[]) => LanceSearchQuery
}

/** LanceDB 查询构建器的最小接口 */
interface LanceSearchQuery {
  limit: (n: number) => LanceSearchQuery
  where: (filter: string) => LanceSearchQuery
  toArray: () => Promise<Record<string, unknown>[]>
}

/** 转义 LanceDB filter 表达式中的字符串值（防注入 + LIKE 通配符） */
function escapeLanceFilterValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
}

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

  // ─── 操作上下文 ───

  const ctx = { isConnected: () => connection !== null, logger }

  // ─── 集合操作适配器 ───

  const collectionDriver: CollectionDriver = {
    async create(name, options) {
      logger.debug('Creating collection', { name, dimension: options.dimension, metric: options.metric })

      const tableNames = await connection!.tableNames()
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

      const table = await connection!.createTable(name, [initRecord])
      // 删除初始记录
      await table.delete('id = "__init__"')

      collectionMetas.set(name, { dimension, metric })

      logger.info('Collection created', { name, dimension, metric })
      return ok(undefined)
    },

    async drop(name) {
      logger.debug('Dropping collection', { name })

      const tableNames = await connection!.tableNames()
      if (!tableNames.includes(name)) {
        return err({
          code: VecdbErrorCode.COLLECTION_NOT_FOUND,
          message: vecdbM('vecdb_collectionNotFound', { params: { name } }),
        })
      }

      await connection!.dropTable(name)
      collectionMetas.delete(name)

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
    },

    async upsert(collection, documents) {
      logger.debug('Upserting vectors', { collection, count: documents.length })

      const table = await openTable(collection)
      if (!table) {
        return err({
          code: VecdbErrorCode.COLLECTION_NOT_FOUND,
          message: vecdbM('vecdb_collectionNotFound', { params: { name: collection } }),
        })
      }

      // LanceDB 不支持原子 upsert，当前实现为 delete + add 两步操作。
      // 若在 delete 之后、add 之前发生错误，已删除的记录将丢失。
      // TODO: LanceDB 未来支持 mergeInsert 后可替换为原子操作
      const records = documents.map(doc => ({
        id: doc.id,
        vector: doc.vector,
        content: doc.content ?? '',
        metadata: JSON.stringify(doc.metadata ?? {}),
      }))

      // 先删除已存在的记录，再插入
      const ids = documents.map(d => `"${escapeLanceFilterValue(d.id)}"`).join(', ')
      await table.delete(`id IN (${ids})`)
      await table.add(records)

      logger.info('Vectors upserted', { collection, count: documents.length })
      return ok(undefined)
    },

    async delete(collection, ids) {
      logger.debug('Deleting vectors', { collection, count: ids.length })

      const table = await openTable(collection)
      if (!table) {
        return err({
          code: VecdbErrorCode.COLLECTION_NOT_FOUND,
          message: vecdbM('vecdb_collectionNotFound', { params: { name: collection } }),
        })
      }

      const idList = ids.map(id => `"${escapeLanceFilterValue(id)}"`).join(', ')
      await table.delete(`id IN (${idList})`)

      logger.info('Vectors deleted', { collection, count: ids.length })
      return ok(undefined)
    },

    async search(collection, vector, options) {
      logger.debug('Searching vectors', { collection, topK: options?.topK, hasFilter: !!options?.filter })

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
          filterParts.push(`metadata LIKE '%"${escapeLanceFilterValue(key)}":"${escapeLanceFilterValue(String(value))}"%'`)
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
    },

    async count(collection) {
      logger.debug('Counting vectors', { collection })

      const table = await openTable(collection)
      if (!table) {
        return err({
          code: VecdbErrorCode.COLLECTION_NOT_FOUND,
          message: vecdbM('vecdb_collectionNotFound', { params: { name: collection } }),
        })
      }

      const count = await table.countRows()
      return ok(count)
    },
  }

  // ─── Provider 接口 ───

  return {
    name: 'lancedb',

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
        // @lancedb/lancedb 为 optionalDependencies，动态 import 后类型与本地最小接口不兼容，需强转
        connection = await lancedb.connect(lanceConfig.path) as unknown as LanceConnection
        config = lanceConfig

        // 恢复已有集合的元信息
        // 限制：LanceDB 不持久化维度/度量元信息，此处通过读取首条记录推断。
        // 若表为空或向量维度与探测维度不匹配，dimension 将为 0。
        const tableNames = await connection!.tableNames()
        await Promise.allSettled(tableNames.map(async (name) => {
          try {
            const table = await connection!.openTable(name)
            const count = await table.countRows()
            if (count === 0)
              return
            // 使用 1 维零向量探测，若真实维度不同 LanceDB 可能报错
            const rows = await table.search(Array.from({ length: 1 }).fill(0)).limit(1).toArray()
            if (rows.length > 0 && rows[0].vector) {
              collectionMetas.set(name, {
                dimension: (rows[0].vector as number[]).length,
                metric: lanceConfig.metric ?? 'cosine',
              })
            }
          }
          catch {
            // 无法推断维度（例如维度不匹配），跳过；info() 将返回 dimension=0
          }
        }))

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

    collection: createBaseCollectionOps(ctx, collectionDriver),
    vector: createBaseVectorOps(ctx, vectorDriver),
  }
}
