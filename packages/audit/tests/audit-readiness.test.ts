/** 慢DDL、失败DDL与close竞态必须经过同一仓库就绪屏障。 */
import { err } from '@h-ai/core'
import { HaiReldbError, reldb } from '@h-ai/reldb'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AuditLogRepository } from '../src/audit-repository-log.js'
import { audit } from '../src/index.js'

beforeEach(async () => {
  expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
  expect((await reldb.ddl.createTable('hai_iam_users', { id: { type: 'TEXT', primaryKey: true }, username: { type: 'TEXT' } }, true)).success).toBe(true)
})
afterEach(async () => {
  vi.restoreAllMocks()
  await audit.close()
  await reldb.close()
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
