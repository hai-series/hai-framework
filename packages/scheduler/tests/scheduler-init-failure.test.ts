import { reldb } from '@h-ai/reldb'
import { afterEach, describe, expect, it } from 'vitest'
import { HaiSchedulerError, scheduler } from '../src/index.js'
import './helpers/sqlite-lifecycle.js'

describe('scheduler initialization failure', () => {
  afterEach(async () => {
    await scheduler.close()
    await reldb.close()
  })

  it.each([
    { id: '', name: 'empty', cron: '* * * * *' },
    { id: 'invalid', name: 'invalid', cron: 'invalid cron' },
    { id: 'seconds', name: 'seconds', cron: '15 * * * * *' },
    {
      id: 'timezone',
      name: 'timezone',
      cron: '* * * * *',
      timezone: 'Invalid/Timezone',
    },
    { id: 'valid', name: 'duplicate', cron: '* * * * *' },
  ])('rejects invalid task $name without retaining earlier tasks', async (invalid) => {
    const result = await scheduler.init({
      enableDb: true,
      tasks: [
        { id: 'valid', name: 'valid', cron: '* * * * *' },
        invalid,
      ],
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

  it('rejects an invalid timezone on update and when loading stored tasks', async () => {
    const id = 'timezone'
    expect((await scheduler.init()).success).toBe(true)
    expect((await scheduler.register({
      id,
      name: id,
      cron: '* * * * *',
      timezone: 'UTC',
    })).success).toBe(true)
    expect(await scheduler.updateTask(id, { timezone: 'Invalid/Timezone' })).toMatchObject({
      success: false,
      error: { code: HaiSchedulerError.INVALID_CRON.code },
    })
    expect(scheduler.tasks.get(id)?.timezone).toBe('UTC')
    await scheduler.close()
    expect((await reldb.sql.execute('UPDATE hai_scheduler_tasks SET timezone = ? WHERE task_id = ?', ['Invalid/Timezone', id])).success).toBe(true)
    expect(await scheduler.init()).toMatchObject({
      success: false,
      error: { code: HaiSchedulerError.INVALID_CRON.code },
    })
    expect(scheduler.isInitialized).toBe(false)
  })

  it('rejects timing values outside the Node timer range', async () => {
    const overflow = 2_147_483_648
    expect(await scheduler.init({ tickInterval: overflow })).toMatchObject({
      success: false,
      error: { code: HaiSchedulerError.CONFIG_ERROR.code },
    })
    expect((await scheduler.init()).success).toBe(true)
    const task = { id: 'timer', name: 'Timer', cron: '* * * * *' }
    expect(await scheduler.register({
      ...task,
      retry: {
        maxAttempts: 2,
        backoffMs: [overflow],
      },
    })).toMatchObject({
      success: false,
      error: { code: HaiSchedulerError.EXECUTION_FAILED.code },
    })
    expect(await scheduler.register({
      ...task,
      handler: { kind: 'api', url: 'https://example.test', timeout: overflow },
    })).toMatchObject({
      success: false,
      error: { code: HaiSchedulerError.CONFIG_ERROR.code },
    })
    expect(await scheduler.register({
      ...task,
      handler: { kind: 'js', code: '() => null', timeout: overflow },
    })).toMatchObject({
      success: false,
      error: { code: HaiSchedulerError.CONFIG_ERROR.code },
    })
  })

  it('stays closed when close interrupts initialization and can initialize again', async () => {
    const task = { id: 'race', name: 'Race', cron: '* * * * *' }
    const initializing = scheduler.init({
      tasks: [task],
    })
    await scheduler.close()
    expect(await initializing).toMatchObject({
      success: false,
      error: { code: HaiSchedulerError.INIT_FAILED.code },
    })
    expect(scheduler.isInitialized).toBe(false)
    expect(scheduler.tasks.size).toBe(0)
    expect((await scheduler.init({
      tasks: [task],
      hooks: {
        onTaskExecute: () => 'ready',
      },
    })).success).toBe(true)
    expect(await scheduler.trigger(task.id)).toMatchObject({
      success: true,
      data: { status: 'success' },
    })
  })
})
