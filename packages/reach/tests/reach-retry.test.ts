import type { ReachProvider } from '../src/reach-types.js'
import type { SendLogRepository, StoredSendLog } from '../src/repositories/reach-repository-send-log.js'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { err, ok } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HaiReachError, reach } from '../src/index.js'
import { createConsoleProvider } from '../src/providers/reach-provider-console.js'
import { deliverClaimedMessage } from '../src/reach-delivery.js'
import { startDndScheduler } from '../src/reach-send.js'
import { createSendLogRepository } from '../src/repositories/reach-repository-send-log.js'

const dnd = { enabled: true, strategy: 'delay', start: '22:00', end: '08:00' } as const
const temporaryRoot = fileURLToPath(new URL('../tmp/', import.meta.url))
let temporary: string
let database: string
let repo: SendLogRepository
let now: number

async function initialize() {
  const db = await reldb.init({ type: 'sqlite', database })
  if (!db.success)
    throw new Error(db.error.message)
  const initialized = await reach.init({ providers: [{ name: 'job', type: 'console' }], dnd })
  if (!initialized.success)
    throw new Error(initialized.error.message)
  const repository = await createSendLogRepository(reldb)
  if (!repository.success)
    throw new Error(repository.error.message)
  repo = repository.data
}

async function insert(body = 'bad', maxAttempts = 3): Promise<StoredSendLog> {
  const queueId = crypto.randomUUID()
  const created = await repo.create({
    queueId,
    provider: 'job',
    toAddr: 'sensitive@example.invalid',
    body,
    status: 'pending',
    maxAttempts,
    retryDelayMs: 120_000,
    maxRetryDelayMs: 240_000,
    createdAt: now,
  })
  if (!created.success)
    throw new Error(created.error.message)
  const rows = await repo.findAll({ where: 'queue_id = ?', params: [queueId] })
  if (!rows.success || rows.data.length !== 1)
    throw new Error('Cannot read inserted message')
  return rows.data[0]
}

async function claim(owner: string): Promise<StoredSendLog> {
  const claimed = await repo.claimPendingBatch(owner, { limit: 1, lockMs: 10_000 })
  if (!claimed.success || claimed.data.length !== 1)
    throw new Error('Cannot claim message')
  return claimed.data[0]
}

beforeEach(async () => {
  now = Date.now()
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  vi.spyOn(Date.prototype, 'getHours').mockReturnValue(23)
  await mkdir(temporaryRoot, { recursive: true })
  temporary = await mkdtemp(join(temporaryRoot, 'reach-retry-'))
  database = join(temporary, 'retry.sqlite')
  await initialize()
})

afterEach(async () => {
  await reach.close()
  await reldb.close()
  vi.useRealTimers()
  vi.restoreAllMocks()
  // 只删除本用例在包 tmp/ 下创建的绝对目录，数据库连接已关闭。
  await rm(temporary, { recursive: true, force: true })
})

describe.sequential('bounded durable retries', () => {
  it('公开发送入口把自定义重试策略随入队消息保存', async () => {
    expect((await reach.init({
      providers: [{ name: 'job', type: 'console' }],
      dnd,
      queue: { maxAttempts: 7, retryDelayMs: 3000, maxRetryDelayMs: 9000 },
    })).success).toBe(true)
    const sent = await reach.send({ provider: 'job', to: 'test@example.invalid', body: 'configured policy' })
    if (!sent.success || !sent.data.deferred)
      throw new Error('Message was not durably queued')
    const repository = await createSendLogRepository(reldb)
    if (!repository.success)
      throw new Error('Queue was not initialized')
    expect(await repository.data.findAll({ where: 'queue_id = ?', params: [sent.data.queueId] })).toMatchObject({
      success: true,
      data: [{ maxAttempts: 7, retryDelayMs: 3000, maxRetryDelayMs: 9000, attemptCount: 0 }],
    })
  })

  it('满 100 条持续失败消息每轮只试一次；后续正常消息可达，超限进入 DLQ，恢复有版本保护', async () => {
    const bad: StoredSendLog[] = []
    for (let index = 0; index < 100; index += 1)
      bad.push(await insert('bad', 2))
    const healthy = await insert('healthy', 2)
    const send = vi.fn<ReachProvider['send']>(async message => message.body === 'healthy' ? ok({ success: true }) : err(HaiReachError.SEND_FAILED, 'temporary failure'))
    const provider: ReachProvider = { ...createConsoleProvider(), isConnected: () => true, send }
    vi.mocked(Date.prototype.getHours).mockReturnValue(9)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    startDndScheduler(dnd, new Map([['job', provider]]), repo)
    await vi.waitFor(async () => {
      expect(send).toHaveBeenCalledTimes(100)
      expect(await repo.findAll({ where: 'status IN (?, ?)', params: ['processing', 'sending'] })).toMatchObject({ success: true, data: [] })
      expect(vi.getTimerCount()).toBe(1)
    })
    expect(send).toHaveBeenCalledTimes(100)
    expect(await reach.queue.get(healthy.queueId!)).toMatchObject({ success: true, data: { status: 'pending', attemptCount: 0 } })
    now += 60_000
    await vi.advanceTimersByTimeAsync(60_000)
    expect(send).toHaveBeenCalledTimes(101)
    expect(await reach.queue.get(healthy.queueId!)).toMatchObject({ success: true, data: { status: 'sent', attemptCount: 1 } })
    now += 60_000
    await vi.advanceTimersByTimeAsync(60_000)
    expect(send).toHaveBeenCalledTimes(201)
    const firstPage = await reach.queue.list({ status: 'dead', limit: 50 })
    const secondPage = await reach.queue.list({ status: 'dead', limit: 50, offset: 50 })
    expect(firstPage.success && firstPage.data).toHaveLength(50)
    expect(secondPage.success && secondPage.data).toHaveLength(50)
    expect(JSON.stringify(firstPage)).not.toContain('sensitive@')
    const state = await reach.queue.get(bad[0].queueId!)
    expect(state).toMatchObject({ success: true, data: { status: 'dead', attemptCount: 2, maxAttempts: 2, nextAttemptAt: 0, lastFailure: 'transient_failure' } })
    now += 600_000
    await vi.advanceTimersByTimeAsync(600_000)
    expect(send).toHaveBeenCalledTimes(201)
    if (!state.success || !state.data?.updatedAt)
      throw new Error('Dead state missing')
    const version = state.data.updatedAt
    expect((await reach.queue.list({ status: 'dead', limit: 101 })).success).toBe(false)
    expect((await reach.queue.requeueDead(bad[0].queueId!, { expectedUpdatedAt: version - 1 })).success).toBe(false)
    const recovered = await Promise.all([
      reach.queue.requeueDead(bad[0].queueId!, { expectedUpdatedAt: version }),
      reach.queue.requeueDead(bad[0].queueId!, { expectedUpdatedAt: version }),
    ])
    expect(recovered.filter(result => result.success)).toHaveLength(1)
    send.mockResolvedValue(ok({ success: true }))
    now += 60_000
    await vi.advanceTimersByTimeAsync(60_000)
    expect(await reach.queue.get(bad[0].queueId!)).toMatchObject({ success: true, data: { status: 'sent', attemptCount: 1, maxAttempts: 2, lastFailure: undefined } })
    expect((await reach.queue.requeueDead(bad[0].queueId!, { expectedUpdatedAt: version })).success).toBe(false)
  })

  it('失败退避跨重启保留，指数增长有上限，策略来自消息而非新节点默认值', async () => {
    const inserted = await insert('bad', 4)
    let row = await claim('first')
    expect((await repo.failClaim(row, 'first', 'provider_unavailable')).success).toBe(true)
    const firstDue = now + 120_000
    expect(await reach.queue.get(inserted.queueId!)).toMatchObject({ success: true, data: { nextAttemptAt: firstDue, attemptCount: 1, maxAttempts: 4 } })
    await reach.close()
    await reldb.close()
    await initialize()
    now = firstDue - 1
    expect(await repo.claimPendingBatch('early')).toMatchObject({ success: true, data: [] })
    now += 1
    row = await claim('second')
    expect(row).toMatchObject({ attemptCount: 2, retryDelayMs: 120_000, maxRetryDelayMs: 240_000, maxAttempts: 4 })
    expect((await repo.failClaim(row, 'second', 'transient_failure')).success).toBe(true)
    expect(await reach.queue.get(inserted.queueId!)).toMatchObject({ success: true, data: { nextAttemptAt: now + 240_000 } })
    now += 240_000
    row = await claim('third')
    expect((await repo.failClaim(row, 'third', 'transient_failure')).success).toBe(true)
    expect(await reach.queue.get(inserted.queueId!)).toMatchObject({ success: true, data: { nextAttemptAt: now + 240_000 } })
    now += 240_000
    row = await claim('last')
    expect((await repo.failClaim(row, 'last', 'transient_failure')).success).toBe(true)
    expect(await reach.queue.get(inserted.queueId!)).toMatchObject({ success: true, data: { status: 'dead', attemptCount: 4 } })
  })

  it('永久坏载荷直接死信；unknown 禁止恢复为 pending；领取崩溃也消耗有限次数', async () => {
    const malformed = await insert()
    // vars_json 是不可变业务字段，模拟存储损坏须使用 SQL，而非受限 CRUD update。
    await reldb.sql.execute('UPDATE hai_reach_send_log SET vars_json = ? WHERE id = ?', ['{broken', malformed.id])
    const provider = { ...createConsoleProvider(), isConnected: () => true, send: vi.fn<ReachProvider['send']>() }
    expect((await deliverClaimedMessage(await claim('bad-json'), 'bad-json', provider, repo)).success).toBe(false)
    expect(provider.send).not.toHaveBeenCalled()
    expect(await reach.queue.get(malformed.queueId!)).toMatchObject({ success: true, data: { status: 'dead', attemptCount: 1, lastFailure: 'invalid_message' } })
    const unknown = await insert('unknown', 1)
    const unknownRow = await claim('unknown')
    expect((await repo.beginDelivery(unknownRow.id, 'unknown', false, 10_000)).success).toBe(true)
    const exhausted = await insert('crashed', 1)
    await claim('crashed')
    const safe = await insert('safe-crash', 1)
    await claim('safe')
    expect((await repo.beginDelivery(safe.id, 'safe', true, 10_000)).success).toBe(true)
    now += 10_001
    expect(await repo.claimPendingBatch('next')).toMatchObject({ success: true, data: [] })
    expect(await reach.queue.get(exhausted.queueId!)).toMatchObject({ success: true, data: { status: 'dead', attemptCount: 1, lastFailure: 'attempts_exhausted' } })
    expect(await reach.queue.get(safe.queueId!)).toMatchObject({ success: true, data: { status: 'dead', attemptCount: 1, lastFailure: 'attempts_exhausted' } })
    expect((await repo.markSent(safe.id, 'safe')).success).toBe(false)
    const unknownState = await reach.queue.get(unknown.queueId!)
    expect(unknownState).toMatchObject({ success: true, data: { status: 'unknown' } })
    if (unknownState.success && unknownState.data?.updatedAt)
      expect((await reach.queue.requeueDead(unknown.queueId!, { expectedUpdatedAt: unknownState.data.updatedAt })).success).toBe(false)
  })

  it('同一轮资格截止点排除耗时发送期间重新到期的坏消息', async () => {
    const inserted = await insert()
    const cutoff = now
    const row = await claim('old')
    expect((await repo.failClaim(row, 'old', 'transient_failure')).success).toBe(true)
    now += 240_000
    expect(await repo.claimPendingBatch('same-round', { eligibleBefore: cutoff })).toMatchObject({ success: true, data: [] })
    expect(await repo.claimPendingBatch('new-round')).toMatchObject({ success: true, data: [{ id: inserted.id, attemptCount: 2 }] })
    expect((await repo.failClaim(row, 'old', 'transient_failure')).success).toBe(false)
  })

  it('本轮已经开始的幂等发送即使租约到期也留待下一轮恢复', async () => {
    const inserted = await insert()
    const cutoff = now
    const row = await claim('first')
    expect((await repo.beginDelivery(row.id, 'first', true, 1000)).success).toBe(true)
    now += 1001
    expect(await repo.claimPendingBatch('same-round', { eligibleBefore: cutoff })).toMatchObject({ success: true, data: [] })
    expect(await repo.claimPendingBatch('next-round')).toMatchObject({ success: true, data: [{ id: inserted.id, attemptCount: 2 }] })
    expect((await repo.markSent(row.id, 'first')).success).toBe(false)
  })
})
