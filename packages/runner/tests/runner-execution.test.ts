import type { RunnerExecution } from '../src/index.js'
import { Buffer } from 'node:buffer'
import { setTimeout as delay } from 'node:timers/promises'
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HaiRunnerError, runner } from '../src/index.js'

const scope = { tenantId: 'studio', userId: 'alice' }
const other = { ...scope, userId: 'bob' }
const capacity = {
  cpu: 2,
  memoryMiB: 512,
  pids: 100,
  scratchMiB: 128,
}

async function status(id: string, expected: RunnerExecution['status']) {
  await expect.poll(() => runner.get(scope, id), { timeout: 5000 })
    .toMatchObject({
      success: true,
      data: { status: expected },
    })
}

beforeEach(async () => {
  expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
})

afterEach(async () => {
  expect((await runner.close()).success).toBe(true)
  expect((await reldb.close()).success).toBe(true)
})

describe('managed execution', () => {
  it('does not start a removed handler when an in-flight claim completes after deregistration', async () => {
    expect((await runner.init({ nodeId: 'alpha', pollMs: 20 })).success).toBe(true)
    const entered = Promise.withResolvers<void>()
    const resume = Promise.withResolvers<void>()
    const handler = vi.fn(async () => 'completed')
    const registered = runner.register('deregister', handler)
    if (!registered.success)
      throw new Error(registered.error.message)
    const sql = reldb.sql
    const get = sql.get.bind(sql)
    const paused = vi.spyOn(sql, 'get').mockImplementation(async (statement, params) => {
      if (statement.includes('SELECT q.id FROM hai_runner_executions q')) {
        entered.resolve()
        await resume.promise
      }
      return get(statement, params)
    })
    try {
      const task = await runner.submit({ scope, kind: 'deregister', input: null })
      if (!task.success)
        throw new Error(task.error.message)
      await entered.promise
      registered.data()
      resume.resolve()
      await status(task.data.id, 'failed')
      expect(handler).not.toHaveBeenCalled()
    }
    finally {
      resume.resolve()
      paused.mockRestore()
    }
  })

  it('signals local handlers and returns within the close budget while cancellation storage waits', async () => {
    expect((await runner.init({ nodeId: 'alpha', closeTimeoutMs: 100 })).success).toBe(true)
    const started = Promise.withResolvers<void>()
    const observed = Promise.withResolvers<void>()
    const unblock = Promise.withResolvers<void>()
    let aborted = false
    expect(runner.register('shutdown', async (_input, context) => {
      await new Promise<void>((resolve) => {
        context.signal.addEventListener('abort', () => {
          aborted = true
          resolve()
        }, { once: true })
        started.resolve()
      })
      return 'completed'
    }).success).toBe(true)
    const task = await runner.submit({ scope, kind: 'shutdown', input: null })
    expect(task.success).toBe(true)
    if (!task.success)
      throw new Error(task.error.message)
    await started.promise
    const sql = reldb.sql
    const execute = sql.execute.bind(sql)
    const patched = vi.spyOn(sql, 'execute').mockImplementation(async (statement, params) => {
      if (statement.includes('SET state = \'cancelling\'') && statement.includes('owner_generation = ?')) {
        observed.resolve()
        await unblock.promise
      }
      return execute(statement, params)
    })
    try {
      const closing = runner.close()
      await observed.promise
      expect(aborted).toBe(true)
      await expect(closing).resolves.toMatchObject({
        success: false,
        error: { code: HaiRunnerError.CLEANUP_UNCONFIRMED.code },
      })
      unblock.resolve()
      await status(task.data.id, 'cancelled')
      expect((await runner.close()).success).toBe(true)
    }
    finally {
      unblock.resolve()
      patched.mockRestore()
    }
  })

  it('retains close state until the outstanding cancellation succeeds', async () => {
    expect((await runner.init({ nodeId: 'alpha' })).success).toBe(true)
    const started = Promise.withResolvers<void>()
    expect(runner.register('shutdown', async (_input, context) => {
      await new Promise<void>((resolve) => {
        context.signal.addEventListener('abort', () => resolve(), { once: true })
        started.resolve()
      })
      return 'completed'
    }).success).toBe(true)
    const task = await runner.submit({ scope, kind: 'shutdown', input: null })
    expect(task.success).toBe(true)
    if (!task.success)
      throw new Error(task.error.message)
    await started.promise
    const sql = reldb.sql
    const execute = sql.execute.bind(sql)
    const patched = vi.spyOn(sql, 'execute').mockImplementation(async (statement, params) => {
      if (statement.includes('SET state = \'cancelling\'') && statement.includes('owner_generation = ?'))
        return core.err('test:runner:unavailable', 'Cancellation storage is temporarily unavailable')
      return execute(statement, params)
    })
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        expect(await runner.close()).toMatchObject({
          success: false,
          error: { code: HaiRunnerError.CLEANUP_UNCONFIRMED.code },
        })
      }
      expect(await runner.get(scope, task.data.id)).toMatchObject({
        success: true,
        data: { status: 'running' },
      })
    }
    finally {
      patched.mockRestore()
    }
    expect((await runner.close()).success).toBe(true)
    expect((await runner.init({ nodeId: 'api', executor: false })).success).toBe(true)
    await status(task.data.id, 'cancelled')
  })

  it('bounds the aggregate event payload of a single execution', async () => {
    expect((await runner.init({ nodeId: 'alpha' })).success).toBe(true)
    const event = Buffer.alloc(500 * 1024, 'x').toString()
    expect(runner.register('events.v1', async (_input, context) => {
      for (let index = 0; index < 32; index++)
        expect((await context.emit(event)).success).toBe(true)
      const overflow = await context.emit(event)
      return { overflowAccepted: overflow.success }
    }).success).toBe(true)
    const submitted = await runner.submit({ scope, kind: 'events.v1', input: null })
    if (!submitted.success)
      throw new Error(submitted.error.message)
    await status(submitted.data.id, 'succeeded')
    expect(await runner.get(scope, submitted.data.id)).toMatchObject({
      success: true,
      data: {
        output: { overflowAccepted: false },
      },
    })
    expect(await reldb.sql.get('SELECT COUNT(*) AS total FROM hai_runner_events WHERE execution_id = ?', [submitted.data.id]))
      .toEqual({
        success: true,
        data: { total: 32 },
      })
  })

  it('does not take the write gate when registered handlers have no eligible work', async () => {
    const second = runner.create()
    try {
      expect((await runner.init({ nodeId: 'first', pollMs: 20 })).success).toBe(true)
      expect((await second.init({ nodeId: 'second', pollMs: 20 })).success).toBe(true)
      for (const instance of [runner, second])
        expect(instance.register('idle.v1', async () => null).success).toBe(true)
      const revision = () => reldb.sql.get<{ revision: number }>('SELECT revision FROM hai_runner_gate WHERE id = 1')
      const before = await revision()
      await delay(300)
      expect(await revision()).toEqual(before)
      expect(before).toEqual({
        success: true,
        data: { revision: 0 },
      })
    }
    finally {
      await second.close()
    }
  })

  it('reserves separate tool resources and applies the smallest active service cap across nodes', async () => {
    const otherNode = runner.create()
    const unblock = Promise.withResolvers<void>()
    try {
      expect((await runner.init({
        nodeId: 'alpha',
        capacity,
        toolCapacity: capacity,
        maxRunningPerScope: 1,
      })).success).toBe(true)
      expect((await otherNode.init({ nodeId: 'beta', capacity, toolCapacity: capacity })).success).toBe(true)
      for (const node of [runner, otherNode]) {
        expect((await node.register('holding', async () => {
          await unblock.promise
          return null
        })).success).toBe(true)
      }
      const ordinary = await runner.submit({
        scope,
        kind: 'holding',
        input: null,
        resources: capacity,
        nodeId: 'alpha',
      })
      const tool = await runner.submit({
        scope,
        kind: 'holding',
        input: null,
        resources: capacity,
        nodeId: 'alpha',
        capacityClass: 'tool',
        concurrency: { key: 'office', limit: 1 },
      })
      if (!ordinary.success || !tool.success)
        throw new Error('submission failed')
      await status(ordinary.data.id, 'running')
      await status(tool.data.id, 'running')
      const waiting = await runner.submit({
        scope,
        kind: 'holding',
        input: null,
        resources: capacity,
        nodeId: 'beta',
        capacityClass: 'tool',
        concurrency: { key: 'office', limit: 2 },
      })
      if (!waiting.success)
        throw new Error('submission failed')
      await status(waiting.data.id, 'queued')
      unblock.resolve()
      await status(waiting.data.id, 'succeeded')
    }
    finally {
      unblock.resolve()
      expect((await otherNode.close()).success).toBe(true)
    }
  })

  it('expires a bounded queue even if no compatible executor handler is registered', async () => {
    expect((await runner.init({ nodeId: 'alpha', pollMs: 20 })).success).toBe(true)
    const receipt = await runner.submit({
      scope,
      kind: 'unavailable.v1',
      input: null,
      queueTimeoutMs: 50,
    })
    if (!receipt.success)
      throw new Error('submission failed')
    await expect.poll(() => runner.get(scope, receipt.data.id), { timeout: 1000 })
      .toMatchObject({
        success: true,
        data: { status: 'failed', failure: 'queue-timeout' },
      })
  })

  it('does not start a handler after the stored execution deadline', async () => {
    const kind = 'expired-start.v1'
    const handler = vi.fn(async () => 'executed')
    expect((await runner.init({ nodeId: 'alpha' })).success).toBe(true)
    expect(runner.register(kind, handler).success).toBe(true)

    const execute = reldb.sql.execute
    const renewal = vi.spyOn(reldb.sql, 'execute').mockImplementation(async (sql, params) => {
      if (sql.startsWith('UPDATE hai_runner_executions SET leased_until =')) {
        expect(await execute('UPDATE hai_runner_executions SET run_until = 0 WHERE kind = ?', [kind]))
          .toMatchObject({
            success: true,
            data: { changes: 1 },
          })
      }
      return execute(sql, params)
    })
    try {
      const receipt = await runner.submit({ scope, kind, input: null })
      if (!receipt.success)
        throw new Error(receipt.error.message)
      await expect.poll(() => runner.get(scope, receipt.data.id)).toMatchObject({
        success: true,
        data: { status: 'failed', failure: 'run-timeout', output: undefined },
      })
      expect(handler).not.toHaveBeenCalled()
    }
    finally {
      renewal.mockRestore()
    }
  })

  it('scopes idempotency and preserves events and output after executor shutdown', async () => {
    expect((await runner.init({ nodeId: 'alpha' })).success).toBe(true)
    const first = await runner.submit({
      scope,
      kind: 'math',
      input: { a: 1, b: 2 },
      idempotencyKey: 'stable',
    })
    const duplicate = await runner.submit({
      scope,
      kind: 'math',
      input: { b: 2, a: 1 },
      idempotencyKey: 'stable',
    })
    expect(first.success).toBe(true)
    expect(duplicate).toEqual(first)
    if (!first.success)
      throw new Error('submission failed')
    expect((await runner.submit({
      scope,
      kind: 'math',
      input: 5,
      idempotencyKey: 'stable',
    })).success).toBe(false)
    expect((await runner.get(other, first.data.id)).success).toBe(false)
    expect((await runner.cancel(other, first.data.id)).success).toBe(false)
    expect((await runner.register('math', async (input, context) => {
      expect((await context.emit({ accepted: input })).success).toBe(true)
      return 3
    })).success).toBe(true)
    await status(first.data.id, 'succeeded')
    expect((await runner.close()).success).toBe(true)
    expect((await runner.init({ nodeId: 'api', executor: false })).success).toBe(true)
    expect(await runner.get(scope, first.data.id)).toMatchObject({
      success: true,
      data: { output: 3 },
    })
    const history = await runner.events(scope, first.data.id)
    expect(history).toMatchObject({
      success: true,
      data: [
        {
          sequence: 1,
          data: {
            accepted: { a: 1, b: 2 },
          },
        },
      ],
    })
    expect(await runner.events(scope, first.data.id, 1)).toEqual({ success: true, data: [] })
  })

  it('retains every acknowledged idempotency key for a reused execution until retention removes it', async () => {
    expect((await runner.init({ nodeId: 'primary' })).success).toBe(true)
    const kind = 'reuse.v1'
    const request = {
      scope,
      kind,
      input: { count: 1 },
      reuseKey: 'worker',
    }
    const first = await runner.submit({ ...request, idempotencyKey: 'original' })
    if (!first.success)
      throw new Error(first.error.message)
    const { id } = first.data
    const aliases = ['retry-one', 'retry-two']
    const accepted = await Promise.all(aliases.map(idempotencyKey => runner.submit({ ...request, idempotencyKey })))
    for (const receipt of accepted) {
      expect(receipt).toMatchObject({
        success: true,
        data: { id },
      })
    }

    expect(await runner.cancel(scope, id)).toMatchObject({
      success: true,
      data: { status: 'cancelled' },
    })
    for (const idempotencyKey of aliases) {
      expect(await runner.find(scope, kind, idempotencyKey)).toMatchObject({
        success: true,
        data: { id, status: 'cancelled' },
      })
      expect(await runner.submit({ ...request, idempotencyKey })).toMatchObject({
        success: true,
        data: { id, status: 'cancelled' },
      })
    }
    expect(await runner.find(other, kind, aliases[0])).toEqual({ success: true, data: undefined })
    expect(await runner.submit({
      ...request,
      idempotencyKey: aliases[0],
      input: { count: 2 },
    })).toMatchObject({
      success: false,
      error: { code: HaiRunnerError.CONFLICT.code },
    })

    expect((await reldb.sql.execute('UPDATE hai_runner_executions SET updated_at = 0 WHERE id = ?', [id])).success).toBe(true)
    await expect.poll(() => runner.find(scope, kind, 'original'), { timeout: 5000 }).toEqual({ success: true, data: undefined })
    expect(await runner.submit({ ...request, idempotencyKey: 'original' })).toMatchObject({
      success: true,
      data: { id, status: 'queued' },
    })
    expect(await runner.find(scope, kind, aliases[0])).toEqual({ success: true, data: undefined })
  })

  it('replays and claims a warm-pool request when API and executor differ only in minReady', async () => {
    const api = runner.create()
    const environment = { id: 'tools', image: `sha256:${'a'.repeat(64)}`, resources: capacity }
    const pool = {
      kind: 'prewarm-policy.v1',
      key: 'tools',
      environmentId: environment.id,
      minReady: 1,
      maxRunning: 1,
      maxTotal: 1,
    }
    const request = {
      scope,
      kind: pool.kind,
      input: { task: 'check' },
      idempotencyKey: 'prewarm-policy',
      capacityClass: 'tool',
      environmentId: environment.id,
      warmPool: true,
      concurrency: { key: pool.key, limit: pool.maxRunning },
    } as const
    try {
      expect((await api.init({
        nodeId: 'api',
        executor: false,
        environments: [environment],
      })).success).toBe(true)
      const originalPool = api.registerWarmPool(pool)
      if (!originalPool.success)
        throw new Error(originalPool.error.message)
      const first = await api.submit(request)
      if (!first.success)
        throw new Error(first.error.message)
      originalPool.data()
      const changedPool = { ...pool, minReady: 0 }
      expect(api.registerWarmPool(changedPool).success).toBe(true)
      expect(await api.submit(request)).toEqual(first)
      expect(await api.submit({
        ...request,
        input: { task: 'changed' },
      })).toMatchObject({
        success: false,
        error: { code: HaiRunnerError.CONFLICT.code },
      })

      expect((await runner.init({
        nodeId: 'tools',
        toolCapacity: capacity,
        environments: [environment],
      })).success).toBe(true)
      expect(runner.register(pool.kind, async input => input).success).toBe(true)
      expect(runner.registerWarmPool(changedPool).success).toBe(true)
      await expect.poll(() => api.get(scope, first.data.id)).toMatchObject({
        success: true,
        data: { status: 'succeeded', output: request.input },
      })
    }
    finally {
      await api.close()
    }
  })

  it('counts resources through cleanup, routes pinned work, and waits for cancellation', async () => {
    const follower = runner.create()
    const jobResources = { ...capacity }
    const started = Promise.withResolvers<void>()
    const cleanupStarted = Promise.withResolvers<void>()
    const hold = Promise.withResolvers<void>()
    try {
      expect((await runner.init({ nodeId: 'alpha', capacity, maxRunning: 2 })).success).toBe(true)
      expect((await follower.init({ nodeId: 'beta', capacity, maxRunning: 2 })).success).toBe(true)
      for (const candidate of [runner, follower]) {
        expect((await candidate.register('hold', async (_input, context) => {
          const cancelled = new Promise<void>((resolve) => {
            if (context.signal.aborted)
              resolve()
            else
              context.signal.addEventListener('abort', () => resolve(), { once: true })
          })
          started.resolve()
          await cancelled
          cleanupStarted.resolve()
          await hold.promise
          return null
        })).success).toBe(true)
        expect((await candidate.register('command', async (_input, context) => context.owner.nodeId)).success).toBe(true)
      }
      const active = await runner.submit({
        scope,
        kind: 'hold',
        input: null,
        resources: jobResources,
        nodeId: 'alpha',
      })
      if (!active.success)
        throw new Error(active.error.message)
      await started.promise
      await status(active.data.id, 'running')
      const second = await runner.submit({
        scope,
        kind: 'hold',
        input: null,
        resources: jobResources,
        nodeId: 'alpha',
      })
      if (!second.success)
        throw new Error(second.error.message)
      await status(second.data.id, 'queued')
      const command = await follower.submit({
        scope,
        kind: 'command',
        input: null,
        parentId: active.data.id,
      })
      if (!command.success)
        throw new Error('submission failed')
      await status(command.data.id, 'succeeded')
      expect(await runner.get(scope, command.data.id)).toMatchObject({
        success: true,
        data: { output: 'alpha' },
      })
      expect(await follower.cancel(scope, active.data.id)).toMatchObject({
        success: true,
        data: { status: 'cancelling' },
      })
      await cleanupStarted.promise
      await status(second.data.id, 'queued')
      hold.resolve()
      await status(active.data.id, 'cancelled')
      await status(second.data.id, 'running')
    }
    finally {
      hold.resolve()
      await follower.close()
    }
  })

  it('rejects an expired owner and retains unknown effects without re-execution', async () => {
    expect((await runner.init({ nodeId: 'alpha', leaseMs: 1000 })).success).toBe(true)
    const done = Promise.withResolvers<void>()
    const calls: string[] = []
    expect((await runner.register('write', async (_input, context) => {
      calls.push(context.id)
      await done.promise
      expect((await context.emit({ late: true })).success).toBe(false)
      return 'written'
    })).success).toBe(true)
    try {
      const first = await runner.submit({
        scope,
        kind: 'write',
        input: null,
        reuseKey: 'exclusive',
      })
      if (!first.success)
        throw new Error('submission failed')
      await status(first.data.id, 'running')
      expect((await reldb.sql.execute('UPDATE hai_runner_executions SET leased_until = 0 WHERE id = ?', [first.data.id])).success).toBe(true)
      done.resolve()
      await status(first.data.id, 'unknown')
      expect(await runner.reconcileUnknown(scope, first.data.id, { operatorId: 'ops', reason: 'Container evidence required' }))
        .toMatchObject({ success: false })
      expect(await runner.submit({
        scope,
        kind: 'write',
        input: null,
        reuseKey: 'exclusive',
      }))
        .toMatchObject({
          success: true,
          data: { id: first.data.id, status: 'unknown' },
        })
      expect(calls).toEqual([first.data.id])
      expect(await runner.events(scope, first.data.id)).toEqual({ success: true, data: [] })
    }
    finally {
      done.resolve()
    }
  })
})
