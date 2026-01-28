/**
 * =============================================================================
 * @hai/db - 数据库连接工厂
 * =============================================================================
 * 支持 SQLite、PostgreSQL、MySQL 多种数据库
 * 基于配置自动选择正确的驱动
 * =============================================================================
 */

import type { Result } from '@hai/core'
import { createLogger, err, ok } from '@hai/core'
import type { DatabaseConfig, SqliteConfig, PostgresConfig, MysqlConfig } from '@hai/config'
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import Database from 'better-sqlite3'

const logger = createLogger({ name: 'db' })

/**
 * 数据库连接错误类型
 */
export type DbErrorType =
    | 'CONNECTION_FAILED'
    | 'QUERY_FAILED'
    | 'MIGRATION_FAILED'
    | 'UNSUPPORTED_DATABASE'
    | 'CONFIG_ERROR'

/**
 * 数据库错误
 */
export interface DbError {
    type: DbErrorType
    message: string
    cause?: unknown
}

/**
 * 数据库实例类型（联合类型）
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

/**
 * 创建 SQLite 连接
 */
function createSqliteConnection(config: SqliteConfig): Result<SqliteConnection, DbError> {
    try {
        logger.info({ filename: config.filename }, 'Connecting to SQLite database')

        // 创建原生连接
        const sqlite = new Database(config.filename)

        // 启用 WAL 模式
        if (config.walMode) {
            sqlite.pragma('journal_mode = WAL')
            logger.debug('SQLite WAL mode enabled')
        }

        // 创建 Drizzle 实例
        const db = drizzleSqlite(sqlite)

        logger.info('SQLite connection established')

        return ok({
            type: 'sqlite',
            db,
            raw: sqlite,
            close: () => {
                sqlite.close()
                logger.info('SQLite connection closed')
            },
        })
    }
    catch (error) {
        logger.error({ error }, 'Failed to connect to SQLite')
        return err({
            type: 'CONNECTION_FAILED',
            message: `SQLite connection failed: ${error}`,
            cause: error,
        })
    }
}

/**
 * 创建 PostgreSQL 连接
 * 
 * 注意：需要安装 postgres 依赖
 */
async function createPostgresConnection(config: PostgresConfig): Promise<Result<PostgresConnection, DbError>> {
    try {
        logger.info({ host: config.host, database: config.database }, 'Connecting to PostgreSQL database')

        // 动态导入 postgres 驱动
        const { default: postgres } = await import('postgres')
        const { drizzle } = await import('drizzle-orm/postgres-js')

        // 构建连接字符串
        const connectionString = `postgres://${config.user}:${config.password}@${config.host}:${config.port}/${config.database}`

        // 创建原生连接
        const client = postgres(connectionString, {
            ssl: config.ssl,
            max: config.poolMax,
            idle_timeout: config.poolIdleTimeout / 1000,
        })

        // 创建 Drizzle 实例
        const db = drizzle(client)

        logger.info('PostgreSQL connection established')

        return ok({
            type: 'postgresql',
            db,
            raw: client,
            close: async () => {
                await client.end()
                logger.info('PostgreSQL connection closed')
            },
        })
    }
    catch (error) {
        logger.error({ error }, 'Failed to connect to PostgreSQL')
        return err({
            type: 'CONNECTION_FAILED',
            message: `PostgreSQL connection failed: ${error}`,
            cause: error,
        })
    }
}

/**
 * 创建 MySQL 连接
 * 
 * 注意：需要安装 mysql2 依赖
 */
async function createMysqlConnection(config: MysqlConfig): Promise<Result<MysqlConnection, DbError>> {
    try {
        logger.info({ host: config.host, database: config.database }, 'Connecting to MySQL database')

        // 动态导入 mysql2 驱动
        const mysql = await import('mysql2/promise')
        const { drizzle } = await import('drizzle-orm/mysql2')

        // 创建连接池
        const pool = mysql.createPool({
            host: config.host,
            port: config.port,
            database: config.database,
            user: config.user,
            password: config.password,
            ssl: config.ssl ? {} : undefined,
            connectionLimit: config.connectionLimit,
            charset: config.charset,
            timezone: config.timezone,
        })

        // 创建 Drizzle 实例
        const db = drizzle(pool)

        logger.info('MySQL connection established')

        return ok({
            type: 'mysql',
            db,
            raw: pool,
            close: async () => {
                await pool.end()
                logger.info('MySQL connection closed')
            },
        })
    }
    catch (error) {
        logger.error({ error }, 'Failed to connect to MySQL')
        return err({
            type: 'CONNECTION_FAILED',
            message: `MySQL connection failed: ${error}`,
            cause: error,
        })
    }
}

/**
 * 创建数据库连接
 * 
 * 根据配置类型自动选择正确的驱动
 * 
 * @param config - 数据库配置
 * @returns 数据库连接
 * 
 * @example
 * ```ts
 * // SQLite
 * const result = await createConnection({ type: 'sqlite', filename: './data/app.db' })
 * 
 * // PostgreSQL
 * const result = await createConnection({
 *   type: 'postgresql',
 *   host: 'localhost',
 *   port: 5432,
 *   database: 'myapp',
 *   user: 'admin',
 *   password: 'secret',
 * })
 * ```
 */
export async function createConnection(config: DatabaseConfig): Promise<Result<DbConnection, DbError>> {
    switch (config.type) {
        case 'sqlite':
            return createSqliteConnection(config)
        case 'postgresql':
            return createPostgresConnection(config)
        case 'mysql':
            return createMysqlConnection(config)
        default:
            return err({
                type: 'UNSUPPORTED_DATABASE',
                message: `Unsupported database type: ${(config as DatabaseConfig).type}`,
            })
    }
}

/**
 * 数据库连接管理器
 * 提供连接池管理和健康检查
 */
export class ConnectionManager {
    private static instance: ConnectionManager | null = null
    private connections: Map<string, DbConnection> = new Map()

    private constructor() { }

    /**
     * 获取单例实例
     */
    static getInstance(): ConnectionManager {
        if (!ConnectionManager.instance) {
            ConnectionManager.instance = new ConnectionManager()
        }
        return ConnectionManager.instance
    }

    /**
     * 重置单例（仅用于测试）
     */
    static resetInstance(): void {
        ConnectionManager.instance = null
    }

    /**
     * 获取或创建连接
     * 
     * @param name - 连接名称
     * @param config - 数据库配置
     */
    async getConnection(name: string, config: DatabaseConfig): Promise<Result<DbConnection, DbError>> {
        const existing = this.connections.get(name)
        if (existing) {
            return ok(existing)
        }

        const result = await createConnection(config)
        if (result.ok) {
            this.connections.set(name, result.value)
        }

        return result
    }

    /**
     * 关闭指定连接
     * 
     * @param name - 连接名称
     */
    async closeConnection(name: string): Promise<void> {
        const connection = this.connections.get(name)
        if (connection) {
            if (connection.type === 'sqlite') {
                connection.close()
            }
            else {
                await connection.close()
            }
            this.connections.delete(name)
        }
    }

    /**
     * 关闭所有连接
     */
    async closeAll(): Promise<void> {
        for (const [name] of this.connections) {
            await this.closeConnection(name)
        }
    }

    /**
     * 获取所有连接名称
     */
    getConnectionNames(): string[] {
        return Array.from(this.connections.keys())
    }
}

/**
 * 获取连接管理器实例
 */
export function getConnectionManager(): ConnectionManager {
    return ConnectionManager.getInstance()
}
