/**
 * =============================================================================
 * @hai/db - SQLite 单元测试
 * =============================================================================
 *
 * SQLite 数据库功能测试，使用内存数据库进行快速测试。
 * SQLite 支持同步和异步两种操作模式。
 *
 * 运行方式：
 *   pnpm test
 *
 * =============================================================================
 */

import type { DbTestConfig } from './db-test-shared.js'
import { createRequire } from 'node:module'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, DbErrorCode } from '../src/index.js'
import {

  runAsyncTxTests,
  runDdlTests,
  runErrorTests,
  runSyncSqlTests,
  runSyncTxTests,
} from './db-test-shared.js'

const require = createRequire(import.meta.url)

let sqliteNativeAvailable = true
try {
  // 仅用于判断 native 依赖是否可用；创建一次实例可提前暴露二进制不兼容问题
  const BetterSqlite3 = require('better-sqlite3') as unknown
  if (typeof BetterSqlite3 !== 'function') {
    sqliteNativeAvailable = false
  }
  else {
    const tmpDb = new (BetterSqlite3 as new (path: string, options?: Record<string, unknown>) => { close: () => void })(
      ':memory:',
      {},
    )
    tmpDb.close()
  }
}
catch {
  sqliteNativeAvailable = false
}

// =============================================================================
// SQLite 测试配置
// =============================================================================

const sqliteConfig: DbTestConfig = {
  name: 'SQLite',
  type: 'sqlite',
  supportSync: true,
  ddlWaitMs: 0,
  tableExistsQuery: _tableName => ({
    sql: 'SELECT name FROM sqlite_master WHERE type=\'table\' AND name=?',
    expectField: 'name',
  }),
}

// =============================================================================
// 测试套件
// =============================================================================

// Node 版本或本地环境不兼容时跳过（避免整个测试套件失败）
const sqliteDescribe = sqliteNativeAvailable ? describe : describe.skip

sqliteDescribe('@hai/db - SQLite', () => {
  beforeAll(() => {
    const result = db.init({
      type: 'sqlite',
      database: ':memory:',
      silent: true,
    })
    if (!result.success) {
      throw new Error(`初始化 SQLite 失败: ${result.error.message}`)
    }
  })

  afterAll(() => {
    db.close()
  })

  // -------------------------------------------------------------------------
  // 初始化测试
  // -------------------------------------------------------------------------
  describe('初始化', () => {
    it('应该正确初始化', () => {
      expect(db.isInitialized).toBe(true)
      expect(db.config?.type).toBe('sqlite')
    })
  })

  // -------------------------------------------------------------------------
  // 共享测试
  // -------------------------------------------------------------------------
  runDdlTests(sqliteConfig)
  runSyncSqlTests()
  runSyncTxTests()
  runAsyncTxTests(sqliteConfig)
  runErrorTests(sqliteConfig)
})

// =============================================================================
// 未初始化状态测试
// =============================================================================

describe('@hai/db - 未初始化', () => {
  it('未初始化时操作应该返回错误', () => {
    db.close()

    const result = db.sql.query('SELECT 1')
    expect(result.success).toBe(false)
    if (result.success) {
      throw new Error('期望未初始化时返回失败结果')
    }
    expect(result.error.code).toBe(DbErrorCode.NOT_INITIALIZED)

    const ddlResult = db.ddl.createTable('test', { id: { type: 'INTEGER' } })
    expect(ddlResult.success).toBe(false)
    if (ddlResult.success) {
      throw new Error('期望未初始化时返回失败结果')
    }
    expect(ddlResult.error.code).toBe(DbErrorCode.NOT_INITIALIZED)

    const txResult = db.tx(() => 'test')
    expect(txResult.success).toBe(false)
    if (txResult.success) {
      throw new Error('期望未初始化时返回失败结果')
    }
    expect(txResult.error.code).toBe(DbErrorCode.NOT_INITIALIZED)
  })
})
