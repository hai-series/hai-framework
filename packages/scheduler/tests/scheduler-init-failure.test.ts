import { reldb } from '@h-ai/reldb'
import { afterEach, describe, expect, it } from 'vitest'
import { scheduler } from '../src/index.js'
import './helpers/sqlite-lifecycle.js'

describe('scheduler initialization failure', () => {
  afterEach(async () => {
    await scheduler.close()
    await reldb.close()
  })

  it.each([
    { id: '', name: 'empty', cron: '* * * * *' },
    { id: 'invalid', name: 'invalid', cron: 'invalid cron' },
    { id: 'valid', name: 'duplicate', cron: '* * * * *' },
  ])('rejects invalid task $name without retaining earlier tasks', async (invalid) => {
    const result = await scheduler.init({
      enableDb: true,
      tasks: [{ id: 'valid', name: 'valid', cron: '* * * * *' }, invalid],
    })
    expect(result.success).toBe(false)
    expect(scheduler.isInitialized).toBe(false)
    expect(scheduler.tasks.size).toBe(0)
    expect(scheduler.start().success).toBe(false)
    expect((await scheduler.init({ enableDb: true })).success).toBe(true)
  })

  it('fails on an unreadable persisted task table and can recover', async () => {
    expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
    expect((await reldb.sql.execute('CREATE TABLE hai_scheduler_tasks (id INTEGER PRIMARY KEY)')).success).toBe(true)
    const result = await scheduler.init({ enableDb: true })
    expect(result.success).toBe(false)
    expect(scheduler.isInitialized).toBe(false)
    expect(scheduler.tasks.size).toBe(0)
    expect((await reldb.sql.execute('DROP TABLE hai_scheduler_tasks')).success).toBe(true)
    expect((await scheduler.init({ enableDb: true })).success).toBe(true)
  })

  it('rejects corrupt persisted task data', async () => {
    expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
    expect((await scheduler.init({ enableDb: true })).success).toBe(true)
    expect((await scheduler.register({ id: 'corrupt', name: 'corrupt', cron: '* * * * *' })).success).toBe(true)
    await scheduler.close()
    expect((await reldb.sql.execute('UPDATE hai_scheduler_tasks SET params = ?', ['[]'])).success).toBe(true)
    expect((await scheduler.init({ enableDb: true })).success).toBe(false)
    expect(scheduler.isInitialized).toBe(false)
    expect(scheduler.tasks.size).toBe(0)
  })
})
