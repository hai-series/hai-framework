/**
 * @h-ai/vecdb — 向量数据库服务主入口
 *
 * 本文件提供统一的 `vecdb` 对象，聚合所有向量数据库操作功能。
 * @module vecdb-main
 */

import type { Result } from '@h-ai/core'
import type { VecdbProvider } from './providers/vecdb-provider-base.js'
import type { VecdbConfig, VecdbConfigInput } from './vecdb-config.js'
import type {
  CollectionOperations,
  VecdbError,
  VecdbFunctions,
  VectorOperations,
} from './vecdb-types.js'

import { core, err, ok } from '@h-ai/core'

import { createLancedbProvider } from './providers/vecdb-provider-lancedb.js'
import { createPgvectorProvider } from './providers/vecdb-provider-pgvector.js'
import { createQdrantProvider } from './providers/vecdb-provider-qdrant.js'
import { VecdbConfigSchema, VecdbErrorCode } from './vecdb-config.js'
import { vecdbM } from './vecdb-i18n.js'

const logger = core.logger.child({ module: 'vecdb', scope: 'main' })

// ─── 内部状态 ───

/** 当前活跃的向量数据库 Provider（未初始化时为 null） */
let currentProvider: VecdbProvider | null = null

/** 当前向量数据库配置（未初始化时为 null） */
let currentConfig: VecdbConfig | null = null

/** init() 是否正在执行（并发防护） */
let initInProgress = false

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
  }
}

// ─── 未初始化时的占位操作 ───

/** 未初始化工具集 */
const notInitialized = core.module.createNotInitializedKit<VecdbError>(
  VecdbErrorCode.NOT_INITIALIZED,
  () => vecdbM('vecdb_notInitialized'),
)

/** 未初始化时的集合操作占位对象 */
const notInitializedCollection = notInitialized.proxy<CollectionOperations>()

/** 未初始化时的向量操作占位对象 */
const notInitializedVector = notInitialized.proxy<VectorOperations>()

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
 *
 * @example
 * ```ts
 * import { vecdb } from '@h-ai/vecdb'
 *
 * // 初始化（LanceDB）
 * await vecdb.init({ type: 'lancedb', path: './data/vecdb' })
 *
 * // 集合操作
 * await vecdb.collection.create('docs', { dimension: 1536 })
 *
 * // 向量操作
 * await vecdb.vector.insert('docs', [
 *   { id: '1', vector: [...], content: '文档内容' },
 * ])
 *
 * // 搜索
 * const result = await vecdb.vector.search('docs', queryVector, { topK: 5 })
 *
 * // 关闭
 * await vecdb.close()
 * ```
 */
export const vecdb: VecdbFunctions = {
  /**
   * 初始化向量数据库连接
   *
   * @param config - 向量数据库配置（允许部分字段，内部会补齐默认值）
   * @returns 初始化结果，失败时包含错误信息
   */
  async init(config: VecdbConfigInput): Promise<Result<void, VecdbError>> {
    // 并发防护：防止多次同时调用导致 Provider/连接泄漏
    if (initInProgress) {
      logger.warn('Vecdb init already in progress, skipping concurrent call')
      return err({
        code: VecdbErrorCode.CONFIG_ERROR,
        message: vecdbM('vecdb_initInProgress'),
      })
    }
    initInProgress = true

    try {
      if (currentProvider) {
        logger.warn('Vecdb module is already initialized, reinitializing')
        await vecdb.close()
      }

      logger.info('Initializing vecdb module')

      const parseResult = VecdbConfigSchema.safeParse(config)
      if (!parseResult.success) {
        logger.error('Vecdb config validation failed', { error: parseResult.error.message })
        return err({
          code: VecdbErrorCode.CONFIG_ERROR,
          message: vecdbM('vecdb_configError', { params: { error: parseResult.error.message } }),
          cause: parseResult.error,
        })
      }
      const parsed = parseResult.data

      try {
        const provider = createProvider(parsed)
        const connectResult = await provider.connect(parsed)
        if (!connectResult.success) {
          logger.error('Vecdb module initialization failed', {
            code: connectResult.error.code,
            message: connectResult.error.message,
          })
          return connectResult
        }
        currentProvider = provider
        currentConfig = parsed
        logger.info('Vecdb module initialized', { type: parsed.type })
        return ok(undefined)
      }
      catch (error) {
        logger.error('Vecdb module initialization failed', { error })
        return err({
          code: VecdbErrorCode.CONNECTION_FAILED,
          message: vecdbM('vecdb_initFailed', { params: { error: error instanceof Error ? error.message : String(error) } }),
          cause: error,
        })
      }
    }
    finally {
      initInProgress = false
    }
  },

  /**
   * 获取集合管理操作接口
   *
   * 未初始化时返回占位对象（所有调用返回 NOT_INITIALIZED）。
   */
  get collection(): CollectionOperations {
    return currentProvider?.collection ?? notInitializedCollection
  },

  /**
   * 获取向量操作接口
   *
   * 未初始化时返回占位对象（所有调用返回 NOT_INITIALIZED）。
   */
  get vector(): VectorOperations {
    return currentProvider?.vector ?? notInitializedVector
  },

  /** 获取当前配置（未初始化时为 null） */
  get config(): VecdbConfig | null {
    return currentConfig
  },

  /** 检查是否已初始化 */
  get isInitialized(): boolean {
    return currentProvider !== null && currentProvider.isConnected()
  },

  /**
   * 关闭向量数据库连接
   *
   * 多次调用安全，未初始化时直接返回。
   */
  async close(): Promise<Result<void, VecdbError>> {
    if (!currentProvider) {
      currentConfig = null
      logger.info('Vecdb module already closed, skipping')
      return ok(undefined)
    }

    logger.info('Closing vecdb module')

    try {
      const closeResult = await currentProvider.close()
      if (!closeResult.success) {
        logger.error('Vecdb module close failed', { code: closeResult.error.code, message: closeResult.error.message })
        return closeResult
      }
      logger.info('Vecdb module closed')
      return ok(undefined)
    }
    catch (error) {
      logger.error('Vecdb module close failed', { error })
      return err({
        code: VecdbErrorCode.CONNECTION_FAILED,
        message: vecdbM('vecdb_closeFailed', { params: { error: error instanceof Error ? error.message : String(error) } }),
        cause: error,
      })
    }
    finally {
      currentProvider = null
      currentConfig = null
    }
  },
}
