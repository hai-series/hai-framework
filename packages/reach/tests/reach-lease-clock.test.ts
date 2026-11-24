import type { DmlWithTxOperations } from '@h-ai/reldb'
import { setTimeout as delay } from 'node:timers/promises'
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { postgresEnv } from '../../reldb/tests/helpers/reldb-test-suite.js'
import { HaiReachError } from '../src/index.js'
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

it.each([
  'beginDelivery',
  'renewClaim',
  'failClaim',
  'markSent',
] as const)('pG 纯行锁等待跨过截止时间后，旧 owner 的 %s 应失败', async (operation) => {
  const created = await createSendLogRepository(reldb)
  expect(created.success).toBe(true)
  if (!created.success)
    return
  const repository = created.data
  const inserted = await repository.create({
    queueId: crypto.randomUUID(),
    provider: 'review-fixture',
    toAddr: 'review-fixture',
    body: 'no external delivery',
    status: 'pending',
    createdAt: Date.now(),
  })
  expect(inserted.success).toBe(true)
  const claimed = await repository.claimPendingBatch('review-old-owner', { limit: 1, lockMs: 10000 })
  expect(claimed.success).toBe(true)
  if (!claimed.success || !claimed.data[0])
    throw new Error('Review fixture did not claim a row')
  const row = claimed.data[0]
  if (operation !== 'beginDelivery' && operation !== 'failClaim')
    expect((await repository.beginDelivery(row.id, 'review-old-owner', true, 10000)).success).toBe(true)
  const shortLease = await reldb.sql.execute('UPDATE hai_reach_send_log SET locked_until = (FLOOR(EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint) + 1000 WHERE id = ?', [row.id])
  expect(shortLease.success).toBe(true)

  let held: DmlWithTxOperations | undefined
  let pending: ReturnType<typeof repository.renewClaim> | undefined
  try {
    const begun = await reldb.tx.begin()
    expect(begun.success).toBe(true)
    if (!begun.success)
      return
    held = begun.data
    expect((await held.get('SELECT id FROM hai_reach_send_log WHERE id = ? FOR UPDATE', [row.id])).success).toBe(true)
    const expiry = await held.get<{ deadline: string, pid: number }>('SELECT locked_until AS deadline, pg_backend_pid() AS pid FROM hai_reach_send_log WHERE id = ?', [row.id])
    expect(expiry.success && expiry.data).toBeTruthy()
    if (!expiry.success || !expiry.data)
      return
    const { deadline, pid } = expiry.data
    const owner = 'review-old-owner'
    const operations = {
      beginDelivery: () => repository.beginDelivery(row.id, owner, true, 10000),
      renewClaim: () => repository.renewClaim(row.id, owner, 10000),
      failClaim: () => repository.failClaim(row, owner, 'transient_failure'),
      markSent: () => repository.markSent(row.id, owner),
    }
    pending = operations[operation]()
    await vi.waitFor(async () => {
      const blocked = await reldb.sql.get('SELECT pid FROM pg_stat_activity WHERE ? = ANY(pg_blocking_pids(pid))', [pid])
      expect(blocked.success && blocked.data).toBeTruthy()
    }, { timeout: 900, interval: 15 })
    const blockedAt = await repository.currentTime()
    expect(blockedAt.success && blockedAt.data < Number(deadline)).toBe(true)
    if (!blockedAt.success)
      return
    await delay(Number(deadline) - blockedAt.data + 20)
    expect((await held.commit()).success).toBe(true)
    held = undefined
    expect(await pending).toMatchObject({
      success: false,
      error: { code: HaiReachError.SEND_FAILED.code },
    })
  }
  finally {
    if (held)
      await held.rollback()
    await pending
  }
})

it('工作节点墙钟相差一小时也不能提前失效或抢占有效租约', async () => {
  const created = await createSendLogRepository(reldb)
  expect(created.success).toBe(true)
  if (!created.success)
    return
  const repository = created.data
  const stored = await repository.create({
    queueId: crypto.randomUUID(),
    provider: 'clock-fixture',
    toAddr: 'fixture',
    body: 'no external delivery',
    status: 'pending',
    createdAt: Date.now(),
  })
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
