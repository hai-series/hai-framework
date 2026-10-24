import type { QueryRow } from '@h-ai/reldb'
import { Buffer } from 'node:buffer'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { core, err, ok } from '@h-ai/core'
import { reach } from '@h-ai/reach'
import { HaiReldbError, reldb } from '@h-ai/reldb'
import { HaiStorageError, storage } from '@h-ai/storage'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFeedbackBundle } from '../src/bundle/index.js'
import { feedback, HaiFeedbackError } from '../src/index.js'

const actor = { scopeId: 'export-status-scope', userId: 'owner', permissions: ['feedback:*'] }
const config = { appId: 'export-status', recipients: ['admin@example.test'], adminUrl: 'http://localhost/admin/feedback', workerIntervalMs: 0, maxAttempts: 1 }
let directory: string | undefined
let previousLevel = core.logger.getLevel()

beforeEach(async () => {
  previousLevel = core.logger.getLevel()
  core.logger.setLevel('fatal')
  directory = await mkdtemp(join(tmpdir(), 'hai-feedback-export-status-'))
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

async function startExport(submissionId: string) {
  const report = await feedback.submit({ appId: config.appId, submissionId }, actor)
  expect(report.success).toBe(true)
  if (!report.success)
    throw new Error('Feedback fixture was not accepted')
  const job = await feedback.export({ id: report.data.id }, actor)
  expect(job.success).toBe(true)
  if (!job.success)
    throw new Error('Export fixture was not accepted')
  return { report: report.data, job: job.data }
}

describe.sequential('导出下载的状态与受权边界', () => {
  it('刚受理的pending导出返回409，允许调用方继续等待', async () => {
    const { report, job } = await startExport('pending-export')
    expect(job.status).toBe('pending')
    const get = vi.spyOn(storage.file, 'get')
    const result = await feedback.getExport({ id: report.id, jobId: job.id }, actor)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiFeedbackError.CONFLICT.code)
      expect(result.error.httpStatus).toBe(409)
    }
    expect(get).not.toHaveBeenCalled()
  })

  it('真实worker执行期间返回409，完成后可下载同一job的完整ZIP', async () => {
    const { report, job } = await startExport('running-export')
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const put = storage.file.put
    vi.spyOn(storage.file, 'put').mockImplementation(async (key, bytes, options) => {
      if (key.endsWith('.zip')) {
        entered.resolve()
        await release.promise
      }
      return put(key, bytes, options)
    })
    const worker = feedback.runJobs()
    try {
      await Promise.race([entered.promise, worker.then(() => {
        throw new Error('Worker finished before export storage checkpoint')
      })])
      const detail = await feedback.get(report.id, actor)
      expect(detail.success).toBe(true)
      if (detail.success)
        expect(detail.data.jobs.find(item => item.id === job.id)?.status).toBe('running')
      const waiting = await feedback.getExport({ id: report.id, jobId: job.id }, actor)
      expect(waiting.success).toBe(false)
      if (!waiting.success) {
        expect(waiting.error.code).toBe(HaiFeedbackError.CONFLICT.code)
        expect(waiting.error.httpStatus).toBe(409)
      }
    }
    finally {
      release.resolve()
      expect((await worker).success).toBe(true)
    }
    const archive = await feedback.getExport({ id: report.id, jobId: job.id }, actor)
    expect(archive.success).toBe(true)
    if (archive.success) {
      expect(archive.data.contentType).toBe('application/zip')
      const bundle = await readFeedbackBundle(Buffer.from(archive.data.dataBase64, 'base64'))
      expect(bundle.success).toBe(true)
      if (bundle.success)
        expect(bundle.data.report.id).toBe(report.id)
    }
  })

  it('真实存储失败耗尽重试后返回500，不把终态失败当等待或找不到', async () => {
    const { report, job } = await startExport('failed-export')
    vi.spyOn(storage.file, 'put').mockResolvedValue(err(HaiStorageError.UPLOAD_FAILED, 'Private storage fixture detail'))
    expect((await feedback.runJobs()).success).toBe(true)
    const detail = await feedback.get(report.id, actor)
    expect(detail.success).toBe(true)
    if (detail.success) {
      expect(detail.data.jobs.find(item => item.id === job.id)?.status).toBe('failed')
      expect(detail.data.jobs.find(item => item.id === job.id)?.lastError).toBe(HaiStorageError.UPLOAD_FAILED.code)
    }
    const result = await feedback.getExport({ id: report.id, jobId: job.id }, actor)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiFeedbackError.OPERATION_FAILED.code)
      expect(result.error.httpStatus).toBe(500)
      expect(result.error.message).not.toContain('Private storage fixture detail')
    }
  })

  it.each(['missing', 'foreign-report', 'non-export', 'foreign-scope'] as const)('%s任务返回404，不暴露其它任务状态', async (mode) => {
    const { report, job } = await startExport(`not-found-${mode}`)
    let jobId = job.id
    if (mode === 'missing')
      jobId = 'missing-export-job'
    if (mode === 'foreign-report')
      jobId = (await startExport('another-export-report')).job.id
    if (mode === 'non-export') {
      const detail = await feedback.get(report.id, actor)
      expect(detail.success).toBe(true)
      if (!detail.success)
        return
      const collection = detail.data.jobs.find(item => item.type === 'collect')
      expect(collection).toBeDefined()
      if (!collection)
        return
      jobId = collection.id
    }
    const result = await feedback.getExport({ id: report.id, jobId }, mode === 'foreign-scope' ? { ...actor, scopeId: 'another-scope' } : actor)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiFeedbackError.NOT_FOUND.code)
      expect(result.error.httpStatus).toBe(404)
    }
  })

  it('报告创建者缺少export权限时先返回403，不查询导出任务', async () => {
    const { report, job } = await startExport('forbidden-export')
    const get = vi.spyOn(reldb.sql, 'get')
    const result = await feedback.getExport({ id: report.id, jobId: job.id }, { ...actor, permissions: [] })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiFeedbackError.FORBIDDEN.code)
      expect(result.error.httpStatus).toBe(403)
    }
    expect(get.mock.calls.every(([sql]) => !sql.includes('FROM hai_feedback_jobs'))).toBe(true)
  })

  it('排队快照过期返回404；当前修订重新申请的新任务仍返回409', async () => {
    const { report, job } = await startExport('expired-pending-export')
    const stored = await reldb.sql.get<{ payload: unknown }>('SELECT payload FROM hai_feedback_jobs WHERE id = ?', [job.id])
    expect(stored.success && stored.data).toBeTruthy()
    if (!stored.success || !stored.data)
      return
    const payload: unknown = typeof stored.data.payload === 'string' ? JSON.parse(stored.data.payload) : stored.data.payload
    if (!payload || typeof payload !== 'object')
      throw new Error('Export fixture snapshot unavailable')
    expect((await reldb.sql.execute('UPDATE hai_feedback_jobs SET payload = ? WHERE id = ?', [JSON.stringify({ ...payload, snapshotExpiresAt: 0 }), job.id])).success).toBe(true)
    const expired = await feedback.getExport({ id: report.id, jobId: job.id }, actor)
    expect(expired.success).toBe(false)
    if (!expired.success) {
      expect(expired.error.code).toBe(HaiFeedbackError.NOT_FOUND.code)
      expect(expired.error.httpStatus).toBe(404)
    }
    const renewed = await feedback.export({ id: report.id }, actor)
    expect(renewed.success).toBe(true)
    if (!renewed.success)
      return
    expect(renewed.data.id).not.toBe(job.id)
    const waiting = await feedback.getExport({ id: report.id, jobId: renewed.data.id }, actor)
    expect(waiting.success).toBe(false)
    if (!waiting.success)
      expect(waiting.error.code).toBe(HaiFeedbackError.CONFLICT.code)
  })

  it('查询任务时数据库错误保持原错误，不变成等待或找不到', async () => {
    const { report, job } = await startExport('database-export-query')
    const get = reldb.sql.get
    vi.spyOn(reldb.sql, 'get').mockImplementation(async <T = QueryRow>(sql: string, parameters?: unknown[]) => sql.includes('FROM hai_feedback_jobs') ? err(HaiReldbError.QUERY_FAILED, 'Export database unavailable') : get<T>(sql, parameters))
    const result = await feedback.getExport({ id: report.id, jobId: job.id }, actor)
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe(HaiReldbError.QUERY_FAILED.code)
  })

  it('已完成导出的对象损坏仍返回checksum错误，不伪装成功', async () => {
    const { report, job } = await startExport('corrupt-completed-export')
    expect((await feedback.runJobs()).success).toBe(true)
    vi.spyOn(storage.file, 'get').mockResolvedValue(ok(Buffer.from('corrupted exported zip')))
    const result = await feedback.getExport({ id: report.id, jobId: job.id }, actor)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiFeedbackError.CHECKSUM_MISMATCH.code)
      expect(result.error.httpStatus).toBe(422)
    }
  })
})
