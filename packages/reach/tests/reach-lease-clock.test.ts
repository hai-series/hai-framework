import type { DmlWithTxOperations } from '@h-ai/reldb'
import { setTimeout as delay } from 'node:timers/promises'
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { postgresEnv } from '../../reldb/tests/helpers/reldb-test-suite.js'
import { createSendLogRepository, resetSendLogRepoSingleton } from '../src/repositories/reach-repository-send-log.js'

let environment: Awaited<ReturnType<typeof postgresEnv>> | undefined
const previousLevel = core.logger.getLevel()

beforeAll(async () => {
  core.logger.setLevel('fatal')
  environment = await postgresEnv()
  expect((await reldb.init(environment.config)).success).toBe(true)
}, 180000)

beforeEach(async () => {
  expect((await createSendLogRepository(reldb)).success).toBe(true)
  expect((await reldb.sql.execute('DELETE FROM hai_reach_send_log')).success).toBe(true)
})

afterAll(async () => {
  resetSendLogRepoSingleton()
  try {
    await reldb.close()
  }
  finally {
    await environment?.release?.()
    core.logger.setLevel(previousLevel)
  }
})

it('pG 行锁真实等待跨过截止时间后，Reach 旧 owner 续租应失败', async () => {
  const created = await createSendLogRepository(reldb)
  expect(created.success).toBe(true)
  if (!created.success)
    return
  const repository = created.data
  const inserted = await repository.create({ queueId: crypto.randomUUID(), provider: 'review-fixture', toAddr: 'review-fixture', body: 'no external delivery', status: 'pending', createdAt: Date.now() })
  expect(inserted.success).toBe(true)
  const claimed = await repository.claimPendingBatch('review-old-owner', { limit: 1, lockMs: 10000 })
  expect(claimed.success).toBe(true)
  if (!claimed.success || !claimed.data[0])
    throw new Error('Review fixture did not claim a row')
  const row = claimed.data[0]
  expect((await repository.beginDelivery(row.id, 'review-old-owner', true, 10000)).success).toBe(true)

  let held: DmlWithTxOperations | undefined
  let renewal: ReturnType<typeof repository.renewClaim> | undefined
  const requested = Promise.withResolvers<void>()
  const execute = reldb.sql.execute
  const spy = vi.spyOn(reldb.sql, 'execute').mockImplementation((sql, params) => {
    if (sql.includes('SET locked_until =') && sql.includes('processing_owner = ?'))
      requested.resolve()
    return execute(sql, params)
  })
  try {
    const begun = await reldb.tx.begin()
    expect(begun.success).toBe(true)
    if (!begun.success)
      return
    held = begun.data
    expect((await held.get('SELECT id FROM hai_reach_send_log WHERE id = ? FOR UPDATE', [row.id])).success).toBe(true)
    expect((await held.execute('UPDATE hai_reach_send_log SET locked_until = (FLOOR(EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint) + 600 WHERE id = ?', [row.id])).success).toBe(true)
    const expiry = await held.get<{ deadline: string }>('SELECT locked_until AS deadline FROM hai_reach_send_log WHERE id = ?', [row.id])
    expect(expiry.success && expiry.data).toBeTruthy()
    if (!expiry.success || !expiry.data)
      return
    renewal = repository.renewClaim(row.id, 'review-old-owner', 10000)
    const controller = new AbortController()
    try {
      await Promise.race([requested.promise, delay(5000, undefined, { signal: controller.signal }).then(() => {
        throw new Error('Renewal did not reach SQL')
      })])
    }
    finally {
      controller.abort()
    }
    await delay(1200)
    const elapsed = await reldb.sql.get<{ now: string }>('SELECT (FLOOR(EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint) AS now')
    expect(elapsed.success && elapsed.data && Number(elapsed.data.now) > Number(expiry.data.deadline)).toBe(true)
    expect((await held.commit()).success).toBe(true)
    held = undefined
    // 最终 SQL 必须拒绝等待行锁期间已经过期的旧领取。
    expect((await renewal).success).toBe(false)
  }
  finally {
    if (held)
      await held.rollback()
    await renewal
    spy.mockRestore()
  }
})

it('工作节点墙钟相差一小时也不能提前失效或抢占有效租约', async () => {
  const created = await createSendLogRepository(reldb)
  expect(created.success).toBe(true)
  if (!created.success)
    return
  const repository = created.data
  const stored = await repository.create({ queueId: crypto.randomUUID(), provider: 'clock-fixture', toAddr: 'fixture', body: 'no external delivery', status: 'pending', createdAt: Date.now() })
  expect(stored.success).toBe(true)
  const claim = await repository.claimPendingBatch('clock-owner', { limit: 1, lockMs: 10000 })
  expect(claim.success && claim.data.length).toBe(1)
  if (!claim.success || !claim.data[0])
    return
  const id = claim.data[0].id
  const now = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 3600000)
  try {
    expect(await repository.claimPendingBatch('future-node')).toMatchObject({ success: true, data: [] })
    expect((await repository.beginDelivery(id, 'clock-owner', true, 10000)).success).toBe(true)
    expect((await repository.renewClaim(id, 'clock-owner', 10000)).success).toBe(true)
    expect((await repository.markSent(id, 'clock-owner', 'confirmed')).success).toBe(true)
  }
  finally { now.mockRestore() }
})
