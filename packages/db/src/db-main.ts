/**
 * =============================================================================
 * @hai/db - 数据库服务主入口
 * =============================================================================
 *
 * 本文件提供统一的 `db` 对象，聚合所有数据库操作功能。
 *
 * 使用方式：
 * 1. 调用 `db.init()` 初始化数据库连接
 * 2. 通过 `db.ddl` 进行表结构操作
 * 3. 通过 `db.sql` 进行数据查询和修改
 * 4. 通过 `db.tx.wrap()` 执行事务
 * 5. 调用 `db.close()` 关闭连接
 *
 * @example
 * ```ts
 * import { db } from '@hai/db'
 *
 * // 1. 初始化数据库
 * await db.init({
 *     type: 'sqlite',
 *     database: './data.db'
 * })
 *
 * // 2. 创建表
 * await db.ddl.createTable('users', {
 *     id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
 *     name: { type: 'TEXT', notNull: true },
 *     email: { type: 'TEXT', unique: true },
 *     created_at: { type: 'TIMESTAMP', defaultValue: '(unixepoch())' }
 * })
 *
 * // 3. 插入数据
 * await db.sql.execute(
 *     'INSERT INTO users (name, email) VALUES (?, ?)',
 *     ['张三', 'zhangsan@example.com']
 * )
 *
 * // 4. 查询数据
 * const users = await db.sql.query<{ id: number; name: string }>('SELECT * FROM users')
 * if (users.success) {
 *     // 使用查询结果 users.data
 * }
 *
 * // 5. 事务操作
 * const result = await db.tx.wrap(async (tx) => {
 *     await tx.execute('INSERT INTO users (name) VALUES (?)', ['用户1'])
 *     await tx.execute('INSERT INTO users (name) VALUES (?)', ['用户2'])
 *     return tx.query('SELECT COUNT(*) as count FROM users')
 * })
 *
 * // 6. 关闭连接
 * await db.close()
 * ```
 *
 * @module db-main
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type { DbConfig, DbConfigInput } from './db-config.js'
import type {
  CrudManager,
  DbError,
  DbProvider,
  DbService,
  DdlOperations,
  SqlOperations,
  TxManager,
} from './db-types.js'

import { err } from '@hai/core'

import { createCrud } from './crud/db-crud-kernal.js'
import { DbConfigSchema, DbErrorCode } from './db-config.js'
import { dbM } from './db-i18n.js'
import { pagination } from './db-pagination.js'

import { createMysqlProvider } from './provider/db-provider-mysql.js'
import { createPostgresProvider } from './provider/db-provider-postgres.js'
import { createSqliteProvider } from './provider/db-provider-sqlite.js'

// =============================================================================
// 内部状态
// =============================================================================

/** 当前活跃的数据库 Provider（未初始化时为 null） */
let currentProvider: DbProvider | null = null

/** 当前数据库配置（未初始化时为 null） */
let currentConfig: DbConfig | null = null

// =============================================================================
// Provider 工厂
// =============================================================================

/**
 * 根据配置创建对应的数据库 Provider
 *
 * @param config - 数据库配置
 * @returns 对应类型的 Provider 实例
 * @throws 不支持的数据库类型时抛出错误
 */
/**
 * 根据配置创建对应的数据库 Provider
 *
 * @param config - 数据库配置（已校验、默认值补齐）
 * @returns Provider 实例
 * @throws 当数据库类型不受支持时抛出错误
 */
function createProvider(config: DbConfig): DbProvider {
  switch (config.type) {
    case 'sqlite':
      return createSqliteProvider()
    case 'postgresql':
      return createPostgresProvider()
    case 'mysql':
      return createMysqlProvider()
    default:
      throw new Error(dbM('db_unsupportedType', { params: { type: config.type } }))
  }
}

// =============================================================================
// 未初始化时的占位操作
// =============================================================================

/**
 * 创建未初始化错误
 */
/**
 * 创建未初始化错误对象
 *
 * @returns 未初始化错误
 */
function notInitializedError(): DbError {
  return {
    code: DbErrorCode.NOT_INITIALIZED,
    message: dbM('db_notInitialized'),
  }
}

/**
 * 未初始化时的统一占位操作类型
 *
 * 所有未初始化方法统一返回 `NOT_INITIALIZED` 错误。
 */
type NotInitializedOperation = (...args: unknown[]) => Promise<Result<unknown, DbError>>

/**
 * 未初始化时的占位操作实现
 *
 * @returns 统一的未初始化错误
 */
const notInitializedOperation: NotInitializedOperation = async () => err(notInitializedError())

/**
 * 未初始化时的操作代理（所有方法均返回未初始化错误）
 *
 * 通过 Proxy 避免逐个声明占位方法。
 */
const notInitializedOperations = new Proxy(
  {},
  {
    get: () => notInitializedOperation,
  },
)

/** 未初始化时的 DDL 操作占位对象 */
const notInitializedDdl = notInitializedOperations as DdlOperations

/** 未初始化时的 SQL 操作占位对象 */
const notInitializedSql = notInitializedOperations as SqlOperations

/** 未初始化时的 CRUD 管理器 */
const notInitializedCrud: CrudManager = {
  table: config => createCrud(notInitializedSql, config),
}

// =============================================================================
// 统一数据库服务对象
// =============================================================================

/**
 * 数据库服务对象
 *
 * 统一的数据库访问入口，提供以下功能：
 * - `db.init()` - 初始化数据库连接
 * - `db.close()` - 关闭连接
 * - `db.ddl` - DDL 操作（表结构管理）
 * - `db.sql` - SQL 操作（数据查询和修改）
 * - `db.tx` - 事务管理器（begin / wrap）
 * - `db.config` - 当前配置
 * - `db.isInitialized` - 初始化状态
 *
 * @example
 * ```ts
 * import { db } from '@hai/db'
 *
 * // 初始化
 * await db.init({ type: 'sqlite', database: ':memory:' })
 *
 * // DDL 操作
 * await db.ddl.createTable('users', {
 *     id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
 *     name: { type: 'TEXT', notNull: true }
 * })
 *
 * // SQL 操作
 * await db.sql.execute('INSERT INTO users (name) VALUES (?)', ['张三'])
 * const users = await db.sql.query('SELECT * FROM users')
 *
 * // 事务操作
 * await db.tx.wrap(async (tx) => {
 *     await tx.execute('INSERT INTO users (name) VALUES (?)', ['用户1'])
 *     await tx.execute('INSERT INTO users (name) VALUES (?)', ['用户2'])
 *     return tx.query('SELECT * FROM users').length
 * })
 *
 * // 关闭连接
 * await db.close()
 * ```
 */
export const db: DbService = {
  /**
   * 初始化数据库连接
   *
   * @param config - 数据库配置（允许部分字段，内部会补齐默认值）
   * @returns 初始化结果，失败时包含错误信息
   */
  async init(config: DbConfigInput): Promise<Result<void, DbError>> {
    // 关闭现有连接（如果存在）
    if (currentProvider) {
      await currentProvider.close()
      currentProvider = null
      currentConfig = null
    }

    try {
      // 运行时校验并补齐默认值（如 host、pool 等）
      const normalizedConfig = DbConfigSchema.parse(config)

      // 创建对应类型的 Provider
      currentProvider = createProvider(normalizedConfig)

      // 连接数据库
      const result = await currentProvider.connect(normalizedConfig)

      if (result.success) {
        currentConfig = normalizedConfig
      }

      return result
    }
    catch (error) {
      return err({
        code: DbErrorCode.CONNECTION_FAILED,
        message: dbM('db_initFailed', { params: { error: error instanceof Error ? error.message : String(error) } }),
        cause: error,
      })
    }
  },

  /**
   * 获取 DDL 操作接口
   *
   * 未初始化时返回占位对象（所有调用返回 NOT_INITIALIZED）。
   */
  get ddl(): DdlOperations {
    return currentProvider?.ddl ?? notInitializedDdl
  },

  /**
   * 获取 SQL 操作接口
   *
   * 未初始化时返回占位对象（所有调用返回 NOT_INITIALIZED）。
   */
  get sql(): SqlOperations {
    return currentProvider?.sql ?? notInitializedSql
  },

  /** CRUD 管理器 */
  get crud() {
    return currentProvider?.crud ?? notInitializedCrud
  },

  /** 事务管理器 */
  get tx(): TxManager {
    if (!currentProvider) {
      return {
        begin: async () => err(notInitializedError()),
        wrap: async () => err(notInitializedError()),
      }
    }
    return currentProvider.tx
  },

  /** 获取当前配置（未初始化时为 null） */
  get config(): DbConfig | null {
    return currentConfig
  },

  /** 检查是否已初始化 */
  get isInitialized(): boolean {
    return currentProvider !== null && currentProvider.isConnected()
  },

  get pagination() {
    return pagination
  },

  /**
   * 关闭数据库连接
   *
   * 多次调用安全，未初始化时直接返回。
   */
  async close(): Promise<void> {
    if (currentProvider) {
      await currentProvider.close()
      currentProvider = null
      currentConfig = null
    }
  },
}
