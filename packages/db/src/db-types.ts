/**
 * =============================================================================
 * @hai/db - 类型定义
 * =============================================================================
 * 定义数据库模块的所有接口和类型
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type Database from 'better-sqlite3'

// =============================================================================
// Provider 定义
// =============================================================================

/**
 * 数据库服务提供者类型
 */
export type DbProvider = 'hai' | 'supabase' | 'firebase' | 'planetscale' | 'neon' | 'custom'

/**
 * 数据库类型
 */
export type DbType = 'sqlite' | 'postgresql' | 'mysql'

/**
 * 数据库连接配置
 */
export interface DbConfig {
    /** 提供者类型 */
    provider: DbProvider
    /** 数据库类型 */
    type: DbType
    /** SQLite 配置 */
    sqlite?: SqliteDbConfig
    /** PostgreSQL 配置 */
    postgresql?: PostgresDbConfig
    /** MySQL 配置 */
    mysql?: MysqlDbConfig
    /** Redis 配置 */
    redis?: RedisConfig
    /** 自定义配置 */
    custom?: Record<string, unknown>
}

/**
 * SQLite 数据库配置
 */
export interface SqliteDbConfig {
    /** 数据库文件路径 */
    filename: string
    /** 是否启用 WAL 模式 */
    walMode?: boolean
    /** 是否只读 */
    readonly?: boolean
}

/**
 * PostgreSQL 数据库配置
 */
export interface PostgresDbConfig {
    /** 连接字符串 */
    connectionString?: string
    /** 主机 */
    host?: string
    /** 端口 */
    port?: number
    /** 数据库名 */
    database?: string
    /** 用户名 */
    user?: string
    /** 密码 */
    password?: string
    /** SSL 模式 */
    ssl?: boolean | 'require' | 'prefer' | 'allow' | 'disable'
    /** 连接池大小 */
    poolSize?: number
}

/**
 * MySQL 数据库配置
 */
export interface MysqlDbConfig {
    /** 连接字符串 */
    connectionString?: string
    /** 主机 */
    host?: string
    /** 端口 */
    port?: number
    /** 数据库名 */
    database?: string
    /** 用户名 */
    user?: string
    /** 密码 */
    password?: string
    /** SSL 配置 */
    ssl?: boolean | Record<string, unknown>
    /** 连接池大小 */
    poolSize?: number
}

/**
 * Redis 配置
 */
export interface RedisConfig {
    /** 连接字符串 */
    url?: string
    /** 主机 */
    host?: string
    /** 端口 */
    port?: number
    /** 密码 */
    password?: string
    /** 数据库索引 */
    db?: number
    /** 键前缀 */
    keyPrefix?: string
}

// =============================================================================
// 连接类型
// =============================================================================

/**
 * 数据库实例类型
 */
export type DbInstance = BetterSQLite3Database<Record<string, never>>

/**
 * SQLite 数据库连接
 */
export interface SqliteConnection {
    type: 'sqlite'
    db: BetterSQLite3Database<Record<string, never>>
    raw: Database.Database
    close: () => void
}

/**
 * PostgreSQL 数据库连接
 */
export interface PostgresConnection {
    type: 'postgresql'
    db: unknown
    raw: unknown
    close: () => Promise<void>
}

/**
 * MySQL 数据库连接
 */
export interface MysqlConnection {
    type: 'mysql'
    db: unknown
    raw: unknown
    close: () => Promise<void>
}

/**
 * 数据库连接（联合类型）
 */
export type DbConnection = SqliteConnection | PostgresConnection | MysqlConnection

// =============================================================================
// 错误类型
// =============================================================================

/**
 * 数据库连接错误类型
 */
export type DbErrorType =
    | 'CONNECTION_FAILED'
    | 'QUERY_FAILED'
    | 'MIGRATION_FAILED'
    | 'UNSUPPORTED_DATABASE'
    | 'CONFIG_ERROR'
    | 'PROVIDER_NOT_FOUND'

/**
 * 数据库错误
 */
export interface DbError {
    type: DbErrorType
    message: string
    cause?: unknown
}

/**
 * Repository 错误类型
 */
export type RepositoryErrorType =
    | 'NOT_FOUND'
    | 'DUPLICATE'
    | 'QUERY_FAILED'
    | 'VALIDATION_FAILED'

/**
 * Repository 错误
 */
export interface RepositoryError {
    type: RepositoryErrorType
    message: string
    cause?: unknown
}

// =============================================================================
// Repository 类型
// =============================================================================

/**
 * 分页参数
 */
export interface PaginationParams {
    /** 页码（从 1 开始） */
    page?: number
    /** 每页数量 */
    pageSize?: number
}

/**
 * 分页结果
 */
export interface PaginatedResult<T> {
    /** 数据列表 */
    data: T[]
    /** 总数 */
    total: number
    /** 当前页码 */
    page: number
    /** 每页数量 */
    pageSize: number
    /** 总页数 */
    totalPages: number
}

// =============================================================================
// 迁移类型
// =============================================================================

/**
 * 迁移定义
 */
export interface Migration {
    /** 迁移 ID (时间戳格式，如 '20240101000000') */
    id: string
    /** 迁移名称 */
    name: string
    /** 升级 SQL */
    up: string
    /** 降级 SQL */
    down: string
}

/**
 * 迁移记录
 */
export interface MigrationRecord {
    id: string
    name: string
    appliedAt: Date
}

// =============================================================================
// Provider 接口
// =============================================================================

/**
 * 连接 Provider
 */
export interface ConnectionProvider {
    /** 创建连接 */
    connect(config: DbConfig): Promise<Result<DbConnection, DbError>>
    /** 关闭连接 */
    close(connection: DbConnection): Promise<void>
    /** 检查连接状态 */
    isConnected(connection: DbConnection): boolean
}

/**
 * 迁移 Provider
 */
export interface MigrationProvider {
    /** 初始化迁移表 */
    initialize(connection: DbConnection): Result<void, DbError>
    /** 运行迁移 */
    run(connection: DbConnection, migrations: Migration[]): Promise<Result<void, DbError>>
    /** 回滚迁移 */
    rollback(connection: DbConnection, steps?: number): Promise<Result<void, DbError>>
    /** 获取已应用的迁移 */
    getApplied(connection: DbConnection): Result<MigrationRecord[], DbError>
    /** 获取待处理的迁移 */
    getPending(connection: DbConnection, migrations: Migration[]): Result<Migration[], DbError>
}

/**
 * 查询 Provider
 */
export interface QueryProvider {
    /** 执行原始 SQL */
    raw<T>(connection: DbConnection, sql: string, params?: unknown[]): Promise<Result<T, DbError>>
    /** 执行事务 */
    transaction<T>(
        connection: DbConnection,
        fn: () => Promise<T>
    ): Promise<Result<T, DbError>>
}

// =============================================================================
// 统一数据库服务接口
// =============================================================================

/**
 * 统一数据库服务
 */
export interface DbService {
    /** 连接管理 */
    readonly connection: ConnectionProvider
    /** 迁移管理 */
    readonly migration: MigrationProvider
    /** 查询执行 */
    readonly query: QueryProvider
    /** 当前配置 */
    readonly config: DbConfig
    /** 当前连接 */
    readonly current: DbConnection | null
    /** 初始化 */
    init(config?: Partial<DbConfig>): Promise<Result<DbConnection, DbError>>
    /** 关闭 */
    close(): Promise<void>
}
