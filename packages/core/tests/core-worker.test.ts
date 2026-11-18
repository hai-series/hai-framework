import { expect, it } from 'vitest'
import { core, HaiCommonError } from '../src/index.js'

interface Job {
  value: string | Uint8Array
  crash?: boolean
}

interface Reply {
  value: string | Uint8Array
  order: number
  threadId: number
  label?: string
}

const entry = new URL('./fixtures/core-worker.mjs', import.meta.url)

it('keeps FIFO order, bounds waiting work, and reuses the same thread', async () => {
  const pool = core.worker.createPool<Job, Reply>(entry, { maxWorkers: 1, maxQueuedJobs: 1 })
  try {
    const active = pool.run({ value: 'first' })
    const queued = pool.run({ value: 'second' })
    expect(await pool.run({ value: 'overflow' })).toMatchObject({
      success: false,
      error: { code: HaiCommonError.RATE_LIMIT_EXCEEDED.code },
    })
    const first = await active
    const second = await queued
    expect(first).toMatchObject({
      success: true,
      data: { value: 'first', order: 1 },
    })
    expect(second).toMatchObject({
      success: true,
      data: { value: 'second', order: 2 },
    })
    if (first.success && second.success)
      expect(first.data.threadId).toBe(second.data.threadId)
  }
  finally { await pool.close() }
})

it('replaces a failed thread and transfers an owned buffer', async () => {
  const pool = core.worker.createPool<Job, Reply>(entry, { maxWorkers: 1, maxQueuedJobs: 1 })
  try {
    const failure = pool.run({ value: 'discarded', crash: true })
    const bytes = new Uint8Array([10, 20])
    const next = pool.run({ value: bytes }, [bytes.buffer])
    expect(await failure).toMatchObject({
      success: false,
      error: { code: HaiCommonError.INTERNAL_ERROR.code },
    })
    expect(await next).toMatchObject({
      success: true,
      data: {
        value: new Uint8Array([10, 20]),
        order: 1,
      },
    })
    expect(bytes.byteLength).toBe(0)
  }
  finally { await pool.close() }
})

it('settles running and queued jobs when the owner closes the pool', async () => {
  const pool = core.worker.createPool<Job, Reply>(entry, { maxWorkers: 1, maxQueuedJobs: 1 })
  const pending = [
    pool.run({ value: 'running' }),
    pool.run({ value: 'waiting' }),
  ]
  const closing = pool.close()
  expect(pool.close()).toBe(closing)
  await closing
  for (const result of await Promise.all([
    ...pending,
    pool.run({ value: 'closed' }),
  ])) {
    expect(result).toMatchObject({
      success: false,
      error: { code: HaiCommonError.NOT_INITIALIZED.code },
    })
  }
})

it('starts a dedicated thread with its own initial data and waits for termination', async () => {
  const thread = core.worker.start<Job, Reply>(entry, {
    workerData: { label: 'dedicated' },
    execArgv: [],
  })
  const received = Promise.withResolvers<Reply>()
  const unsubscribe = thread.onMessage(received.resolve)
  try {
    thread.postMessage({ value: 'first' })
    expect(await received.promise).toMatchObject({ value: 'first', label: 'dedicated' })
  }
  finally {
    unsubscribe()
    await thread.terminate()
  }
  expect(await thread.exited).toMatchObject({
    code: expect.any(Number),
  })
})
