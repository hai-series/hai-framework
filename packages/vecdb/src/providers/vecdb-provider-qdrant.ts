/**
 * @h-ai/vecdb — Qdrant Provider
 *
 * 基于 Qdrant 向量搜索引擎的 Provider 实现。
 * 使用原生 fetch 访问固定 REST 端点。
 * @module vecdb-provider-qdrant
 */

import type { HaiResult } from '@h-ai/core'
import type { DistanceMetric, QdrantConfig } from '../vecdb-config.js'
import type {
  CollectionInfo,
  VectorSearchResult,
} from '../vecdb-types.js'

import type { CollectionDriver, VecdbProvider, VectorDriver } from './vecdb-provider-base.js'
import { createHash } from 'node:crypto'
import { core } from '@h-ai/core'
import { vecdbM } from '../vecdb-i18n.js'
import { HaiVecdbError } from '../vecdb-types.js'

import { createBaseCollectionOps, createBaseVectorOps, vectorScoreFromDistance } from './vecdb-provider-base.js'
import { MAX_QDRANT_POINT_ID, QdrantHttpError, QdrantRestClient } from './vecdb-qdrant-rest.js'

const logger = core.logger.child({ module: 'vecdb', scope: 'qdrant' })
const MAX_SEARCH_CANDIDATES = 10_000

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

/** 只认可能按原文档 ID 删除的 point，原生 ID 和不匹配的载荷均不参与框架检索。 */
function readFrameworkId(pointId: string | number | bigint, documentId: unknown): string | undefined {
  return typeof pointId === 'string' && typeof documentId === 'string' && hashToUuid(documentId) === pointId
    ? documentId
    : undefined
}

/**
 * 将 DistanceMetric 转换为 Qdrant 距离类型名称
 */
function toQdrantDistance(metric: DistanceMetric): 'Cosine' | 'Euclid' | 'Dot' {
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
  let client: QdrantRestClient | null = null
  let config: QdrantConfig | null = null

  // ─── 辅助函数 ───

  /** 判断 Qdrant 错误是否为 404（集合不存在） */
  function isQdrantNotFoundError(error: unknown): boolean {
    return error instanceof QdrantHttpError && error.status === 404
  }

  /** 获取集合信息；集合不存在时返回 COLLECTION_NOT_FOUND，其余异常继续抛出 */
  async function getCollectionInfo(name: string): Promise<HaiResult<Awaited<ReturnType<QdrantRestClient['getCollection']>>>> {
    try {
      return core.ok(await client!.getCollection(name))
    }
    catch (error) {
      if (isQdrantNotFoundError(error)) {
        return core.err(HaiVecdbError.COLLECTION_NOT_FOUND, vecdbM('vecdb_collectionNotFound', {
          params: { name },
        }))
      }
      throw error
    }
  }

  /** 本模块使用单个未命名向量字段，不将外部 named/Manhattan 集合猜测为默认 cosine。 */
  function readVectorDefinition(info: Awaited<ReturnType<QdrantRestClient['getCollection']>>): Pick<CollectionInfo, 'dimension' | 'metric'> | undefined {
    const vectors = info.config.params.vectors
    if (!vectors || typeof vectors !== 'object' || !('size' in vectors) || typeof vectors.size !== 'number' || !Number.isSafeInteger(vectors.size) || vectors.size <= 0)
      return undefined
    if (!('distance' in vectors))
      return undefined
    const metric = vectors.distance === 'Cosine'
      ? 'cosine'
      : vectors.distance === 'Euclid'
        ? 'euclidean'
        : vectors.distance === 'Dot'
          ? 'dot'
          : undefined
    return metric
      ? { dimension: vectors.size, metric }
      : undefined
  }

  /** 获取集合维度 */
  async function getCollectionDimension(name: string): Promise<HaiResult<number>> {
    const infoResult = await getCollectionInfo(name)
    if (!infoResult.success) {
      return infoResult
    }

    const definition = readVectorDefinition(infoResult.data)
    return definition
      ? core.ok(definition.dimension)
      : core.err(HaiVecdbError.CONFIG_ERROR, vecdbM('vecdb_invalidCollectionSchema', {
          params: { name },
        }))
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

  // ─── 操作上下文 ───

  const ctx = {
    isConnected: () => client !== null,
    logger,
    operationLog: () => config?.operationLog,
  }

  // ─── 集合操作适配器 ───

  const collectionDriver: CollectionDriver = {
    async create(name, options) {
      logger.debug('Creating collection', { name, dimension: options.dimension, metric: options.metric })

      const metric = options.metric ?? config?.metric ?? 'cosine'
      try {
        const created = await client!.createCollection(name, {
          vectors: {
            size: options.dimension,
            distance: toQdrantDistance(metric),
          },
        })
        if (!created)
          throw new Error('Qdrant did not confirm collection creation')
      }
      catch (error) {
        if (!(error instanceof QdrantHttpError) || error.status !== 409)
          throw error
        return core.err(HaiVecdbError.COLLECTION_ALREADY_EXISTS, vecdbM('vecdb_collectionAlreadyExists', {
          params: { name },
        }))
      }

      logger.info('Collection created', { name, dimension: options.dimension, metric })
      return core.ok(undefined)
    },

    async drop(name) {
      logger.debug('Dropping collection', { name })

      const dropped = await client!.deleteCollection(name).catch((error: unknown) => {
        if (isQdrantNotFoundError(error))
          return false
        throw error
      })
      if (!dropped) {
        return core.err(HaiVecdbError.COLLECTION_NOT_FOUND, vecdbM('vecdb_collectionNotFound', {
          params: { name },
        }))
      }

      logger.info('Collection dropped', { name })
      return core.ok(undefined)
    },

    async exists(name) {
      logger.debug('Checking collection exists', { name })

      try {
        await client!.getCollection(name)
        return core.ok(true)
      }
      catch (error) {
        if (isQdrantNotFoundError(error)) {
          return core.ok(false)
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
      if (!definition) {
        return core.err(HaiVecdbError.CONFIG_ERROR, vecdbM('vecdb_invalidCollectionSchema', {
          params: { name },
        }))
      }

      return core.ok({
        name,
        ...definition,
        count: collectionInfo.points_count ?? 0,
      })
    },

    async list() {
      logger.debug('Listing collections')

      const collections = await client!.getCollections()
      const names = collections.collections.map(c => c.name)
      return core.ok(names)
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
      return core.ok(undefined)
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
      return core.ok(undefined)
    },

    async delete(collection, ids) {
      logger.debug('Deleting vectors', { collection, count: ids.length })

      const uuids = ids.map(hashToUuid)
      await client!.delete(collection, { points: uuids, wait: true })

      logger.info('Vectors deleted', { collection, count: ids.length })
      return core.ok(undefined)
    },

    async search(collection, vector, options) {
      const topK = options?.topK ?? 10
      const minScore = options?.minScore ?? 0
      if (!Number.isSafeInteger(topK) || topK < 1)
        throw new Error('Qdrant search limit must be a positive safe integer')

      logger.debug('Searching vectors', { collection, topK, hasFilter: !!options?.filter })

      const collectionInfo = await getCollectionInfo(collection)
      if (!collectionInfo.success)
        return collectionInfo
      const definition = readVectorDefinition(collectionInfo.data)
      if (!definition) {
        return core.err(HaiVecdbError.CONFIG_ERROR, vecdbM('vecdb_invalidCollectionSchema', {
          params: { name: collection },
        }))
      }
      const dimensionValidation = validateVectorDimension<VectorSearchResult[]>(definition.dimension, vector.length)
      if (dimensionValidation) {
        return dimensionValidation
      }

      const must = Object.entries(options?.filter ?? {}).map(([key, value]) => ({
        key,
        match: { value },
      }))
      // Strict 模式可能拒绝未索引的内部字段或增加的过滤条件，保持调用方原有查询条件。
      const strictMode = collectionInfo.data.config.strict_mode_config
      const mustNot = strictMode?.enabled
        ? undefined
        : [
            {
              is_empty: { key: '_id' },
            },
          ]
      const filter = must.length || mustNot
        ? { must, must_not: mustNot }
        : undefined
      const maxCandidates = strictMode?.enabled
        ? Math.min(strictMode.max_query_limit ?? MAX_SEARCH_CANDIDATES, MAX_SEARCH_CANDIDATES)
        : MAX_SEARCH_CANDIDATES

      let limit = topK
      while (true) {
        const { points } = await client!.query(collection, {
          query: vector,
          limit,
          filter,
          with_payload: true,
        })

        const results: VectorSearchResult[] = []
        for (const point of points) {
          // Qdrant 按相关度返回，转换保留顺序，低于阈值的后续候选无需再查。
          const score = vectorScoreFromDistance(definition.metric === 'cosine'
            ? 1 - point.score
            : definition.metric === 'dot'
              ? -point.score
              : point.score, definition.metric)
          if (!(score >= minScore))
            return core.ok(results)

          const { _id, _content, ...metadata } = point.payload ?? {}
          const id = readFrameworkId(point.id, _id)
          if (id === undefined)
            continue

          results.push({
            id,
            score,
            content: typeof _content === 'string' && _content.length > 0
              ? _content
              : undefined,
            metadata: Object.keys(metadata).length > 0
              ? metadata
              : undefined,
          })
          if (results.length === topK)
            return core.ok(results)
        }

        if (points.length < limit)
          return core.ok(results)
        if (limit >= maxCandidates)
          throw new Error('Qdrant candidate limit reached before collecting requested framework results')

        // 扩展同一排名前缀，避免多次近似搜索分页时的边界重复或遗漏。
        limit = Math.min(limit * 2, maxCandidates)
      }
    },

    async count(collection) {
      logger.debug('Counting vectors', { collection })

      // 集合信息中的 points_count 是近似统计，不能用作版本过滤扩大候选数的终止依据。
      const count = await client!.count(collection, { exact: true })
      return core.ok(count.count)
    },

    async scan(collection, limit, cursor) {
      let offset: string | bigint | undefined
      if (cursor !== undefined) {
        if (/^n:(?:0|[1-9]\d{0,19})$/.test(cursor) && BigInt(cursor.slice(2)) <= MAX_QDRANT_POINT_ID)
          offset = BigInt(cursor.slice(2))
        else if (/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(cursor))
          offset = cursor.toLowerCase()
        else
          return core.err(HaiVecdbError.CONFIG_ERROR, vecdbM('vecdb_invalidScanCursor'))
      }
      const page = await client!.scroll(collection, limit, offset).catch((error: unknown) => {
        if (isQdrantNotFoundError(error))
          return undefined
        throw error
      })
      if (!page) {
        return core.err(HaiVecdbError.COLLECTION_NOT_FOUND, vecdbM('vecdb_collectionNotFound', {
          params: { name: collection },
        }))
      }
      const items = page.points.flatMap(({ id, payload }) => {
        const documentId = readFrameworkId(id, payload?._id)
        return documentId === undefined
          ? []
          : [
              { id: documentId },
            ]
      })
      const next = page.next_page_offset ?? undefined
      if (next !== undefined && next === offset)
        throw new Error('Qdrant scroll cursor did not advance')
      return core.ok({
        items,
        nextCursor: typeof next === 'bigint'
          ? `n:${next}`
          : next,
      })
    },
  }

  // ─── Provider 接口 ───

  return {
    name: 'qdrant',

    async connect(cfg): Promise<HaiResult<void>> {
      if (cfg.type !== 'qdrant') {
        return core.err(HaiVecdbError.UNSUPPORTED_TYPE, vecdbM('vecdb_unsupportedType', {
          params: { type: cfg.type },
        }))
      }

      const qdrantConfig = cfg

      try {
        const qdrantClient = new QdrantRestClient(qdrantConfig.url, qdrantConfig.apiKey)

        // 验证连接
        await qdrantClient.getCollections()

        client = qdrantClient

        config = qdrantConfig
        logger.info('Qdrant connected', {
          url: core.sanitize.sanitizeUrl(qdrantConfig.url),
        })
        return core.ok(undefined)
      }
      catch (error) {
        // 仅提取错误消息，避免 error 对象中的 URL 或连接信息泄漏
        logger.error('Failed to connect to Qdrant', {
          error: core.sanitize.sanitizeSensitiveFields(error),
        })
        return core.err(HaiVecdbError.CONNECTION_FAILED, vecdbM('vecdb_connectionFailed', {
          params: { error: 'Qdrant connection failed' },
        }))
      }
    },

    async close(): Promise<HaiResult<void>> {
      client = null
      config = null
      logger.info('Qdrant connection closed')
      return core.ok(undefined)
    },

    isConnected(): boolean {
      return client !== null
    },

    collection: createBaseCollectionOps(ctx, collectionDriver),
    vector: createBaseVectorOps(ctx, vectorDriver),
  }
}
