import { afterEach, describe, expect, it, vi } from 'vitest'
import { scheduler } from '../src/index.js'
import './helpers/sqlite-lifecycle.js'

describe('scheduler close during execution', () => {
  afterEach(async () => {
    await scheduler.close()
    vi.unstubAllGlobals()
  })

  it('cancels a pending hook and isolates callbacks after reinitialization', async () => {
    let resolveOld: (value: string) => void = () => {}
    let started: () => void = () => {}
    const entered = new Promise<void>((resolve) => {
      started = resolve
    })
    let oldSignal: AbortSignal | undefined
    const finished = vi.fn()
    expect((await scheduler.init({
      enableDb: true,
      hooks: {
        onTaskExecute: event => new Promise<string>((resolve) => {
          oldSignal = event.signal
          resolveOld = resolve
          started()
        }),
        onTaskFinish: finished,
      },
    })).success).toBe(true)
    expect((await scheduler.register({ id: 'same', name: 'old', cron: '* * * * *', deleteAfterRun: true })).success).toBe(true)
    const oldRun = scheduler.trigger('same')
    await entered
    await scheduler.close()
    expect(oldSignal?.aborted).toBe(true)
    const oldResult = await oldRun
    expect(oldResult.success).toBe(true)
    if (oldResult.success)
      expect(oldResult.data.status).toBe('unknown')
    expect((await scheduler.init({ enableDb: true })).success).toBe(true)
    expect((await scheduler.updateTask('same', { name: 'new' })).success).toBe(true)
    resolveOld('late result')
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(scheduler.tasks.get('same')?.name).toBe('new')
    expect(finished).not.toHaveBeenCalled()
  })

  it('terminates a long-running worker on close', async () => {
    expect((await scheduler.init({ enableDb: true })).success).toBe(true)
    expect((await scheduler.register({
      id: 'worker',
      name: 'worker',
      cron: '* * * * *',
      handler: { kind: 'js', code: '() => { while (true) {} }', timeout: 60000 },
    })).success).toBe(true)
    const running = scheduler.trigger('worker')
    await new Promise(resolve => setTimeout(resolve, 50))
    const started = Date.now()
    await scheduler.close()
    expect(Date.now() - started).toBeLessThan(2000)
    const result = await running
    expect(result.success).toBe(true)
    if (result.success)
      expect(result.data.status).toBe('unknown')
  })

  it('cancels retry backoff without executing another attempt', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response('failed', { status: 503 }))
    vi.stubGlobal('fetch', fetchMock)
    expect((await scheduler.init({ enableDb: true })).success).toBe(true)
    expect((await scheduler.register({
      id: 'retry',
      name: 'retry',
      cron: '* * * * *',
      handler: { kind: 'api', url: 'http://localhost/test' },
      idempotent: true,
      retry: { maxAttempts: 3, backoffMs: [60000] },
    })).success).toBe(true)
    const running = scheduler.trigger('retry')
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await scheduler.close()
    const result = await running
    expect(result.success).toBe(true)
    if (result.success)
      expect(result.data.status).toBe('unknown')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
