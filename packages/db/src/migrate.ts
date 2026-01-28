/**
 * =============================================================================
 * @hai/db - 数据库迁移工具
 * =============================================================================
 * 提供数据库迁移功能
 * =============================================================================
 */

import type { Result } from '@hai/core'
import { createLogger, err, ok } from '@hai/core'
import type { SqliteConnection, DbError } from './connection.js'

const logger = createLogger({ name: 'db-migrate' })

/**
 * 迁移记录
 */
interface MigrationRecord {
    id: string
    name: string
    appliedAt: Date
}

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
 * 迁移管理器
 */
export class MigrationManager {
    private connection: SqliteConnection

    constructor(connection: SqliteConnection) {
        this.connection = connection
    }

    /**
     * 初始化迁移表
     */
    initialize(): Result<void, DbError> {
        try {
            this.connection.raw.exec(`
        CREATE TABLE IF NOT EXISTS _migrations (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at INTEGER NOT NULL DEFAULT (unixepoch())
        )
      `)

            logger.debug('Migrations table initialized')
            return ok(undefined)
        }
        catch (error) {
            logger.error({ error }, 'Failed to initialize migrations table')
            return err({
                type: 'MIGRATION_FAILED',
                message: `Failed to initialize migrations table: ${error}`,
                cause: error,
            })
        }
    }

    /**
     * 获取已应用的迁移
     */
    getAppliedMigrations(): Result<MigrationRecord[], DbError> {
        try {
            const rows = this.connection.raw
                .prepare('SELECT id, name, applied_at FROM _migrations ORDER BY id')
                .all() as Array<{ id: string, name: string, applied_at: number }>

            return ok(rows.map(row => ({
                id: row.id,
                name: row.name,
                appliedAt: new Date(row.applied_at * 1000),
            })))
        }
        catch (error) {
            logger.error({ error }, 'Failed to get applied migrations')
            return err({
                type: 'QUERY_FAILED',
                message: `Failed to get applied migrations: ${error}`,
                cause: error,
            })
        }
    }

    /**
     * 获取待应用的迁移
     * 
     * @param migrations - 所有迁移定义
     */
    getPendingMigrations(migrations: Migration[]): Result<Migration[], DbError> {
        const appliedResult = this.getAppliedMigrations()
        if (!appliedResult.ok) {
            return appliedResult as Result<Migration[], DbError>
        }

        const appliedIds = new Set(appliedResult.value.map(m => m.id))
        const pending = migrations
            .filter(m => !appliedIds.has(m.id))
            .sort((a, b) => a.id.localeCompare(b.id))

        return ok(pending)
    }

    /**
     * 应用单个迁移
     * 
     * @param migration - 迁移定义
     */
    applyMigration(migration: Migration): Result<void, DbError> {
        try {
            logger.info({ id: migration.id, name: migration.name }, 'Applying migration')

            // 在事务中执行
            this.connection.raw.transaction(() => {
                // 执行迁移 SQL
                this.connection.raw.exec(migration.up)

                // 记录迁移
                this.connection.raw
                    .prepare('INSERT INTO _migrations (id, name) VALUES (?, ?)')
                    .run(migration.id, migration.name)
            })()

            logger.info({ id: migration.id }, 'Migration applied successfully')
            return ok(undefined)
        }
        catch (error) {
            logger.error({ error, id: migration.id }, 'Migration failed')
            return err({
                type: 'MIGRATION_FAILED',
                message: `Migration ${migration.id} failed: ${error}`,
                cause: error,
            })
        }
    }

    /**
     * 回滚单个迁移
     * 
     * @param migration - 迁移定义
     */
    rollbackMigration(migration: Migration): Result<void, DbError> {
        try {
            logger.info({ id: migration.id, name: migration.name }, 'Rolling back migration')

            // 在事务中执行
            this.connection.raw.transaction(() => {
                // 执行回滚 SQL
                this.connection.raw.exec(migration.down)

                // 删除迁移记录
                this.connection.raw
                    .prepare('DELETE FROM _migrations WHERE id = ?')
                    .run(migration.id)
            })()

            logger.info({ id: migration.id }, 'Migration rolled back successfully')
            return ok(undefined)
        }
        catch (error) {
            logger.error({ error, id: migration.id }, 'Rollback failed')
            return err({
                type: 'MIGRATION_FAILED',
                message: `Rollback ${migration.id} failed: ${error}`,
                cause: error,
            })
        }
    }

    /**
     * 应用所有待处理的迁移
     * 
     * @param migrations - 所有迁移定义
     */
    migrate(migrations: Migration[]): Result<number, DbError> {
        // 初始化迁移表
        const initResult = this.initialize()
        if (!initResult.ok) {
            return initResult as Result<number, DbError>
        }

        // 获取待应用的迁移
        const pendingResult = this.getPendingMigrations(migrations)
        if (!pendingResult.ok) {
            return pendingResult as Result<number, DbError>
        }

        const pending = pendingResult.value

        if (pending.length === 0) {
            logger.info('No pending migrations')
            return ok(0)
        }

        logger.info({ count: pending.length }, 'Applying pending migrations')

        // 逐个应用迁移
        for (const migration of pending) {
            const result = this.applyMigration(migration)
            if (!result.ok) {
                return result as Result<number, DbError>
            }
        }

        logger.info({ count: pending.length }, 'All migrations applied')
        return ok(pending.length)
    }

    /**
     * 回滚最后 N 个迁移
     * 
     * @param migrations - 所有迁移定义
     * @param count - 要回滚的数量
     */
    rollback(migrations: Migration[], count: number = 1): Result<number, DbError> {
        // 获取已应用的迁移
        const appliedResult = this.getAppliedMigrations()
        if (!appliedResult.ok) {
            return appliedResult as Result<number, DbError>
        }

        const applied = appliedResult.value

        if (applied.length === 0) {
            logger.info('No migrations to rollback')
            return ok(0)
        }

        // 获取要回滚的迁移（从最新到最旧）
        const toRollback = applied
            .sort((a, b) => b.id.localeCompare(a.id))
            .slice(0, count)

        // 构建迁移映射
        const migrationMap = new Map(migrations.map(m => [m.id, m]))

        let rolledBack = 0
        for (const record of toRollback) {
            const migration = migrationMap.get(record.id)
            if (!migration) {
                logger.warn({ id: record.id }, 'Migration definition not found, skipping')
                continue
            }

            const result = this.rollbackMigration(migration)
            if (!result.ok) {
                return result as Result<number, DbError>
            }
            rolledBack++
        }

        logger.info({ count: rolledBack }, 'Migrations rolled back')
        return ok(rolledBack)
    }

    /**
     * 重置数据库（回滚所有迁移）
     * 
     * @param migrations - 所有迁移定义
     */
    reset(migrations: Migration[]): Result<number, DbError> {
        const appliedResult = this.getAppliedMigrations()
        if (!appliedResult.ok) {
            return appliedResult as Result<number, DbError>
        }

        return this.rollback(migrations, appliedResult.value.length)
    }

    /**
     * 刷新数据库（重置 + 重新迁移）
     * 
     * @param migrations - 所有迁移定义
     */
    refresh(migrations: Migration[]): Result<number, DbError> {
        const resetResult = this.reset(migrations)
        if (!resetResult.ok) {
            return resetResult
        }

        return this.migrate(migrations)
    }
}

/**
 * 创建迁移管理器
 * 
 * @param connection - 数据库连接
 */
export function createMigrationManager(connection: SqliteConnection): MigrationManager {
    return new MigrationManager(connection)
}
