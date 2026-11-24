import type { SchedulerTaskExecuteEvent, SchedulerTaskFinishEvent } from '../src/index.js'
import { afterEach, expect, it, vi } from 'vitest'
import { HaiSchedulerError, scheduler } from '../src/index.js'
import './helpers/sqlite-lifecycle.js'

afterEach(async () => {
  await scheduler.close()
})

it('treats failed hooks as retryable failures and retains unsuccessful one-time tasks', async () => {
  const execute = vi.fn(async () => {
    throw new Error('temporary failure')
  })
  expect((await scheduler.init({ enableDb: true })).success).toBe(true)
  scheduler.setHooks({ onTaskExecute: execute })
  await scheduler.register({
    id: 'retry',
    name: 'Retry',
    cron: '* * * * *',
    enabled: true,
    deleteAfterRun: true,
    idempotent: true,
    retry: { maxAttempts: 3 },
  })
  expect(await scheduler.trigger('retry')).toMatchObject({
    success: true,
    data: { status: 'failed' },
  })
  expect(execute).toHaveBeenCalledTimes(3)
  expect(scheduler.tasks.has('retry')).toBe(true)
})

it('keeps one occurrence across retries and deletes a one-time task only after success', async () => {
  const occurrences: Array<string | undefined> = []
  const execute = vi.fn(async (event: SchedulerTaskExecuteEvent) => {
    occurrences.push(event.context.occurrenceId)
    if (occurrences.length < 3)
      throw new Error('Transient failure')
    return { completed: true }
  })
  await scheduler.init({
    enableDb: true,
    hooks: { onTaskExecute: execute },
  })
  await scheduler.register({
    id: 'retry-success',
    name: 'Retry',
    cron: '* * * * *',
    deleteAfterRun: true,
    idempotent: true,
    retry: { maxAttempts: 3 },
  })
  expect(await scheduler.trigger('retry-success')).toMatchObject({
    success: true,
    data: { status: 'success' },
  })
  expect(occurrences).toHaveLength(3)
  expect(occurrences[0]).toMatch(/^[a-f\d]{64}$/u)
  expect(new Set(occurrences).size).toBe(1)
  expect(scheduler.tasks.has('retry-success')).toBe(false)
})

it('does not let a finish observer change a failed outcome or release its task slot', async () => {
  const execute = vi.fn(() => {
    throw new Error('Outcome requires review')
  })
  const observe = vi.fn(({ log }: SchedulerTaskFinishEvent) => {
    Reflect.set(log, 'status', 'success')
  })
  expect((await scheduler.init({
    hooks: { onTaskExecute: execute, onTaskFinish: observe },
  })).success).toBe(true)
  expect((await scheduler.register({ id: 'frozen', name: 'Frozen', cron: '* * * * *' })).success).toBe(true)
  const options = { idempotencyKey: 'original-key' }
  const first = await scheduler.trigger('frozen', options)
  expect(first).toMatchObject({
    success: true,
    data: {
      status: 'unknown',
      persistence: { status: 'persisted' },
    },
  })
  expect(await scheduler.trigger('frozen', options)).toEqual(first)
  expect(await scheduler.trigger('frozen', { idempotencyKey: 'another-key' })).toMatchObject({
    success: true,
    data: { status: 'interrupted' },
  })
  expect(execute).toHaveBeenCalledOnce()
  expect(observe).toHaveBeenCalledOnce()
})

it.each([false, true])('one-time task is consumed across restart and its keyed receipt remains replayable (init task=%s)', async (fromConfig) => {
  const task = {
    id: 'one-time',
    name: 'One-time',
    cron: '* * * * *',
    deleteAfterRun: true,
  }
  const execute = vi.fn(() => 'done')
  const config = {
    tasks: fromConfig
      ? [task]
      : [],
    hooks: { onTaskExecute: execute },
  }
  expect((await scheduler.init(config)).success).toBe(true)
  if (!fromConfig)
    expect((await scheduler.register(task)).success).toBe(true)
  const options = { idempotencyKey: 'first' }
  const first = await scheduler.trigger(task.id, options)
  expect(first).toMatchObject({
    success: true,
    data: { status: 'success' },
  })
  expect(scheduler.tasks.has(task.id)).toBe(false)
  await scheduler.close()
  expect((await scheduler.init(config)).success).toBe(true)
  expect(scheduler.tasks.has(task.id)).toBe(false)
  expect(await scheduler.trigger(task.id, options)).toEqual(first)
  expect(await scheduler.trigger(task.id, { idempotencyKey: 'second' })).toMatchObject({
    success: false,
    error: { code: HaiSchedulerError.TASK_NOT_FOUND.code },
  })
  expect(execute).toHaveBeenCalledOnce()
})
