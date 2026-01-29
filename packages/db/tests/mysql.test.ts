/**
 * =============================================================================
 * @hai/db - MySQL 容器化测试
 * =============================================================================
 *
 * 使用 testcontainers 进行 MySQL 集成测试。
 * 测试需要 Docker 环境。
 *
 * 运行方式：
 *   pnpm test:container
 *
 * =============================================================================
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers'
import { db } from '../src/index.js'
import {
    type DbTestConfig,
    runDdlTests,
    runAsyncTxTests,
    runSyncUnsupportedTests,
    runErrorTests,
} from './db-test-shared.js'

async function waitForMysqlReady(timeoutMs = 30_000, intervalMs = 500): Promise<void> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
        const ping = await db.txAsync(async (tx) => {
            await tx.query('SELECT 1')
            return true
        })

        if (ping.success) {
            return
        }

        await new Promise(resolve => setTimeout(resolve, intervalMs))
    }

    throw new Error('等待 MySQL 就绪超时')
}

// =============================================================================
// MySQL 测试配置
// =============================================================================

const mysqlConfig: DbTestConfig = {
    name: 'MySQL',
    type: 'mysql',
    supportSync: false,
    ddlWaitMs: 500,
    tableExistsQuery: (_tableName) => ({
        sql: `SHOW TABLES LIKE ?`,
        expectField: `Tables_in_testdb`,
    }),
}

// =============================================================================
// 测试套件
// =============================================================================

describe('@hai/db - MySQL (容器化测试)', () => {
    let container: StartedTestContainer

    beforeAll(async () => {
        // 启动 MySQL 容器
        container = await new GenericContainer('mysql:8')
            .withEnvironment({
                MYSQL_ROOT_PASSWORD: 'rootpass',
                MYSQL_USER: 'testuser',
                MYSQL_PASSWORD: 'testpass',
                MYSQL_DATABASE: 'testdb',
            })
            .withExposedPorts(3306)
            .withWaitStrategy(Wait.forLogMessage('ready for connections'))
            .start()

        const host = container.getHost()
        const port = container.getMappedPort(3306)

        // 等待 MySQL 完全就绪
        await new Promise((resolve) => setTimeout(resolve, 5000))

        // 初始化数据库连接
        const result = db.init({
            type: 'mysql',
            host,
            port,
            database: 'testdb',
            user: 'testuser',
            password: 'testpass',
            pool: { max: 5 },
            mysql: { charset: 'utf8mb4' },
            silent: true,
        })

        expect(result.success).toBe(true)

        await waitForMysqlReady()
    }, 120000) // 2 分钟超时

    afterAll(async () => {
        db.close()
        if (container) {
            await container.stop()
        }
    })

    // -------------------------------------------------------------------------
    // 初始化测试
    // -------------------------------------------------------------------------
    describe('初始化', () => {
        it('应该正确初始化', () => {
            expect(db.isInitialized).toBe(true)
            expect(db.config?.type).toBe('mysql')
        })
    })

    // -------------------------------------------------------------------------
    // 共享测试
    // -------------------------------------------------------------------------
    runDdlTests(mysqlConfig)
    runAsyncTxTests(mysqlConfig)
    runSyncUnsupportedTests()
    runErrorTests(mysqlConfig)
})
