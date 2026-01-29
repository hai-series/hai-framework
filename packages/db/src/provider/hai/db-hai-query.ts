/**
 * =============================================================================
 * @hai/db - HAI Query Provider
 * =============================================================================
 * 数据库查询执行实现
 * =============================================================================
 */

import type { Result } from '@hai/core'
import { err, ok } from '@hai/core'

import type {
    DbConnection,
    DbError,
    QueryProvider,
    SqliteConnection,
} from '../../db-types.js'

/**
 * 创建 HAI Query Provider
 */
export function createHaiQueryProvider(): QueryProvider {
    return {
        async raw<T>(
            connection: DbConnection,
            sql: string,
            params?: unknown[],
        ): Promise<Result<T, DbError>> {
            if (connection.type !== 'sqlite') {
                return err({
                    type: 'UNSUPPORTED_DATABASE',
                    message: 'Only SQLite queries are currently supported',
                })
            }

            try {
                const sqliteConn = connection as SqliteConnection
                const stmt = sqliteConn.raw.prepare(sql)
                const result = params ? stmt.all(...params) : stmt.all()

                return ok(result as T)
            }
            catch (error) {
                return err({
                    type: 'QUERY_FAILED',
                    message: `Query failed: ${error}`,
                    cause: error,
                })
            }
        },

        async transaction<T>(
            connection: DbConnection,
            fn: () => Promise<T>,
        ): Promise<Result<T, DbError>> {
            if (connection.type !== 'sqlite') {
                return err({
                    type: 'UNSUPPORTED_DATABASE',
                    message: 'Only SQLite transactions are currently supported',
                })
            }

            const sqliteConn = connection as SqliteConnection

            try {
                sqliteConn.raw.exec('BEGIN TRANSACTION')

                try {
                    const result = await fn()
                    sqliteConn.raw.exec('COMMIT')
                    return ok(result)
                }
                catch (error) {
                    sqliteConn.raw.exec('ROLLBACK')
                    throw error
                }
            }
            catch (error) {
                return err({
                    type: 'QUERY_FAILED',
                    message: `Transaction failed: ${error}`,
                    cause: error,
                })
            }
        },
    }
}

export const haiQueryProvider = createHaiQueryProvider()
