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
 * 4. 通过 `db.tx()` 或 `db.txAsync()` 执行事务
 * 5. 调用 `db.close()` 关闭连接
 *
 * @example
 * ```ts
 * import { db } from '@hai/db'
 *
 * // 1. 初始化数据库
 * db.init({
 *     type: 'sqlite',
 *     database: './data.db'
 * })
 *
 * // 2. 创建表
 * db.ddl.createTable('users', {
 *     id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
 *     name: { type: 'TEXT', notNull: true },
 *     email: { type: 'TEXT', unique: true },
 *     created_at: { type: 'TIMESTAMP', defaultValue: '(unixepoch())' }
 * })
 *
 * // 3. 插入数据
 * db.sql.execute(
 *     'INSERT INTO users (name, email) VALUES (?, ?)',
 *     ['张三', 'zhangsan@example.com']
 * )
 *
 * // 4. 查询数据
 * const users = db.sql.query<{ id: number; name: string }>('SELECT * FROM users')
 * if (users.success) {
 *     // 使用查询结果 users.data
 * }
 *
 * // 5. 事务操作
 * const result = db.tx((tx) => {
 *     tx.execute('INSERT INTO users (name) VALUES (?)', ['用户1'])
 *     tx.execute('INSERT INTO users (name) VALUES (?)', ['用户2'])
 *     return tx.query('SELECT COUNT(*) as count FROM users')
 * })
 *
 * // 6. 关闭连接
 * db.close()
 * ```
 *
 * @module db-main
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type {
    DbConfig,
    DbConfigInput,
    DbError,
    DbProvider,
    DbService,
    DdlOperations,
    SqlOperations,
    TxCallback,
    TxOperations,
} from './db-types.js'

import { err } from '@hai/core'

import { DbConfigSchema, DbErrorCode } from './db-config.js'

import { createMysqlProvider } from './provider/db-provider-mysql.js'
import { createPostgresProvider } from './provider/db-provider-postgres.js'
import { createSqliteProvider } from './provider/db-provider-sqlite.js'

// =============================================================================
// 内部状态
// =============================================================================

/** 当前活跃的数据库 Provider */
let currentProvider: DbProvider | null = null

/** 当前数据库配置 */
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
function createProvider(config: DbConfig): DbProvider {
    switch (config.type) {
        case 'sqlite':
            return createSqliteProvider()
        case 'postgresql':
            return createPostgresProvider()
        case 'mysql':
            return createMysqlProvider()
        default:
            throw new Error(`Unsupported database type: ${config.type}`)
    }
}

// =============================================================================
// 未初始化时的占位操作
// =============================================================================

/**
 * 创建未初始化错误
 */
function notInitializedError(): DbError {
    return {
        code: DbErrorCode.NOT_INITIALIZED,
        message: 'Database not initialized. Call db.init() first.',
    }
}

/** 未初始化时的 DDL 操作占位 */
const notInitializedDdl: DdlOperations = {
    createTable: () => err(notInitializedError()),
    dropTable: () => err(notInitializedError()),
    addColumn: () => err(notInitializedError()),
    dropColumn: () => err(notInitializedError()),
    renameTable: () => err(notInitializedError()),
    createIndex: () => err(notInitializedError()),
    dropIndex: () => err(notInitializedError()),
    raw: () => err(notInitializedError()),
}

/** 未初始化时的 SQL 操作占位 */
const notInitializedSql: SqlOperations = {
    query: () => err(notInitializedError()),
    get: () => err(notInitializedError()),
    execute: () => err(notInitializedError()),
    batch: () => err(notInitializedError()),
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
 * - `db.tx()` - 同步事务（仅 SQLite）
 * - `db.txAsync()` - 异步事务（所有数据库）
 * - `db.config` - 当前配置
 * - `db.isInitialized` - 初始化状态
 *
 * @example
 * ```ts
 * import { db } from '@hai/db'
 *
 * // 初始化
 * db.init({ type: 'sqlite', database: ':memory:' })
 *
 * // DDL 操作
 * db.ddl.createTable('users', {
 *     id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
 *     name: { type: 'TEXT', notNull: true }
 * })
 *
 * // SQL 操作
 * db.sql.execute('INSERT INTO users (name) VALUES (?)', ['张三'])
 * const users = db.sql.query('SELECT * FROM users')
 *
 * // 事务操作
 * db.tx((tx) => {
 *     tx.execute('INSERT INTO users (name) VALUES (?)', ['用户1'])
 *     tx.execute('INSERT INTO users (name) VALUES (?)', ['用户2'])
 *     return tx.query('SELECT * FROM users').length
 * })
 *
 * // 关闭连接
 * db.close()
 * ```
 */
export const db: DbService = {
    /** 初始化数据库连接 */
    init(config: DbConfigInput): Result<void, DbError> {
        // 关闭现有连接（如果存在）
        if (currentProvider) {
            currentProvider.close()
            currentProvider = null
            currentConfig = null
        }

        try {
            // 运行时校验并补齐默认值（如 host、pool 等）
            const normalizedConfig = DbConfigSchema.parse(config)

            // 创建对应类型的 Provider
            currentProvider = createProvider(normalizedConfig)

            // 连接数据库
            const result = currentProvider.connect(normalizedConfig)

            if (result.success) {
                currentConfig = normalizedConfig
            }

            return result
        }
        catch (error) {
            return err({
                code: DbErrorCode.CONNECTION_FAILED,
                message: `Failed to initialize database: ${error}`,
                cause: error,
            })
        }
    },

    /** 获取 DDL 操作接口 */
    get ddl(): DdlOperations {
        return currentProvider?.ddl ?? notInitializedDdl
    },

    /** 获取 SQL 操作接口 */
    get sql(): SqlOperations {
        return currentProvider?.sql ?? notInitializedSql
    },

    /** 执行同步事务 */
    tx<T>(fn: TxCallback<T>): Result<T, DbError> {
        if (!currentProvider) {
            return err(notInitializedError())
        }
        return currentProvider.tx(fn)
    },

    /** 执行异步事务 */
    txAsync<T>(fn: (tx: TxOperations) => Promise<T>): Promise<Result<T, DbError>> {
        if (!currentProvider) {
            return Promise.resolve(err(notInitializedError()))
        }
        return currentProvider.txAsync(fn)
    },

    /** 获取当前配置 */
    get config(): DbConfig | null {
        return currentConfig
    },

    /** 检查是否已初始化 */
    get isInitialized(): boolean {
        return currentProvider !== null && currentProvider.isConnected()
    },

    /** 关闭数据库连接 */
    close(): void {
        if (currentProvider) {
            currentProvider.close()
            currentProvider = null
            currentConfig = null
        }
    },
}
