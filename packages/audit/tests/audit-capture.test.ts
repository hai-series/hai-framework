/** 自动采集的启停不影响应用显式记录，读取采集可以单独启用。 */
import { reldb } from '@h-ai/reldb'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { defineDbSuite, mysqlEnv, postgresEnv, sqliteMemoryEnv } from '../../reldb/tests/helpers/reldb-test-suite.js'
import { audit, HaiAuditError } from '../src/index.js'

function tests() {
  beforeEach(async () => {
    for (const table of ['hai_audit_logs', 'hai_audit_policy', 'hai_schema_migrations', 'hai_iam_users'])
      expect((await reldb.ddl.dropTable(table, true)).success).toBe(true)
    expect((await reldb.ddl.createTable('hai_iam_users', { id: { type: 'TEXT', primaryKey: true }, username: { type: 'TEXT' } })).success).toBe(true)
  })

  afterEach(async () => {
    await audit.close()
  })

  it('未初始化采集明确失败，已初始化后关闭自动采集可跳过且显式 log 仍然持久化', async () => {
    expect(await audit.capture({ action: 'optional', resource: 'orders' })).toMatchObject({ success: false, error: { code: HaiAuditError.NOT_INITIALIZED.code } })
    expect((await audit.init({ capture: { enabled: false } })).success).toBe(true)
    expect((await audit.capture({ action: 'skipped', resource: 'orders' })).success).toBe(true)
    expect((await audit.log({ action: 'explicit', resource: 'orders' })).success).toBe(true)
    expect(await audit.list()).toMatchObject({ success: true, data: { total: 1, items: [{ action: 'explicit' }] } })
  })

  it('默认跳过成功读取，失败读取保留，开启读取采集后记录成功读取', async () => {
    expect((await audit.init()).success).toBe(true)
    expect((await audit.capture({ action: 'read', resource: 'orders' }, { read: true })).success).toBe(true)
    expect((await audit.capture({ action: 'read-denied', resource: 'orders', outcome: 'denied' }, { read: true })).success).toBe(true)
    expect(await audit.list()).toMatchObject({ success: true, data: { total: 1, items: [{ action: 'read-denied' }] } })
    expect((await audit.init({ capture: { includeReads: true } })).success).toBe(true)
    expect((await audit.capture({ action: 'read-enabled', resource: 'orders' }, { read: true })).success).toBe(true)
    expect(await audit.list()).toMatchObject({ success: true, data: { total: 2 } })
  })

  it('外部事务提交或回滚同时决定变更事件，回滚不留下成功记录', async () => {
    expect((await audit.init()).success).toBe(true)
    for (const commit of [false, true]) {
      const opened = await reldb.tx.begin()
      if (!opened.success)
        throw new Error(opened.error.message)
      let finished = false
      try {
        expect((await audit.capture({ action: 'transaction.changed', resource: 'orders' }, { tx: opened.data })).success).toBe(true)
        if (commit) {
          expect((await opened.data.commit()).success).toBe(true)
          finished = true
        }
      }
      finally {
        if (!finished)
          await opened.data.rollback()
      }
    }
    expect(await audit.list()).toMatchObject({ success: true, data: { total: 1 } })
  })
}
defineDbSuite('audit capture SQLite', sqliteMemoryEnv, tests)
defineDbSuite('audit capture PostgreSQL', postgresEnv, tests)
defineDbSuite('audit capture MySQL', mysqlEnv, tests)
