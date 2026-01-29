/**
 * =============================================================================
 * @hai/db - 共享测试模块（契约化精简版）
 * =============================================================================
 *
 * 核心契约测试：验证所有 DB Provider 必须满足的行为一致性。
 * 各数据库测试文件只需提供初始化/清理逻辑并调用共享测试。
 *
 * =============================================================================
 */

import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { db, DbErrorCode } from '../src/index.js'

// =============================================================================
// 类型与辅助
// =============================================================================

type TestResult<T, E> = { success: true, data: T } | { success: false, error: E }

function unwrapOk<T, E>(result: TestResult<T, E>): T {
  if (!result.success) {
    const msg = typeof result.error === 'object' && result.error !== null && 'message' in result.error
      ? String((result.error as { message?: unknown }).message)
      : String(result.error)
    throw new Error(`期望成功但失败: ${msg}`)
  }
  return result.data
}

function unwrapErr<T, E>(result: TestResult<T, E>): E {
  if (result.success)
    throw new Error('期望失败但成功')
  return result.error
}

export interface DbTestConfig {
  name: string
  type: 'sqlite' | 'postgresql' | 'mysql'
  supportSync: boolean
  ddlWaitMs?: number
  tableExistsQuery: (tableName: string) => { sql: string, expectField: string }
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

async function waitForTable(config: DbTestConfig, table: string, exists: boolean, timeout = 8000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const found = await verifyTable(config, table)
    if (found === exists)
      return true
    await delay(100)
  }
  return false
}

async function verifyTable(config: DbTestConfig, table: string): Promise<boolean> {
  const q = config.tableExistsQuery(table)
  if (config.supportSync) {
    const r = db.sql.query<Record<string, unknown>>(q.sql, [table])
    return unwrapOk(r).length > 0
  }
  const r = await db.txAsync(async tx => tx.query<Record<string, unknown>>(q.sql, [table]))
  return unwrapOk(r).length > 0
}

// =============================================================================
// 契约测试：DDL
// =============================================================================

export function runDdlTests(config: DbTestConfig) {
  const wait = config.ddlWaitMs ?? 0
  const timeout = config.supportSync ? undefined : 15000

  describe('DDL 契约', () => {
    beforeEach(async () => {
      db.ddl.dropTable('test_ddl', true)
      if (!config.supportSync)
        await waitForTable(config, 'test_ddl', false)
      else if (wait)
        await delay(wait)
    })

    it('createTable/dropTable', async () => {
      const r = db.ddl.createTable('test_ddl', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        name: { type: 'TEXT', notNull: true },
      })
      expect(r.success).toBe(true)
      if (!config.supportSync)
        expect(await waitForTable(config, 'test_ddl', true)).toBe(true)
      else expect(await verifyTable(config, 'test_ddl')).toBe(true)

      const d = db.ddl.dropTable('test_ddl')
      expect(d.success).toBe(true)
      if (!config.supportSync)
        expect(await waitForTable(config, 'test_ddl', false)).toBe(true)
    }, timeout)

    it('createIndex (unique)', async () => {
      db.ddl.createTable('test_ddl', {
        id: { type: 'INTEGER', primaryKey: true },
        email: { type: 'TEXT' },
      })
      if (!config.supportSync)
        await waitForTable(config, 'test_ddl', true)
      else if (wait)
        await delay(wait)

      const r = db.ddl.createIndex('test_ddl', 'idx_email', { columns: ['email'], unique: true })
      expect(r.success).toBe(true)
    }, timeout)
  })
}

// =============================================================================
// 契约测试：异步事务（所有 DB）
// =============================================================================

export function runAsyncTxTests(config: DbTestConfig) {
  const wait = config.ddlWaitMs ?? 0

  describe('txAsync 契约', () => {
    beforeAll(async () => {
      db.ddl.dropTable('test_tx', true)
      if (wait)
        await delay(wait)
      db.ddl.createTable('test_tx', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        name: { type: 'TEXT', notNull: true },
        balance: { type: 'INTEGER', defaultValue: 0 },
      })
      if (wait)
        await delay(wait)
    })

    beforeEach(async () => {
      await db.txAsync(async (tx) => {
        await tx.execute('DELETE FROM test_tx')
      })
    })

    it('CRUD 基础', async () => {
      const r = await db.txAsync(async (tx) => {
        await tx.execute('INSERT INTO test_tx (name, balance) VALUES (?, ?)', ['A', 100])
        await tx.execute('INSERT INTO test_tx (name, balance) VALUES (?, ?)', ['B', 200])
        return tx.query<{ name: string }>('SELECT name FROM test_tx ORDER BY id')
      })
      const data = unwrapOk(r)
      expect(data.length).toBe(2)
      expect(data[0].name).toBe('A')
    })

    it('get 返回单行或 null', async () => {
      await db.txAsync(async (tx) => {
        await tx.execute('INSERT INTO test_tx (name) VALUES (?)', ['X'])
      })
      const r1 = await db.txAsync(async tx => tx.get<{ name: string }>('SELECT * FROM test_tx WHERE name = ?', ['X']))
      expect(unwrapOk(r1)?.name).toBe('X')
      const r2 = await db.txAsync(async tx => tx.get('SELECT * FROM test_tx WHERE name = ?', ['不存在']))
      expect(unwrapOk(r2)).toBeNull()
    })

    it('事务回滚', async () => {
      await db.txAsync(async (tx) => {
        await tx.execute('INSERT INTO test_tx (name, balance) VALUES (?, ?)', ['Z', 500])
      })
      const fail = await db.txAsync(async (tx) => {
        await tx.execute('UPDATE test_tx SET balance = ? WHERE name = ?', [0, 'Z'])
        throw new Error('rollback')
      })
      expect(fail.success).toBe(false)
      const check = await db.txAsync(async tx => tx.get<{ balance: number }>('SELECT balance FROM test_tx WHERE name = ?', ['Z']))
      expect(unwrapOk(check)?.balance).toBe(500)
    })
  })
}

// =============================================================================
// 契约测试：同步 SQL（仅 SQLite）
// =============================================================================

export function runSyncSqlTests() {
  describe('同步 SQL 契约 (SQLite)', () => {
    beforeAll(() => {
      db.ddl.dropTable('test_sync', true)
      db.ddl.createTable('test_sync', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        name: { type: 'TEXT' },
      })
    })
    beforeEach(() => {
      db.sql.execute('DELETE FROM test_sync')
    })

    it('execute/query/get', () => {
      const ins = db.sql.execute('INSERT INTO test_sync (name) VALUES (?)', ['foo'])
      expect(unwrapOk(ins).changes).toBe(1)
      const all = db.sql.query<{ name: string }>('SELECT * FROM test_sync')
      expect(unwrapOk(all).length).toBe(1)
      const one = db.sql.get<{ name: string }>('SELECT * FROM test_sync WHERE name = ?', ['foo'])
      expect(unwrapOk(one)?.name).toBe('foo')
    })
  })
}

// =============================================================================
// 契约测试：同步事务（仅 SQLite）
// =============================================================================

export function runSyncTxTests() {
  describe('同步事务契约 (SQLite)', () => {
    beforeAll(() => {
      db.ddl.dropTable('test_stx', true)
      db.ddl.createTable('test_stx', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        val: { type: 'INTEGER', defaultValue: 0 },
      })
    })
    beforeEach(() => {
      db.sql.execute('DELETE FROM test_stx')
    })

    it('tx 成功提交', () => {
      const r = db.tx((tx) => {
        tx.execute('INSERT INTO test_stx (val) VALUES (?)', [10])
        return tx.get<{ val: number }>('SELECT val FROM test_stx')?.val
      })
      expect(unwrapOk(r)).toBe(10)
    })

    it('tx 失败回滚', () => {
      db.sql.execute('INSERT INTO test_stx (val) VALUES (?)', [100])
      const r = db.tx(() => {
        throw new Error('fail')
      })
      expect(r.success).toBe(false)
      expect(unwrapOk(db.sql.get<{ val: number }>('SELECT val FROM test_stx'))?.val).toBe(100)
    })
  })
}

// =============================================================================
// 契约测试：同步不支持（PostgreSQL/MySQL）
// =============================================================================

export function runSyncUnsupportedTests() {
  describe('同步操作应返回 UNSUPPORTED_TYPE', () => {
    it('sql.query/execute/tx', () => {
      expect(unwrapErr(db.sql.query('SELECT 1')).code).toBe(DbErrorCode.UNSUPPORTED_TYPE)
      expect(unwrapErr(db.sql.execute('SELECT 1')).code).toBe(DbErrorCode.UNSUPPORTED_TYPE)
      expect(unwrapErr(db.tx(() => 1)).code).toBe(DbErrorCode.UNSUPPORTED_TYPE)
    })
  })
}

// =============================================================================
// 契约测试：错误处理
// =============================================================================

export function runErrorTests(config?: DbTestConfig) {
  describe('错误处理契约', () => {
    it('SQL 语法错误', async () => {
      const r = await db.txAsync(async (tx) => {
        await tx.query('INVALID SQL')
      })
      expect(r.success).toBe(false)
    })

    it('DDL 错误', async () => {
      if (config?.supportSync ?? db.config?.type === 'sqlite') {
        const r = db.ddl.raw('CREATE TABL x')
        expect(unwrapErr(r).code).toBe(DbErrorCode.DDL_FAILED)
      }
      else {
        const r = await db.txAsync(async (tx) => {
          await tx.execute('CREATE TABL x')
        })
        expect(r.success).toBe(false)
      }
    })
  })
}
