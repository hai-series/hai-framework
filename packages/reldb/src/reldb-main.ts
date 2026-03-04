/**
 * @h-ai/reldb — 数据库服务主入口
 *
 * 本文件提供统一的 `reldb` 对象，聚合所有数据库操作功能。
 * @module reldb-main
 */

import type { Result } from '@h-ai/core'
import type { ReldbConfig, ReldbConfigInput } from './reldb-config.js'
import type {
  ReldbCrudManager,
  ReldbDdlOperations,
  ReldbError,
  ReldbFunctions,
  ReldbProvider,
  ReldbSqlOperations,
  ReldbTxManager,
} from './reldb-types.js'

import { core, err, ok } from '@h-ai/core'

import { createMysqlProvider } from './providers/reldb-provider-mysql.js'
import { createPostgresProvider } from './providers/reldb-provider-postgres.js'
import { createSqliteProvider } from './providers/reldb-provider-sqlite.js'
import { ReldbConfigSchema, ReldbErrorCode } from './reldb-config.js'

import { createCrud } from './reldb-crud-kernel.js'
import { reldbM } from './reldb-i18n.js'
import { pagination } from './reldb-pagination.js'

const logger = core.logger.child({ module: 'reldb', scope: 'main' })

// ─── 内部状态 ───

/** 当前活跃的数据库 Provider（未初始化时为 null） */
let currentProvider: ReldbProvider | null = null

/** 当前数据库配置（未初始化时为 null） */
let currentConfig: ReldbConfig | null = null

// ─── Provider 工厂 ───

/**
 * 根据配置创建对应的数据库 Provider
 *
 * @param config - 数据库配置（已校验、默认值补齐）
 * @returns Provider 实例
 */
function createProvider(config: ReldbConfig): ReldbProvider {
  switch (config.type) {
    case 'sqlite':
      return createSqliteProvider()
    case 'postgresql':
      return createPostgresProvider()
    case 'mysql':
      return createMysqlProvider()
  }
}

// ─── 未初始化时的占位操作 ───

/** 未初始化工具集 */
const notInitialized = core.module.createNotInitializedKit<ReldbError>(
  ReldbErrorCode.NOT_INITIALIZED,
  () => reldbM('reldb_notInitialized'),
)

/** 未初始化时的 DDL 操作占位对象 */
const notInitializedDdl = notInitialized.proxy<ReldbDdlOperations>()

/** 未初始化时的 SQL 操作占位对象 */
const notInitializedSql = notInitialized.proxy<ReldbSqlOperations>()

/** 未初始化时的 CRUD 管理器 */
const notInitializedCrud: ReldbCrudManager = {
  table: config => createCrud(notInitializedSql, config),
}

/** 未初始化时的事务管理器占位对象 */
const notInitializedTx: ReldbTxManager = {
  begin: async () => notInitialized.result(),
  wrap: async () => notInitialized.result(),
}

// ─── 统一数据库服务对象 ───

/**
 * 数据库服务对象
 *
 * 统一的数据库访问入口，提供以下功能：
 * - `reldb.init()` - 初始化数据库连接
 * - `reldb.close()` - 关闭连接
 * - `reldb.ddl` - DDL 操作（表结构管理）
 * - `reldb.sql` - SQL 操作（数据查询和修改）
 * - `reldb.tx` - 事务管理器（begin / wrap）
 * - `reldb.config` - 当前配置
 * - `reldb.isInitialized` - 初始化状态
 *
 * @example
 * ```ts
 * import { reldb } from '@h-ai/reldb'
 *
 * // 初始化
 * await reldb.init({ type: 'sqlite', database: ':memory:' })
 *
 * // DDL 操作
 * await reldb.ddl.createTable('users', {
 *     id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
 *     name: { type: 'TEXT', notNull: true }
 * })
 *
 * // SQL 操作
 * await reldb.sql.execute('INSERT INTO users (name) VALUES (?)', ['张三'])
 * const users = await reldb.sql.query('SELECT * FROM users')
 *
 * // 事务操作
 * await reldb.tx.wrap(async (tx) => {
 *     await tx.execute('INSERT INTO users (name) VALUES (?)', ['用户1'])
 *     await tx.execute('INSERT INTO users (name) VALUES (?)', ['用户2'])
 *     return 'done'
 * })
 *
 * // 关闭连接
 * await reldb.close()
 * ```
 */
export const reldb: ReldbFunctions = {
  /**
   * 初始化数据库连接
   *
   * @param config - 数据库配置（允许部分字段，内部会补齐默认值）
   * @returns 初始化结果，失败时包含错误信息
   */
  async init(config: ReldbConfigInput): Promise<Result<void, ReldbError>> {
    if (currentProvider) {
      logger.warn('DB module is already initialized, reinitializing')
      await reldb.close()
    }

    logger.info('Initializing DB module')

    const parseResult = ReldbConfigSchema.safeParse(config)
    if (!parseResult.success) {
      logger.error('DB config validation failed', { error: parseResult.error.message })
      return err({
        code: ReldbErrorCode.CONFIG_ERROR,
        message: reldbM('reldb_configError', { params: { error: parseResult.error.message } }),
        cause: parseResult.error,
      })
    }
    const parsed = parseResult.data

    try {
      const provider = createProvider(parsed)
      const connectResult = await provider.connect(parsed)
      if (!connectResult.success) {
        logger.error('DB module initialization failed', {
          code: connectResult.error.code,
          message: connectResult.error.message,
        })
        return connectResult
      }
      currentProvider = provider
      currentConfig = parsed
      logger.info('DB module initialized')
      return ok(undefined)
    }
    catch (error) {
      logger.error('DB module initialization failed', { error })
      return err({
        code: ReldbErrorCode.CONNECTION_FAILED,
        message: reldbM('reldb_initFailed', { params: { error: error instanceof Error ? error.message : String(error) } }),
        cause: error,
      })
    }
  },

  /**
   * 获取 DDL 操作接口
   *
   * 未初始化时返回占位对象（所有调用返回 NOT_INITIALIZED）。
   */
  get ddl(): ReldbDdlOperations {
    return currentProvider?.ddl ?? notInitializedDdl
  },

  /**
   * 获取 SQL 操作接口
   *
   * 未初始化时返回占位对象（所有调用返回 NOT_INITIALIZED）。
   */
  get sql(): ReldbSqlOperations {
    return currentProvider?.sql ?? notInitializedSql
  },

  /**
   * 获取 CRUD 管理器
   *
   * 通过 `reldb.crud.table(config)` 获取单表 CRUD 仓库。
   * 未初始化时返回占位对象（所有调用返回 NOT_INITIALIZED）。
   */
  get crud() {
    return currentProvider?.crud ?? notInitializedCrud
  },

  /** 事务管理器 */
  get tx(): ReldbTxManager {
    return currentProvider?.tx ?? notInitializedTx
  },

  /** 获取当前配置（未初始化时为 null） */
  get config(): ReldbConfig | null {
    return currentConfig
  },

  /** 检查是否已初始化 */
  get isInitialized(): boolean {
    return currentProvider !== null && currentProvider.isConnected()
  },

  /**
   * 获取分页工具
   *
   * 提供 `reldb.pagination.normalize()` 和 `reldb.pagination.build()` 两个纯函数，
   * 用于自定义分页场景（无需数据库连接）。
   */
  get pagination() {
    return pagination
  },

  /**
   * 关闭数据库连接
   *
   * 多次调用安全，未初始化时直接返回。
   */
  async close(): Promise<Result<void, ReldbError>> {
    if (!currentProvider) {
      currentConfig = null
      logger.info('DB module already closed, skipping')
      return ok(undefined)
    }

    logger.info('Closing DB module')

    try {
      const closeResult = await currentProvider.close()
      if (!closeResult.success) {
        logger.error('DB module close failed', { code: closeResult.error.code, message: closeResult.error.message })
        return closeResult
      }
      logger.info('DB module closed')
      return ok(undefined)
    }
    catch (error) {
      logger.error('DB module close failed', { error })
      return err({
        code: ReldbErrorCode.CONNECTION_FAILED,
        message: reldbM('reldb_closeFailed', { params: { error: error instanceof Error ? error.message : String(error) } }),
        cause: error,
      })
    }
    finally {
      currentProvider = null
      currentConfig = null
    }
  },
}
