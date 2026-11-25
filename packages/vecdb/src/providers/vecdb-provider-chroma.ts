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
import type { ChromaClient, ChromaClientArgs, Collection, EmbeddingFunction, EmbeddingFunctionSpace, Metadata, Where } from 'chromadb'
import type { ChildProcess } from 'node:child_process'
import type { ChromaConfig, DistanceMetric } from '../vecdb-config.js'
import type {
  VectorDocument,
  VectorSearchResult,
} from '../vecdb-types.js'

import type { CollectionDriver, VecdbProvider, VectorDriver } from './vecdb-provider-base.js'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { core } from '@h-ai/core'
import { z } from 'zod'

import { vecdbM } from '../vecdb-i18n.js'
import { HaiVecdbError } from '../vecdb-types.js'
import { createBaseCollectionOps, createBaseVectorOps, vectorScoreFromDistance } from './vecdb-provider-base.js'

const logger = core.logger.child({ module: 'vecdb', scope: 'chroma' })
const DIMENSION_METADATA_KEY = 'hai_dimension'
// Chroma 的原生 schema 使用此保留键表示集合的密集向量索引。
const EMBEDDING_SCHEMA_KEY = '#embedding'
const HEARTBEAT_POLL_INTERVAL = 300
const ACTIVE_METADATA_KEYS = '_hai_vecdb_metadata_keys'
const ACTIVE_METADATA_FORMAT = 'v1'
const NEGATIVE_WHERE_OPERATORS = new Set(['$ne', '$nin', '$not_contains'])

// SDK 的 Collection 对象没有保留 GET 响应中的持久化维度和原始标识。
const NativeCollectionDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  tenant: z.string(),
  database: z.string(),
  dimension: z.number().int().positive().nullable(),
})

/**
 * 可选 SDK 的真实模块类型；type import 不会提前加载运行时驱动。
 * @example 模块内部上下文
 * ```ts
 * function client(module: ChromaModule) {
 *   return new module.ChromaClient({ host: 'localhost', port: 8000, ssl: false })
 * }
 * ```
 */
type ChromaModule = typeof import('chromadb')

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
} satisfies EmbeddingFunction

/** DistanceMetric → Chroma 原生距离空间 */
function toChromaSpace(metric: DistanceMetric): EmbeddingFunctionSpace {
  if (metric === 'euclidean')
    return 'l2'
  if (metric === 'dot')
    return 'ip'
  return 'cosine'
}

/** Chroma 原生距离空间 → DistanceMetric */
function fromChromaSpace(space: unknown): DistanceMetric | undefined {
  if (space === 'l2')
    return 'euclidean'
  if (space === 'ip')
    return 'dot'
  return space === 'cosine'
    ? 'cosine'
    : undefined
}

/** 从原生 schema 或集合配置读取密集索引的距离空间。 */
function readMetric(collection: Collection): HaiResult<DistanceMetric> {
  const schema = collection.schema
  const space = schema?.keys[EMBEDDING_SCHEMA_KEY]?.floatList?.vectorIndex?.config.space
    ?? collection.configuration?.hnsw?.space
    ?? collection.configuration?.spann?.space
    ?? schema?.defaults.floatList?.vectorIndex?.config.space
  const metric = fromChromaSpace(space)
  return metric === undefined
    ? invalidNativeCollectionDefinition(collection.name)
    : core.ok(metric)
}

function invalidNativeCollectionDefinition(name: string): HaiResult<never> {
  return core.err(HaiVecdbError.CONFIG_ERROR, vecdbM('vecdb_invalidCollectionSchema', {
    params: { name },
  }))
}

function missingNativeCollectionDefinition(name: string): HaiResult<never> {
  return core.err(HaiVecdbError.COLLECTION_NOT_FOUND, vecdbM('vecdb_collectionNotFound', {
    params: { name },
  }))
}

/** 将 Chroma 距离转换为相似度分数 [0, 1] */
function distanceToScore(distance: number, metric: DistanceMetric): number {
  // Chroma 的内积距离为 1-dot；共享转换接收负内积。
  return vectorScoreFromDistance(metric === 'dot'
    ? distance - 1
    : distance, metric)
}

/** Chroma 原地合并元数据；以清单为准判断字段是否存在。 */
function guardMetadataWhere(where: Where): Where {
  const entries: Array<[string, unknown]> = Object.entries(where)
  if (entries.length !== 1)
    return where
  const [[key, test]] = entries
  if (key === '$and' || key === '$or') {
    if (!Array.isArray(test) || test.some(child => child === null || typeof child !== 'object' || Array.isArray(child)))
      return where
    // SDK 校验嵌套谓词及其操作数，此处仅为合法形状的节点添加过滤条件。
    const children = (test as Where[]).map(guardMetadataWhere)
    return key === '$and'
      ? { $and: children }
      : { $or: children }
  }

  const marker = `k:${key}`
  if (test && typeof test === 'object' && Object.keys(test).some(operator => NEGATIVE_WHERE_OPERATORS.has(operator))) {
    // Chroma 的否定谓词匹配缺失字段。物理存在但已失效的字段也按缺失处理。
    return {
      $or: [
        where,
        {
          [ACTIVE_METADATA_KEYS]: { $not_contains: marker },
        },
      ],
    }
  }
  return {
    $and: [
      where,
      {
        [ACTIVE_METADATA_KEYS]: { $contains: marker },
      },
    ],
  }
}

/** 单字段直接匹配，多字段用 AND；有效键检查在服务端和 topK 一同执行。 */
function buildWhere(filter?: Record<string, unknown>): Where | undefined {
  if (!filter)
    return undefined
  const entries = Object.entries(filter)
  if (entries.length === 0)
    return undefined
  const where = entries.length === 1
    ? { [entries[0][0]]: entries[0][1] }
    : {
        $and: entries.map(([key, value]) => ({ [key]: value })),
      }
  // 清单格式约束覆盖所有分支，且与业务谓词一同在服务端筛选。SDK 校验谓词。
  return {
    $and: [
      {
        [ACTIVE_METADATA_KEYS]: { $contains: ACTIVE_METADATA_FORMAT },
      },
      guardMetadataWhere(where as Where),
    ],
  }
}

/**
 * 创建 Chroma Provider
 * @returns 尚未连接的 Provider；connect 成功后可用，close 失败时保留资源供重试。
 * @example 模块内部上下文
 * ```ts
 * const provider = createChromaProvider()
 * // 连接由模块 init 发布；独立内部调用者必须检查 connect 并回收 close。
 * const closed = await provider.close()
 * if (!closed.success) throw new Error(closed.error.message)
 * ```
 */
export function createChromaProvider(): VecdbProvider {
  let client: ChromaClient | null = null
  let config: ChromaConfig | null = null
  let endpointOrigin: URL | null = null
  let serverProcess: ChildProcess | null = null
  let spawnFailed = false
  let closing: Promise<HaiResult<void>> | null = null

  function isMissingModuleError(error: unknown): boolean {
    const message = error instanceof Error
      ? error.message
      : String(error)
    return message.includes('chromadb')
  }

  /** 动态加载 Chroma JS 客户端 */
  async function loadChromaModule(): Promise<HaiResult<ChromaModule>> {
    try {
      const mod = await import('chromadb')
      if (!isChromaModule(mod)) {
        const error = new Error('chromadb driver module does not export ChromaClient')
        logger.error('Failed to load Chroma driver', { error: error.message })
        return core.err(HaiVecdbError.DRIVER_NOT_FOUND, vecdbM('vecdb_driverNotFound', {
          params: { driver: 'chromadb' },
        }), error)
      }
      return core.ok(mod)
    }
    catch (error) {
      if (isMissingModuleError(error)) {
        logger.error('Failed to load Chroma driver', {
          error: error instanceof Error
            ? error.message
            : String(error),
        })
        return core.err(HaiVecdbError.DRIVER_NOT_FOUND, vecdbM('vecdb_driverNotFound', {
          params: { driver: 'chromadb' },
        }), error)
      }
      throw error
    }
  }

  /** 拉起本地 Chroma 服务（嵌入式模式） */
  async function startEmbeddedServer(chromaConfig: ChromaConfig): Promise<void> {
    const args = [
      'run',
      '--path',
      chromaConfig.path ?? './data/chroma',
      '--host',
      chromaConfig.host,
      '--port',
      String(chromaConfig.port),
    ]
    logger.info('Starting embedded Chroma server', { command: chromaConfig.serverCommand, host: chromaConfig.host, port: chromaConfig.port })
    spawnFailed = false
    const proc = spawn(chromaConfig.serverCommand, args, { stdio: 'ignore' })
    proc.on('error', (error: Error) => {
      spawnFailed = proc.pid === undefined
      logger.error('Chroma server process error', { error: error.message })
    })
    serverProcess = proc
    await new Promise<void>((resolve, reject) => {
      proc.once('spawn', resolve)
      proc.once('error', reject)
    })
  }

  /** 终止本模块直接启动的服务器并等待 exit；失败保留句柄，不能用 killed 充当退出证明。 */
  async function stopEmbeddedServer(): Promise<void> {
    const owned = serverProcess
    if (!owned)
      return
    const hasExited = () => owned.exitCode !== null || owned.signalCode !== null || (spawnFailed && owned.pid === undefined)
    if (!hasExited()) {
      const child: ChildProcess = owned
      await new Promise<void>((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout> | undefined
        let settled = false
        function cleanup(): void {
          clearTimeout(timer)
          child.removeListener('exit', exited)
          child.removeListener('error', failed)
        }
        function exited(): void {
          if (settled)
            return
          settled = true
          cleanup()
          resolve()
        }
        function failed(cause: Error): void {
          if (settled)
            return
          if (hasExited()) {
            exited()
            return
          }
          settled = true
          cleanup()
          reject(cause)
        }
        function signal(name: 'SIGTERM' | 'SIGKILL'): void {
          try {
            if (!child.kill(name))
              failed(new Error('Chroma child termination signal was rejected'))
          }
          catch (cause) {
            failed(cause instanceof Error
              ? cause
              : new Error(String(cause)))
          }
        }
        child.once('exit', exited)
        child.once('error', failed)
        timer = setTimeout(() => {
          timer = setTimeout(() => failed(new Error('Chroma child exit was not confirmed')), 1500)
          signal('SIGKILL')
        }, 1500)
        if (hasExited())
          exited()
        else signal('SIGTERM')
      })
    }
    if (serverProcess === owned)
      serverProcess = null
  }

  /** 关闭立即停止业务发布；退出确认失败时仅保留清理所有权，允许同一实例重试。 */
  async function closeResources(): Promise<HaiResult<void>> {
    if (!closing) {
      client = null
      config = null
      endpointOrigin = null
      closing = (async () => {
        try {
          await stopEmbeddedServer()
          logger.info('Chroma connection closed')
          return core.ok(undefined)
        }
        catch (cause) {
          return core.err({
            ...HaiVecdbError.CONNECTION_FAILED,
            message: vecdbM('vecdb_closeFailed', {
              params: {
                error: cause instanceof Error
                  ? cause.message
                  : String(cause),
              },
            }),
            cause,
            ext: { cleanupPending: true },
          })
        }
      })().finally(() => { closing = null })
    }
    return await closing
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
    throw new Error(`Chroma heartbeat timed out after ${timeout}ms: ${lastError instanceof Error
      ? lastError.message
      : String(lastError)}`)
  }

  /** 获取集合（含维度校验所需的 metadata） */
  async function getCollection(name: string): Promise<Collection> {
    return client!.getCollection({ name, embeddingFunction: NOOP_EMBEDDING_FUNCTION })
  }

  /** 框架集合沿用预先声明的维度，原生集合从同一连接的服务端定义读取。 */
  async function readDimension(collection: Collection): Promise<HaiResult<number>> {
    const value = collection.metadata?.[DIMENSION_METADATA_KEY]
    if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0)
      return core.ok(value)

    const activeClient = client
    const origin = endpointOrigin
    if (!activeClient || !origin)
      return core.err(HaiVecdbError.NOT_INITIALIZED, vecdbM('vecdb_notInitialized'))

    const scope = [collection.tenant, collection.database, collection.name]
    if (scope.some(segment => !segment || segment === '.' || segment === '..'))
      return invalidNativeCollectionDefinition(collection.name)
    const [tenant, database, name] = scope.map(segment => encodeURIComponent(segment))
    // SDK GET 的业务路径按名称解析。校验响应 ID，避免同名重建把新集合定义与旧句柄混用。
    const endpoint = new URL(`/api/v2/tenants/${tenant}/databases/${database}/collections/${name}`, origin)
    const response = await fetch(endpoint, {
      headers: activeClient.headers,
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) {
      await response.body?.cancel()
      if (response.status === 404)
        return missingNativeCollectionDefinition(collection.name)
      throw new Error(`Chroma collection definition request returned HTTP ${response.status}`)
    }
    const definition = NativeCollectionDefinitionSchema.safeParse(await response.json().catch(() => undefined))
    if (!definition.success)
      return invalidNativeCollectionDefinition(collection.name)
    if (definition.data.id !== collection.id || definition.data.name !== collection.name
      || definition.data.tenant !== collection.tenant || definition.data.database !== collection.database) {
      return missingNativeCollectionDefinition(collection.name)
    }
    return core.ok(definition.data.dimension ?? 0)
  }

  function validateDimension<T>(expected: number, actual: number): HaiResult<T> | null {
    if (expected === 0 || expected === actual)
      return null
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
        await client!.createCollection({
          name,
          configuration: {
            hnsw: {
              space: toChromaSpace(metric),
            },
          },
          metadata: { [DIMENSION_METADATA_KEY]: options.dimension },
          embeddingFunction: NOOP_EMBEDDING_FUNCTION,
        })
      }
      catch (error) {
        // Chroma SDK 将服务端的 HTTP 409 映射为 ChromaUniqueError。
        if (!(error instanceof Error) || error.name !== 'ChromaUniqueError')
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
      const existing = await client!.listCollections()
      const exists = existing.some(item => item.name === name)
      if (!exists) {
        return core.err(HaiVecdbError.COLLECTION_NOT_FOUND, vecdbM('vecdb_collectionNotFound', {
          params: { name },
        }))
      }

      await client!.deleteCollection({ name })
      logger.info('Collection dropped', { name })
      return core.ok(undefined)
    },

    async exists(name) {
      logger.debug('Checking collection exists', { name })
      const existing = await client!.listCollections()
      return core.ok(existing.some(item => item.name === name))
    },

    async info(name) {
      logger.debug('Getting collection info', { name })
      try {
        const collection = await getCollection(name)
        const dimension = await readDimension(collection)
        if (!dimension.success)
          return dimension
        const metric = readMetric(collection)
        if (!metric.success)
          return metric
        return core.ok({
          name,
          dimension: dimension.data,
          metric: metric.data,
          count: await collection.count(),
        })
      }
      catch (error) {
        if (error instanceof Error && ['ChromaNotFoundError', 'InvalidCollectionError'].includes(error.name))
          return missingNativeCollectionDefinition(name)
        throw error
      }
    },

    async list() {
      logger.debug('Listing collections')
      const existing = await client!.listCollections()
      return core.ok(existing.map(item => item.name))
    },
  }

  // ─── 向量操作适配器 ───

  function toWriteParams(documents: VectorDocument[]): Parameters<Collection['add']>[0] {
    return {
      ids: documents.map(doc => doc.id),
      embeddings: documents.map(doc => doc.vector),
      documents: documents.map(doc => doc.content ?? ''),
      // 统一 API 的 metadata 更宽；SDK 在 add/upsert 中先执行 validateMetadata，再发送请求。
      // 使用上游 Metadata 类型跨越此边界，避免复制其标量、数组及稀疏向量规则；原生拒绝会由 base 转为 HaiResult。
      metadatas: documents.map((doc) => {
        const metadata: Record<string, unknown> = { ...doc.metadata, _content: doc.content ?? '' }
        if (Object.hasOwn(metadata, ACTIVE_METADATA_KEYS)) {
          throw new Error(vecdbM('vecdb_chromaReservedMetadataKey', {
            params: { key: ACTIVE_METADATA_KEYS },
          }))
        }
        // SDK 省略 null/undefined。清单与字段一并提交，读者只看到完整的一次写入。
        const keys = Object.entries(metadata)
          .filter(([, value]) => value !== null && value !== undefined)
          .map(([key]) => `k:${key}`)
        metadata[ACTIVE_METADATA_KEYS] = [ACTIVE_METADATA_FORMAT, ...keys]
        return metadata as Metadata
      }),
    }
  }

  const vectorDriver: VectorDriver = {
    async insert(collection, documents) {
      logger.debug('Inserting vectors', { collection, count: documents.length })
      const target = await getCollection(collection)
      const expected = await readDimension(target)
      if (!expected.success)
        return expected
      for (const doc of documents) {
        const validation = validateDimension<void>(expected.data, doc.vector.length)
        if (validation)
          return validation
      }
      await target.add(toWriteParams(documents))
      logger.info('Vectors inserted', { collection, count: documents.length })
      return core.ok(undefined)
    },

    async upsert(collection, documents) {
      logger.debug('Upserting vectors', { collection, count: documents.length })
      const target = await getCollection(collection)
      const expected = await readDimension(target)
      if (!expected.success)
        return expected
      for (const doc of documents) {
        const validation = validateDimension<void>(expected.data, doc.vector.length)
        if (validation)
          return validation
      }
      await target.upsert(toWriteParams(documents))
      logger.info('Vectors upserted', { collection, count: documents.length })
      return core.ok(undefined)
    },

    async delete(collection, ids) {
      logger.debug('Deleting vectors', { collection, count: ids.length })
      const target = await getCollection(collection)
      await target.delete({ ids })
      logger.info('Vectors deleted', { collection, count: ids.length })
      return core.ok(undefined)
    },

    async search(collection, vector, options) {
      const topK = options?.topK ?? 10
      const minScore = options?.minScore ?? 0
      logger.debug('Searching vectors', { collection, topK, hasFilter: !!options?.filter })

      const target = await getCollection(collection)
      const expected = await readDimension(target)
      if (!expected.success)
        return expected
      const validation = validateDimension<VectorSearchResult[]>(expected.data, vector.length)
      if (validation)
        return validation

      const metric = readMetric(target)
      if (!metric.success)
        return metric
      const response = await target.query({
        queryEmbeddings: [vector],
        nResults: topK,
        where: buildWhere(options?.filter),
      })

      const ids = response.ids[0] ?? []
      const distances = response.distances?.[0] ?? []
      const metadatas = response.metadatas?.[0] ?? []

      const results: VectorSearchResult[] = []
      for (let i = 0; i < ids.length; i++) {
        const score = distanceToScore(distances[i] ?? 0, metric.data)
        if (score < minScore)
          continue
        const metadata = metadatas[i] ?? {}
        const { _content, [ACTIVE_METADATA_KEYS]: keys, ...rest } = metadata
        const active = Array.isArray(keys)
          ? new Set<unknown>(keys)
          : undefined
        const visible = active?.has(ACTIVE_METADATA_FORMAT)
          ? Object.fromEntries(Object.entries(rest).filter(([key]) => active.has(`k:${key}`)))
          : undefined
        results.push({
          id: ids[i],
          score,
          content: typeof _content === 'string' && _content.length > 0
            ? _content
            : undefined,
          metadata: visible && Object.keys(visible).length > 0
            ? visible
            : undefined,
        })
      }
      return core.ok(results)
    },

    async count(collection) {
      logger.debug('Counting vectors', { collection })
      const target = await getCollection(collection)
      return core.ok(await target.count())
    },

    async scan(collection, limit, cursor) {
      const offset = cursor === undefined
        ? 0
        : Number(cursor)
      if (!Number.isSafeInteger(offset) || offset < 0 || (cursor !== undefined && String(offset) !== cursor))
        return core.err(HaiVecdbError.CONFIG_ERROR, vecdbM('vecdb_invalidScanCursor'))
      try {
        const target = await getCollection(collection)
        const { ids } = await target.get({ offset, limit: limit + 1, include: [] })
        return core.ok({
          items: ids.slice(0, limit).map(id => ({ id })),
          nextCursor: ids.length > limit
            ? String(offset + limit)
            : undefined,
        })
      }
      catch (error) {
        if (error instanceof Error && ['ChromaNotFoundError', 'InvalidCollectionError'].includes(error.name)) {
          return core.err(HaiVecdbError.COLLECTION_NOT_FOUND, vecdbM('vecdb_collectionNotFound', {
            params: { name: collection },
          }))
        }
        throw error
      }
    },
  }

  // ─── Provider 接口 ───

  return {
    name: 'chroma',

    async connect(cfg): Promise<HaiResult<void>> {
      if (cfg.type !== 'chroma') {
        return core.err(HaiVecdbError.UNSUPPORTED_TYPE, vecdbM('vecdb_unsupportedType', {
          params: { type: cfg.type },
        }))
      }

      if (serverProcess || client || closing) {
        const cleaned = await closeResources()
        if (!cleaned.success)
          return cleaned
      }
      const chromaConfig = cfg
      const embedded = !!chromaConfig.path && !chromaConfig.url

      const loadResult = await loadChromaModule()
      if (!loadResult.success)
        return loadResult

      const startupAbort = new AbortController()
      const startupTimeout = embedded ? chromaConfig.startupTimeout : 5000
      const startupTimer = setTimeout(() => startupAbort.abort(), startupTimeout)
      try {
        if (embedded)
          await startEmbeddedServer(chromaConfig)

        const endpoint = chromaConfig.url
          ? new URL(chromaConfig.url)
          : undefined
        const clientParams: ChromaClientArgs = endpoint
          ? {
              host: endpoint.hostname,
              port: Number(endpoint.port || (endpoint.protocol === 'https:'
                ? 443
                : 80)),
              ssl: endpoint.protocol === 'https:',
            }
          : { host: chromaConfig.host, port: chromaConfig.port, ssl: false }
        if (chromaConfig.apiKey)
          clientParams.headers = { Authorization: `Bearer ${chromaConfig.apiKey}` }
        // SDK 的所有候选连接请求共享初始化截止；成功后清除 timer，不使后续业务请求自动失效。
        clientParams.fetchOptions = { signal: startupAbort.signal }

        const chromaClient = new loadResult.data.ChromaClient(clientParams)
        await waitForHeartbeat(chromaClient, startupTimeout)
        // 心跳可能公开；发布连接前必须确认默认 tenant/database 的数据端点也允许当前凭据访问。
        await chromaClient.countCollections()

        startupAbort.signal.throwIfAborted()
        if (embedded && (spawnFailed || !serverProcess || serverProcess.exitCode !== null || serverProcess.signalCode !== null))
          throw new Error('Chroma child exited before readiness was confirmed')
        endpointOrigin = endpoint ?? new URL(`http://${chromaConfig.host}:${chromaConfig.port}`)
        client = chromaClient
        config = chromaConfig
        logger.info('Chroma connected', {
          embedded,
          host: clientParams.host,
          port: clientParams.port,
          ssl: clientParams.ssl,
        })
        return core.ok(undefined)
      }
      catch (error) {
        startupAbort.abort()
        const cleanup = await closeResources()
        logger.error('Failed to connect to Chroma', {
          error: error instanceof Error
            ? error.message
            : String(error),
        })
        const failure = core.err(HaiVecdbError.CONNECTION_FAILED, vecdbM('vecdb_connectionFailed', {
          params: {
            error: String(error),
          },
        }), error)
        return !failure.success && !cleanup.success
          ? core.err({
              ...failure.error,
              ext: { cleanupPending: true, cleanupError: cleanup.error },
            })
          : failure
      }
      finally {
        clearTimeout(startupTimer)
      }
    },

    async close(): Promise<HaiResult<void>> {
      return await closeResources()
    },

    isConnected(): boolean {
      return client !== null
    },

    collection: createBaseCollectionOps(ctx, collectionDriver),
    vector: createBaseVectorOps(ctx, vectorDriver),
  }
}
