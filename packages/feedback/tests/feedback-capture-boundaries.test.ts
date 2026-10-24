import type { QueryRow } from '@h-ai/reldb'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { core, err } from '@h-ai/core'
import { reach } from '@h-ai/reach'
import { HaiReldbError, reldb } from '@h-ai/reldb'
import { storage } from '@h-ai/storage'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { feedback } from '../src/index.js'

const actor = { scopeId: 'capture-scope', userId: 'capture-user', permissions: ['feedback:*'] }
const config = { appId: 'capture-boundaries', recipients: ['admin@example.test'], adminUrl: 'http://localhost/admin/feedback', workerIntervalMs: 0 }
let directory: string | undefined
let previousLevel = core.logger.getLevel()

beforeEach(async () => {
  previousLevel = core.logger.getLevel()
  core.logger.setLevel('fatal')
  vi.spyOn(process.stdout, 'write').mockReturnValue(true)
  directory = await mkdtemp(join(tmpdir(), 'hai-feedback-capture-'))
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

function logger(requestId: string) {
  const output = core.logger.create({ name: 'capture-fixture', level: 'info', format: 'json' })
  return {
    info(message: string) { core.context.run({ ...actor, requestId }, () => output.info(message)) },
    error(message: string) { core.context.run({ ...actor, requestId }, () => output.error(message)) },
  }
}

async function collect(submissionId: string) {
  const report = await feedback.submit({ appId: config.appId, submissionId }, actor)
  expect(report.success).toBe(true)
  if (!report.success)
    throw new Error('Feedback fixture submission failed')
  expect((await feedback.completeCollection({ id: report.data.id }, actor)).success).toBe(true)
  expect((await feedback.runJobs()).success).toBe(true)
  return report.data.id
}

async function expectMissing(id: string, missingReason: string) {
  const detail = await feedback.get(id, actor)
  expect(detail.success && detail.data.report.collectionStatus).toBe('partial')
  const evidence = await feedback.getEvidence({ id, kind: 'missing', pageSize: 100 }, actor)
  expect(evidence.success).toBe(true)
  if (evidence.success) {
    expect(evidence.data.items.some(item => item.missingReason === missingReason)).toBe(true)
    expect(JSON.stringify(evidence.data)).not.toContain('fixture-internal-database-details')
  }
}

describe.sequential('服务端现场有界采集', () => {
  it('超过单条日志上限后明确记录缺失原因，而非悄悄丢弃', async () => {
    logger('large-log').error('x'.repeat(70000))
    await expectMissing(await collect('oversized-log'), 'server_log_record_too_large')
  })

  it('临时证据读取失败保留本地现场并明确标为partial', async () => {
    logger('read-failed').error('Correlated error remains available locally')
    const query = reldb.sql.query
    vi.spyOn(reldb.sql, 'query').mockImplementation(<T = QueryRow>(sql: string, parameters?: unknown[]) => sql.includes('report_id IS NULL')
      ? Promise.resolve(err(HaiReldbError.QUERY_FAILED, 'fixture-internal-database-details'))
      : query<T>(sql, parameters))
    await expectMissing(await collect('temporary-read-failed'), 'server_temporary_evidence_read_failed')
  })

  it('错误窗口暂存失败仍有缺失说明，不把可恢复的内存现场当作已完整持久化', async () => {
    const execute = reldb.sql.execute
    vi.spyOn(reldb.sql, 'execute').mockImplementation((sql, parameters) => sql.startsWith('INSERT INTO hai_feedback_evidence') && parameters?.[1] === null
      ? Promise.resolve(err(HaiReldbError.QUERY_FAILED, 'fixture-internal-database-details'))
      : execute(sql, parameters))
    logger('write-failed').error('Unsaved error window')
    await expectMissing(await collect('temporary-write-failed'), 'server_temporary_evidence_write_failed')
  })

  it('活跃错误窗口达到全局上限后给出可见缺失说明', async () => {
    for (let index = 0; index < 101; index++) logger(`active-${index}`).error(`Error ${index}`)
    await expectMissing(await collect('active-window-limit'), 'server_error_window_overflow')
  })

  it('暂存待写队列和单次证据预算耗尽后均可见，反馈仍被可靠受理', async () => {
    for (let request = 0; request < 16; request++) {
      const output = logger(`queue-${request}`)
      for (let index = 0; index < 100; index++) output.info(`Before ${index}`)
      output.error('Error with full context')
      for (let index = 0; index < 100; index++) output.info(`After ${index}`)
    }
    const id = await collect('pending-queue-limit')
    await expectMissing(id, 'server_pending_evidence_overflow')
    await expectMissing(id, 'server_evidence_truncated')
  })

  it('相邻两个错误各有前100/自身/后100，重叠日志只保存一次且重试不冲突', async () => {
    const output = logger('overlapping-errors')
    for (let index = 0; index < 110; index++) output.info(`before-${index}`)
    output.error('first-error')
    for (let index = 0; index < 20; index++) output.info(`between-${index}`)
    output.error('second-error')
    for (let index = 0; index < 110; index++) output.info(`after-${index}`)
    const id = await collect('overlap')
    const errors = await feedback.getEvidence({ id, kind: 'error' }, actor)
    expect(errors.success).toBe(true)
    if (!errors.success)
      return
    expect(errors.data.total).toBe(2)
    for (const error of errors.data.items) {
      const window = await feedback.getEvidence({ id, errorId: error.id, pageSize: 100 }, actor)
      expect(window.success && window.data.total).toBe(201)
    }
    const all = await feedback.getEvidence({ id, requestId: 'overlapping-errors' }, actor)
    expect(all.success && all.data.total).toBe(222)
    const before = await feedback.get(id, actor)
    // 模拟追加已提交、任务完成回执丢失后的重新执行。
    expect((await reldb.sql.execute('UPDATE hai_feedback_jobs SET status = \'pending\', next_run_at = 0 WHERE report_id = ? AND kind = \'collect\'', [id])).success).toBe(true)
    expect((await feedback.runJobs()).success).toBe(true)
    const after = await feedback.get(id, actor)
    expect(after.success && after.data.report.evidenceRevision).toBe(before.success && before.data.report.evidenceRevision)
    expect(after.success && after.data.jobs.find(job => job.type === 'collect')?.status).toBe('succeeded')
  })
})
