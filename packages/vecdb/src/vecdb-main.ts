/**
 * @h-ai/vecdb — 向量数据库服务主入口
 *
 * 本文件提供统一的 `vecdb` 对象，聚合所有向量数据库操作功能。
 * @module vecdb-main
 */

import type { HaiResult } from '@h-ai/core'
import type { VecdbProvider } from './providers/vecdb-provider-base.js'
import type { VecdbConfig, VecdbConfigInput } from './vecdb-config.js'
import type {
  CollectionOperations,
  VecdbConnection,
  VecdbFunctions,
  VectorOperations,
} from './vecdb-types.js'

import process from 'node:process'
import { core, err, ok } from '@h-ai/core'

import { createChromaProvider } from './providers/vecdb-provider-chroma.js'
import { createLancedbProvider } from './providers/vecdb-provider-lancedb.js'
import { createPgvectorProvider } from './providers/vecdb-provider-pgvector.js'
import { createQdrantProvider } from './providers/vecdb-provider-qdrant.js'
import { VecdbConfigSchema } from './vecdb-config.js'
import { vecdbM } from './vecdb-i18n.js'
import { HaiVecdbError } from './vecdb-types.js'

const logger = core.logger.child({ module: 'vecdb', scope: 'main' })

// ─── 内部状态 ───

/** 当前活跃的向量数据库 Provider（未初始化时为 null） */
let currentProvider: VecdbProvider | null = null

/** 当前向量数据库配置（未初始化时为 null） */
let currentConfig: VecdbConfig | null = null

/** init() 是否正在执行（并发防护） */
let initInProgress = false

/** 未发布或关闭失败的唯一资源所有权；不暴露给业务，close/init 必须先清理它。 */
let pendingProvider: VecdbProvider | null = null
/** close 等待初始化确定资源归属，并合并并发关闭。 */
let initCompletion: Promise<void> | null = null
let closingPromise: Promise<HaiResult<void>> | null = null

/**
 * 停止业务发布，只有清理确认成功才释放所有权；失败可由同一模块重试。
 * @returns 清理结果；失败保留 cleanupPending 与资源句柄。
 * @example 模块内部上下文
 * ```ts
 * const closed = await vecdb.close()
 * if (!closed.success && closed.error.ext?.cleanupPending) {
 *   const retried = await vecdb.close()
 *   if (!retried.success) throw new Error(retried.error.message)
 * }
 * ```
 */
async function closeOwnedProvider(): Promise<HaiResult<void>> {
  if (currentProvider) {
    pendingProvider = currentProvider
    currentProvider = null
  }
  currentConfig = null
  if (!pendingProvider)
    return ok(undefined)
  try {
    const result = await pendingProvider.close()
    if (!result.success)
      return err({ ...result.error, ext: { ...result.error.ext, cleanupPending: true } })
    pendingProvider = null
    return result
  }
  catch (cause) {
    return err({ ...HaiVecdbError.CONNECTION_FAILED, message: vecdbM('vecdb_closeFailed', { params: { error: cause instanceof Error ? cause.message : String(cause) } }), cause, ext: { cleanupPending: true } })
  }
}

/**
 * 初始化失败保留原始业务错误，并说明候选清理是否需要重试。
 * @param result - 候选初始化的失败结果。
 * @returns 原始失败；清理已确认时移除过期 cleanup 标记。
 * @example 模块内部上下文
 * ```ts
 * const failure = err(HaiVecdbError.CONNECTION_FAILED, 'Controlled startup failure')
 * const result = await failInitialization(failure)
 * if (!result.success) void result.error.ext?.cleanupPending
 * ```
 */
async function failInitialization(result: HaiResult<void>): Promise<HaiResult<void>> {
  const cleanup = await closeOwnedProvider()
  if (result.success)
    return result
  if (!cleanup.success)
    return err({ ...result.error, ext: { ...result.error.ext, cleanupPending: true, cleanupError: cleanup.error } })
  const ext = { ...result.error.ext }
  delete ext.cleanupPending
  delete ext.cleanupError
  return err({ ...result.error, ext: Object.keys(ext).length ? ext : undefined })
}

// ─── Provider 工厂 ───

/**
 * 根据配置创建对应的向量数据库 Provider
 *
 * @param config - 向量数据库配置（已校验、默认值补齐）
 * @returns Provider 实例
 */
function createProvider(config: VecdbConfig): VecdbProvider {
  switch (config.type) {
    case 'lancedb':
      return createLancedbProvider()
    case 'pgvector':
      return createPgvectorProvider()
    case 'qdrant':
      return createQdrantProvider()
    case 'chroma':
      return createChromaProvider()
  }
}

// ─── 未初始化时的占位操作 ───

/** 未初始化工具集 */
const notInitialized = core.module.createNotInitializedKit(
  HaiVecdbError.NOT_INITIALIZED,
  () => vecdbM('vecdb_notInitialized'),
)

/** 未初始化时的集合操作占位对象 */
const notInitializedCollection = notInitialized.proxy<CollectionOperations>()

/** 未初始化时的向量操作占位对象 */
const notInitializedVector = notInitialized.proxy<VectorOperations>()

/** 稳定转发层不泄漏 Provider 引用；旧调用方持有的操作在关闭期间同样停止服务。 */
const collectionOps: CollectionOperations = {
  create: (name, options) => currentProvider && !closingPromise ? currentProvider.collection.create(name, options) : notInitializedCollection.create(name, options),
  drop: name => currentProvider && !closingPromise ? currentProvider.collection.drop(name) : notInitializedCollection.drop(name),
  exists: name => currentProvider && !closingPromise ? currentProvider.collection.exists(name) : notInitializedCollection.exists(name),
  info: name => currentProvider && !closingPromise ? currentProvider.collection.info(name) : notInitializedCollection.info(name),
  list: () => currentProvider && !closingPromise ? currentProvider.collection.list() : notInitializedCollection.list(),
}
const vectorOps: VectorOperations = {
  insert: (collection, documents) => currentProvider && !closingPromise ? currentProvider.vector.insert(collection, documents) : notInitializedVector.insert(collection, documents),
  upsert: (collection, documents) => currentProvider && !closingPromise ? currentProvider.vector.upsert(collection, documents) : notInitializedVector.upsert(collection, documents),
  delete: (collection, ids) => currentProvider && !closingPromise ? currentProvider.vector.delete(collection, ids) : notInitializedVector.delete(collection, ids),
  search: (collection, vector, options) => currentProvider && !closingPromise ? currentProvider.vector.search(collection, vector, options) : notInitializedVector.search(collection, vector, options),
  count: collection => currentProvider && !closingPromise ? currentProvider.vector.count(collection) : notInitializedVector.count(collection),
}

// ─── 统一向量数据库服务对象 ───

/**
 * 向量数据库服务对象
 *
 * 统一的向量数据库访问入口，提供以下功能：
 * - `vecdb.init()` - 初始化连接
 * - `vecdb.close()` - 关闭连接
 * - `vecdb.collection` - 集合管理（创建/删除/查询）
 * - `vecdb.vector` - 向量操作（插入/搜索/删除）
 * - `vecdb.config` - 当前配置
 * - `vecdb.isInitialized` - 初始化状态
 * @example
 * ```ts
 * import { vecdb } from '@h-ai/vecdb'
 *
 * const initialized = await vecdb.init({ type: 'qdrant', url: 'http://localhost:6333' })
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   const result = await vecdb.collection.list()
 *   if (!result.success) throw new Error(result.error.message)
 *   void result.data
 * } finally {
 *   const closed = await vecdb.close()
 *   if (!closed.success) throw new Error(closed.error.message)
 * }
 * ```
 */
export const vecdb: VecdbFunctions = {
  /**
   * 初始化向量数据库连接
   *
   * @param config - 向量数据库配置（允许部分字段，内部会补齐默认值）
   * @returns 初始化结果，失败时包含错误信息
   */
  async init(config: VecdbConfigInput): Promise<HaiResult<void>> {
    // 并发防护：防止多次同时调用导致 Provider/连接泄漏
    if (initInProgress || closingPromise) {
      logger.warn('Vecdb init already in progress, skipping concurrent call')
      return err(HaiVecdbError.CONFIG_ERROR, vecdbM('vecdb_initInProgress'))
    }
    initInProgress = true
    let resolveInit!: () => void
    initCompletion = new Promise<void>((resolve) => {
      resolveInit = resolve
    })

    try {
      const cleanup = await closeOwnedProvider()
      if (!cleanup.success)
        return cleanup

      logger.info('Initializing vecdb module')

      const parseResult = VecdbConfigSchema.safeParse(config)
      if (!parseResult.success) {
        logger.error('Vecdb config validation failed', { error: parseResult.error.message })
        return err(HaiVecdbError.CONFIG_ERROR, vecdbM('vecdb_configError', { params: { error: parseResult.error.message } }), parseResult.error)
      }
      const parsed = parseResult.data
      if (core.module.requiresSharedState(process.env) && (parsed.type === 'lancedb' || (parsed.type === 'chroma' && !!parsed.path && !parsed.url)))
        return err(HaiVecdbError.CONFIG_ERROR, vecdbM('vecdb_sharedBackendRequired'))

      try {
        const provider = createProvider(parsed)
        pendingProvider = provider
        const connectResult = await provider.connect(parsed)
        if (!connectResult.success) {
          logger.error('Vecdb module initialization failed', {
            code: connectResult.error.code,
            message: connectResult.error.message,
          })
          return await failInitialization(connectResult)
        }
        pendingProvider = null
        currentProvider = provider
        currentConfig = parsed
        logger.info('Vecdb module initialized', { type: parsed.type })
        return ok(undefined)
      }
      catch (error) {
        logger.error('Vecdb module initialization failed', { error })
        return await failInitialization(err(HaiVecdbError.CONNECTION_FAILED, vecdbM('vecdb_initFailed', { params: { error: error instanceof Error ? error.message : String(error) } }), error))
      }
    }
    finally {
      initInProgress = false
      initCompletion = null
      resolveInit()
    }
  },

  /**
   * 获取集合管理操作接口
   *
   * 未初始化时返回占位对象（所有调用返回 NOT_INITIALIZED）。
   */
  get collection(): CollectionOperations {
    return collectionOps
  },

  /**
   * 获取向量操作接口
   *
   * 未初始化时返回占位对象（所有调用返回 NOT_INITIALIZED）。
   */
  get vector(): VectorOperations {
    return vectorOps
  },

  /** 获取当前脱敏配置快照（未初始化时为 null） */
  get config(): VecdbConfig | null {
    return currentConfig && !closingPromise ? core.sanitize.sanitizeSensitiveFields(currentConfig) : null
  },

  /** 获取底层后端的原始连接信息（含凭证，未初始化时为 null；仅供同进程内集成使用） */
  get rawConnection(): VecdbConnection | null {
    if (!currentConfig || closingPromise)
      return null
    if (currentConfig.type === 'qdrant')
      return { type: 'qdrant', url: currentConfig.url, apiKey: currentConfig.apiKey }
    if (currentConfig.type === 'pgvector') {
      return {
        type: 'pgvector',
        connectionString: currentConfig.url,
        host: currentConfig.host,
        port: currentConfig.port,
        database: currentConfig.database,
        user: currentConfig.user,
        password: currentConfig.password,
      }
    }
    if (currentConfig.type === 'chroma') {
      return {
        type: 'chroma',
        url: currentConfig.url,
        host: currentConfig.host,
        port: currentConfig.port,
        apiKey: currentConfig.apiKey,
        path: currentConfig.path,
      }
    }
    return { type: currentConfig.type, path: currentConfig.path }
  },

  /** 检查是否已初始化 */
  get isInitialized(): boolean {
    return currentProvider !== null && !closingPromise && currentProvider.isConnected()
  },

  /**
   * 关闭向量数据库连接
   *
   * 多次调用安全，未初始化时直接返回。
   */
  async close(): Promise<HaiResult<void>> {
    if (!closingPromise) {
      closingPromise = (async () => {
        if (initCompletion)
          await initCompletion
        return closeOwnedProvider()
      })().finally(() => { closingPromise = null })
    }
    return await closingPromise
  },
}
