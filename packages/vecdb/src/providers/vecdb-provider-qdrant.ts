/**
 * @h-ai/vecdb — Qdrant Provider
 *
 * 基于 Qdrant 向量搜索引擎的 Provider 实现。
 * 使用 @qdrant/js-client-rest 客户端连接。
 * @module vecdb-provider-qdrant
 */

import type { HaiResult } from '@h-ai/core'
import type { DistanceMetric, QdrantConfig } from '../vecdb-config.js'
import type {
  VectorSearchResult,
} from '../vecdb-types.js'
import type { CollectionDriver, VecdbProvider, VectorDriver } from './vecdb-provider-base.js'

import { createHash } from 'node:crypto'
import { core, err, ok } from '@h-ai/core'
import { vecdbM } from '../vecdb-i18n.js'
import { HaiVecdbError } from '../vecdb-types.js'

import { createBaseCollectionOps, createBaseVectorOps } from './vecdb-provider-base.js'

/** 脱敏 URL 中的用户名和密码 */
function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.username)
      parsed.username = '***'
    if (parsed.password)
      parsed.password = '***'
    return parsed.toString()
  }
  catch {
    return '(invalid url)'
  }
}

const logger = core.logger.child({ module: 'vecdb', scope: 'qdrant' })

/** Qdrant Client 的最小接口定义（避免强依赖可选包） */
interface QdrantClient {
  getCollections: () => Promise<{ collections: { name: string }[] }>
  getCollection: QdrantGetCollectionMethod
  createCollection: (name: string, params: Record<string, unknown>) => Promise<unknown>
  deleteCollection: (name: string) => Promise<unknown>
  upsert: (collection: string, params: Record<string, unknown>) => Promise<unknown>
  delete: (collection: string, params: Record<string, unknown>) => Promise<unknown>
  search: (collection: string, params: Record<string, unknown>) => Promise<Record<string, unknown>[]>
}

/** Qdrant getCollection 的返回类型 */
interface QdrantCollectionInfo {
  config?: { params?: { vectors?: { size?: number, distance?: string } } }
  points_count?: number
}

/** Qdrant getCollection 特定错误对象的最小接口 */
interface QdrantGetCollectionError {
  getActualType?: () => { status?: number }
}

/** Qdrant getCollection 方法的最小接口（含 typed error 构造器） */
interface QdrantGetCollectionMethod {
  (name: string): Promise<QdrantCollectionInfo>
  Error?: new (...args: never[]) => QdrantGetCollectionError
}

/** Qdrant 模块的最小接口 */
interface QdrantModule {
  QdrantClient: new (config: { url: string, apiKey?: string }) => QdrantClient
}

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
    const getCollectionErrorCtor = client?.getCollection.Error
    if (getCollectionErrorCtor && error instanceof getCollectionErrorCtor) {
      return error.getActualType?.().status === 404
    }

    const maybeError = error as {
      status?: number
      response?: { status?: number }
      $metadata?: { httpStatusCode?: number }
    }

    return maybeError.status === 404
      || maybeError.response?.status === 404
      || maybeError.$metadata?.httpStatusCode === 404
  }

  /** 获取集合信息；集合不存在时返回 COLLECTION_NOT_FOUND，其余异常继续抛出 */
  async function getCollectionInfo(name: string): Promise<HaiResult<QdrantCollectionInfo>> {
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

  /** 获取集合维度 */
  async function getCollectionDimension(name: string): Promise<HaiResult<number>> {
    const infoResult = await getCollectionInfo(name)
    if (!infoResult.success) {
      return infoResult
    }

    return ok(infoResult.data.config?.params?.vectors?.size ?? 0)
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
      const exists = collections.collections.some((c: { name: string }) => c.name === name)
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
    },

    async list() {
      logger.debug('Listing collections')

      const collections = await client!.getCollections()
      const names = collections.collections.map((c: { name: string }) => c.name)
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
      await client!.upsert(collection, { points })

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

      await client!.upsert(collection, { points })

      logger.info('Vectors upserted', { collection, count: documents.length })
      return ok(undefined)
    },

    async delete(collection, ids) {
      logger.debug('Deleting vectors', { collection, count: ids.length })

      const uuids = ids.map(hashToUuid)
      await client!.delete(collection, { points: uuids })

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
      let filter: Record<string, unknown> | undefined
      if (options?.filter && Object.keys(options.filter).length > 0) {
        const mustConditions = Object.entries(options.filter).map(([key, value]) => ({
          key,
          match: { value },
        }))
        filter = { must: mustConditions }
      }

      const searchResult = await client!.search(collection, {
        vector,
        limit: topK,
        score_threshold: minScore > 0 ? minScore : undefined,
        filter,
        with_payload: true,
      })

      const results: VectorSearchResult[] = searchResult.map((point: Record<string, unknown>) => {
        const payload = point.payload as Record<string, unknown> ?? {}
        const { _id, _content, ...metadata } = payload
        return {
          id: (_id as string) ?? '',
          score: point.score as number,
          content: (_content as string) || undefined,
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        }
      })

      return ok(results)
    },

    async count(collection) {
      logger.debug('Counting vectors', { collection })

      const infoResult = await getCollectionInfo(collection)
      if (!infoResult.success) {
        return infoResult
      }

      return ok(infoResult.data.points_count ?? 0)
    },
  }

  // ─── Provider 接口 ───

  return {
    name: 'qdrant',

    async connect(cfg): Promise<HaiResult<void>> {
      if (cfg.type !== 'qdrant') {
        return err(HaiVecdbError.UNSUPPORTED_TYPE, vecdbM('vecdb_unsupportedType', { params: { type: cfg.type } }))
      }

      const qdrantConfig = cfg as QdrantConfig

      try {
        const loadResult = await loadQdrantClient()
        if (!loadResult.success) {
          return loadResult
        }

        const { QdrantClient: QdrantClientClass } = loadResult.data

        // @qdrant/js-client-rest 为 optionalDependencies，动态 import 后类型与本地最小接口不兼容，需强转
        const qdrantClient = new QdrantClientClass({
          url: qdrantConfig.url,
          apiKey: qdrantConfig.apiKey,
        }) as unknown as QdrantClient

        // 验证连接
        await qdrantClient.getCollections()

        client = qdrantClient

        config = qdrantConfig
        logger.info('Qdrant connected', { url: sanitizeUrl(qdrantConfig.url) })
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
