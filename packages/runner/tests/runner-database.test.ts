import { reldb } from '@h-ai/reldb'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mysqlEnv, postgresEnv } from '../../reldb/tests/helpers/reldb-test-suite.js'
import { createRunner } from '../src/index.js'

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
      const starts = await Promise.all([
        first.init({ nodeId: 'first' }),
        second.init({ nodeId: 'second' }),
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
