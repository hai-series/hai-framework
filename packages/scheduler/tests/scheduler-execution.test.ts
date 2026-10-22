import type { SchedulerTaskExecuteEvent, SchedulerTaskFinishEvent, SchedulerTaskStartEvent, TaskDefinition } from '../src/index.js'
import type { SchedulerExecutionRepository as ExecutionRepository, StoredExecution } from '../src/repositories/index.js'
import { reldb } from '@h-ai/reldb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { scheduler, SchedulerConfigSchema } from '../src/index.js'
import { executionId, SchedulerExecutionRepository } from '../src/repositories/index.js'

let repo: ExecutionRepository
let now: number
const task: TaskDefinition = { id: 'shared-slot', name: 'shared-slot', cron: '* * * * *' }
const trigger = { type: 'manual', source: null } as const

async function claim(key: string): Promise<StoredExecution> {
  const result = await repo.claim(task, executionId(task.id, trigger.type, key), trigger, 'node', 1000)
  if (!result.success || !result.data)
    throw new Error('Claim failed')
  return result.data
}

beforeEach(async () => {
  now = Date.now()
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
  repo = new SchedulerExecutionRepository(reldb)
  expect((await repo.count()).success).toBe(true)
})

afterEach(async () => {
  await scheduler.close()
  await reldb.close()
  vi.restoreAllMocks()
})

describe('shared execution gates', () => {
  it('已过期但尚未开始的领取可以恢复，旧owner不能开始、续租或提交', async () => {
    const old = await claim('same')
    now += 1001
    const next = await claim('same')
    expect(next.owner).not.toBe(old.owner)
    expect((await repo.begin(old, 1000)).success).toBe(false)
    expect((await repo.renew(old, 1000)).success).toBe(false)
    expect((await repo.begin(next, 1000)).success).toBe(true)
    expect(next.attemptCount).toBe(1)
    const log = { id: crypto.randomUUID(), persistence: { status: 'pending' as const }, taskId: task.id, taskName: task.name, taskType: 'hook', triggerType: 'manual', triggerSource: null, status: 'success', result: null, error: null, startedAt: now, finishedAt: now, duration: 0 } as const
    expect((await repo.finish(old, log)).success).toBe(false)
    expect((await repo.finish(next, log)).success).toBe(true)
  })

  it('跨 occurrence 串行槽不可绕过；unknown在人工条件裁定前仍占槽', async () => {
    const row = await claim('first')
    expect((await repo.begin(row, 1000)).success).toBe(true)
    now += 1001
    expect(await repo.claim(task, row.occurrenceId, trigger, 'new', 1000)).toMatchObject({ success: true, data: null })
    expect(await repo.byOccurrence(row.occurrenceId)).toMatchObject({ success: true, data: { status: 'unknown' } })
    expect(await repo.claim(task, executionId(task.id, 'scheduled', 'new-minute'), trigger, 'new', 1000)).toMatchObject({ success: true, data: null })
    const unknown = await repo.byOccurrence(row.occurrenceId)
    if (!unknown.success || !unknown.data)
      throw new Error('Unknown state missing')
    expect((await repo.resolve(row.occurrenceId, 'discarded', unknown.data.updatedAt - 1)).success).toBe(false)
    expect((await repo.resolve(row.occurrenceId, 'discarded', unknown.data.updatedAt)).success).toBe(true)
    expect((await repo.resolve(row.occurrenceId, 'success', unknown.data.updatedAt)).success).toBe(false)
    expect((await repo.begin(row, 1000)).success).toBe(false)
    expect((await repo.claim(task, executionId(task.id, 'manual', 'explicit-next'), trigger, 'new', 1000)).success).toBe(true)
  })

  it('幂等任务耗尽持久尝试预算后也不无限接管，外部不明结果留unknown人工核对', async () => {
    const safe = { ...task, idempotent: true, retry: { maxAttempts: 1 } }
    const id = executionId(task.id, 'manual', 'budget')
    const claimed = await repo.claim(safe, id, trigger, 'first', 1000)
    if (!claimed.success || !claimed.data)
      throw new Error('Claim failed')
    expect((await repo.begin(claimed.data, 1000)).success).toBe(true)
    now += 1001
    expect(await repo.claim(safe, id, trigger, 'second', 1000)).toMatchObject({ success: true, data: null })
    expect(await repo.byOccurrence(id)).toMatchObject({ success: true, data: { status: 'unknown', attemptCount: 1 } })
  })

  it('生产配置不允许无数据库执行，执行与运维边界有输入上限', async () => {
    expect(SchedulerConfigSchema.safeParse({ enableDb: false }).success).toBe(false)
    expect(SchedulerConfigSchema.safeParse({ leaseMs: 999 }).success).toBe(false)
    expect(SchedulerConfigSchema.safeParse({ leaseMs: 86_400_001 }).success).toBe(false)
    expect((await scheduler.init()).success).toBe(true)
    expect((await scheduler.execution.get('invalid')).success).toBe(false)
    expect((await scheduler.execution.listUnknown({ limit: 101 })).success).toBe(false)
    expect((await scheduler.execution.listUnknown({ offset: -1 })).success).toBe(false)
    expect((await scheduler.trigger(task.id, { idempotencyKey: '' })).success).toBe(false)
  })

  it('手动幂等键跨重复调用只执行一次，context含完整持久身份和fence，查询不泄漏凭据', async () => {
    const calls: SchedulerTaskExecuteEvent[] = []
    const starts: SchedulerTaskStartEvent[] = []
    const finishes: SchedulerTaskFinishEvent[] = []
    expect((await scheduler.init({
      hooks: {
        onTaskExecute: event => calls.push(event),
        onTaskStart: (event) => {
          starts.push(event)
        },
        onTaskFinish: (event) => {
          finishes.push(event)
        },
      },
    })).success).toBe(true)
    expect((await scheduler.register(task)).success).toBe(true)
    const first = await scheduler.trigger(task.id, { idempotencyKey: 'stable' })
    const second = await scheduler.trigger(task.id, { idempotencyKey: 'stable' })
    expect(first).toMatchObject({ success: true, data: { status: 'success' } })
    expect(second).toEqual(first)
    expect(calls).toHaveLength(1)
    expect(starts[0].context?.occurrenceId).toBe(calls[0].context.occurrenceId)
    expect(finishes[0].context?.occurrenceId).toBe(calls[0].context.occurrenceId)
    expect(finishes[0].log.occurrenceId).toBe(calls[0].context.occurrenceId)
    expect(calls[0].context).toMatchObject({ occurrenceId: expect.stringMatching(/^[a-f\d]{64}$/), executionToken: expect.any(String), sequence: 1, attempt: 1 })
    const metadata = await scheduler.execution.get(calls[0].context.occurrenceId!)
    expect(metadata).toMatchObject({ success: true, data: { status: 'success', attemptCount: 1 } })
    expect(JSON.stringify(metadata)).not.toContain('executionToken')
    expect(JSON.stringify(metadata)).not.toContain(calls[0].context.executionToken!)
    const observed = await scheduler.getLogs({ taskId: task.id })
    expect(observed).toMatchObject({ success: true, data: { items: [expect.objectContaining({ occurrenceId: calls[0].context.occurrenceId })] } })
  })
})
