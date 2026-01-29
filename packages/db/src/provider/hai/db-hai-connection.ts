/**
 * =============================================================================
 * @hai/db - HAI Connection Provider
 * =============================================================================
 * 数据库连接管理实现
 * =============================================================================
 */

import type { Result } from '@hai/core'
import { err, ok } from '@hai/core'
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3'
import Database from 'better-sqlite3'

import type {
    ConnectionProvider,
    DbConfig,
    DbConnection,
    DbError,
    SqliteConnection,
} from '../../db-types.js'

/**
 * 创建 HAI Connection Provider
 */
export function createHaiConnectionProvider(): ConnectionProvider {
    return {
        async connect(config: DbConfig): Promise<Result<DbConnection, DbError>> {
            switch (config.type) {
                case 'sqlite':
                    return connectSqlite(config)
                case 'postgresql':
                    return connectPostgres()
                case 'mysql':
                    return connectMysql()
                default:
                    return err({
                        type: 'UNSUPPORTED_DATABASE',
                        message: `Unsupported database type: ${config.type}`,
                    })
            }
        },

        async close(connection: DbConnection): Promise<void> {
            switch (connection.type) {
                case 'sqlite':
                    connection.close()
                    break
                case 'postgresql':
                case 'mysql':
                    await connection.close()
                    break
            }
        },

        isConnected(connection: DbConnection): boolean {
            switch (connection.type) {
                case 'sqlite':
                    return connection.raw.open
                case 'postgresql':
                case 'mysql':
                    return true // 简化实现
                default:
                    return false
            }
        },
    }
}

/**
 * 创建 SQLite 连接
 */
function connectSqlite(config: DbConfig): Result<SqliteConnection, DbError> {
    if (!config.sqlite) {
        return err({
            type: 'CONFIG_ERROR',
            message: 'SQLite configuration is required',
        })
    }

    try {
        const sqlite = new Database(config.sqlite.filename, {
            readonly: config.sqlite.readonly,
        })

        if (config.sqlite.walMode) {
            sqlite.pragma('journal_mode = WAL')
        }

        const db = drizzleSqlite(sqlite)

        return ok({
            type: 'sqlite',
            db,
            raw: sqlite,
            close: () => {
                sqlite.close()
            },
        })
    }
    catch (error) {
        return err({
            type: 'CONNECTION_FAILED',
            message: `Failed to connect to SQLite: ${error}`,
            cause: error,
        })
    }
}

/**
 * 创建 PostgreSQL 连接（占位）
 */
async function connectPostgres(): Promise<Result<DbConnection, DbError>> {
    // PostgreSQL 支持可在需要时实现
    return err({
        type: 'UNSUPPORTED_DATABASE',
        message: 'PostgreSQL support is not yet implemented. Install @neondatabase/serverless or pg for PostgreSQL support.',
    })
}

/**
 * 创建 MySQL 连接（占位）
 */
async function connectMysql(): Promise<Result<DbConnection, DbError>> {
    // MySQL 支持可在需要时实现
    return err({
        type: 'UNSUPPORTED_DATABASE',
        message: 'MySQL support is not yet implemented. Install mysql2 for MySQL support.',
    })
}

export const haiConnectionProvider = createHaiConnectionProvider()
