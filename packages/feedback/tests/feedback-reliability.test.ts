import type { QueryRow } from '@h-ai/reldb'
import type { FeedbackContext } from '../src/index.js'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { core, err, ok } from '@h-ai/core'
import { HaiReachError, reach } from '@h-ai/reach'
import { reldb } from '@h-ai/reldb'
import { storage } from '@h-ai/storage'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { feedback, HaiFeedbackError } from '../src/index.js'

const actor: FeedbackContext = { scopeId: 'tenant-a', userId: 'user-a' }
const admin: FeedbackContext = { scopeId: actor.scopeId, userId: 'administrator', permissions: ['feedback:*'] }
const config = { appId: 'reliability-test', recipients: ['admin@example.test'], notificationProvider: 'email', adminUrl: 'http://localhost/admin/feedback', workerIntervalMs: 0, collectionTimeoutMs: 60000, leaseMs: 1000, maxAttempts: 1 }
let directory: string | undefined
let previousLevel = core.logger.getLevel()

beforeEach(async () => {
  previousLevel = core.logger.getLevel()
  core.logger.setLevel('fatal')
  directory = await mkdtemp(join(tmpdir(), 'hai-feedback-reliability-'))
  expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
  expect((await storage.init({ type: 'local', root: directory })).success).toBe(true)
  expect((await reach.init({ providers: [{ name: 'email', type: 'console' }] })).success).toBe(true)
  expect((await feedback.init(config)).success).toBe(true)
})

afterEach(async () => {
  vi.restoreAllMocks()
  await feedback.close()
  await reach.close()
  await storage.close()
  await reldb.close()
  if (directory)
    await rm(directory, { recursive: true, force: true })
  directory = undefined
  core.logger.setLevel(previousLevel)
})

describe.sequential('反馈可靠性边界', () => {
  it('每日提交配额在事务中原子预留，重复提交不重复计数，拒绝不留下报告', async () => {
    await feedback.close()
    expect((await feedback.init({ ...config, maxReportsPerUserDay: 1 })).success).toBe(true)
    const first = await feedback.submit({ appId: config.appId, submissionId: 'quota-once' }, actor)
    expect(first.success).toBe(true)
    expect((await feedback.submit({ appId: config.appId, submissionId: 'quota-once' }, actor)).success).toBe(true)
    expect(await feedback.submit({ appId: config.appId, submissionId: 'quota-twice' }, actor)).toMatchObject({ success: false, error: { code: HaiFeedbackError.QUOTA_EXCEEDED.code } })
    expect(await feedback.list({}, admin)).toMatchObject({ success: true, data: { total: 1 } })
    expect((await feedback.submit({ appId: config.appId, submissionId: 'other-user' }, { ...actor, userId: 'another-user' })).success).toBe(true)
    expect(await reldb.sql.get('SELECT COUNT(*) AS count FROM hai_feedback_quotas WHERE period = -1')).toMatchObject({ success: true, data: { count: 2 } })
  })

  it('scope 存储预留包含历史 ZIP，超限在上传之前拒绝且隔离其它 scope', async () => {
    await feedback.close()
    expect((await feedback.init({ ...config, maxExportsPerReport: 1, maxStoredBytesPerScope: 64 * 1024 * 1024 })).success).toBe(true)
    expect((await feedback.submit({ appId: config.appId, submissionId: 'storage-first' }, actor)).success).toBe(true)
    expect(await feedback.submit({ appId: config.appId, submissionId: 'storage-second' }, { ...actor, userId: 'other' })).toMatchObject({ success: false, error: { code: HaiFeedbackError.QUOTA_EXCEEDED.code } })
    expect((await feedback.submit({ appId: config.appId, submissionId: 'storage-second' }, { ...actor, scopeId: 'tenant-b' })).success).toBe(true)
  })

  it('到期临时证据按应用限批清理，保留其它应用数据', async () => {
    const now = Date.now()
    for (let index = 0; index < 202; index++) {
      const saved = await reldb.sql.execute('INSERT INTO hai_feedback_evidence (id, report_id, scope_id, user_id, app_id, source, sequence, kind, timestamp, revision, bytes, expires_at, payload) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [`expired-${index}`, actor.scopeId, actor.userId, index === 201 ? 'other-app' : config.appId, 'server:log', index, 'log', now - 1000, 0, 2, now - 1, '{}'])
      expect(saved.success).toBe(true)
    }
    expect((await feedback.runJobs()).success).toBe(true)
    expect(await reldb.sql.get('SELECT COUNT(*) AS count FROM hai_feedback_evidence WHERE app_id = ?', [config.appId])).toMatchObject({ success: true, data: { count: 101 } })
    expect((await feedback.runJobs()).success).toBe(true)
    expect((await feedback.runJobs()).success).toBe(true)
    expect(await reldb.sql.get('SELECT COUNT(*) AS count FROM hai_feedback_evidence')).toMatchObject({ success: true, data: { count: 1 } })
  })

  it('服务端环境证据写入失败时不留下伪完整受理，恢复后相同提交可安全重试', async () => {
    const begin = reldb.tx.begin
    const failing = vi.spyOn(reldb.tx, 'begin').mockImplementation(async () => {
      const started = await begin()
      if (!started.success)
        return started
      const execute = started.data.execute
      started.data.execute = async (sql, params) => sql.startsWith('INSERT INTO hai_feedback_evidence') && params?.includes('environment')
        ? err(HaiFeedbackError.OPERATION_FAILED, 'Environment fixture write unavailable')
        : execute(sql, params)
      return started
    })
    const input = { submissionId: 'atomic-environment', appId: config.appId }
    try {
      expect((await feedback.submit(input, actor)).success).toBe(false)
      expect(await feedback.list({}, admin)).toMatchObject({ success: true, data: { total: 0 } })
    }
    finally { failing.mockRestore() }
    const report = await feedback.submit(input, actor)
    expect(report.success).toBe(true)
    if (!report.success)
      return
    expect((await feedback.submit(input, actor)).success).toBe(true)
    expect(await feedback.getEvidence({ id: report.data.id, kind: 'environment' }, admin)).toMatchObject({ success: true, data: { total: 1 } })
  })

  it('同租户只读管理员不能借read权限为他人的反馈追加或结束采集', async () => {
    const report = await feedback.submit({ submissionId: 'read-is-not-write', appId: config.appId }, actor)
    expect(report.success).toBe(true)
    if (!report.success)
      return
    const reader: FeedbackContext = { scopeId: actor.scopeId, userId: 'read-only-user', permissions: ['feedback:read'] }
    expect((await feedback.get(report.data.id, reader)).success).toBe(true)
    const write = await feedback.appendEvidence({ id: report.data.id, evidence: [{ id: 'forged-by-reader', source: 'browser', sequence: 1, kind: 'log', timestamp: Date.now(), data: { message: 'Reader altered evidence' } }] }, reader)
    expect(write).toMatchObject({ success: false, error: { code: HaiFeedbackError.FORBIDDEN.code } })
    expect((await feedback.completeCollection({ id: report.data.id }, reader)).success).toBe(false)
    const detail = await feedback.get(report.data.id, admin)
    expect(detail.success && detail.data.report.collectionStatus).toBe('collecting')
    const events = await feedback.getEvidence({ id: report.data.id, source: 'browser' }, actor)
    expect(events.success && events.data.total).toBe(0)
  })

  it('补采等待期间失去claim后不追加旧现场或覆盖新owner的材料状态', async () => {
    const report = await feedback.submit({ submissionId: 'lost-collection-owner', appId: config.appId }, actor)
    expect(report.success).toBe(true)
    if (!report.success)
      return
    expect((await feedback.completeCollection({ id: report.data.id }, actor)).success).toBe(true)
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const original = reldb.sql.query
    let paused = false
    const query = vi.spyOn(reldb.sql, 'query').mockImplementation(async <T = QueryRow>(sql: string, params?: unknown[]) => {
      if (!paused && sql.includes('report_id IS NULL')) {
        paused = true
        entered.resolve()
        await release.promise
      }
      return original<T>(sql, params)
    })
    const worker = feedback.runJobs()
    try {
      await entered.promise
      const active = await reldb.sql.get<{ id: string }>('SELECT id FROM hai_feedback_jobs WHERE report_id = ? AND status = \'running\'', [report.data.id])
      expect(active.success && active.data).toBeTruthy()
      if (!active.success || !active.data)
        return
      expect((await reldb.sql.execute('UPDATE hai_feedback_jobs SET status = \'succeeded\' WHERE report_id = ? AND id <> ?', [report.data.id, active.data.id])).success).toBe(true)
      expect((await reldb.sql.execute('UPDATE hai_feedback_jobs SET token = ?, lease_until = ? WHERE id = ?', ['replacement-collector', Date.now() + 60000, active.data.id])).success).toBe(true)
      expect((await reldb.sql.execute('UPDATE hai_feedback_reports SET collection_status = \'failed\' WHERE id = ?', [report.data.id])).success).toBe(true)
    }
    finally { release.resolve() }
    await worker
    query.mockRestore()
    const detail = await feedback.get(report.data.id, admin)
    expect(detail.success && detail.data.report.collectionStatus).toBe('failed')
    const collected = await feedback.getEvidence({ id: report.data.id, source: 'collection' }, admin)
    expect(collected.success && collected.data.total).toBe(0)
  })

  it('sMTP等待期间失去claim的旧worker不得把反馈标记为已发送', async () => {
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const send = vi.spyOn(reach, 'send').mockImplementation(async () => {
      entered.resolve()
      await release.promise
      return ok({ success: true, messageId: 'accepted-after-claim-loss' })
    })
    const report = await feedback.submit({ submissionId: 'lost-notify-owner', appId: config.appId }, actor)
    expect(report.success).toBe(true)
    if (!report.success)
      return
    expect((await feedback.completeCollection({ id: report.data.id }, actor)).success).toBe(true)
    const worker = feedback.runJobs()
    try {
      await entered.promise
      const replaced = await reldb.sql.execute('UPDATE hai_feedback_jobs SET token = ?, lease_until = ? WHERE report_id = ? AND kind = \'notify\' AND status = \'running\'', ['new-owner-token', Date.now() + 60000, report.data.id])
      expect(replaced.success && replaced.data.changes).toBe(1)
    }
    finally { release.resolve() }
    await worker
    expect(send).toHaveBeenCalledTimes(1)
    const detail = await feedback.get(report.data.id, admin)
    expect(detail.success).toBe(true)
    if (detail.success) {
      expect(detail.data.report.notificationStatus).not.toBe('sent')
      expect(detail.data.jobs.find(job => job.type === 'notify')?.status).toBe('running')
    }
  })

  it('两个收件人部分失败时不会因最后一个成功而把整体通知标记为sent', async () => {
    await feedback.close()
    expect((await feedback.init({ ...config, recipients: ['a@example.test', 'b@example.test'] })).success).toBe(true)
    let calls = 0
    const send = vi.spyOn(reach, 'send').mockImplementation(async () => {
      calls++
      return calls === 1 ? err(HaiReachError.SEND_FAILED, 'SMTP fixture unavailable') : ok({ success: true, messageId: 'second-recipient-accepted' })
    })
    const report = await feedback.submit({ submissionId: 'partial-notification', appId: config.appId }, actor)
    expect(report.success).toBe(true)
    if (!report.success)
      return
    expect((await feedback.completeCollection({ id: report.data.id }, actor)).success).toBe(true)
    await feedback.runJobs()
    expect(send).toHaveBeenCalledTimes(2)
    const detail = await feedback.get(report.data.id, admin)
    expect(detail.success).toBe(true)
    if (detail.success) {
      expect(detail.data.report.notificationStatus).not.toBe('sent')
      expect(detail.data.jobs.filter(job => job.type === 'notify').map(job => job.status).sort()).toEqual(['failed', 'succeeded'])
    }
  })

  it('reach 免打扰不会阻止反馈初始化', async () => {
    await feedback.close()
    await reach.close()
    expect((await reach.init({ providers: [{ name: 'email', type: 'console' }], dnd: { enabled: true, strategy: 'delay', start: '00:00', end: '23:59' } })).success).toBe(true)
    const initialized = await feedback.init(config)
    expect(initialized.success).toBe(true)
    expect(feedback.isInitialized).toBe(true)
  })

  it('补采耗尽尝试后进入failed终态，人工重试时才重新进入collecting', async () => {
    await feedback.close()
    expect((await feedback.init({ ...config, maxEvidenceCount: 1, maxAttempts: 1 })).success).toBe(true)
    const report = await feedback.submit({ submissionId: 'collection-terminal-failure', appId: config.appId }, actor)
    expect(report.success).toBe(true)
    if (!report.success)
      return
    expect((await feedback.completeCollection({ id: report.data.id }, actor)).success).toBe(true)
    expect((await feedback.runJobs()).success).toBe(true)
    const failed = await feedback.get(report.data.id, admin)
    expect(failed.success).toBe(true)
    if (failed.success) {
      expect(failed.data.jobs.find(job => job.type === 'collect')?.status).toBe('failed')
      expect(failed.data.report.collectionStatus).toBe('failed')
    }
    expect((await feedback.retry({ id: report.data.id, target: 'collect' }, admin)).success).toBe(true)
    const retried = await feedback.get(report.data.id, admin)
    expect(retried.success && retried.data.report.collectionStatus).toBe('collecting')
  })
})
