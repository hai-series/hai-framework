/**
 * =============================================================================
 * @hai/db - 连接管理器单元测试
 * =============================================================================
 */

import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
    ConnectionManager,
    createConnection,
    getConnectionManager,
} from '../src/connection.js'

describe('connection', () => {
    let testDir: string

    beforeEach(() => {
        testDir = join(tmpdir(), `hai-db-test-${Date.now()}`)
        mkdirSync(testDir, { recursive: true })
        ConnectionManager.resetInstance()
    })

    afterEach(() => {
        // 关闭所有连接
        const manager = getConnectionManager()
        manager.closeAll()

        if (existsSync(testDir)) {
            rmSync(testDir, { recursive: true, force: true })
        }

        ConnectionManager.resetInstance()
    })

    describe('createConnection', () => {
        it('should create SQLite connection', async () => {
            const dbPath = join(testDir, 'test.db')

            const result = await createConnection({
                type: 'sqlite',
                filename: dbPath,
                walMode: true,
            })

            expect(result.ok).toBe(true)

            if (result.ok) {
                expect(result.value.type).toBe('sqlite')
                expect(result.value.db).toBeDefined()
                expect(result.value.raw).toBeDefined()

                // 关闭连接
                result.value.close()
            }
        })

        it('should enable WAL mode for SQLite', async () => {
            const dbPath = join(testDir, 'wal-test.db')

            const result = await createConnection({
                type: 'sqlite',
                filename: dbPath,
                walMode: true,
            })

            expect(result.ok).toBe(true)

            if (result.ok && result.value.type === 'sqlite') {
                const mode = result.value.raw.pragma('journal_mode', { simple: true })
                expect(mode).toBe('wal')
                result.value.close()
            }
        })

        it('should return error for unsupported database type', async () => {
            const result = await createConnection({
                type: 'unknown' as 'sqlite',
                filename: 'test.db',
            })

            expect(result.ok).toBe(false)

            if (!result.ok) {
                expect(result.error.type).toBe('UNSUPPORTED_DATABASE')
            }
        })
    })

    describe('ConnectionManager', () => {
        it('should return singleton instance', () => {
            const instance1 = ConnectionManager.getInstance()
            const instance2 = ConnectionManager.getInstance()

            expect(instance1).toBe(instance2)
        })

        it('should return same instance via getConnectionManager', () => {
            const instance1 = getConnectionManager()
            const instance2 = ConnectionManager.getInstance()

            expect(instance1).toBe(instance2)
        })

        it('should get or create connection', async () => {
            const manager = getConnectionManager()
            const dbPath = join(testDir, 'manager-test.db')

            const result1 = await manager.getConnection('test', {
                type: 'sqlite',
                filename: dbPath,
            })

            expect(result1.ok).toBe(true)

            // 第二次获取应该返回相同连接
            const result2 = await manager.getConnection('test', {
                type: 'sqlite',
                filename: dbPath,
            })

            expect(result2.ok).toBe(true)

            if (result1.ok && result2.ok) {
                expect(result1.value).toBe(result2.value)
            }
        })

        it('should close specific connection', async () => {
            const manager = getConnectionManager()
            const dbPath = join(testDir, 'close-test.db')

            await manager.getConnection('toclose', {
                type: 'sqlite',
                filename: dbPath,
            })

            expect(manager.getConnectionNames()).toContain('toclose')

            await manager.closeConnection('toclose')

            expect(manager.getConnectionNames()).not.toContain('toclose')
        })

        it('should close all connections', async () => {
            const manager = getConnectionManager()

            await manager.getConnection('conn1', {
                type: 'sqlite',
                filename: join(testDir, 'db1.db'),
            })

            await manager.getConnection('conn2', {
                type: 'sqlite',
                filename: join(testDir, 'db2.db'),
            })

            expect(manager.getConnectionNames().length).toBe(2)

            await manager.closeAll()

            expect(manager.getConnectionNames().length).toBe(0)
        })

        it('should reset instance', async () => {
            const instance1 = ConnectionManager.getInstance()

            await instance1.getConnection('test', {
                type: 'sqlite',
                filename: join(testDir, 'reset-test.db'),
            })

            ConnectionManager.resetInstance()

            const instance2 = ConnectionManager.getInstance()

            expect(instance1).not.toBe(instance2)
            expect(instance2.getConnectionNames().length).toBe(0)
        })
    })
})
