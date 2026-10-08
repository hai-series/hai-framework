import type { SchedulerTaskExecuteEvent } from '../src/index.js'
import { afterEach, expect, it, vi } from 'vitest'
import { scheduler } from '../src/index.js'

afterEach(async () => {
  await scheduler.close()
})

it('treats failed hooks as retryable failures and retains unsuccessful one-time tasks', async () => {
  const execute = vi.fn(async () => {
    throw new Error('temporary failure')
  })
  expect((await scheduler.init({ enableDb: false })).success).toBe(true)
  scheduler.setHooks({ onTaskExecute: execute })
  await scheduler.register({ id: 'retry', name: 'Retry', cron: '* * * * *', enabled: true, deleteAfterRun: true, retry: { maxAttempts: 3 } })
  expect(await scheduler.trigger('retry')).toMatchObject({ success: true, data: { status: 'failed' } })
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
  await scheduler.init({ enableDb: false, hooks: { onTaskExecute: execute } })
  await scheduler.register({ id: 'retry-success', name: 'Retry', cron: '* * * * *', deleteAfterRun: true, retry: { maxAttempts: 3 } })
  expect(await scheduler.trigger('retry-success')).toMatchObject({ success: true, data: { status: 'success' } })
  expect(occurrences).toHaveLength(3)
  expect(occurrences[0]).toMatch(/^manual:/u)
  expect(new Set(occurrences).size).toBe(1)
  expect(scheduler.tasks.has('retry-success')).toBe(false)
})
