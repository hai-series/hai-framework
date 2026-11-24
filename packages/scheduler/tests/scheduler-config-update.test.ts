/** 调度定义更新、并发刷新与在途任务收敛的公共 API 回归。 */
import type { SchedulerTaskExecuteEvent } from '../src/index.js'
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { afterEach, expect, it, vi } from 'vitest'
import { scheduler } from '../src/index.js'
import './helpers/sqlite-lifecycle.js'

afterEach(async () => {
  vi.restoreAllMocks()
  await scheduler.close()
  await reldb.close()
  vi.useRealTimers()
})

it('shares a concurrent refresh instead of rejecting another reader of the same snapshot', async () => {
  expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
  expect((await scheduler.init({ enableDb: true })).success).toBe(true)
  const results = await Promise.all([
    scheduler.refreshTasks(),
    scheduler.refreshTasks(),
    scheduler.refreshTasks(),
  ])
  expect(results.every(result => result.success)).toBe(true)
})

it('retains an edited one-time definition after an earlier execution completes', async () => {
  await scheduler.init({
    enableDb: true,
    hooks: {
      onTaskExecute: async (event) => {
        expect((await scheduler.updateTask(event.task.id, {
          name: 'Next definition',
          params: { version: 2 },
        })).success).toBe(true)
        return { completed: true }
      },
    },
  })
  await scheduler.register({
    id: 'edited',
    name: 'Original',
    cron: '* * * * *',
    deleteAfterRun: true,
    params: { version: 1 },
  })
  expect(await scheduler.trigger('edited')).toMatchObject({
    success: true,
    data: { status: 'success' },
  })
  expect(scheduler.tasks.get('edited')).toMatchObject({
    name: 'Next definition',
    params: { version: 2 },
  })
})

it('does not execute a replacement definition under an earlier failed occurrence', async () => {
  const execute = vi.fn(async (event: SchedulerTaskExecuteEvent) => {
    if (execute.mock.calls.length === 1) {
      await scheduler.updateTask(event.task.id, {
        params: { version: 2 },
      })
      throw new Error('Original attempt failed')
    }
    return { completed: true }
  })
  await scheduler.init({
    enableDb: true,
    hooks: { onTaskExecute: execute },
  })
  await scheduler.register({
    id: 'edited',
    name: 'Original',
    cron: '* * * * *',
    idempotent: true,
    retry: { maxAttempts: 2 },
    params: { version: 1 },
  })
  expect(await scheduler.trigger('edited')).toMatchObject({
    success: true,
    data: { status: 'unknown' },
  })
  expect(execute).toHaveBeenCalledOnce()
  expect(scheduler.tasks.get('edited')?.params).toEqual({ version: 2 })
})

it('keeps the old cron when another part of an update fails validation', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-08T12:34:00Z'))
  const execute = vi.fn()
  await scheduler.init({
    enableDb: true,
    tickInterval: 100,
    hooks: { onTaskExecute: execute },
  })
  await scheduler.register({
    id: 'invalid-update',
    name: 'Original',
    cron: '* * * * *',
    timezone: 'UTC',
  })
  expect((await scheduler.updateTask('invalid-update', {
    cron: '0 0 * * *',
    idempotent: true,
    retry: { maxAttempts: 0 },
  })).success).toBe(false)
  scheduler.start()
  await vi.advanceTimersByTimeAsync(100)
  expect(execute).toHaveBeenCalledOnce()
})

it('keeps a definition in memory when persistent deletion fails', async () => {
  await reldb.init({ type: 'sqlite', database: ':memory:' })
  await scheduler.init({ enableDb: true })
  await scheduler.register({ id: 'retained', name: 'Retained', cron: '* * * * *' })
  await reldb.close()
  expect((await scheduler.unregister('retained')).success).toBe(false)
  expect(scheduler.tasks.has('retained')).toBe(true)
})

it.each([false, true])('atomically checks the executed definition at database deletion, concurrent edit=%s', async (edit) => {
  await reldb.init({ type: 'sqlite', database: ':memory:' })
  await scheduler.init({
    enableDb: true,
    hooks: {
      onTaskExecute: async () => ({ completed: true }),
    },
  })
  await scheduler.register({
    id: 'atomic-delete',
    name: 'Original',
    cron: '* * * * *',
    deleteAfterRun: true,
    params: { version: 1 },
  })
  const executeSql = reldb.sql.execute.bind(reldb.sql)
  let changed = false
  vi.spyOn(reldb.sql, 'execute').mockImplementation(async (sql, params) => {
    if (edit && !changed && sql.startsWith('DELETE') && sql.includes('hai_scheduler_tasks')) {
      changed = true
      // 模拟另一节点在最终读取之后、DELETE 之前提交新配置。
      await executeSql('UPDATE hai_scheduler_tasks SET task_name = ? WHERE task_id = ?', ['Replacement', 'atomic-delete'])
    }
    return executeSql(sql, params)
  })
  expect(await scheduler.trigger('atomic-delete')).toMatchObject({
    success: true,
    data: { status: 'success' },
  })
  expect((await scheduler.refreshTasks()).success).toBe(true)
  expect(scheduler.tasks.has('atomic-delete')).toBe(edit)
  if (edit)
    expect(scheduler.tasks.get('atomic-delete')?.name).toBe('Replacement')
})

it.each([false, true])('prevents a second execution when cleanup fails after a one-time success (old journal=%s)', async (legacy) => {
  const task = {
    id: 'cleanup-failed',
    name: 'One-time',
    cron: '* * * * *',
    deleteAfterRun: true,
  }
  const execute = vi.fn(() => 'done')
  const config = {
    hooks: { onTaskExecute: execute },
  }
  expect((await scheduler.init(config)).success).toBe(true)
  expect((await scheduler.register(task)).success).toBe(true)
  const sql = reldb.sql.execute.bind(reldb.sql)
  const failing = vi.spyOn(reldb.sql, 'execute').mockImplementation((statement, params) => statement.startsWith('DELETE FROM hai_scheduler_tasks')
    ? Promise.resolve(core.err('test:delete', 'Definition cleanup delayed'))
    : sql(statement, params))
  expect(await scheduler.trigger(task.id)).toMatchObject({
    success: true,
    data: { status: 'success' },
  })
  expect(scheduler.tasks.has(task.id)).toBe(true)
  if (legacy) {
    expect((await sql('UPDATE hai_scheduler_executions SET snapshot = json_remove(snapshot, ?) WHERE task_id = ?', ['$.definitionRowId', task.id])).success).toBe(true)
  }
  await scheduler.close()
  failing.mockRestore()
  expect((await scheduler.init(config)).success).toBe(true)
  expect(await scheduler.trigger(task.id)).toMatchObject({
    success: true,
    data: { status: 'interrupted' },
  })
  expect(scheduler.tasks.has(task.id)).toBe(false)
  expect(execute).toHaveBeenCalledOnce()
})

it('removes a completed definition even if the handler JSON keys were stored in another order', async () => {
  const id = 'ordered-handler'
  expect((await scheduler.init()).success).toBe(true)
  expect((await scheduler.register({
    id,
    name: 'Ordered handler',
    cron: '* * * * *',
    deleteAfterRun: true,
    handler: { timeout: 1000, code: '() => 42', kind: 'js' },
  })).success).toBe(true)
  expect(await scheduler.trigger(id)).toMatchObject({
    success: true,
    data: { status: 'success', result: '42' },
  })
  expect(scheduler.tasks.has(id)).toBe(false)
})
