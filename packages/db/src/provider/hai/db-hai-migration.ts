/**
 * =============================================================================
 * @hai/db - HAI Migration Provider
 * =============================================================================
 * 数据库迁移管理实现
 * =============================================================================
 */

import type { Result } from '@hai/core'
import { err, ok } from '@hai/core'

import type {
    DbConnection,
    DbError,
    Migration,
    MigrationProvider,
    MigrationRecord,
    SqliteConnection,
} from '../../db-types.js'

/**
 * 创建 HAI Migration Provider
 */
export function createHaiMigrationProvider(): MigrationProvider {
    return {
        initialize(connection: DbConnection): Result<void, DbError> {
            if (connection.type !== 'sqlite') {
                return err({
                    type: 'UNSUPPORTED_DATABASE',
                    message: 'Only SQLite migrations are currently supported',
                })
            }

            try {
                const sqliteConn = connection as SqliteConnection
                sqliteConn.raw.exec(`
                    CREATE TABLE IF NOT EXISTS _migrations (
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        applied_at INTEGER NOT NULL DEFAULT (unixepoch())
                    )
                `)

                return ok(undefined)
            }
            catch (error) {
                return err({
                    type: 'MIGRATION_FAILED',
                    message: `Failed to initialize migrations table: ${error}`,
                    cause: error,
                })
            }
        },

        async run(connection: DbConnection, migrations: Migration[]): Promise<Result<void, DbError>> {
            if (connection.type !== 'sqlite') {
                return err({
                    type: 'UNSUPPORTED_DATABASE',
                    message: 'Only SQLite migrations are currently supported',
                })
            }

            const sqliteConn = connection as SqliteConnection
            const pendingResult = this.getPending(connection, migrations)

            if (!pendingResult.success) {
                return pendingResult
            }

            const pending = pendingResult.data
            if (pending.length === 0) {
                return ok(undefined)
            }

            for (const migration of pending) {
                try {
                    sqliteConn.raw.exec(migration.up)

                    sqliteConn.raw
                        .prepare('INSERT INTO _migrations (id, name) VALUES (?, ?)')
                        .run(migration.id, migration.name)
                }
                catch (error) {
                    return err({
                        type: 'MIGRATION_FAILED',
                        message: `Migration ${migration.id} failed: ${error}`,
                        cause: error,
                    })
                }
            }

            return ok(undefined)
        },

        async rollback(connection: DbConnection, steps = 1): Promise<Result<void, DbError>> {
            if (connection.type !== 'sqlite') {
                return err({
                    type: 'UNSUPPORTED_DATABASE',
                    message: 'Only SQLite migrations are currently supported',
                })
            }

            const sqliteConn = connection as SqliteConnection

            try {
                const rows = sqliteConn.raw
                    .prepare('SELECT id FROM _migrations ORDER BY id DESC LIMIT ?')
                    .all(steps) as Array<{ id: string }>

                for (const row of rows) {
                    sqliteConn.raw
                        .prepare('DELETE FROM _migrations WHERE id = ?')
                        .run(row.id)
                }

                return ok(undefined)
            }
            catch (error) {
                return err({
                    type: 'MIGRATION_FAILED',
                    message: `Rollback failed: ${error}`,
                    cause: error,
                })
            }
        },

        getApplied(connection: DbConnection): Result<MigrationRecord[], DbError> {
            if (connection.type !== 'sqlite') {
                return err({
                    type: 'UNSUPPORTED_DATABASE',
                    message: 'Only SQLite migrations are currently supported',
                })
            }

            try {
                const sqliteConn = connection as SqliteConnection
                const rows = sqliteConn.raw
                    .prepare('SELECT id, name, applied_at FROM _migrations ORDER BY id')
                    .all() as Array<{ id: string; name: string; applied_at: number }>

                const records: MigrationRecord[] = rows.map(row => ({
                    id: row.id,
                    name: row.name,
                    appliedAt: new Date(row.applied_at * 1000),
                }))

                return ok(records)
            }
            catch (error) {
                return err({
                    type: 'MIGRATION_FAILED',
                    message: `Failed to get applied migrations: ${error}`,
                    cause: error,
                })
            }
        },

        getPending(connection: DbConnection, migrations: Migration[]): Result<Migration[], DbError> {
            const appliedResult = this.getApplied(connection)

            if (!appliedResult.success) {
                return appliedResult
            }

            const appliedIds = new Set(appliedResult.data.map(m => m.id))
            const pending = migrations
                .filter(m => !appliedIds.has(m.id))
                .sort((a, b) => a.id.localeCompare(b.id))

            return ok(pending)
        },
    }
}

export const haiMigrationProvider = createHaiMigrationProvider()
