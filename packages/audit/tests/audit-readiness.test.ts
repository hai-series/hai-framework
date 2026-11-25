/** 慢DDL、失败DDL与close竞态必须经过同一仓库就绪屏障。 */
import { core } from '@h-ai/core'
import { HaiReldbError, reldb } from '@h-ai/reldb'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AuditLogRepository } from '../src/audit-repository-log.js'
import { audit, HaiAuditError } from '../src/index.js'

beforeEach(async () => {
  expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
  expect((await reldb.ddl.createTable('hai_iam_users', {
    id: { type: 'TEXT', primaryKey: true },
    username: { type: 'TEXT' },
  }, true)).success).toBe(true)
})
afterEach(async () => {
  vi.restoreAllMocks()
  await audit.close()
  await reldb.close()
})

it('close等待已开始的审计写入，并拒绝关闭后的新写入', async () => {
  expect((await audit.init()).success).toBe(true)
  const execute = reldb.sql.execute.bind(reldb.sql)
  let release!: () => void
  let entered = false
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  vi.spyOn(reldb.sql, 'execute').mockImplementation(async (sql, params) => {
    if (sql.startsWith('INSERT INTO hai_audit_logs')) {
      entered = true
      await gate
    }
    return execute(sql, params)
  })
  const pending = audit.log({ action: 'shutdown-write', resource: 'orders' })
  let closed = false
  let closing: ReturnType<typeof audit.close> | undefined
  try {
    await vi.waitFor(() => expect(entered).toBe(true))
    closing = audit.close().then((result) => {
      closed = true
      return result
    })
    await Promise.resolve()
    await Promise.resolve()
    expect(closed).toBe(false)
    expect((await audit.log({ action: 'late-write', resource: 'orders' })).success).toBe(false)
  }
  finally {
    release()
    expect((await pending).success).toBe(true)
    await closing
  }
  expect(await reldb.sql.get('SELECT COUNT(*) AS count FROM hai_audit_logs')).toMatchObject({
    success: true,
    data: { count: 1 },
  })
  expect((await audit.capture({ action: 'closed-module-capture', resource: 'orders' })).success).toBe(false)
})

/** 可控DDL门闩；底层仍执行真实SQLite建表。 */
function delayDdl() {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const create = reldb.ddl.createTable.bind(reldb.ddl)
  vi.spyOn(reldb.ddl, 'createTable').mockImplementation(async (...args) => {
    await gate
    return create(...args)
  })
  return release
}

it('init在DDL完成前不发布，完成后立即查询可用', async () => {
  const release = delayDdl()
  let done = false
  const pending = audit.init().then((result) => {
    done = true
    return result
  })
  await Promise.resolve()
  expect(done).toBe(false)
  expect(audit.isInitialized).toBe(false)
  expect((await audit.list()).success).toBe(false)
  release()
  expect((await pending).success).toBe(true)
  for (const result of [await audit.list(), await audit.cleanup(), await audit.getStats()]) expect(result.success).toBe(true)
})

it('自定义查询全部等待基类DDL，失败不会提前执行SQL', async () => {
  expect((await audit.init()).success).toBe(true)
  await audit.close()
  expect((await reldb.ddl.dropTable('hai_audit_logs')).success).toBe(true)
  const release = delayDdl()
  const repo = new AuditLogRepository({
    userTable: 'hai_iam_users',
    userIdColumn: 'id',
    userNameColumn: 'username',
    minimumRetentionDays: 0,
  })
  let finished = 0
  const tasks = [
    repo.listWithUser(),
    repo.cleanupOld(),
    repo.getStats(),
  ].map(p => p.then((result) => {
    finished++
    return result
  }))
  await Promise.resolve()
  expect(finished).toBe(0)
  release()
  expect((await Promise.all(tasks)).every(result => result.success)).toBe(true)
})

it('建表失败init明确失败且可重试，失败候选不变成已初始化', async () => {
  const spy = vi.spyOn(reldb.ddl, 'createTable').mockResolvedValueOnce(core.err(HaiReldbError.DDL_FAILED, 'Injected DDL failure'))
  expect((await audit.init()).success).toBe(false)
  expect(audit.isInitialized).toBe(false)
  spy.mockRestore()
  expect((await audit.init()).success).toBe(true)
  expect((await audit.log({ action: 'create', resource: 'test' })).success).toBe(true)
})

it('close使在途初始化失效，迟到DDL不能重新发布仓库', async () => {
  const release = delayDdl()
  const pending = audit.init()
  const closed = vi.fn()
  const closing = audit.close()
  void closing.then(closed)
  try {
    await Promise.resolve()
    expect(closed).not.toHaveBeenCalled()
    expect(audit.close()).toBe(closing)
    expect(await audit.init()).toMatchObject({
      success: false,
      error: { code: HaiAuditError.INIT_IN_PROGRESS.code },
    })
  }
  finally {
    release()
    expect(await pending).toMatchObject({
      success: false,
      error: { code: HaiAuditError.NOT_INITIALIZED.code },
    })
    expect((await closing).success).toBe(true)
  }
  expect(audit.isInitialized).toBe(false)
  expect((await audit.init()).success).toBe(true)
})

it('关闭取消 SQLite 在途的触发器更新并等待回滚', async () => {
  expect((await audit.init({
    retention: { enabled: true, minDays: 90 },
  })).success).toBe(true)
  const updated = Promise.withResolvers<void>()
  const unblock = Promise.withResolvers<void>()
  const begin = reldb.tx.begin.bind(reldb.tx)
  const spy = vi.spyOn(reldb.tx, 'begin').mockImplementation(async () => {
    const opened = await begin()
    if (!opened.success)
      return opened
    const tx = opened.data
    const execute = tx.execute.bind(tx)
    tx.execute = async (sql, params) => {
      const result = await execute(sql, params)
      if (sql.startsWith('CREATE TRIGGER hai_audit_retention_') && sql.includes('_120')) {
        updated.resolve()
        await unblock.promise
      }
      return result
    }
    return opened
  })
  const pending = audit.init({
    retention: { enabled: true, minDays: 120 },
  })
  try {
    await updated.promise
    const closing = audit.close()
    unblock.resolve()
    expect(await pending).toMatchObject({
      success: false,
      error: { code: HaiAuditError.NOT_INITIALIZED.code },
    })
    expect((await closing).success).toBe(true)
    expect(await reldb.sql.query('SELECT name FROM sqlite_master WHERE type=\'trigger\' AND tbl_name=\'hai_audit_logs\' ORDER BY name')).toEqual({
      success: true,
      data: [
        { name: 'hai_audit_retention_delete_90' },
        { name: 'hai_audit_retention_insert_90' },
        { name: 'hai_audit_retention_update_90' },
      ],
    })
  }
  finally {
    unblock.resolve()
    await pending
    spy.mockRestore()
  }
})

it('关闭等待已开始的旧日志清理', async () => {
  expect((await audit.init()).success).toBe(true)
  const event = await audit.log({ action: 'scheduled-cleanup', resource: 'audit' })
  if (!event.success)
    throw new Error(event.error.message)
  expect((await reldb.sql.execute('UPDATE hai_audit_logs SET created_at=? WHERE id=?', [
    event.data.createdAt.getTime() - 2 * 86400000,
    event.data.id,
  ])).success).toBe(true)
  const entered = Promise.withResolvers<void>()
  const unblock = Promise.withResolvers<void>()
  const execute = reldb.sql.execute.bind(reldb.sql)
  const spy = vi.spyOn(reldb.sql, 'execute').mockImplementation(async (sql, params) => {
    if (sql.startsWith('DELETE FROM hai_audit_logs')) {
      entered.resolve()
      await unblock.promise
    }
    return execute(sql, params)
  })
  const pending = audit.cleanup(1)
  try {
    await entered.promise
    const closed = vi.fn()
    const closing = audit.close()
    void closing.then(closed)
    await Promise.resolve()
    expect(closed).not.toHaveBeenCalled()
    unblock.resolve()
    expect(await pending).toEqual({ success: true, data: 1 })
    expect((await closing).success).toBe(true)
  }
  finally {
    unblock.resolve()
    await pending
    spy.mockRestore()
  }
})
