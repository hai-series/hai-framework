import type { ReldbConfigInput } from '@h-ai/reldb'
import type { StartedTestContainer } from 'testcontainers'
import type { TaskDefinition, TaskExecutionLog } from '../src/index.js'
import { reldb } from '@h-ai/reldb'
import { GenericContainer, Wait } from 'testcontainers'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { executionId, SchedulerExecutionRepository } from '../src/repositories/index.js'

const task: TaskDefinition = { id: 'database-task', name: 'database-task', cron: '* * * * *', retry: { maxAttempts: 3 } }
const trigger = { type: 'manual', source: null } as const
const table = 'hai_scheduler_executions'

function successLog(now: number): TaskExecutionLog {
  return { id: 0, taskId: task.id, taskName: task.name, taskType: 'hook', triggerType: 'manual', triggerSource: null, status: 'success', result: 'committed', error: null, startedAt: now, finishedAt: now, duration: 0 }
}

for (const type of ['sqlite', 'postgresql', 'mysql'] as const) {
  describe.sequential(`shared execution protocol (${type})`, () => {
    let container: StartedTestContainer | undefined
    let repo: SchedulerExecutionRepository
    let now: number

    beforeAll(async () => {
      let config: ReldbConfigInput = { type: 'sqlite', database: ':memory:' }
      if (type !== 'sqlite') {
        const postgres = type === 'postgresql'
        const port = postgres ? 5432 : 3306
        container = await new GenericContainer(postgres ? 'docker.io/library/postgres:16.15-alpine' : 'docker.io/library/mysql:8.4.11')
          .withExposedPorts(port)
          .withEnvironment(postgres
            ? { POSTGRES_DB: 'scheduler_execution', POSTGRES_USER: 'scheduler_test', POSTGRES_PASSWORD: 'scheduler_test' }
            : { MYSQL_DATABASE: 'scheduler_execution', MYSQL_ROOT_PASSWORD: 'scheduler_test' })
          .withWaitStrategy(postgres ? Wait.forLogMessage('database system is ready to accept connections', 2) : Wait.forLogMessage(/ready for connections\..*port: 3306/))
          .withStartupTimeout(120_000)
          .start()
        config = { type, host: container.getHost(), port: container.getMappedPort(port), database: 'scheduler_execution', user: postgres ? 'scheduler_test' : 'root', password: 'scheduler_test' }
      }
      expect((await reldb.init(config)).success).toBe(true)
    }, 150_000)

    beforeEach(async () => {
      expect((await reldb.ddl.dropTable(table, true)).success).toBe(true)
      repo = new SchedulerExecutionRepository(reldb)
      expect((await repo.count()).success).toBe(true)
      now = 1_789_009_309_123
      vi.spyOn(Date, 'now').mockImplementation(() => now)
    })

    afterEach(() => vi.restoreAllMocks())

    afterAll(async () => {
      try {
        await reldb.close()
      }
      finally {
        await container?.stop({ timeout: 10_000, remove: true, removeVolumes: true })
      }
    }, 30_000)

    it('跨 occurrence 唯一槽和过期前门闩阻止旧 owner；确认终态后允许下次执行', async () => {
      const id = executionId(task.id, 'manual', 'first')
      const first = await repo.claim(task, id, trigger, 'a', 1000)
      if (!first.success || !first.data)
        throw new Error('Initial claim failed')
      expect(first.data.sequence).toBeTypeOf('number')
      expect(first.data.leasedUntil).toBe(now + 1000)
      expect(await repo.claim(task, executionId(task.id, 'scheduled', 'next-minute'), trigger, 'b', 1000)).toMatchObject({ success: true, data: null })
      now += 1001
      const recovered = await repo.claim(task, id, trigger, 'b', 1000)
      if (!recovered.success || !recovered.data)
        throw new Error('Recovery claim failed')
      expect((await repo.begin(first.data, 1000)).success).toBe(false)
      expect((await repo.renew(first.data, 1000)).success).toBe(false)
      expect((await repo.begin(recovered.data, 1000)).success).toBe(true)
      expect((await repo.finish(first.data, successLog(now))).success).toBe(false)
      expect((await repo.finish(recovered.data, successLog(now))).success).toBe(true)
      const second = await repo.claim(task, executionId(task.id, 'manual', 'second'), trigger, 'b', 1000)
      expect(second.success && second.data?.sequence).toBeGreaterThan(recovered.data.sequence)
    })

    it.each([false, true])('已开始的过期执行按 idempotent=%s 处理，尝试次数保留', async (idempotent) => {
      const definition = { ...task, idempotent }
      const id = executionId(task.id, 'manual', 'started')
      const first = await repo.claim(definition, id, trigger, 'old', 1000)
      if (!first.success || !first.data)
        throw new Error('Initial claim failed')
      expect((await repo.begin(first.data, 1000)).success).toBe(true)
      now += 1001
      const next = await repo.claim(definition, id, trigger, 'new', 1000)
      expect(next.success).toBe(true)
      expect((await repo.begin(first.data, 1000)).success).toBe(false)
      if (idempotent) {
        if (!next.success || !next.data)
          throw new Error('Idempotent recovery failed')
        expect(next.data.attemptCount).toBe(1)
        expect((await repo.begin(next.data, 1000)).success).toBe(true)
        expect(next.data.attemptCount).toBe(2)
        expect((await repo.finish(next.data, successLog(now))).success).toBe(true)
      }
      else {
        expect(next).toMatchObject({ success: true, data: null })
        const unknown = await repo.byOccurrence(id)
        expect(unknown).toMatchObject({ success: true, data: { status: 'unknown', attemptCount: 1 } })
        expect(await repo.claim(task, executionId(task.id, 'manual', 'blocked'), trigger, 'new', 1000)).toMatchObject({ success: true, data: null })
        if (!unknown.success || !unknown.data)
          throw new Error('Unknown state missing')
        expect((await repo.resolve(id, 'discarded', unknown.data.updatedAt - 1)).success).toBe(false)
        expect((await repo.resolve(id, 'discarded', unknown.data.updatedAt)).success).toBe(true)
        expect((await repo.resolve(id, 'success', unknown.data.updatedAt)).success).toBe(false)
      }
    })

    it('读取拒绝超出安全整数的租约时间，终态相同 occurrence 不再领取', async () => {
      const id = executionId(task.id, 'manual', 'unsafe-integer')
      const claimed = await repo.claim(task, id, trigger, 'a', 1000)
      if (!claimed.success || !claimed.data)
        throw new Error('Claim failed')
      expect((await repo.begin(claimed.data, 1000)).success).toBe(true)
      expect((await repo.finish(claimed.data, successLog(now))).success).toBe(true)
      expect(await repo.claim(task, id, trigger, 'b', 1000)).toMatchObject({ success: true, data: { status: 'success', attemptCount: 1 } })
      expect((await reldb.sql.execute(`UPDATE ${table} SET leased_until = ? WHERE occurrence_id = ?`, ['9007199254740993', id])).success).toBe(true)
      expect((await repo.byOccurrence(id)).success).toBe(false)
    })
  })
}
