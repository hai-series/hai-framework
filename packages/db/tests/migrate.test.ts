/**
 * =============================================================================
 * @hai/db - 迁移管理器单元测试
 * =============================================================================
 */

import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createConnection, type SqliteConnection } from '../src/connection.js'
import { createMigrationManager, type Migration } from '../src/migrate.js'

describe('migrate', () => {
    let testDir: string
    let connection: SqliteConnection

    // 测试迁移
    const testMigrations: Migration[] = [
        {
            id: '20240101000000',
            name: 'create_test_table',
            up: `
        CREATE TABLE test_table (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          created_at INTEGER DEFAULT (unixepoch())
        )
      `,
            down: 'DROP TABLE test_table',
        },
        {
            id: '20240101000001',
            name: 'add_email_column',
            up: 'ALTER TABLE test_table ADD COLUMN email TEXT',
            down: `
        CREATE TABLE test_table_backup AS SELECT id, name, created_at FROM test_table;
        DROP TABLE test_table;
        ALTER TABLE test_table_backup RENAME TO test_table;
      `,
        },
        {
            id: '20240101000002',
            name: 'create_users_table',
            up: `
        CREATE TABLE users (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL UNIQUE
        )
      `,
            down: 'DROP TABLE users',
        },
    ]

    beforeEach(async () => {
        testDir = join(tmpdir(), `hai-db-migrate-test-${Date.now()}`)
        mkdirSync(testDir, { recursive: true })

        const result = await createConnection({
            type: 'sqlite',
            filename: join(testDir, 'migrate.db'),
            walMode: false,
        })

        if (!result.ok) {
            throw new Error('Failed to create connection')
        }

        connection = result.value as SqliteConnection
    })

    afterEach(() => {
        connection.close()

        if (existsSync(testDir)) {
            rmSync(testDir, { recursive: true, force: true })
        }
    })

    describe('initialize', () => {
        it('should create migrations table', () => {
            const manager = createMigrationManager(connection)
            const result = manager.initialize()

            expect(result.ok).toBe(true)

            // 验证表存在
            const tableExists = connection.raw
                .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='_migrations'")
                .get()

            expect(tableExists).toBeDefined()
        })

        it('should be idempotent', () => {
            const manager = createMigrationManager(connection)

            const result1 = manager.initialize()
            const result2 = manager.initialize()

            expect(result1.ok).toBe(true)
            expect(result2.ok).toBe(true)
        })
    })

    describe('migrate', () => {
        it('should apply all migrations', () => {
            const manager = createMigrationManager(connection)
            const result = manager.migrate(testMigrations)

            expect(result.ok).toBe(true)
            if (result.ok) {
                expect(result.value).toBe(3)
            }

            // 验证迁移记录
            const appliedResult = manager.getAppliedMigrations()
            expect(appliedResult.ok).toBe(true)
            if (appliedResult.ok) {
                expect(appliedResult.value.length).toBe(3)
            }

            // 验证表创建
            const tables = connection.raw
                .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
                .all() as Array<{ name: string }>

            const tableNames = tables.map(t => t.name)
            expect(tableNames).toContain('test_table')
            expect(tableNames).toContain('users')
        })

        it('should skip already applied migrations', () => {
            const manager = createMigrationManager(connection)

            // 第一次迁移
            manager.migrate(testMigrations)

            // 第二次迁移应该跳过
            const result = manager.migrate(testMigrations)

            expect(result.ok).toBe(true)
            if (result.ok) {
                expect(result.value).toBe(0)
            }
        })

        it('should apply only pending migrations', () => {
            const manager = createMigrationManager(connection)

            // 只应用前两个迁移
            manager.migrate(testMigrations.slice(0, 2))

            // 应用全部迁移，应该只执行第三个
            const result = manager.migrate(testMigrations)

            expect(result.ok).toBe(true)
            if (result.ok) {
                expect(result.value).toBe(1)
            }
        })
    })

    describe('rollback', () => {
        it('should rollback last migration', () => {
            const manager = createMigrationManager(connection)

            // 先应用迁移
            manager.migrate(testMigrations)

            // 回滚最后一个
            const result = manager.rollback(testMigrations, 1)

            expect(result.ok).toBe(true)
            if (result.ok) {
                expect(result.value).toBe(1)
            }

            // 验证 users 表已删除
            const tableExists = connection.raw
                .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
                .get()

            expect(tableExists).toBeUndefined()

            // 验证迁移记录
            const appliedResult = manager.getAppliedMigrations()
            expect(appliedResult.ok).toBe(true)
            if (appliedResult.ok) {
                expect(appliedResult.value.length).toBe(2)
            }
        })

        it('should rollback multiple migrations', () => {
            const manager = createMigrationManager(connection)

            manager.migrate(testMigrations)

            const result = manager.rollback(testMigrations, 2)

            expect(result.ok).toBe(true)
            if (result.ok) {
                expect(result.value).toBe(2)
            }

            const appliedResult = manager.getAppliedMigrations()
            expect(appliedResult.ok).toBe(true)
            if (appliedResult.ok) {
                expect(appliedResult.value.length).toBe(1)
            }
        })

        it('should handle rollback with no applied migrations', () => {
            const manager = createMigrationManager(connection)
            manager.initialize()

            const result = manager.rollback(testMigrations, 1)

            expect(result.ok).toBe(true)
            if (result.ok) {
                expect(result.value).toBe(0)
            }
        })
    })

    describe('reset', () => {
        it('should rollback all migrations', () => {
            const manager = createMigrationManager(connection)

            manager.migrate(testMigrations)

            const result = manager.reset(testMigrations)

            expect(result.ok).toBe(true)
            if (result.ok) {
                expect(result.value).toBe(3)
            }

            const appliedResult = manager.getAppliedMigrations()
            expect(appliedResult.ok).toBe(true)
            if (appliedResult.ok) {
                expect(appliedResult.value.length).toBe(0)
            }
        })
    })

    describe('refresh', () => {
        it('should reset and re-migrate', () => {
            const manager = createMigrationManager(connection)

            // 先迁移
            manager.migrate(testMigrations)

            // 插入一些数据
            connection.raw.exec("INSERT INTO test_table (id, name) VALUES ('1', 'test')")

            // 刷新
            const result = manager.refresh(testMigrations)

            expect(result.ok).toBe(true)
            if (result.ok) {
                expect(result.value).toBe(3)
            }

            // 数据应该被清除
            const count = connection.raw
                .prepare('SELECT COUNT(*) as count FROM test_table')
                .get() as { count: number }

            expect(count.count).toBe(0)
        })
    })

    describe('getPendingMigrations', () => {
        it('should return all migrations when none applied', () => {
            const manager = createMigrationManager(connection)
            manager.initialize()

            const result = manager.getPendingMigrations(testMigrations)

            expect(result.ok).toBe(true)
            if (result.ok) {
                expect(result.value.length).toBe(3)
            }
        })

        it('should return only unapplied migrations', () => {
            const manager = createMigrationManager(connection)

            // 只应用第一个迁移
            manager.migrate([testMigrations[0]])

            const result = manager.getPendingMigrations(testMigrations)

            expect(result.ok).toBe(true)
            if (result.ok) {
                expect(result.value.length).toBe(2)
                expect(result.value[0].id).toBe('20240101000001')
            }
        })
    })
})
