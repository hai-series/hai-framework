import { setImmediate } from 'node:timers/promises'
import { reldb } from '@h-ai/reldb'
import { afterEach, expect, it, vi } from 'vitest'
import { scheduler } from '../src/index.js'

afterEach(async () => {
  vi.restoreAllMocks()
  await scheduler.close()
  await reldb.close()
})

function latch() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

it('合法写入与持久快照交错时，刷新和其他注册均成功且定义完整', async () => {
  expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
  expect((await scheduler.init()).success).toBe(true)
  const inserted = latch()
  const releaseInsert = latch()
  const releaseRead = latch()
  const execute = reldb.sql.execute.bind(reldb.sql)
  const query = reldb.sql.query.bind(reldb.sql)
  let blockRead = false
  vi.spyOn(reldb.sql, 'execute').mockImplementation(async (sql, params) => {
    const result = await execute(sql, params)
    if (/^INSERT/i.test(sql) && sql.includes('hai_scheduler_tasks') && params?.includes('first')) {
      inserted.release()
      await releaseInsert.promise
    }
    return result
  })
  vi.spyOn(reldb.sql, 'query').mockImplementation(async (sql, params) => {
    const result = await query(sql, params)
    if (blockRead && /^SELECT/i.test(sql) && sql.includes('hai_scheduler_tasks')) {
      blockRead = false
      await releaseRead.promise
    }
    return result
  })
  const first = scheduler.register({ id: 'first', name: 'First', cron: '0 0 1 1 *' })
  const pending: Promise<unknown>[] = [first]
  try {
    await inserted.promise
    blockRead = true
    const refresh = scheduler.refreshTasks()
    const second = scheduler.register({ id: 'second', name: 'Second', cron: '0 0 1 1 *' })
    pending.push(refresh, second)
    await setImmediate()
    releaseInsert.release()
    expect((await first).success).toBe(true)
    releaseRead.release()
    expect((await refresh).success).toBe(true)
    expect((await second).success).toBe(true)
    expect((await scheduler.refreshTasks()).success).toBe(true)
    expect([...scheduler.tasks.keys()].sort()).toEqual(['first', 'second'])
    expect(await reldb.sql.get('SELECT COUNT(*) AS count FROM hai_scheduler_tasks')).toMatchObject({ success: true, data: { count: 2 } })
  }
  finally {
    releaseInsert.release()
    releaseRead.release()
    await Promise.allSettled(pending)
  }
})

it('close 排空已经开始的定义写入，返回后任务投影为空且重新初始化不受旧代次污染', async () => {
  await reldb.init({ type: 'sqlite', database: ':memory:' })
  await scheduler.init()
  const inserted = latch()
  const release = latch()
  const execute = reldb.sql.execute.bind(reldb.sql)
  vi.spyOn(reldb.sql, 'execute').mockImplementation(async (sql, params) => {
    const result = await execute(sql, params)
    if (/^INSERT/i.test(sql) && sql.includes('hai_scheduler_tasks') && params?.includes('closing')) {
      inserted.release()
      await release.promise
    }
    return result
  })
  const registering = scheduler.register({ id: 'closing', name: 'Closing', cron: '0 0 1 1 *' })
  let closing: Promise<void> | undefined
  try {
    await inserted.promise
    let returned = false
    closing = scheduler.close().then(() => {
      returned = true
    })
    await setImmediate()
    expect(returned).toBe(false)
    expect((await scheduler.register({ id: 'rejected', name: 'Rejected', cron: '0 0 1 1 *' })).success).toBe(false)
    release.release()
    expect((await registering).success).toBe(true)
    await closing
    expect(scheduler.tasks.size).toBe(0)
    expect((await scheduler.init()).success).toBe(true)
    expect([...scheduler.tasks.keys()]).toEqual(['closing'])
  }
  finally {
    release.release()
    await registering
    await closing
  }
})

it('close 可结束只读等待并取消尚未写入的注册，迟到快照不会写入或污染新生命周期', async () => {
  expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
  expect((await scheduler.init()).success).toBe(true)
  const entered = latch()
  const release = latch()
  const query = reldb.sql.query.bind(reldb.sql)
  vi.spyOn(reldb.sql, 'query').mockImplementationOnce(async (sql, params) => {
    const snapshot = await query(sql, params)
    entered.release()
    await release.promise
    return snapshot
  })
  const registering = scheduler.register({ id: 'cancelled', name: 'Cancelled', cron: '0 0 1 1 *' })
  try {
    await entered.promise
    await scheduler.close()
    expect((await registering).success).toBe(false)
    expect((await scheduler.init()).success).toBe(true)
    release.release()
    await setImmediate()
    expect(scheduler.tasks.size).toBe(0)
    expect(await reldb.sql.get('SELECT COUNT(*) AS count FROM hai_scheduler_tasks')).toMatchObject({ success: true, data: { count: 0 } })
  }
  finally {
    release.release()
    await registering
  }
})
