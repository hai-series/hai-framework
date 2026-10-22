import type { ReldbConfigInput } from '@h-ai/reldb'
import type { StartedTestContainer } from 'testcontainers'
import type { SendLogRepository } from '../src/repositories/reach-repository-send-log.js'
import { reldb } from '@h-ai/reldb'
import { GenericContainer, Wait } from 'testcontainers'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { HaiReachError } from '../src/index.js'
import { createSendLogRepository, resetSendLogRepoSingleton } from '../src/repositories/reach-repository-send-log.js'

const milliseconds = 1_789_009_309_123
const leaseMs = 1234
const table = 'hai_reach_send_log'

for (const type of ['sqlite', 'postgresql', 'mysql'] as const) {
  describe.sequential(`reach epoch milliseconds (${type})`, () => {
    let container: StartedTestContainer | undefined
    let repository: SendLogRepository

    beforeAll(async () => {
      let config: ReldbConfigInput = { type: 'sqlite', database: ':memory:' }
      if (type !== 'sqlite') {
        const postgres = type === 'postgresql'
        const port = postgres ? 5432 : 3306
        const database = 'reach_epoch_test'
        const password = 'reach_epoch_test'
        container = await new GenericContainer(postgres ? 'docker.io/library/postgres:16.15-alpine' : 'docker.io/library/mysql:8.4.11')
          .withExposedPorts(port)
          .withEnvironment(postgres
            ? { POSTGRES_DB: database, POSTGRES_USER: 'reach_test', POSTGRES_PASSWORD: password }
            : { MYSQL_DATABASE: database, MYSQL_ROOT_PASSWORD: password })
          .withWaitStrategy(postgres
            ? Wait.forLogMessage('database system is ready to accept connections', 2)
            : Wait.forLogMessage(/ready for connections\..*port: 3306/))
          .withStartupTimeout(120_000)
          .start()
        config = {
          type,
          host: container.getHost(),
          port: container.getMappedPort(port),
          database,
          user: postgres ? 'reach_test' : 'root',
          password,
        }
      }
      const initialized = await reldb.init(config)
      if (!initialized.success)
        throw new Error(initialized.error.message)
    }, 150_000)

    beforeEach(async () => {
      resetSendLogRepoSingleton()
      const dropped = await reldb.ddl.dropTable(table, true)
      if (!dropped.success)
        throw new Error(dropped.error.message)
      const created = await createSendLogRepository(reldb)
      if (!created.success)
        throw new Error(created.error.message)
      repository = created.data
    })

    afterAll(async () => {
      resetSendLogRepoSingleton()
      try {
        await reldb.close()
      }
      finally {
        await container?.stop({ timeout: 10_000, remove: true, removeVolumes: true })
      }
    }, 30_000)

    async function insertPending() {
      const created = await repository.create({
        provider: 'test',
        toAddr: 'epoch-test',
        status: 'pending',
        body: 'millisecond precision',
        createdAt: milliseconds,
        updatedAt: milliseconds,
      })
      if (!created.success)
        throw new Error(created.error.message)
      const pending = await repository.findPending()
      if (!pending.success || pending.data.length !== 1)
        throw new Error('Pending record was not persisted')
      expect(pending.data[0].id).toBeTypeOf('number')
      return pending.data[0].id
    }

    it('三项队列时间列均使用可容纳毫秒的 BIGINT', async () => {
      if (type === 'sqlite') {
        const columns = await reldb.sql.query<{ name: string, type: string }>(`PRAGMA table_info(${table})`)
        expect(columns.success).toBe(true)
        if (columns.success) {
          const fields = columns.data.filter(column => ['created_at', 'updated_at', 'locked_until'].includes(column.name))
          expect(fields).toHaveLength(3)
          expect(fields.every(column => column.type === 'INTEGER')).toBe(true)
        }
      }
      else {
        const columns = await reldb.sql.query<{ field_name: string, field_type: string }>(
          'SELECT column_name AS field_name, data_type AS field_type FROM information_schema.columns WHERE table_name = ? AND table_schema = ?',
          [table, type === 'postgresql' ? 'public' : 'reach_epoch_test'],
        )
        expect(columns.success).toBe(true)
        if (columns.success) {
          const fields = columns.data.filter(column => ['created_at', 'updated_at', 'locked_until'].includes(column.field_name))
          expect(fields).toHaveLength(3)
          expect(fields.every(column => column.field_type === 'bigint')).toBe(true)
        }
      }
    })

    it('写入、领取与毫秒级过期接管在真实数据库保持精确值', async () => {
      const id = await insertPending()
      const claimed = await repository.claimPendingBatch('node-a', { now: milliseconds, lockMs: leaseMs })
      expect(claimed).toMatchObject({
        success: true,
        data: [{ id, createdAt: milliseconds, updatedAt: milliseconds, lockedUntil: milliseconds + leaseMs }],
      })
      const early = await repository.claimPendingBatch('node-b', { now: milliseconds + leaseMs - 1 })
      expect(early).toMatchObject({ success: true, data: [] })
      const recoveredAt = milliseconds + leaseMs + 1
      const recovered = await repository.claimPendingBatch('node-b', { now: recoveredAt, lockMs: leaseMs })
      expect(recovered).toMatchObject({
        success: true,
        data: [{ id, processingOwner: 'node-b', createdAt: milliseconds, updatedAt: recoveredAt, lockedUntil: recoveredAt + leaseMs }],
      })
    })

    it('各读取入口将驱动 BIGINT 转成 number，释放及投递状态更新时间仍保留毫秒', async () => {
      const id = await insertPending()
      const raw = await reldb.sql.get<{ created_at: unknown }>(`SELECT created_at FROM ${table} WHERE id = ?`, [id])
      expect(raw.success).toBe(true)
      if (raw.success && type === 'postgresql')
        expect(raw.data?.created_at).toBeTypeOf('string')
      const reads = [await repository.findById(id), await repository.getById(id)]
      for (const result of reads)
        expect(result).toMatchObject({ success: true, data: { createdAt: milliseconds, updatedAt: milliseconds } })
      const page = await repository.findPage({})
      expect(page).toMatchObject({ success: true, data: { items: [{ createdAt: milliseconds, updatedAt: milliseconds }] } })
      const claimed = await repository.claimPendingBatch('node-a', { now: milliseconds, lockMs: leaseMs })
      expect(claimed.success).toBe(true)
      const now = vi.spyOn(Date, 'now').mockReturnValue(milliseconds + 123)
      try {
        const released = await repository.releaseClaim(id, 'node-a')
        expect(released.success).toBe(true)
        const record = await repository.findById(id)
        expect(record).toMatchObject({ success: true, data: { status: 'pending', updatedAt: milliseconds + 123 } })
        const reclaimed = await repository.claimPendingBatch('node-b', { now: milliseconds + 124, lockMs: leaseMs })
        expect(reclaimed.success).toBe(true)
        now.mockReturnValue(milliseconds + 125)
        const sent = await repository.markSent(id, 'delivered', undefined, 'node-b')
        expect(sent.success).toBe(true)
        expect(await repository.findById(id)).toMatchObject({
          success: true,
          data: { status: 'sent', messageId: 'delivered', createdAt: milliseconds, updatedAt: milliseconds + 125 },
        })
      }
      finally {
        now.mockRestore()
      }
    })

    it.each(['created_at', 'updated_at', 'locked_until'] as const)('所有读取入口拒绝 %s 超过 JS 安全整数范围，而非静默舍入', async (column) => {
      const id = await insertPending()
      // 列名来自上方固定用例列表；数值仍使用参数化 SQL。
      const corrupted = await reldb.sql.execute(`UPDATE ${table} SET ${column} = ? WHERE id = ?`, ['9007199254740993', id])
      expect(corrupted.success).toBe(true)
      const reads = [
        await repository.findById(id),
        await repository.getById(id),
        await repository.findAll(),
        await repository.findPage({}),
      ]
      for (const result of reads) {
        expect(result.success).toBe(false)
        if (!result.success)
          expect(result.error.code).toBe(HaiReachError.SEND_FAILED.code)
      }
    })
  })
}
