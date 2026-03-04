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

type QdrantClient = any

/**
 * 将字符串 ID 转换为 UUID 格式（Qdrant 要求 UUID 或无符号整数作为 point ID）
 *
 * @param id - 原始字符串 ID
 * @returns UUID 格式字符串
 */
function hashToUuid(id: string): string {
  const hash = createHash('md5').update(id).digest('hex')
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

      try {
        const collections = await client.getCollections()
        const exists = collections.collections.some((c: { name: string }) => c.name === name)
        if (!exists) {
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

      try {
        const collections = await client.getCollections()
        const exists = collections.collections.some((c: { name: string }) => c.name === name)
        return ok(exists)
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
      if (!client) {
        return err({ code: VecdbErrorCode.NOT_INITIALIZED, message: vecdbM('vecdb_notInitialized') })
      }

      try {
        // 先检查集合是否存在，避免依赖不稳定的错误消息匹配
        const collections = await client.getCollections()
        const exists = collections.collections.some((c: { name: string }) => c.name === name)
        if (!exists) {
          return err({
            code: VecdbErrorCode.COLLECTION_NOT_FOUND,
            message: vecdbM('vecdb_collectionNotFound', { params: { name } }),
          })
        }

        const collectionInfo = await client.getCollection(name)

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

        client = new QdrantClientClass({
          url: qdrantConfig.url,
          apiKey: qdrantConfig.apiKey,
        })

        // 验证连接
        await client.getCollections()

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
