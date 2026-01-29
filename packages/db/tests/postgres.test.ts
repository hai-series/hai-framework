/**
 * =============================================================================
 * @hai/db - PostgreSQL 容器化测试
 * =============================================================================
 *
 * 使用 testcontainers 进行 PostgreSQL 集成测试。
 * 测试需要 Docker 环境。
 *
 * 运行方式：
 *   pnpm test:container
 *
 * =============================================================================
 */

import type { StartedTestContainer } from 'testcontainers'
import type { DbTestConfig } from './db-test-shared.js'
import { GenericContainer } from 'testcontainers'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../src/index.js'
import {

  runAsyncTxTests,
  runDdlTests,
  runErrorTests,
  runSyncUnsupportedTests,
} from './db-test-shared.js'

// =============================================================================
// PostgreSQL 测试配置
// =============================================================================

const postgresConfig: DbTestConfig = {
  name: 'PostgreSQL',
  type: 'postgresql',
  supportSync: false,
  ddlWaitMs: 100,
  tableExistsQuery: _tableName => ({
    sql: 'SELECT tablename FROM pg_tables WHERE schemaname = \'public\' AND tablename = ?',
    expectField: 'tablename',
  }),
}

// =============================================================================
// 测试套件
// =============================================================================

describe('@hai/db - PostgreSQL (容器化测试)', () => {
  let container: StartedTestContainer

  beforeAll(async () => {
    // 启动 PostgreSQL 容器
    container = await new GenericContainer('postgres:alpine')
      .withEnvironment({
        POSTGRES_USER: 'testuser',
        POSTGRES_PASSWORD: 'testpass',
        POSTGRES_DB: 'testdb',
      })
      .withExposedPorts(5432)
      .start()

    const host = container.getHost()
    const port = container.getMappedPort(5432)

    // 初始化数据库连接
    const result = db.init({
      type: 'postgresql',
      host,
      port,
      database: 'testdb',
      user: 'testuser',
      password: 'testpass',
      pool: { max: 5 },
      silent: true,
    })

    expect(result.success).toBe(true)
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
      expect(db.config?.type).toBe('postgresql')
    })
  })

  // -------------------------------------------------------------------------
  // 共享测试
  // -------------------------------------------------------------------------
  runDdlTests(postgresConfig)
  runAsyncTxTests(postgresConfig)
  runSyncUnsupportedTests()
  runErrorTests(postgresConfig)
})
