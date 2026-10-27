import type { ReldbConfigInput } from '@h-ai/reldb'
import type { StartedTestContainer } from 'testcontainers'
import type { SendLogRepository } from '../src/repositories/reach-repository-send-log.js'
import { reldb } from '@h-ai/reldb'
import { GenericContainer, Wait } from 'testcontainers'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
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
        queueId: crypto.randomUUID(),
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

    it('四项队列时间列均使用可容纳毫秒的 BIGINT', async () => {
      if (type === 'sqlite') {
        const columns = await reldb.sql.query<{ name: string, type: string }>(`PRAGMA table_info(${table})`)
        expect(columns.success).toBe(true)
        if (columns.success) {
          const fields = columns.data.filter(column => ['created_at', 'updated_at', 'locked_until', 'next_attempt_at'].includes(column.name))
          expect(fields).toHaveLength(4)
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
          const fields = columns.data.filter(column => ['created_at', 'updated_at', 'locked_until', 'next_attempt_at'].includes(column.field_name))
          expect(fields).toHaveLength(4)
          expect(fields.every(column => column.field_type === 'bigint')).toBe(true)
        }
      }
    })

    it('真实数据库的领取计数、退避边界、死信恢复和旧 owner 条件均持久生效', async () => {
      const id = await insertPending()
      expect((await reldb.sql.execute('UPDATE hai_reach_send_log SET max_attempts = 2, retry_delay_ms = 1234 WHERE id = ?', [id])).success).toBe(true)
      const first = await repository.claimPendingBatch('first')
      expect(first).toMatchObject({ success: true, data: [{ attemptCount: 1, maxAttempts: 2 }] })
      if (!first.success)
        throw new Error('First claim failed')
      expect((await repository.failClaim(first.data[0], 'first', 'transient_failure')).success).toBe(true)
      const backoff = await repository.getById(id)
      expect(backoff.success).toBe(true)
      if (backoff.success)
        expect(Math.abs(backoff.data.nextAttemptAt - backoff.data.updatedAt - 1234)).toBeLessThanOrEqual(1)
      expect(await repository.claimPendingBatch('early')).toMatchObject({ success: true, data: [] })
      // 调整本套隔离数据库的到期状态，不以伪造节点时间代替数据库时钟。
      expect((await reldb.sql.execute('UPDATE hai_reach_send_log SET next_attempt_at = 0 WHERE id = ?', [id])).success).toBe(true)
      const second = await repository.claimPendingBatch('second')
      expect(second).toMatchObject({ success: true, data: [{ attemptCount: 2 }] })
      if (!second.success)
        throw new Error('Second claim failed')
      expect((await repository.failClaim(first.data[0], 'first', 'transient_failure')).success).toBe(false)
      expect((await repository.failClaim(second.data[0], 'second', 'transient_failure')).success).toBe(true)
      const dead = await repository.getById(id)
      expect(dead).toMatchObject({ success: true, data: { status: 'dead', attemptCount: 2, nextAttemptAt: 0 } })
      expect(await repository.claimPendingBatch('exhausted')).toMatchObject({ success: true, data: [] })
      if (!dead.success || !dead.data.queueId)
        throw new Error('Dead state missing')
      expect((await repository.requeueDead(dead.data.queueId, dead.data.updatedAt - 1)).success).toBe(false)
      expect((await repository.requeueDead(dead.data.queueId, dead.data.updatedAt)).success).toBe(true)
      expect((await repository.requeueDead(dead.data.queueId, dead.data.updatedAt)).success).toBe(false)
      expect(await repository.claimPendingBatch('restored')).toMatchObject({ success: true, data: [{ queueId: dead.data.queueId, attemptCount: 1 }] })
    })

    it('写入、领取与毫秒级过期接管在真实数据库保持精确值', async () => {
      const id = await insertPending()
      const claimed = await repository.claimPendingBatch('node-a', { lockMs: 10000 })
      expect(claimed).toMatchObject({ success: true, data: [{ id, createdAt: milliseconds }] })
      if (!claimed.success)
        throw new Error('Claim failed')
      const row = claimed.data[0]!
      expect(Number.isSafeInteger(row.updatedAt)).toBe(true)
      expect(Math.abs(row.lockedUntil! - row.updatedAt - 10000)).toBeLessThanOrEqual(1)
      expect(await repository.claimPendingBatch('node-b')).toMatchObject({ success: true, data: [] })
      expect((await reldb.sql.execute('UPDATE hai_reach_send_log SET locked_until = 0, updated_at = 0 WHERE id = ?', [id])).success).toBe(true)
      const recovered = await repository.claimPendingBatch('node-b', { lockMs: leaseMs })
      expect(recovered).toMatchObject({ success: true, data: [{ id, processingOwner: 'node-b', createdAt: milliseconds }] })
      if (recovered.success)
        expect(Math.abs(recovered.data[0]!.lockedUntil! - recovered.data[0]!.updatedAt - leaseMs)).toBeLessThanOrEqual(1)
    })

    it('各读取入口将驱动 BIGINT 转成 number，释放及投递状态更新时间仍保留毫秒', async () => {
      const id = await insertPending()
      const raw = await reldb.sql.get<{ created_at: unknown }>(`SELECT created_at FROM ${table} WHERE id = ?`, [id])
      expect(raw.success).toBe(true)
      if (raw.success && type === 'postgresql')
        expect(raw.data?.created_at).toBeTypeOf('string')
      for (const read of [await repository.findById(id), await repository.getById(id)])
        expect(read).toMatchObject({ success: true, data: { createdAt: milliseconds, updatedAt: milliseconds } })
      expect(await repository.findPage({})).toMatchObject({ success: true, data: { items: [{ createdAt: milliseconds, updatedAt: milliseconds }] } })
      expect((await repository.claimPendingBatch('node-a', { lockMs: 10000 })).success).toBe(true)
      expect((await repository.releaseClaim(id, 'node-a')).success).toBe(true)
      const released = await repository.getById(id)
      expect(released).toMatchObject({ success: true, data: { status: 'pending' } })
      if (released.success)
        expect(Number.isSafeInteger(released.data.updatedAt)).toBe(true)
      expect((await reldb.sql.execute('UPDATE hai_reach_send_log SET next_attempt_at = 0 WHERE id = ?', [id])).success).toBe(true)
      expect((await repository.claimPendingBatch('node-b', { lockMs: 10000 })).success).toBe(true)
      expect((await repository.beginDelivery(id, 'node-b', true, 10000)).success).toBe(true)
      expect((await repository.markSent(id, 'node-b', 'delivered')).success).toBe(true)
      const sent = await repository.getById(id)
      expect(sent).toMatchObject({ success: true, data: { status: 'sent', messageId: 'delivered', createdAt: milliseconds } })
      if (sent.success && released.success)
        expect(sent.data.updatedAt).toBeGreaterThanOrEqual(released.data.updatedAt)
    })

    it.each(['created_at', 'updated_at', 'locked_until', 'next_attempt_at'] as const)('所有读取入口拒绝 %s 超过 JS 安全整数范围，而非静默舍入', async (column) => {
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

    it.each([false, true])('在途记录过期按 retrySafe=%s 恢复，旧 owner 不能再次投递或确认', async (retrySafe) => {
      const id = await insertPending()
      expect((await repository.claimPendingBatch('old', { lockMs: 10000 })).success).toBe(true)
      expect((await repository.beginDelivery(id, 'old', retrySafe, 10000)).success).toBe(true)
      expect((await repository.renewClaim(id, 'old', 10000)).success).toBe(true)
      expect(await repository.claimPendingBatch('other')).toMatchObject({ success: true, data: [] })
      expect((await reldb.sql.execute('UPDATE hai_reach_send_log SET locked_until = 0, updated_at = 0 WHERE id = ?', [id])).success).toBe(true)
      const recovered = await repository.claimPendingBatch('new', { lockMs: 10000 })
      expect(recovered.success).toBe(true)
      if (recovered.success)
        expect(recovered.data).toHaveLength(retrySafe ? 1 : 0)
      expect((await repository.beginDelivery(id, 'old', retrySafe)).success).toBe(false)
      expect((await repository.renewClaim(id, 'old')).success).toBe(false)
      expect((await repository.markSent(id, 'old')).success).toBe(false)
      expect((await repository.releaseClaim(id, 'old')).success).toBe(false)
      if (retrySafe) {
        expect((await repository.beginDelivery(id, 'new', true)).success).toBe(true)
        expect((await repository.markSent(id, 'new', 'new-result')).success).toBe(true)
      }
      else {
        expect(await repository.findById(id)).toMatchObject({ success: true, data: { status: 'unknown' } })
      }
    })
  })
}
