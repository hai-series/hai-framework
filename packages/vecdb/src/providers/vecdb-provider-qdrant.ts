/**
 * @h-ai/vecdb — Qdrant Provider
 *
 * 基于 Qdrant 向量搜索引擎的 Provider 实现。
 * 使用 @qdrant/js-client-rest 客户端连接。
 * @module vecdb-provider-qdrant
 */

import type { HaiResult } from '@h-ai/core'
import type { QdrantClient, Schemas } from '@qdrant/js-client-rest'
import type { DistanceMetric, QdrantConfig } from '../vecdb-config.js'
import type {
  CollectionInfo,
  VectorSearchResult,
} from '../vecdb-types.js'
import type { CollectionDriver, VecdbProvider, VectorDriver } from './vecdb-provider-base.js'

import { createHash } from 'node:crypto'
import { core, err, ok } from '@h-ai/core'
import { vecdbM } from '../vecdb-i18n.js'
import { HaiVecdbError } from '../vecdb-types.js'

import { createBaseCollectionOps, createBaseVectorOps } from './vecdb-provider-base.js'

const logger = core.logger.child({ module: 'vecdb', scope: 'qdrant' })

/**
 * 可选 SDK 的真实模块类型；type import 不会提前加载运行时驱动。
 * @example 模块内部上下文
 * ```ts
 * function client(module: QdrantModule) {
 *   return new module.QdrantClient({ url: 'http://localhost:6333' })
 * }
 * ```
 */
type QdrantModule = typeof import('@qdrant/js-client-rest')

function isQdrantModule(value: unknown): value is QdrantModule {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const maybeModule = value as { QdrantClient?: unknown }
  return typeof maybeModule.QdrantClient === 'function'
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
function toQdrantDistance(metric: DistanceMetric): Schemas['Distance'] {
  switch (metric) {
    case 'cosine': return 'Cosine'
    case 'euclidean': return 'Euclid'
    case 'dot': return 'Dot'
  }
}

/**
 * 创建 Qdrant Provider
 *
 * @returns VecdbProvider 实例
 * @example 模块内部上下文
 * ```ts
 * const provider = createQdrantProvider()
 * // 连接由模块 init 发布；独立内部调用者必须检查 connect 并回收 close。
 * const closed = await provider.close()
 * if (!closed.success) throw new Error(closed.error.message)
 * ```
 */
export function createQdrantProvider(): VecdbProvider {
  let client: QdrantClient | null = null
  let config: QdrantConfig | null = null

  // ─── 辅助函数 ───

  /** 判断动态 import 是否因缺少驱动失败 */
  function isMissingModuleError(error: unknown, packageName: string): boolean {
    const message = error instanceof Error ? error.message : String(error)
    return message.includes(`'${packageName}'`) || message.includes(`\"${packageName}\"`) || message.includes(packageName)
  }

  /** 动态加载 Qdrant JS 客户端 */
  async function loadQdrantClient(): Promise<HaiResult<QdrantModule>> {
    try {
      const mod = await import('@qdrant/js-client-rest')
      if (!isQdrantModule(mod)) {
        const error = new Error('@qdrant/js-client-rest driver module does not export QdrantClient')
        logger.error('Failed to load Qdrant driver', { error: error.message })
        return err(HaiVecdbError.DRIVER_NOT_FOUND, vecdbM('vecdb_driverNotFound', { params: { driver: '@qdrant/js-client-rest' } }), error)
      }

      return ok(mod)
    }
    catch (error) {
      if (isMissingModuleError(error, '@qdrant/js-client-rest')) {
        logger.error('Failed to load Qdrant driver', { error: error instanceof Error ? error.message : String(error) })
        return err(HaiVecdbError.DRIVER_NOT_FOUND, vecdbM('vecdb_driverNotFound', { params: { driver: '@qdrant/js-client-rest' } }), error)
      }
      throw error
    }
  }

  /** 判断 Qdrant 错误是否为 404（集合不存在） */
  function isQdrantNotFoundError(error: unknown): boolean {
    // Qdrant REST SDK 的 ApiError 携带顶层 status；不猜测其它 SDK 的异常形态。
    return typeof error === 'object' && error !== null && 'status' in error && error.status === 404
  }

  /** 获取集合信息；集合不存在时返回 COLLECTION_NOT_FOUND，其余异常继续抛出 */
  async function getCollectionInfo(name: string): Promise<HaiResult<Schemas['CollectionInfo']>> {
    try {
      return ok(await client!.getCollection(name))
    }
    catch (error) {
      if (isQdrantNotFoundError(error)) {
        return err(HaiVecdbError.COLLECTION_NOT_FOUND, vecdbM('vecdb_collectionNotFound', { params: { name } }))
      }
      throw error
    }
  }

  /** 本模块使用单个未命名向量字段，不将外部 named/Manhattan 集合猜测为默认 cosine。 */
  function readVectorDefinition(info: Schemas['CollectionInfo']): Pick<CollectionInfo, 'dimension' | 'metric'> | undefined {
    const vectors = info.config.params.vectors
    if (!vectors || !('size' in vectors) || typeof vectors.size !== 'number' || !Number.isSafeInteger(vectors.size) || vectors.size <= 0)
      return undefined
    if (!('distance' in vectors))
      return undefined
    const metric = vectors.distance === 'Cosine' ? 'cosine' : vectors.distance === 'Euclid' ? 'euclidean' : vectors.distance === 'Dot' ? 'dot' : undefined
    return metric ? { dimension: vectors.size, metric } : undefined
  }

  /** 获取集合维度 */
  async function getCollectionDimension(name: string): Promise<HaiResult<number>> {
    const infoResult = await getCollectionInfo(name)
    if (!infoResult.success) {
      return infoResult
    }

    const definition = readVectorDefinition(infoResult.data)
    return definition
      ? ok(definition.dimension)
      : err(HaiVecdbError.CONFIG_ERROR, vecdbM('vecdb_invalidCollectionSchema', { params: { name } }))
  }

  /** 校验查询向量维度 */
  function validateVectorDimension<T>(expected: number, actual: number): HaiResult<T> | null {
    if (expected === actual) {
      return null
    }

    return err(
      HaiVecdbError.DIMENSION_MISMATCH,
      vecdbM('vecdb_dimensionMismatch', {
        params: { expected: String(expected), actual: String(actual) },
      }),
    )
  }

  // ─── 操作上下文 ───

  const ctx = { isConnected: () => client !== null, logger, operationLog: () => config?.operationLog }

  // ─── 集合操作适配器 ───

  const collectionDriver: CollectionDriver = {
    async create(name, options) {
      logger.debug('Creating collection', { name, dimension: options.dimension, metric: options.metric })

      // 检查集合是否已存在
      const collections = await client!.getCollections()
      const exists = collections.collections.some(c => c.name === name)
      if (exists) {
        return err(HaiVecdbError.COLLECTION_ALREADY_EXISTS, vecdbM('vecdb_collectionAlreadyExists', { params: { name } }))
      }

      const metric = options.metric ?? config?.metric ?? 'cosine'

      await client!.createCollection(name, {
        vectors: {
          size: options.dimension,
          distance: toQdrantDistance(metric),
        },
      })

      logger.info('Collection created', { name, dimension: options.dimension, metric })
      return ok(undefined)
    },

    async drop(name) {
      logger.debug('Dropping collection', { name })

      const infoResult = await getCollectionInfo(name)
      if (!infoResult.success) {
        return infoResult
      }

      await client!.deleteCollection(name)

      logger.info('Collection dropped', { name })
      return ok(undefined)
    },

    async exists(name) {
      logger.debug('Checking collection exists', { name })

      try {
        await client!.getCollection(name)
        return ok(true)
      }
      catch (error) {
        if (isQdrantNotFoundError(error)) {
          return ok(false)
        }
        throw error
      }
    },

    async info(name) {
      logger.debug('Getting collection info', { name })

      const infoResult = await getCollectionInfo(name)
      if (!infoResult.success) {
        return infoResult
      }

      const collectionInfo = infoResult.data

      const definition = readVectorDefinition(collectionInfo)
      if (!definition)
        return err(HaiVecdbError.CONFIG_ERROR, vecdbM('vecdb_invalidCollectionSchema', { params: { name } }))

      return ok({
        name,
        ...definition,
        count: collectionInfo.points_count ?? 0,
      })
    },

    async list() {
      logger.debug('Listing collections')

      const collections = await client!.getCollections()
      const names = collections.collections.map(c => c.name)
      return ok(names)
    },
  }

  // ─── 向量操作适配器 ───

  const vectorDriver: VectorDriver = {
    async insert(collection, documents) {
      logger.debug('Inserting vectors', { collection, count: documents.length })

      const dimensionResult = await getCollectionDimension(collection)
      if (!dimensionResult.success) {
        return dimensionResult
      }

      for (const document of documents) {
        const validation = validateVectorDimension<void>(dimensionResult.data, document.vector.length)
        if (validation) {
          return validation
        }
      }

      // 内部保留字段 _id / _content 放在展开之后，防止被 metadata 同名字段覆盖
      const points = documents.map(doc => ({
        id: hashToUuid(doc.id),
        vector: doc.vector,
        payload: {
          ...doc.metadata,
          _id: doc.id,
          _content: doc.content ?? '',
        },
      }))

      // 限制：Qdrant API 仅提供 upsert，无原生 strict insert；
      // ID 已存在时会静默覆盖而非报错，行为等同于 upsert。
      // 返回成功前等待索引写入应用；上层知识版本只有此后才可发布。
      await client!.upsert(collection, { points, wait: true })

      logger.info('Vectors inserted', { collection, count: documents.length })
      return ok(undefined)
    },

    async upsert(collection, documents) {
      logger.debug('Upserting vectors', { collection, count: documents.length })

      const dimensionResult = await getCollectionDimension(collection)
      if (!dimensionResult.success) {
        return dimensionResult
      }

      for (const document of documents) {
        const validation = validateVectorDimension<void>(dimensionResult.data, document.vector.length)
        if (validation) {
          return validation
        }
      }

      // 内部保留字段 _id / _content 放在展开之后，防止被 metadata 同名字段覆盖
      const points = documents.map(doc => ({
        id: hashToUuid(doc.id),
        vector: doc.vector,
        payload: {
          ...doc.metadata,
          _id: doc.id,
          _content: doc.content ?? '',
        },
      }))

      await client!.upsert(collection, { points, wait: true })

      logger.info('Vectors upserted', { collection, count: documents.length })
      return ok(undefined)
    },

    async delete(collection, ids) {
      logger.debug('Deleting vectors', { collection, count: ids.length })

      const uuids = ids.map(hashToUuid)
      await client!.delete(collection, { points: uuids, wait: true })

      logger.info('Vectors deleted', { collection, count: ids.length })
      return ok(undefined)
    },

    async search(collection, vector, options) {
      const topK = options?.topK ?? 10
      const minScore = options?.minScore ?? 0

      logger.debug('Searching vectors', { collection, topK, hasFilter: !!options?.filter })

      const dimensionResult = await getCollectionDimension(collection)
      if (!dimensionResult.success) {
        return dimensionResult
      }

      const dimensionValidation = validateVectorDimension<VectorSearchResult[]>(dimensionResult.data, vector.length)
      if (dimensionValidation) {
        return dimensionValidation
      }

      // 构建过滤条件
      let filter: Schemas['Filter'] | undefined
      if (options?.filter && Object.keys(options.filter).length > 0) {
        const mustConditions = Object.entries(options.filter).map(([key, value]) => ({
          key,
          match: { value },
        }))
        filter = { must: mustConditions }
      }

      const searchResult = await client!.query(collection, {
        query: vector,
        limit: topK,
        score_threshold: minScore > 0 ? minScore : undefined,
        filter,
        with_payload: true,
      })

      const results: VectorSearchResult[] = searchResult.points.map((point) => {
        const payload = point.payload ?? {}
        const { _id, _content, ...metadata } = payload
        return {
          id: typeof _id === 'string' ? _id : '',
          score: point.score,
          content: typeof _content === 'string' && _content.length > 0 ? _content : undefined,
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        }
      })

      return ok(results)
    },

    async count(collection) {
      logger.debug('Counting vectors', { collection })

      // 集合信息中的 points_count 是近似统计，不能用作版本过滤扩大候选数的终止依据。
      const count = await client!.count(collection, { exact: true })
      return ok(count.count)
    },
  }

  // ─── Provider 接口 ───

  return {
    name: 'qdrant',

    async connect(cfg): Promise<HaiResult<void>> {
      if (cfg.type !== 'qdrant') {
        return err(HaiVecdbError.UNSUPPORTED_TYPE, vecdbM('vecdb_unsupportedType', { params: { type: cfg.type } }))
      }

      const qdrantConfig = cfg

      try {
        const loadResult = await loadQdrantClient()
        if (!loadResult.success) {
          return loadResult
        }

        const { QdrantClient: QdrantClientClass } = loadResult.data

        const qdrantClient = new QdrantClientClass({
          url: qdrantConfig.url,
          apiKey: qdrantConfig.apiKey,
        })

        // 验证连接
        await qdrantClient.getCollections()

        client = qdrantClient

        config = qdrantConfig
        logger.info('Qdrant connected', { url: core.sanitize.sanitizeUrl(qdrantConfig.url) })
        return ok(undefined)
      }
      catch (error) {
        // 仅提取错误消息，避免 error 对象中的 URL 或连接信息泄漏
        logger.error('Failed to connect to Qdrant', { error: error instanceof Error ? error.message : String(error) })
        return err(HaiVecdbError.CONNECTION_FAILED, vecdbM('vecdb_connectionFailed', { params: { error: String(error) } }), error)
      }
    },

    async close(): Promise<HaiResult<void>> {
      client = null
      config = null
      logger.info('Qdrant connection closed')
      return ok(undefined)
    },

    isConnected(): boolean {
      return client !== null
    },

    collection: createBaseCollectionOps(ctx, collectionDriver),
    vector: createBaseVectorOps(ctx, vectorDriver),
  }
}
