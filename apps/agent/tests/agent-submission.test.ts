import type { DbTestEnv } from '../../../packages/reldb/tests/helpers/reldb-test-suite.js'
import { randomUUID } from 'node:crypto'
import { HaiAIError } from '@h-ai/ai'
import { core } from '@h-ai/core'
import { HaiReldbError, reldb } from '@h-ai/reldb'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { findTask, initWorkspace, insertTask, owner, reserveTurn, turnById, writeTurn } from '#lib/server/data.js'
import { action, view } from '#lib/server/workspace.js'
import { sendSchema, settingsSchema } from '#lib/workspace.js'
import { postgresEnv, sqliteMemoryEnv } from '../../../packages/reldb/tests/helpers/reldb-test-suite.js'

const { scoped } = vi.hoisted(() => ({
  scoped: vi.fn(),
}))
vi.mock('@h-ai/ai', async (load) => {
  const source = await load<typeof import('@h-ai/ai')>()
  return {
    ...source,
    ai: {
      acp: { scoped },
      token: {
        estimateText: (value: string) => value.length,
      },
    },
  }
})

const subject = { tenantId: 'team', userId: 'alice' }
const account = owner(subject)

describe.each([
  ['SQLite', sqliteMemoryEnv],
  ['PostgreSQL', postgresEnv],
] as const)('agent submission recovery (%s)', (_name, environment) => {
  let database: DbTestEnv
  beforeAll(async () => {
    database = await environment()
  }, 120_000)

  beforeEach(async () => {
    expect((await reldb.init(database.config)).success).toBe(true)
    expect((await initWorkspace()).success).toBe(true)
    vi.spyOn(core.config, 'get').mockReturnValue({})
  })

  afterEach(async () => {
    scoped.mockReset()
    vi.restoreAllMocks()
    await reldb.close()
  })

  afterAll(async () => {
    await database?.release?.()
  })

  async function nextTurn() {
    const task = await insertTask(account, randomUUID(), settingsSchema.parse({ agentId: 'fixture' }))
    return sendSchema.parse({
      type: 'send',
      task: task.id,
      turn: randomUUID(),
      text: 'Summarize the work',
    })
  }

  it.each(['acp', 'workspace'] as const)('找回受理后丢失的 %s 回执，原轮次只有一个执行', async (fault) => {
    const input = await nextTurn()
    const nativeId = 'fixture-session'
    const receiptId = 'fixture-execution'
    const submit = vi.fn(async () => {
      const saved = await turnById(account, input.turn)
      expect(saved.submission?.sessionId).toBe(nativeId)
      expect((await findTask(account, input.task)).acpId).toBe(nativeId)
      if (fault === 'acp')
        return core.err(HaiAIError.ACP_OPERATION_FAILED, 'Receipt unavailable')
      vi.spyOn(reldb.tx, 'begin').mockResolvedValueOnce(core.err(HaiReldbError.TRANSACTION_FAILED, 'Write unavailable'))
      return core.ok({ taskId: receiptId, status: 'queued' as const })
    })
    const findSubmission = vi.fn(async () => core.ok({ taskId: receiptId, status: 'succeeded' as const }))
    scoped.mockReturnValue({
      plan: async () => core.ok({ resolvedMode: 'task', reason: 'explicit', modelId: 'fixture' }),
      sessions: {
        create: async () => core.ok({ id: nativeId, submit }),
      },
      tasks: {
        findSubmission,
        get: async () => core.ok({
          status: 'succeeded',
          output: { text: 'Done' },
        }),
        events: async () => core.ok([]),
      },
    })

    await expect(action(subject, input)).rejects.toMatchObject({
      code: fault === 'acp'
        ? HaiAIError.ACP_OPERATION_FAILED.code
        : HaiReldbError.TRANSACTION_FAILED.code,
    })
    const pending = await turnById(account, input.turn)
    expect(pending.status).toBe('submitting')
    expect(pending.receipt).toBeUndefined()

    const recovered = await view(subject, input.task)
    expect(recovered.turns).toEqual([
      expect.objectContaining({
        id: input.turn,
        status: 'succeeded',
        receipt: receiptId,
        output: { text: 'Done' },
      }),
    ])
    expect(recovered.turns?.[0]).not.toHaveProperty('submission')
    expect(recovered.turns?.[0]).not.toHaveProperty('revision')
    expect(findSubmission).toHaveBeenCalledExactlyOnceWith(nativeId, input.turn)
    await expect(action(subject, input)).resolves.toMatchObject({ receipt: receiptId, status: 'succeeded' })
    expect(submit).toHaveBeenCalledOnce()
    const late = await writeTurn(account, pending, { status: 'failed' })
    expect(late).toMatchObject({
      updated: false,
      turn: { status: 'succeeded', receipt: receiptId },
    })
  })

  it('并发调用同一轮次共享已保存的受理身份，取消沿用查回的回执', async () => {
    const input = await nextTurn()
    const dispatched = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const submit = vi.fn(async () => {
      dispatched.resolve()
      await release.promise
      return core.ok({ taskId: 'accepted', status: 'queued' })
    })
    const findSubmission = vi.fn()
      .mockResolvedValueOnce(core.ok(null))
      .mockResolvedValueOnce(core.ok({ taskId: 'accepted', status: 'queued' }))
    const cancel = vi.fn(async () => core.ok({ status: 'cancelling' }))
    scoped.mockReturnValue({
      plan: async () => core.ok({ resolvedMode: 'task' }),
      sessions: {
        create: async () => core.ok({ id: 'session', submit }),
      },
      tasks: { findSubmission, cancel },
    })

    const first = action(subject, input)
    await Promise.race([dispatched.promise, first])
    try {
      await expect(action(subject, input)).resolves.toMatchObject({ status: 'submitting' })
      await expect(action(subject, {
        ...input,
        files: [
          randomUUID(),
        ],
      })).rejects.toMatchObject({ status: 409 })
      await expect(action(subject, { type: 'cancel', id: input.turn })).resolves.toBe('cancelling')
      expect(cancel).toHaveBeenCalledExactlyOnceWith('accepted')
    }
    finally {
      release.resolve()
      await first
    }
    expect(submit).toHaveBeenCalledOnce()
  })

  it('准备阶段的失败可被确认并释放新轮次的提交权', async () => {
    const input = await nextTurn()
    scoped.mockReturnValue({
      plan: async () => core.err(HaiAIError.ACP_UNSUPPORTED, 'No available configuration'),
    })

    await expect(action(subject, input)).rejects.toMatchObject({ code: HaiAIError.ACP_UNSUPPORTED.code })
    expect((await turnById(account, input.turn)).status).toBe('failed')
    await expect(reserveTurn(account, {
      ...input,
      turn: randomUUID(),
    })).resolves.toMatchObject({ created: true })
  })
})
