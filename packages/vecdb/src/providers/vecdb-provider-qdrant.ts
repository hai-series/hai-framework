/**
 * @h-ai/vecdb — Qdrant Provider
 *
 * 基于 Qdrant 向量搜索引擎的 Provider 实现。
 * 使用 @qdrant/js-client-rest 客户端连接。
 * @module vecdb-provider-qdrant
 */

import type { Result } from '@h-ai/core'
import type { DistanceMetric, QdrantConfig } from '../vecdb-config.js'
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

import { createHash } from 'node:crypto'
import { core, err, ok } from '@h-ai/core'

import { VecdbErrorCode } from '../vecdb-config.js'
import { vecdbM } from '../vecdb-i18n.js'

const logger = core.logger.child({ module: 'vecdb', scope: 'qdrant' })

/** Qdrant Client 的最小接口定义（避免强依赖可选包） */
interface QdrantClient {
  getCollections: () => Promise<{ collections: { name: string }[] }>
  getCollection: (name: string) => Promise<{ config?: { params?: { vectors?: { size?: number, distance?: string } } }, points_count?: number }>
  createCollection: (name: string, params: Record<string, unknown>) => Promise<unknown>
  deleteCollection: (name: string) => Promise<unknown>
  upsert: (collection: string, params: Record<string, unknown>) => Promise<unknown>
  delete: (collection: string, params: Record<string, unknown>) => Promise<unknown>
  search: (collection: string, params: Record<string, unknown>) => Promise<Record<string, unknown>[]>
}

/**
 * 将字符串 ID 转换为 UUID 格式（Qdrant 要求 UUID 或无符号整数作为 point ID）
 *
 * @param id - 原始字符串 ID
 * @returns UUID 格式字符串
 */
function hashToUuid(id: string): string {
  const hash = createHash('sha256').update(id).digest('hex')
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`
}

/**
 * 将 DistanceMetric 转换为 Qdrant 距离类型名称
 */
function toQdrantDistance(metric: DistanceMetric): string {
  switch (metric) {
    case 'cosine': return 'Cosine'
    case 'euclidean': return 'Euclid'
    case 'dot': return 'Dot'
    default: return 'Cosine'
  }
}

/**
 * 创建 Qdrant Provider
 *
 * @returns VecdbProvider 实例
 */
export function createQdrantProvider(): VecdbProvider {
  let client: QdrantClient | null = null
  let config: QdrantConfig | null = null

  // ─── 集合操作 ───

  const collectionOps: CollectionOperations = {
    async create(name: string, options: CollectionCreateOptions): Promise<Result<void, VecdbError>> {
      if (!client) {
        return err({ code: VecdbErrorCode.NOT_INITIALIZED, message: vecdbM('vecdb_notInitialized') })
      }

      logger.debug('Creating collection', { name, dimension: options.dimension, metric: options.metric })

      try {
        // 检查集合是否已存在
        const collections = await client.getCollections()
        const exists = collections.collections.some((c: { name: string }) => c.name === name)
        if (exists) {
          return err({
            code: VecdbErrorCode.COLLECTION_ALREADY_EXISTS,
            message: vecdbM('vecdb_collectionAlreadyExists', { params: { name } }),
          })
        }

        const metric = options.metric ?? config?.metric ?? 'cosine'

        await client.createCollection(name, {
          vectors: {
            size: options.dimension,
            distance: toQdrantDistance(metric),
          },
        })

        logger.info('Collection created', { name, dimension: options.dimension, metric })
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
      if (!client) {
        return err({ code: VecdbErrorCode.NOT_INITIALIZED, message: vecdbM('vecdb_notInitialized') })
      }

      logger.debug('Dropping collection', { name })

      try {
        // 先用 getCollection 确认存在，不存在时会抛出异常
        try {
          await client.getCollection(name)
        }
        catch {
          return err({
            code: VecdbErrorCode.COLLECTION_NOT_FOUND,
            message: vecdbM('vecdb_collectionNotFound', { params: { name } }),
          })
        }

        await client.deleteCollection(name)

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
      if (!client) {
        return err({ code: VecdbErrorCode.NOT_INITIALIZED, message: vecdbM('vecdb_notInitialized') })
      }

      logger.debug('Checking collection exists', { name })

      try {
        await client.getCollection(name)
        return ok(true)
      }
      catch {
        // getCollection 在集合不存在时抛出异常
        return ok(false)
      }
    },

    async info(name: string): Promise<Result<CollectionInfo, VecdbError>> {
      if (!client) {
        return err({ code: VecdbErrorCode.NOT_INITIALIZED, message: vecdbM('vecdb_notInitialized') })
      }

      logger.debug('Getting collection info', { name })

      try {
        let collectionInfo: Awaited<ReturnType<QdrantClient['getCollection']>>
        try {
          collectionInfo = await client.getCollection(name)
        }
        catch {
          return err({
            code: VecdbErrorCode.COLLECTION_NOT_FOUND,
            message: vecdbM('vecdb_collectionNotFound', { params: { name } }),
          })
        }

        const vectorsConfig = collectionInfo.config?.params?.vectors
        const dimension = vectorsConfig?.size ?? 0

        // 从 Qdrant distance 字符串映射回 DistanceMetric
        const qdrantDistance = vectorsConfig?.distance ?? 'Cosine'
        const metric: DistanceMetric = qdrantDistance === 'Euclid'
          ? 'euclidean'
          : qdrantDistance === 'Dot' ? 'dot' : 'cosine'

        return ok({
          name,
          dimension,
          metric,
          count: collectionInfo.points_count ?? 0,
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
      if (!client) {
        return err({ code: VecdbErrorCode.NOT_INITIALIZED, message: vecdbM('vecdb_notInitialized') })
      }

      logger.debug('Listing collections')

      try {
        const collections = await client.getCollections()
        const names = collections.collections.map((c: { name: string }) => c.name)
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
      if (!client) {
        return err({ code: VecdbErrorCode.NOT_INITIALIZED, message: vecdbM('vecdb_notInitialized') })
      }

      logger.debug('Inserting vectors', { collection, count: documents.length })

      try {
        const points = documents.map(doc => ({
          id: hashToUuid(doc.id),
          vector: doc.vector,
          payload: {
            _id: doc.id,
            content: doc.content ?? '',
            ...doc.metadata,
          },
        }))

        await client.upsert(collection, { points })

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
      // Qdrant 的 upsert 与 insert 操作相同（原生支持 upsert）
      return vectorOps.insert(collection, documents)
    },

    async delete(collection: string, ids: string[]): Promise<Result<void, VecdbError>> {
      if (!client) {
        return err({ code: VecdbErrorCode.NOT_INITIALIZED, message: vecdbM('vecdb_notInitialized') })
      }

      logger.debug('Deleting vectors', { collection, count: ids.length })

      try {
        const uuids = ids.map(hashToUuid)
        await client.delete(collection, { points: uuids })

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
      if (!client) {
        return err({ code: VecdbErrorCode.NOT_INITIALIZED, message: vecdbM('vecdb_notInitialized') })
      }

      const topK = options?.topK ?? 10
      const minScore = options?.minScore ?? 0

      logger.debug('Searching vectors', { collection, topK, hasFilter: !!options?.filter })

      try {
        // 构建过滤条件
        let filter: Record<string, unknown> | undefined
        if (options?.filter && Object.keys(options.filter).length > 0) {
          const mustConditions = Object.entries(options.filter).map(([key, value]) => ({
            key,
            match: { value },
          }))
          filter = { must: mustConditions }
        }

        const searchResult = await client.search(collection, {
          vector,
          limit: topK,
          score_threshold: minScore > 0 ? minScore : undefined,
          filter,
          with_payload: true,
        })

        const results: VectorSearchResult[] = searchResult.map((point: Record<string, unknown>) => {
          const payload = point.payload as Record<string, unknown> ?? {}
          const { _id, content, ...metadata } = payload
          return {
            id: (_id as string) ?? '',
            score: point.score as number,
            content: (content as string) || undefined,
            metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
          }
        })

        return ok(results)
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
      if (!client) {
        return err({ code: VecdbErrorCode.NOT_INITIALIZED, message: vecdbM('vecdb_notInitialized') })
      }

      logger.debug('Counting vectors', { collection })

      try {
        const info = await client.getCollection(collection)
        return ok(info.points_count ?? 0)
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
    name: 'qdrant',

    async connect(cfg): Promise<Result<void, VecdbError>> {
      if (cfg.type !== 'qdrant') {
        return err({
          code: VecdbErrorCode.UNSUPPORTED_TYPE,
          message: vecdbM('vecdb_unsupportedType', { params: { type: cfg.type } }),
        })
      }

      const qdrantConfig = cfg as QdrantConfig

      try {
        const { QdrantClient: QdrantClientClass } = await import('@qdrant/js-client-rest')

        const qdrantClient = new QdrantClientClass({
          url: qdrantConfig.url,
          apiKey: qdrantConfig.apiKey,
        }) as unknown as QdrantClient

        // 验证连接
        await qdrantClient.getCollections()

        client = qdrantClient

        config = qdrantConfig
        logger.info('Qdrant connected', { url: qdrantConfig.url })
        return ok(undefined)
      }
      catch (error) {
        logger.error('Failed to connect to Qdrant', { error })
        return err({
          code: VecdbErrorCode.CONNECTION_FAILED,
          message: vecdbM('vecdb_connectionFailed', { params: { error: String(error) } }),
          cause: error,
        })
      }
    },

    async close(): Promise<Result<void, VecdbError>> {
      client = null
      config = null
      logger.info('Qdrant connection closed')
      return ok(undefined)
    },

    isConnected(): boolean {
      return client !== null
    },

    collection: collectionOps,
    vector: vectorOps,
  }
}
