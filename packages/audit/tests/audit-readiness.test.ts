/** 慢DDL、失败DDL与close竞态必须经过同一仓库就绪屏障。 */
import { err } from '@h-ai/core'
import { HaiReldbError, reldb } from '@h-ai/reldb'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AuditLogRepository } from '../src/audit-repository-log.js'
import { audit, migrateAudit } from '../src/index.js'

beforeEach(async () => {
  expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
  expect((await reldb.ddl.createTable('hai_iam_users', { id: { type: 'TEXT', primaryKey: true }, username: { type: 'TEXT' } }, true)).success).toBe(true)
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
  expect(await reldb.sql.get('SELECT COUNT(*) AS count FROM hai_audit_logs')).toMatchObject({ success: true, data: { count: 1 } })
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
  // 内部仓库夹具先准备模块元数据，审计表本身仍由下方受门闩控制的基类创建。
  expect((await migrateAudit()).success).toBe(true)
  const release = delayDdl()
  const repo = new AuditLogRepository({ userTable: 'hai_iam_users', userIdColumn: 'id', userNameColumn: 'username' })
  let finished = 0
  const tasks = [repo.listWithUser(), repo.cleanupOld(), repo.getStats()].map(p => p.then((result) => {
    finished++
    return result
  }))
  await Promise.resolve()
  expect(finished).toBe(0)
  release()
  expect((await Promise.all(tasks)).every(result => result.success)).toBe(true)
})

it('建表失败init明确失败且可重试，失败候选不变成已初始化', async () => {
  const spy = vi.spyOn(reldb.ddl, 'createTable').mockResolvedValueOnce(err(HaiReldbError.DDL_FAILED, 'Injected DDL failure'))
  expect((await audit.init()).success).toBe(false)
  expect(audit.isInitialized).toBe(false)
  spy.mockRestore()
  expect((await audit.init()).success).toBe(true)
  expect((await audit.log({ action: 'create', resource: 'test' })).success).toBe(true)
})

it('close使在途初始化失效，迟到DDL不能重新发布仓库', async () => {
  const release = delayDdl()
  const pending = audit.init()
  await Promise.resolve()
  expect((await audit.close()).success).toBe(true)
  release()
  expect((await pending).success).toBe(false)
  expect(audit.isInitialized).toBe(false)
  expect((await audit.init()).success).toBe(true)
})
