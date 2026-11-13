import { execFile } from 'node:child_process'
import process from 'node:process'
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
    const first = createRunner()
    const second = createRunner()
    const scope = { tenantId: 'shared-test', userId: 'worker-owner' }

    beforeAll(async () => {
      const database = await setup()
      release = database.release
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
  })
}
