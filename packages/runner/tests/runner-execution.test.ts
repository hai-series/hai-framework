import type { RunnerExecution } from '../src/index.js'
import { Buffer } from 'node:buffer'
import { setTimeout as delay } from 'node:timers/promises'
import { reldb } from '@h-ai/reldb'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRunner, runner } from '../src/index.js'

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
    const second = createRunner()
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
    const otherNode = createRunner()
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

  it('counts resources through cleanup, routes pinned work, and waits for cancellation', async () => {
    const follower = createRunner()
    const jobResources = { ...capacity }
    const hold = Promise.withResolvers<void>()
    try {
      expect((await runner.init({ nodeId: 'alpha', capacity, maxRunning: 2 })).success).toBe(true)
      expect((await follower.init({ nodeId: 'beta', capacity, maxRunning: 2 })).success).toBe(true)
      for (const candidate of [runner, follower]) {
        expect((await candidate.register('hold', async (_input, context) => {
          await new Promise<void>(resolve => context.signal.addEventListener('abort', () => resolve(), { once: true }))
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
      const second = await runner.submit({
        scope,
        kind: 'hold',
        input: null,
        resources: jobResources,
        nodeId: 'alpha',
      })
      if (!active.success || !second.success)
        throw new Error('submission failed')
      await status(active.data.id, 'running')
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
