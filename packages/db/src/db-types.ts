/**
 * =============================================================================
 * @hai/db - 类型定义
 * =============================================================================
 *
 * 本文件定义数据库模块的核心接口和类型（非配置相关）。
 * 配置相关类型请从 db-config.ts 导入。
 *
 * 包含：
 * - 错误类型（DbError）
 * - 列定义（ColumnDef、TableDef、IndexDef）
 * - DDL 操作接口（DdlOperations）
 * - SQL 操作接口（SqlOperations）
 * - 事务操作接口（TxOperations）
 * - 数据库服务接口（DbService）
 * - Provider 接口（DbProvider）
 *
 * @example
 * ```ts
 * import type { DbService, TableDef, ColumnDef } from '@hai/db'
 *
 * // 定义表结构
 * const userTable: TableDef = {
 *     id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
 *     name: { type: 'TEXT', notNull: true },
 *     email: { type: 'TEXT', unique: true }
 * }
 * ```
 *
 * @module db-types
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type { DbConfig, DbConfigInput, DbErrorCodeType } from './db-config.js'

// =============================================================================
// 重新导出配置类型（方便使用）
// =============================================================================

export type { DbConfig, DbConfigInput, DbErrorCodeType, DbType, PoolConfig, SslConfig } from './db-config.js'
export { DbConfigSchema, DbErrorCode, DbTypeSchema, PoolConfigSchema } from './db-config.js'

// =============================================================================
// 错误类型
// =============================================================================

/**
 * 数据库错误接口
 *
 * 所有数据库操作返回的错误都遵循此接口。
 *
 * @example
 * ```ts
 * const result = db.sql.query('SELECT * FROM users')
 * if (!result.success) {
 *     const error: DbError = result.error
 *     // 处理错误：根据 error.code / error.message 做兜底
 * }
 * ```
 */
export interface DbError {
    /** 错误码（数值，参见 DbErrorCode） */
    code: DbErrorCodeType
    /** 错误消息 */
    message: string
    /** 原始错误（可选） */
    cause?: unknown
}

// =============================================================================
// 列定义
// =============================================================================

/**
 * 列数据类型
 *
 * 统一的列类型定义，会根据不同数据库自动映射：
 *
 * | 类型        | SQLite  | PostgreSQL       | MySQL      |
 * |------------|---------|------------------|------------|
 * | TEXT       | TEXT    | TEXT             | TEXT       |
 * | INTEGER    | INTEGER | INTEGER          | INT        |
 * | REAL       | REAL    | DOUBLE PRECISION | DOUBLE     |
 * | BLOB       | BLOB    | BYTEA            | BLOB       |
 * | BOOLEAN    | INTEGER | BOOLEAN          | TINYINT(1) |
 * | TIMESTAMP  | INTEGER | TIMESTAMPTZ      | DATETIME   |
 * | JSON       | TEXT    | JSONB            | JSON       |
 */
export type ColumnType
    = | 'TEXT'
    | 'INTEGER'
    | 'REAL'
    | 'BLOB'
    | 'BOOLEAN'
    | 'TIMESTAMP'
    | 'JSON'

/**
 * 列定义接口
 *
 * 用于定义表的列结构。
 *
 * @example
 * ```ts
 * // 主键列
 * const idColumn: ColumnDef = {
 *     type: 'INTEGER',
 *     primaryKey: true,
 *     autoIncrement: true
 * }
 *
 * // 带外键的列
 * const userIdColumn: ColumnDef = {
 *     type: 'INTEGER',
 *     notNull: true,
 *     references: {
 *         table: 'users',
 *         column: 'id',
 *         onDelete: 'CASCADE'
 *     }
 * }
 * ```
 */
export interface ColumnDef {
    /** 列数据类型 */
    type: ColumnType
    /** 是否为主键 */
    primaryKey?: boolean
    /** 是否自增（仅主键有效） */
    autoIncrement?: boolean
    /** 是否非空 */
    notNull?: boolean
    /** 默认值（支持字符串、数字、布尔、null） */
    defaultValue?: string | number | boolean | null
    /** 是否唯一 */
    unique?: boolean
    /** 外键引用 */
    references?: {
        /** 引用的表名 */
        table: string
        /** 引用的列名 */
        column: string
        /** 删除时的行为 */
        onDelete?: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION'
        /** 更新时的行为 */
        onUpdate?: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION'
    }
}

/**
 * 表定义（列名到列定义的映射）
 *
 * @example
 * ```ts
 * const userTable: TableDef = {
 *     id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
 *     name: { type: 'TEXT', notNull: true },
 *     email: { type: 'TEXT', unique: true },
 *     created_at: { type: 'TIMESTAMP', defaultValue: 'NOW()' }
 * }
 * ```
 */
export interface TableDef {
    [columnName: string]: ColumnDef
}

/**
 * 索引定义
 *
 * @example
 * ```ts
 * // 普通索引
 * const emailIndex: IndexDef = { columns: ['email'] }
 *
 * // 唯一复合索引
 * const compositeIndex: IndexDef = {
 *     columns: ['user_id', 'created_at'],
 *     unique: true
 * }
 *
 * // 部分索引（带条件）
 * const partialIndex: IndexDef = {
 *     columns: ['status'],
 *     where: "status = 'active'"
 * }
 * ```
 */
export interface IndexDef {
    /** 索引包含的列 */
    columns: string[]
    /** 是否为唯一索引 */
    unique?: boolean
    /** 索引条件（WHERE 子句，用于部分索引） */
    where?: string
}

// =============================================================================
// DDL 操作接口
// =============================================================================

/**
 * DDL（数据定义语言）操作接口
 *
 * 提供表结构管理功能，包括创建/删除表、添加/删除列、创建索引等。
 * 所有操作返回 `Result<void, DbError>` 类型。
 *
 * @example
 * ```ts
 * // 创建表
 * const result = db.ddl.createTable('users', {
 *     id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
 *     name: { type: 'TEXT', notNull: true }
 * })
 *
 * if (!result.success) {
 *     // 处理错误：创建表失败（可根据 result.error.code / message 做兜底）
 * }
 * ```
 */
export interface DdlOperations {
    /**
     * 创建表
     * @param tableName - 表名
     * @param columns - 列定义
     * @param ifNotExists - 是否使用 IF NOT EXISTS（默认 true）
     */
    createTable: (tableName: string, columns: TableDef, ifNotExists?: boolean) => Result<void, DbError>

    /**
     * 删除表
     * @param tableName - 表名
     * @param ifExists - 是否使用 IF EXISTS（默认 true）
     */
    dropTable: (tableName: string, ifExists?: boolean) => Result<void, DbError>

    /**
     * 添加列
     * @param tableName - 表名
     * @param columnName - 列名
     * @param columnDef - 列定义
     */
    addColumn: (tableName: string, columnName: string, columnDef: ColumnDef) => Result<void, DbError>

    /**
     * 删除列
     * @param tableName - 表名
     * @param columnName - 列名
     */
    dropColumn: (tableName: string, columnName: string) => Result<void, DbError>

    /**
     * 重命名表
     * @param oldName - 原表名
     * @param newName - 新表名
     */
    renameTable: (oldName: string, newName: string) => Result<void, DbError>

    /**
     * 创建索引
     * @param tableName - 表名
     * @param indexName - 索引名
     * @param indexDef - 索引定义
     */
    createIndex: (tableName: string, indexName: string, indexDef: IndexDef) => Result<void, DbError>

    /**
     * 删除索引
     * @param indexName - 索引名
     * @param ifExists - 是否使用 IF EXISTS（默认 true）
     */
    dropIndex: (indexName: string, ifExists?: boolean) => Result<void, DbError>

    /**
     * 执行原始 DDL SQL
     * @param sql - DDL SQL 语句
     */
    raw: (sql: string) => Result<void, DbError>
}

// =============================================================================
// SQL 操作接口
// =============================================================================

/**
 * 查询结果行类型
 */
export type QueryRow = Record<string, unknown>

/**
 * 执行结果
 *
 * INSERT/UPDATE/DELETE 操作返回的结果。
 */
export interface ExecuteResult {
    /** 影响的行数 */
    changes: number
    /** 最后插入的行 ID（仅 INSERT 时有效） */
    lastInsertRowid?: number | bigint
}

/**
 * SQL（数据操作语言）操作接口
 *
 * 提供数据查询和修改功能。
 *
 * 注意：PostgreSQL 和 MySQL 由于是异步驱动，不支持同步的 sql 操作，
 * 请使用 `txAsync()` 进行数据操作。
 *
 * @example
 * ```ts
 * // 查询多行
 * const users = db.sql.query<{ id: number; name: string }>('SELECT * FROM users')
 *
 * // 查询单行
 * const user = db.sql.get('SELECT * FROM users WHERE id = ?', [1])
 *
 * // 执行修改
 * const result = db.sql.execute('INSERT INTO users (name) VALUES (?)', ['张三'])
 * // 可从 result.data?.lastInsertRowid 获取插入 ID
 * ```
 */
export interface SqlOperations {
    /**
     * 查询多行
     * @param sql - SQL 查询语句
     * @param params - 参数列表（使用 ? 占位符）
     * @returns 查询结果数组
     */
    query: <T = QueryRow>(sql: string, params?: unknown[]) => Result<T[], DbError>

    /**
     * 查询单行
     * @param sql - SQL 查询语句
     * @param params - 参数列表
     * @returns 单行结果或 null
     */
    get: <T = QueryRow>(sql: string, params?: unknown[]) => Result<T | null, DbError>

    /**
     * 执行修改语句（INSERT/UPDATE/DELETE）
     * @param sql - SQL 语句
     * @param params - 参数列表
     * @returns 执行结果（影响行数、最后插入 ID）
     */
    execute: (sql: string, params?: unknown[]) => Result<ExecuteResult, DbError>

    /**
     * 批量执行多条语句（在同一事务中）
     * @param statements - SQL 语句数组
     */
    batch: (statements: Array<{ sql: string, params?: unknown[] }>) => Result<void, DbError>
}

// =============================================================================
// 事务接口
// =============================================================================

/**
 * 事务内操作接口
 *
 * 在事务回调函数中使用，提供同步风格的数据操作。
 * 注意：PostgreSQL/MySQL 的事务内操作返回 Promise，需要使用 await。
 *
 * @example
 * ```ts
 * // SQLite 同步事务
 * db.tx((tx) => {
 *     tx.execute('INSERT INTO users (name) VALUES (?)', ['用户1'])
 *     const user = tx.get('SELECT * FROM users WHERE name = ?', ['用户1'])
 *     return user
 * })
 *
 * // PostgreSQL/MySQL 异步事务
 * await db.txAsync(async (tx) => {
 *     await tx.execute('INSERT INTO users (name) VALUES (?)', ['用户1'])
 *     const user = await tx.get('SELECT * FROM users WHERE name = ?', ['用户1'])
 *     return user
 * })
 * ```
 */
export interface TxOperations {
    /** 查询多行 */
    query: <T = QueryRow>(sql: string, params?: unknown[]) => T[]
    /** 查询单行 */
    get: <T = QueryRow>(sql: string, params?: unknown[]) => T | null
    /** 执行修改 */
    execute: (sql: string, params?: unknown[]) => ExecuteResult
}

/**
 * 事务回调函数类型
 */
export type TxCallback<T> = (tx: TxOperations) => T

// =============================================================================
// 数据库服务接口
// =============================================================================

/**
 * 数据库服务接口
 *
 * 统一的数据库访问入口，通过 `db` 对象提供所有数据库操作。
 *
 * @example
 * ```ts
 * import { db } from '@hai/db'
 *
 * // 初始化
 * db.init({ type: 'sqlite', database: ':memory:' })
 *
 * // 检查状态
 * if (db.isInitialized) {
 *     // 可读取当前数据库类型：db.config?.type
 * }
 *
 * // 使用 DDL
 * db.ddl.createTable('users', { ... })
 *
 * // 使用 SQL
 * db.sql.query('SELECT * FROM users')
 *
 * // 使用事务
 * db.tx((tx) => { ... })
 *
 * // 关闭连接
 * db.close()
 * ```
 */
export interface DbService {
    /**
     * 初始化数据库连接
     *
     * @param config - 数据库配置
     * @returns 初始化结果
     */
    init: (config: DbConfigInput) => Result<void, DbError>

    /** DDL 操作（表结构管理） */
    readonly ddl: DdlOperations

    /** SQL 操作（数据查询和修改） */
    readonly sql: SqlOperations

    /**
     * 执行同步事务
     *
     * 注意：仅 SQLite 支持同步事务，PostgreSQL/MySQL 请使用 txAsync()
     *
     * @param fn - 事务回调函数
     * @returns 事务执行结果
     */
    tx: <T>(fn: TxCallback<T>) => Result<T, DbError>

    /**
     * 执行异步事务
     *
     * 适用于所有数据库类型，推荐用于 PostgreSQL/MySQL。
     *
     * @param fn - 异步事务回调函数
     * @returns 事务执行结果
     */
    txAsync: <T>(fn: (tx: TxOperations) => Promise<T>) => Promise<Result<T, DbError>>

    /** 当前数据库配置（未初始化时为 null） */
    readonly config: DbConfig | null

    /** 是否已初始化 */
    readonly isInitialized: boolean

    /** 关闭数据库连接 */
    close: () => void
}

// =============================================================================
// Provider 接口
// =============================================================================

/**
 * 数据库 Provider 接口
 *
 * 内部使用，定义各数据库驱动需要实现的接口。
 * 每个数据库类型（SQLite、PostgreSQL、MySQL）都有对应的 Provider 实现。
 */
export interface DbProvider {
    /** 连接数据库 */
    connect: (config: DbConfig) => Result<void, DbError>
    /** 关闭连接 */
    close: () => void
    /** 是否已连接 */
    isConnected: () => boolean
    /** DDL 操作 */
    ddl: DdlOperations
    /** SQL 操作 */
    sql: SqlOperations
    /** 同步事务 */
    tx: <T>(fn: TxCallback<T>) => Result<T, DbError>
    /** 异步事务 */
    txAsync: <T>(fn: (tx: TxOperations) => Promise<T>) => Promise<Result<T, DbError>>
}
