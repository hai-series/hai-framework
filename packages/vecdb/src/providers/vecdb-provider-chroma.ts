/**
 * @h-ai/vecdb — Chroma Provider
 *
 * 基于 Chroma 向量数据库的 Provider 实现。Chroma 在 Node 端只有 HTTP 客户端，
 * 本 Provider 支持两种模式：
 * - **嵌入式**：提供 `path` 且无 `url` 时，connect 自动拉起本地 `chroma run` 服务
 *   （持久化到 `path`），close 时关闭进程。
 * - **直连**：提供 `url` 时直接连接已有服务，不拉起进程。
 *
 * 向量由调用方显式提供，集合不使用 Chroma 内置 embedding function。
 * @module vecdb-provider-chroma
 */

import type { HaiResult } from '@h-ai/core'
import type { ChildProcess } from 'node:child_process'
import type { ChromaConfig, DistanceMetric } from '../vecdb-config.js'
import type {
  VectorSearchResult,
} from '../vecdb-types.js'
import type { CollectionDriver, VecdbProvider, VectorDriver } from './vecdb-provider-base.js'

import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { core, err, ok } from '@h-ai/core'

import { vecdbM } from '../vecdb-i18n.js'
import { HaiVecdbError } from '../vecdb-types.js'
import { createBaseCollectionOps, createBaseVectorOps } from './vecdb-provider-base.js'

const logger = core.logger.child({ module: 'vecdb', scope: 'chroma' })
const DIMENSION_METADATA_KEY = 'hai_dimension'
const SPACE_METADATA_KEY = 'hnsw:space'
const HEARTBEAT_POLL_INTERVAL = 300

/** Chroma Collection 的最小接口定义（避免强依赖可选包） */
interface ChromaCollection {
  metadata?: Record<string, unknown> | null
  add: (params: ChromaWriteParams) => Promise<unknown>
  upsert: (params: ChromaWriteParams) => Promise<unknown>
  delete: (params: { ids: string[] }) => Promise<unknown>
  query: (params: { queryEmbeddings: number[][], nResults?: number, where?: Record<string, unknown> }) => Promise<ChromaQueryResult>
  count: () => Promise<number>
}

interface ChromaWriteParams {
  ids: string[]
  embeddings: number[][]
  documents?: (string | null)[]
  metadatas?: (Record<string, unknown> | null)[]
}

interface ChromaQueryResult {
  ids: string[][]
  distances?: (number[] | null)[] | null
  documents?: ((string | null)[] | null)[] | null
  metadatas?: ((Record<string, unknown> | null)[] | null)[] | null
}

interface ChromaClient {
  heartbeat: () => Promise<number>
  getOrCreateCollection: (params: { name: string, metadata?: Record<string, unknown>, embeddingFunction?: unknown }) => Promise<ChromaCollection>
  getCollection: (params: { name: string, embeddingFunction?: unknown }) => Promise<ChromaCollection>
  deleteCollection: (params: { name: string }) => Promise<unknown>
  listCollections: () => Promise<Array<{ name: string } | string>>
}

/** Chroma 模块的最小接口 */
interface ChromaModule {
  ChromaClient: new (params: Record<string, unknown>) => ChromaClient
}

function isChromaModule(value: unknown): value is ChromaModule {
  return typeof value === 'object' && value !== null && typeof (value as { ChromaClient?: unknown }).ChromaClient === 'function'
}

/**
 * 占位 embedding function：本 Provider 始终显式传入向量，此函数不会被调用。
 * 提供它是为了避免 Chroma 在无 embedding function 时加载默认实现（需额外依赖）。
 */
const NOOP_EMBEDDING_FUNCTION = {
  name: 'hai-noop',
  async generate(): Promise<number[][]> {
    throw new Error('Chroma embedding function should not be called: vectors are provided explicitly')
  },
}

/** DistanceMetric → Chroma hnsw:space */
function toChromaSpace(metric: DistanceMetric): string {
  if (metric === 'euclidean')
    return 'l2'
  if (metric === 'dot')
    return 'ip'
  return 'cosine'
}

/** Chroma hnsw:space → DistanceMetric */
function fromChromaSpace(space: unknown): DistanceMetric {
  if (space === 'l2')
    return 'euclidean'
  if (space === 'ip')
    return 'dot'
  return 'cosine'
}

/** 将 Chroma 距离转换为相似度分数 [0, 1] */
function distanceToScore(distance: number, metric: DistanceMetric): number {
  if (metric === 'cosine')
    return Math.max(0, Math.min(1, 1 - distance))
  return 1 / (1 + Math.max(0, distance))
}

/** 构建 Chroma where 过滤条件（单键直接匹配，多键用 $and） */
function buildWhere(filter?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!filter)
    return undefined
  const entries = Object.entries(filter)
  if (entries.length === 0)
    return undefined
  if (entries.length === 1)
    return { [entries[0][0]]: entries[0][1] }
  return { $and: entries.map(([key, value]) => ({ [key]: value })) }
}

/**
 * 创建 Chroma Provider
 */
export function createChromaProvider(): VecdbProvider {
  let client: ChromaClient | null = null
  let config: ChromaConfig | null = null
  let serverProcess: ChildProcess | null = null

  function isMissingModuleError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error)
    return message.includes('chromadb')
  }

  /** 动态加载 Chroma JS 客户端 */
  async function loadChromaModule(): Promise<HaiResult<ChromaModule>> {
    try {
      const mod = await import('chromadb')
      if (!isChromaModule(mod)) {
        const error = new Error('chromadb driver module does not export ChromaClient')
        logger.error('Failed to load Chroma driver', { error: error.message })
        return err(HaiVecdbError.DRIVER_NOT_FOUND, vecdbM('vecdb_driverNotFound', { params: { driver: 'chromadb' } }), error)
      }
      return ok(mod)
    }
    catch (error) {
      if (isMissingModuleError(error)) {
        logger.error('Failed to load Chroma driver', { error: error instanceof Error ? error.message : String(error) })
        return err(HaiVecdbError.DRIVER_NOT_FOUND, vecdbM('vecdb_driverNotFound', { params: { driver: 'chromadb' } }), error)
      }
      throw error
    }
  }

  /** 拉起本地 Chroma 服务（嵌入式模式） */
  function startEmbeddedServer(chromaConfig: ChromaConfig): void {
    const args = ['run', '--path', chromaConfig.path ?? './data/chroma', '--host', chromaConfig.host, '--port', String(chromaConfig.port)]
    logger.info('Starting embedded Chroma server', { command: chromaConfig.serverCommand, host: chromaConfig.host, port: chromaConfig.port })
    const proc = spawn(chromaConfig.serverCommand, args, { stdio: 'ignore' })
    proc.on('error', (error: Error) => {
      logger.error('Chroma server process error', { error: error.message })
    })
    serverProcess = proc
  }

  /** 停止本地 Chroma 服务 */
  function stopEmbeddedServer(): void {
    if (!serverProcess)
      return
    try {
      serverProcess.kill()
    }
    catch (error) {
      logger.warn('Failed to stop Chroma server', { error: error instanceof Error ? error.message : String(error) })
    }
    serverProcess = null
  }

  /** 轮询心跳直至就绪或超时 */
  async function waitForHeartbeat(chromaClient: ChromaClient, timeout: number): Promise<void> {
    const deadline = Date.now() + timeout
    let lastError: unknown
    while (Date.now() < deadline) {
      try {
        await chromaClient.heartbeat()
        return
      }
      catch (error) {
        lastError = error
        await delay(HEARTBEAT_POLL_INTERVAL)
      }
    }
    throw new Error(`Chroma heartbeat timed out after ${timeout}ms: ${lastError instanceof Error ? lastError.message : String(lastError)}`)
  }

  /** 获取集合（含维度校验所需的 metadata） */
  async function getCollection(name: string): Promise<ChromaCollection> {
    return client!.getCollection({ name, embeddingFunction: NOOP_EMBEDDING_FUNCTION })
  }

  /** 读取集合存储的维度 */
  function readDimension(collection: ChromaCollection): number {
    const value = collection.metadata?.[DIMENSION_METADATA_KEY]
    return typeof value === 'number' ? value : 0
  }

  function validateDimension<T>(expected: number, actual: number): HaiResult<T> | null {
    if (expected === 0 || expected === actual)
      return null
    return err(
      HaiVecdbError.DIMENSION_MISMATCH,
      vecdbM('vecdb_dimensionMismatch', { params: { expected: String(expected), actual: String(actual) } }),
    )
  }

  const ctx = { isConnected: () => client !== null, logger, operationLog: () => config?.operationLog }

  // ─── 集合操作适配器 ───

  const collectionDriver: CollectionDriver = {
    async create(name, options) {
      logger.debug('Creating collection', { name, dimension: options.dimension, metric: options.metric })

      const existing = await client!.listCollections()
      const exists = existing.some(item => (typeof item === 'string' ? item : item.name) === name)
      if (exists)
        return err(HaiVecdbError.COLLECTION_ALREADY_EXISTS, vecdbM('vecdb_collectionAlreadyExists', { params: { name } }))

      const metric = options.metric ?? config?.metric ?? 'cosine'
      await client!.getOrCreateCollection({
        name,
        metadata: { [SPACE_METADATA_KEY]: toChromaSpace(metric), [DIMENSION_METADATA_KEY]: options.dimension },
        embeddingFunction: NOOP_EMBEDDING_FUNCTION,
      })

      logger.info('Collection created', { name, dimension: options.dimension, metric })
      return ok(undefined)
    },

    async drop(name) {
      logger.debug('Dropping collection', { name })
      const existing = await client!.listCollections()
      const exists = existing.some(item => (typeof item === 'string' ? item : item.name) === name)
      if (!exists)
        return err(HaiVecdbError.COLLECTION_NOT_FOUND, vecdbM('vecdb_collectionNotFound', { params: { name } }))

      await client!.deleteCollection({ name })
      logger.info('Collection dropped', { name })
      return ok(undefined)
    },

    async exists(name) {
      logger.debug('Checking collection exists', { name })
      const existing = await client!.listCollections()
      return ok(existing.some(item => (typeof item === 'string' ? item : item.name) === name))
    },

    async info(name) {
      logger.debug('Getting collection info', { name })
      const existing = await client!.listCollections()
      if (!existing.some(item => (typeof item === 'string' ? item : item.name) === name))
        return err(HaiVecdbError.COLLECTION_NOT_FOUND, vecdbM('vecdb_collectionNotFound', { params: { name } }))

      const collection = await getCollection(name)
      const count = await collection.count()
      return ok({
        name,
        dimension: readDimension(collection),
        metric: fromChromaSpace(collection.metadata?.[SPACE_METADATA_KEY]),
        count,
      })
    },

    async list() {
      logger.debug('Listing collections')
      const existing = await client!.listCollections()
      return ok(existing.map(item => (typeof item === 'string' ? item : item.name)))
    },
  }

  // ─── 向量操作适配器 ───

  function toWriteParams(documents: { id: string, vector: number[], content?: string, metadata?: Record<string, unknown> }[]): ChromaWriteParams {
    return {
      ids: documents.map(doc => doc.id),
      embeddings: documents.map(doc => doc.vector),
      documents: documents.map(doc => doc.content ?? null),
      metadatas: documents.map(doc => ({ ...doc.metadata, _content: doc.content ?? '' })),
    }
  }

  const vectorDriver: VectorDriver = {
    async insert(collection, documents) {
      logger.debug('Inserting vectors', { collection, count: documents.length })
      const target = await getCollection(collection)
      const expected = readDimension(target)
      for (const doc of documents) {
        const validation = validateDimension<void>(expected, doc.vector.length)
        if (validation)
          return validation
      }
      await target.add(toWriteParams(documents))
      logger.info('Vectors inserted', { collection, count: documents.length })
      return ok(undefined)
    },

    async upsert(collection, documents) {
      logger.debug('Upserting vectors', { collection, count: documents.length })
      const target = await getCollection(collection)
      const expected = readDimension(target)
      for (const doc of documents) {
        const validation = validateDimension<void>(expected, doc.vector.length)
        if (validation)
          return validation
      }
      await target.upsert(toWriteParams(documents))
      logger.info('Vectors upserted', { collection, count: documents.length })
      return ok(undefined)
    },

    async delete(collection, ids) {
      logger.debug('Deleting vectors', { collection, count: ids.length })
      const target = await getCollection(collection)
      await target.delete({ ids })
      logger.info('Vectors deleted', { collection, count: ids.length })
      return ok(undefined)
    },

    async search(collection, vector, options) {
      const topK = options?.topK ?? 10
      const minScore = options?.minScore ?? 0
      logger.debug('Searching vectors', { collection, topK, hasFilter: !!options?.filter })

      const target = await getCollection(collection)
      const expected = readDimension(target)
      const validation = validateDimension<VectorSearchResult[]>(expected, vector.length)
      if (validation)
        return validation

      const metric = fromChromaSpace(target.metadata?.[SPACE_METADATA_KEY])
      const response = await target.query({ queryEmbeddings: [vector], nResults: topK, where: buildWhere(options?.filter) })

      const ids = response.ids[0] ?? []
      const distances = response.distances?.[0] ?? []
      const metadatas = response.metadatas?.[0] ?? []

      const results: VectorSearchResult[] = []
      for (let i = 0; i < ids.length; i++) {
        const score = distanceToScore(distances[i] ?? 0, metric)
        if (score < minScore)
          continue
        const metadata = metadatas[i] ?? {}
        const { _content, ...rest } = metadata
        results.push({
          id: ids[i],
          score,
          content: typeof _content === 'string' && _content.length > 0 ? _content : undefined,
          metadata: Object.keys(rest).length > 0 ? rest : undefined,
        })
      }
      return ok(results)
    },

    async count(collection) {
      logger.debug('Counting vectors', { collection })
      const target = await getCollection(collection)
      return ok(await target.count())
    },
  }

  // ─── Provider 接口 ───

  return {
    name: 'chroma',

    async connect(cfg): Promise<HaiResult<void>> {
      if (cfg.type !== 'chroma')
        return err(HaiVecdbError.UNSUPPORTED_TYPE, vecdbM('vecdb_unsupportedType', { params: { type: cfg.type } }))

      const chromaConfig = cfg as ChromaConfig
      const embedded = !!chromaConfig.path && !chromaConfig.url

      const loadResult = await loadChromaModule()
      if (!loadResult.success)
        return loadResult

      try {
        if (embedded)
          startEmbeddedServer(chromaConfig)

        const clientParams: Record<string, unknown> = chromaConfig.url
          ? { path: chromaConfig.url }
          : { host: chromaConfig.host, port: chromaConfig.port }
        if (chromaConfig.apiKey)
          clientParams.auth = { provider: 'token', credentials: chromaConfig.apiKey, tokenHeaderType: 'AUTHORIZATION' }

        // chromadb 为 optionalDependencies，动态 import 后类型与本地最小接口不兼容，需强转
        const chromaClient = new loadResult.data.ChromaClient(clientParams) as unknown as ChromaClient
        await waitForHeartbeat(chromaClient, embedded ? chromaConfig.startupTimeout : 5000)

        client = chromaClient
        config = chromaConfig
        logger.info('Chroma connected', { embedded, host: chromaConfig.host, port: chromaConfig.port })
        return ok(undefined)
      }
      catch (error) {
        stopEmbeddedServer()
        logger.error('Failed to connect to Chroma', { error: error instanceof Error ? error.message : String(error) })
        return err(HaiVecdbError.CONNECTION_FAILED, vecdbM('vecdb_connectionFailed', { params: { error: String(error) } }), error)
      }
    },

    async close(): Promise<HaiResult<void>> {
      stopEmbeddedServer()
      client = null
      config = null
      logger.info('Chroma connection closed')
      return ok(undefined)
    },

    isConnected(): boolean {
      return client !== null
    },

    collection: createBaseCollectionOps(ctx, collectionDriver),
    vector: createBaseVectorOps(ctx, vectorDriver),
  }
}
