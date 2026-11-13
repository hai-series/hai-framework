import { execFile, fork } from 'node:child_process'
import { once } from 'node:events'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { reldb } from '@h-ai/reldb'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mysqlEnv, postgresEnv } from '../../reldb/tests/helpers/reldb-test-suite.js'
import { createRunner } from '../src/index.js'

const warmImage = process.env.HAI_TEST_RUNNER_ARTIFACT_IMAGE
const engine = (process.env.HAI_ACP_E2E_ENGINE ?? process.env.HAI_TEST_CONTAINER_ENGINE) === 'podman'
  ? 'podman'
  : 'docker'

for (const [backend, setup] of [
  ['postgresql', postgresEnv],
  ['mysql', mysqlEnv],
] as const) {
  describe(`${backend} execution ownership`, () => {
    let release: (() => Promise<void>) | undefined
    let fixtureDatabase: Awaited<ReturnType<typeof setup>>['config']
    const first = createRunner()
    const second = createRunner()
    const scope = { tenantId: 'shared-test', userId: 'worker-owner' }

    beforeAll(async () => {
      const database = await setup()
      release = database.release
      fixtureDatabase = database.config
      expect((await reldb.init(database.config)).success).toBe(true)
      const image = warmImage
        ? (await promisify(execFile)(engine, [
            'image',
            'inspect',
            '--format',
            '{{.Id}}',
            warmImage,
          ])).stdout.trim().replace(/^(?:sha256:)?/u, 'sha256:')
        : undefined
      const environments = image
        ? [
            {
              id: 'tools',
              image,
              resources: {
                cpu: 0.5,
                memoryMiB: 128,
                pids: 24,
                scratchMiB: 64,
              },
            },
          ]
        : []
      const starts = await Promise.all([
        first.init({ nodeId: 'first', engine, environments }),
        second.init({ nodeId: 'second', engine, environments }),
      ])
      expect(starts).toEqual([
        { success: true, data: undefined },
        { success: true, data: undefined },
      ])
    }, 150_000)

    afterAll(async () => {
      try {
        await Promise.all([
          first.close(),
          second.close(),
        ])
      }
      finally {
        try {
          await reldb.close()
        }
        finally {
          await release?.()
        }
      }
    }, 30_000)

    it.runIf(!!warmImage)('transfers one prewarmed container atomically between two executors', async () => {
      const pool = {
        key: 'tools',
        kind: 'tool.v1',
        environmentId: 'tools',
        minReady: 1,
        maxRunning: 1,
        maxTotal: 1,
      }
      for (const instance of [first, second]) {
        expect((await instance.register(pool.kind, async (_input, context) => {
          const launched = await context.start({
            command: 'cat',
            args: ['/input/fixture'],
            inputs: { fixture: 'dmVyaWZpZWQ=' },
          })
          if (!launched.success)
            throw new Error(launched.error.message)
          launched.data.stderr.resume()
          let output = ''
          for await (const chunk of launched.data.stdout)
            output += String(chunk)
          return output
        })).success).toBe(true)
        expect(instance.registerWarmPool(pool).success).toBe(true)
      }
      const ready = () => reldb.sql.get<{ container_json: string | { id: string } }>(
        'SELECT container_json FROM hai_runner_executions WHERE state = \'running\' AND warm_state = \'ready\'',
      )
      await expect.poll(ready, { timeout: 8000 }).toMatchObject({
        success: true,
        data: {
          container_json: expect.anything(),
        },
      })
      const before = await ready()
      const job = await first.submit({
        scope,
        kind: pool.kind,
        input: null,
        capacityClass: 'tool',
        environmentId: 'tools',
        warmPool: true,
        concurrency: { key: pool.key, limit: 1 },
      })
      if (!job.success)
        throw new Error(job.error.message)
      await expect.poll(() => second.get(scope, job.data.id), { timeout: 8000 })
        .toMatchObject({
          success: true,
          data: { status: 'succeeded', output: 'verified' },
        })
      const receipt = await reldb.sql.get<{ container_json: string | { id: string } }>(
        'SELECT container_json FROM hai_runner_executions WHERE id = ?',
        [job.data.id],
      )
      expect(receipt).toEqual(before)
    }, 20_000)

    it('only lets one executor claim and publish the request accepted on two API instances', async () => {
      const calls: string[] = []
      for (const instance of [first, second]) {
        expect((await instance.register('once.v1', async (input, context) => {
          calls.push(context.owner.nodeId)
          expect((await context.emit({ owner: context.owner.nodeId })).success).toBe(true)
          return input
        })).success).toBe(true)
      }
      const payload = {
        scope,
        kind: 'once.v1',
        input: {
          text: 'a'.repeat(600),
        },
        idempotencyKey: 'same-operation',
      }
      const [a, b] = await Promise.all([
        first.submit(payload),
        second.submit(payload),
      ])
      expect(a.success && b.success).toBe(true)
      if (!a.success || !b.success)
        throw new Error('submission failed')
      expect(a.data.id).toBe(b.data.id)
      await expect.poll(() => second.get(scope, a.data.id), { timeout: 5000 })
        .toMatchObject({
          success: true,
          data: { status: 'succeeded', output: payload.input },
        })
      expect(calls).toHaveLength(1)
      expect(await first.events(scope, a.data.id)).toMatchObject({
        success: true,
        data: [
          {
            sequence: 1,
            data: { owner: calls[0] },
          },
        ],
      })
      expect(await first.find(scope, payload.kind, payload.idempotencyKey)).toMatchObject({
        success: true,
        data: { id: a.data.id },
      })
    })

    it('removes expired terminal jobs and their events in bounded maintenance while preserving unresolved children', async () => {
      const live = Promise.withResolvers<void>()
      const request = {
        scope,
        kind: 'retention.v1',
        input: { example: 'short-lived' },
        idempotencyKey: 'aged-parent',
      }
      for (const instance of [first, second]) {
        expect(instance.register(request.kind, async (input, context) => {
          expect((await context.emit({ ready: true })).success).toBe(true)
          await live.promise
          return input
        }).success).toBe(true)
      }
      try {
        const parent = await first.submit(request)
        if (!parent.success)
          throw new Error(parent.error.message)
        await expect.poll(() => second.get(scope, parent.data.id)).toMatchObject({
          success: true,
          data: { status: 'running' },
        })
        const children = await Promise.all(['unknown-child', 'finished-child'].map(idempotencyKey => first.submit({
          ...request,
          parentId: parent.data.id,
          idempotencyKey,
        })))
        const [unresolved, terminal] = children
        if (!unresolved.success || !terminal.success)
          throw new Error('Child submission failed')
        await expect.poll(async () => Promise.all(children.map(child => child.success && first.events(scope, child.data.id))))
          .toMatchObject([
            {
              success: true,
              data: [
                { sequence: 1 },
              ],
            },
            {
              success: true,
              data: [
                { sequence: 1 },
              ],
            },
          ])
        expect((await reldb.sql.execute('UPDATE hai_runner_executions SET leased_until = 0 WHERE id = ?', [unresolved.data.id])).success).toBe(true)
        await expect.poll(() => second.get(scope, unresolved.data.id)).toMatchObject({
          success: true,
          data: { status: 'unknown' },
        })
        live.resolve()
        await expect.poll(() => first.get(scope, parent.data.id)).toMatchObject({
          success: true,
          data: { status: 'succeeded' },
        })
        await expect.poll(() => second.get(scope, terminal.data.id)).toMatchObject({
          success: true,
          data: {
            status: expect.stringMatching(/^(?:cancelled|succeeded)$/),
          },
        })
        expect((await first.submit(request)).success).toBe(true)
        expect((await reldb.sql.execute('UPDATE hai_runner_executions SET updated_at = 0 WHERE id IN (?, ?, ?)', [
          parent.data.id,
          unresolved.data.id,
          terminal.data.id,
        ])).success).toBe(true)
        await expect.poll(() => first.get(scope, terminal.data.id), { timeout: 5000 })
          .toMatchObject({ success: false })
        expect(await second.get(scope, parent.data.id)).toMatchObject({ success: true })
        expect(await second.get(scope, unresolved.data.id)).toMatchObject({
          success: true,
          data: { status: 'unknown' },
        })
        const events = await reldb.sql.get<{ total: string | number }>('SELECT COUNT(*) AS total FROM hai_runner_events WHERE execution_id = ?', [terminal.data.id])
        expect(events.success && Number(events.data?.total)).toBe(0)
        expect((await reldb.sql.execute('UPDATE hai_runner_executions SET reconciled_at = 1 WHERE id = ?', [unresolved.data.id])).success).toBe(true)
        await expect.poll(() => second.find(scope, request.kind, request.idempotencyKey), { timeout: 5000 })
          .toMatchObject({ success: true, data: undefined })
        expect(await first.events(scope, parent.data.id)).toMatchObject({ success: false })
      }
      finally {
        live.resolve()
      }
    }, 20_000)

    it.runIf(process.platform === 'linux')('reconciles only after the original host process and the parent are verified stopped', async () => {
      const nodeId = 'owner-recovery'
      const review = { operatorId: 'ops', reason: 'Confirmed host resources stopped', hostResourcesStopped: true } as const
      const child = fork(fileURLToPath(new URL('./fixtures/runner-owner-node.mjs', import.meta.url)), [], {
        execArgv: [],
        stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
        env: {
          ...process.env,
          HAI_TEST_RUNNER_OWNER: JSON.stringify({ database: fixtureDatabase, nodeId }),
        },
      })
      const exit = once(child, 'exit')
      const replacement = createRunner()
      const request = { scope, kind: 'owner.v1', input: null }
      const hold = Promise.withResolvers<void>()
      try {
        const [ready] = await once(child, 'message', {
          signal: AbortSignal.timeout(5000),
        })
        expect(ready).toEqual({ ready: true })
        const parent = await first.submit({ ...request, nodeId, idempotencyKey: 'original-owner' })
        if (!parent.success)
          throw new Error(parent.error.message)
        await expect.poll(() => first.events(scope, parent.data.id)).toMatchObject({
          success: true,
          data: [
            {
              data: { entered: true },
            },
          ],
        })
        const control = await second.submit({ ...request, parentId: parent.data.id, idempotencyKey: 'original-control' })
        if (!control.success)
          throw new Error(control.error.message)
        await expect.poll(() => second.events(scope, control.data.id)).toMatchObject({
          success: true,
          data: [
            {
              data: { entered: true },
            },
          ],
        })
        expect((await reldb.sql.execute('UPDATE hai_runner_executions SET leased_until = 0 WHERE id IN (?, ?)', [parent.data.id, control.data.id])).success)
          .toBe(true)
        await expect.poll(() => second.get(scope, control.data.id)).toMatchObject({
          success: true,
          data: { status: 'unknown' },
        })
        expect((await replacement.init({ nodeId, maxControlRunning: 1 })).success).toBe(true)
        expect((await replacement.reconcileUnknown(scope, parent.data.id, review)).success).toBe(false)

        expect(child.kill('SIGKILL')).toBe(true)
        await exit
        expect(replacement.register(request.kind, async (input, context) => {
          if (!context.parentId) {
            expect((await context.emit({ entered: true })).success).toBe(true)
            await hold.promise
          }
          return input
        }).success).toBe(true)
        const fresh = await first.submit({ ...request, nodeId, idempotencyKey: 'fresh-owner' })
        if (!fresh.success)
          throw new Error(fresh.error.message)
        await expect.poll(() => first.events(scope, fresh.data.id)).toMatchObject({
          success: true,
          data: [
            {
              data: { entered: true },
            },
          ],
        })
        const queued = await first.submit({ ...request, parentId: fresh.data.id })
        if (!queued.success)
          throw new Error(queued.error.message)
        expect(await first.get(scope, queued.data.id)).toMatchObject({
          success: true,
          data: { status: 'queued' },
        })
        expect((await replacement.reconcileUnknown(scope, control.data.id, review)).success).toBe(false)
        expect((await replacement.reconcileUnknown(scope, parent.data.id, { operatorId: 'ops', reason: 'Missing attestation' })).success).toBe(false)
        expect(await replacement.reconcileUnknown(scope, parent.data.id, review)).toMatchObject({
          success: true,
          data: {
            status: 'unknown',
            failure: 'owner-lost',
            reconciledAt: expect.any(Number),
          },
        })
        expect(await replacement.reconcileUnknown(scope, control.data.id, review)).toMatchObject({
          success: true,
          data: {
            status: 'unknown',
            failure: 'owner-lost',
            reconciledAt: expect.any(Number),
          },
        })
        await expect.poll(() => second.get(scope, queued.data.id)).toMatchObject({
          success: true,
          data: { status: 'succeeded' },
        })
        expect(await first.submit({ ...request, nodeId, idempotencyKey: 'original-owner' })).toMatchObject({
          success: true,
          data: { id: parent.data.id, status: 'unknown' },
        })
      }
      finally {
        if (child.exitCode === null && child.signalCode === null)
          child.kill('SIGKILL')
        await exit
        hold.resolve()
        await replacement.close()
      }
    }, 20_000)
  })
}
