import type { QueryRow } from '@h-ai/reldb'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
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

const actor = { scopeId: 'notification-export-scope', userId: 'owner', permissions: ['feedback:*'] }
const config = { appId: 'notification-export', recipients: ['admin@example.test'], adminUrl: 'http://localhost/admin/feedback', workerIntervalMs: 0, maxAttempts: 2 }
let directory: string | undefined
let previousLevel = core.logger.getLevel()

beforeEach(async () => {
  previousLevel = core.logger.getLevel()
  core.logger.setLevel('fatal')
  directory = await mkdtemp(join(tmpdir(), 'hai-feedback-notify-export-'))
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

describe.sequential('通知与材料任务边界', () => {
  it('通知先执行时，证据配额耗尽仅让collect失败，受理邮件仍发送一次', async () => {
    await feedback.close()
    expect((await feedback.init({ ...config, maxEvidenceCount: 1, maxAttempts: 1 })).success).toBe(true)
    const send = vi.spyOn(reach, 'send')
    const report = await feedback.submit({ appId: config.appId, submissionId: 'notify-before-collect' }, actor)
    expect(report.success).toBe(true)
    if (!report.success)
      return
    expect((await feedback.completeCollection({ id: report.data.id }, actor)).success).toBe(true)
    expect((await reldb.sql.execute('UPDATE hai_feedback_jobs SET next_run_at = CASE WHEN kind = \'notify\' THEN 0 ELSE 1 END WHERE report_id = ? AND kind IN (\'notify\', \'collect\')', [report.data.id])).success).toBe(true)
    expect((await feedback.runJobs()).success).toBe(true)
    expect(send).toHaveBeenCalledTimes(1)
    const detail = await feedback.get(report.data.id, actor)
    expect(detail.success).toBe(true)
    if (detail.success) {
      expect(detail.data.report.collectionStatus).toBe('failed')
      expect(detail.data.report.notificationStatus).toBe('sent')
      expect(detail.data.jobs.find(job => job.type === 'collect')?.lastError).toBe(HaiFeedbackError.LIMIT_EXCEEDED.code)
      expect(detail.data.jobs.find(job => job.type === 'notify')?.status).toBe('succeeded')
    }
  })

  it.each(['token', 'lease', 'deleting', 'database'] as const)('邮件发送前再次确认租约及报告存活：%s变化不得发信', async (mode) => {
    const send = vi.spyOn(reach, 'send')
    const report = await feedback.submit({ appId: config.appId, submissionId: `pre-send-${mode}` }, actor)
    expect(report.success).toBe(true)
    if (!report.success)
      return
    expect((await reldb.sql.execute('UPDATE hai_feedback_jobs SET next_run_at = 0 WHERE report_id = ? AND kind = \'notify\'', [report.data.id])).success).toBe(true)
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const get = reldb.sql.get
    let paused = false
    vi.spyOn(reldb.sql, 'get').mockImplementation(async <T = QueryRow>(sql: string, parameters?: unknown[]) => {
      const result = await get<T>(sql, parameters)
      if (!paused && sql.startsWith('SELECT * FROM hai_feedback_reports')) {
        paused = true
        entered.resolve()
        await release.promise
      }
      return result
    })
    const worker = feedback.runJobs()
    try {
      await Promise.race([entered.promise, worker.then(() => {
        throw new Error('Worker finished before pre-send checkpoint')
      })])
      if (mode === 'token')
        expect((await reldb.sql.execute('UPDATE hai_feedback_jobs SET token = ? WHERE report_id = ? AND kind = \'notify\'', ['replacement-notifier', report.data.id])).success).toBe(true)
      if (mode === 'lease')
        expect((await reldb.sql.execute('UPDATE hai_feedback_jobs SET lease_until = 0 WHERE report_id = ? AND kind = \'notify\'', [report.data.id])).success).toBe(true)
      if (mode === 'deleting')
        expect((await reldb.sql.execute('UPDATE hai_feedback_reports SET deleting = 1 WHERE id = ?', [report.data.id])).success).toBe(true)
      if (mode === 'database')
        vi.spyOn(reldb.tx, 'begin').mockResolvedValue(err(HaiReldbError.QUERY_FAILED, 'Database unavailable at pre-send checkpoint'))
    }
    finally { release.resolve() }
    expect((await worker).success).toBe(true)
    expect(send).not.toHaveBeenCalled()
    const detail = await feedback.get(report.data.id, actor)
    if (mode === 'deleting') {
      expect(detail.success).toBe(false)
    }
    else {
      expect(detail.success).toBe(true)
      if (detail.success) {
        expect(detail.data.report.notificationStatus).not.toBe('sent')
        if (mode === 'database')
          expect(detail.data.jobs.find(job => job.type === 'notify')?.lastError).toBe(HaiReldbError.QUERY_FAILED.code)
      }
    }
  })

  it('冻结pending/failed附件写入manifest缺失清单，之后补传不会改写旧快照', async () => {
    const bytes = Buffer.from('diagnostic notes')
    const metadata = (id: string) => ({ id, name: `${id}.txt`, contentType: 'text/plain', size: bytes.length, checksum: createHash('sha256').update(bytes).digest('hex') })
    const report = await feedback.submit({ appId: config.appId, submissionId: 'frozen-unavailable-attachments', attachments: [metadata('pending-file'), metadata('failed-file')] }, actor)
    expect(report.success).toBe(true)
    if (!report.success)
      return
    const put = vi.spyOn(storage.file, 'put').mockResolvedValue(err(HaiStorageError.UPLOAD_FAILED, 'Attachment fixture unavailable'))
    expect((await feedback.uploadAttachment({ id: report.data.id, attachmentId: 'failed-file', dataBase64: bytes.toString('base64') }, actor)).success).toBe(false)
    put.mockRestore()
    expect((await feedback.completeCollection({ id: report.data.id }, actor)).success).toBe(true)
    expect((await feedback.runJobs()).success).toBe(true)
    const exported = await feedback.export({ id: report.data.id }, actor)
    expect(exported.success).toBe(true)
    if (!exported.success)
      return
    expect((await feedback.uploadAttachment({ id: report.data.id, attachmentId: 'pending-file', dataBase64: bytes.toString('base64') }, actor)).success).toBe(true)
    expect((await feedback.runJobs()).success).toBe(true)
    const archive = await feedback.getExport({ id: report.data.id, jobId: exported.data.id }, actor)
    expect(archive.success).toBe(true)
    if (!archive.success)
      return
    const bundle = await readFeedbackBundle(Buffer.from(archive.data.dataBase64, 'base64'))
    expect(bundle.success).toBe(true)
    if (bundle.success) {
      expect(bundle.data.manifest.missing).toEqual(['attachment:failed-file:failed', 'attachment:pending-file:pending'])
      expect(bundle.data.manifest.files.filter(file => file.kind === 'attachment')).toEqual([])
    }
  })

  it('已受理的不透明附件标识可上传、受权读取并完整导出，大小写和Unicode不折叠', async () => {
    const identity = { ...actor, scopeId: 'tenant:附件', userId: 'user:one' }
    const files = ['screen:1', 'space id', 'A', 'a', '页面截图', '../escape', 'emoji-😀', 'é', 'e\u0301'].map((id, index) => {
      const bytes = Buffer.from(`diagnostic material ${index}`)
      return { id, name: `页面:截图 / 原始文件${index}.txt`, contentType: 'text/plain', size: bytes.length, checksum: createHash('sha256').update(bytes).digest('hex'), bytes }
    })
    const report = await feedback.submit({ appId: config.appId, submissionId: 'opaque:attachment-export', attachments: files.map(({ bytes: _bytes, ...metadata }) => metadata) }, identity)
    expect(report.success).toBe(true)
    if (!report.success)
      return
    expect(report.data.scopeId).toBe(identity.scopeId)
    expect(report.data.userId).toBe(identity.userId)
    for (const file of files) {
      expect((await feedback.uploadAttachment({ id: report.data.id, attachmentId: file.id, dataBase64: file.bytes.toString('base64') }, identity)).success).toBe(true)
      const content = await feedback.getAttachment({ id: report.data.id, attachmentId: file.id }, identity)
      expect(content.success).toBe(true)
      if (content.success)
        expect(Buffer.from(content.data.dataBase64, 'base64')).toEqual(file.bytes)
    }
    const exported = await feedback.export({ id: report.data.id }, identity)
    expect(exported.success).toBe(true)
    if (!exported.success)
      return
    expect((await feedback.runJobs()).success).toBe(true)
    const archive = await feedback.getExport({ id: report.data.id, jobId: exported.data.id }, identity)
    expect(archive.success).toBe(true)
    if (!archive.success)
      return
    const bundle = await readFeedbackBundle(Buffer.from(archive.data.dataBase64, 'base64'))
    expect(bundle.success).toBe(true)
    if (!bundle.success)
      return
    const entries = bundle.data.manifest.files.filter(file => file.kind === 'attachment')
    expect(entries).toHaveLength(files.length)
    expect(new Set(entries.map(file => file.path.toLowerCase())).size).toBe(files.length)
    for (const file of files) {
      const entry = entries.find(entry => entry.attachmentId === file.id)
      expect(entry).toBeDefined()
      if (!entry)
        continue
      expect(entry.name).toBe(file.name)
      expect(entry.sha256).toBe(file.checksum)
      expect(Buffer.from(bundle.data.files[entry.path]!)).toEqual(file.bytes)
    }
  })

  it.each(['\uD800', '\uDC00'])('单个孤立Unicode代理项附件标识在受理前拒绝，不留下报告或任务：%j', async (id) => {
    const bytes = Buffer.from('malformed attachment identity')
    const submitted = await feedback.submit({ appId: config.appId, submissionId: 'malformed-attachment', attachments: [{ id, name: 'note.txt', contentType: 'text/plain', size: bytes.length, checksum: createHash('sha256').update(bytes).digest('hex') }] }, actor)
    expect.soft(submitted.success).toBe(false)
    if (!submitted.success)
      expect(submitted.error.code).toBe(HaiFeedbackError.INVALID_INPUT.code)
    const reports = await reldb.sql.get<{ count: number }>('SELECT COUNT(*) AS count FROM hai_feedback_reports')
    const attachments = await reldb.sql.get<{ count: number }>('SELECT COUNT(*) AS count FROM hai_feedback_attachments')
    const jobs = await reldb.sql.get<{ count: number }>('SELECT COUNT(*) AS count FROM hai_feedback_jobs')
    expect(reports.success).toBe(true)
    expect(attachments.success).toBe(true)
    expect(jobs.success).toBe(true)
    if (reports.success && attachments.success && jobs.success)
      expect([Number(reports.data?.count), Number(attachments.data?.count), Number(jobs.data?.count)]).toEqual([0, 0, 0])
  })

  it.each(['read', 'checksum'] as const)('available附件的%s失败保留export重试，不用missing掩盖固定快照错误', async (mode) => {
    const bytes = Buffer.from('fixed diagnostic notes')
    const report = await feedback.submit({ appId: config.appId, submissionId: `available-attachment-${mode}`, attachments: [{ id: 'available-file', name: 'notes.txt', contentType: 'text/plain', size: bytes.length, checksum: createHash('sha256').update(bytes).digest('hex') }] }, actor)
    expect(report.success).toBe(true)
    if (!report.success)
      return
    expect((await feedback.uploadAttachment({ id: report.data.id, attachmentId: 'available-file', dataBase64: bytes.toString('base64') }, actor)).success).toBe(true)
    const exported = await feedback.export({ id: report.data.id }, actor)
    expect(exported.success).toBe(true)
    if (!exported.success)
      return
    const get = vi.spyOn(storage.file, 'get').mockResolvedValue(mode === 'read' ? err(HaiStorageError.NOT_FOUND, 'Object temporarily unavailable') : ok(Buffer.from('tampered object')))
    expect((await feedback.runJobs()).success).toBe(true)
    get.mockRestore()
    const detail = await feedback.get(report.data.id, actor)
    expect(detail.success).toBe(true)
    if (detail.success) {
      const job = detail.data.jobs.find(job => job.id === exported.data.id)
      expect(job?.status).toBe('pending')
      expect(job?.lastError).toBe(mode === 'read' ? HaiStorageError.NOT_FOUND.code : HaiFeedbackError.CHECKSUM_MISMATCH.code)
    }
    expect((await feedback.getExport({ id: report.data.id, jobId: exported.data.id }, actor)).success).toBe(false)
    expect((await feedback.retry({ id: report.data.id, target: 'export' }, actor)).success).toBe(true)
    expect((await feedback.runJobs()).success).toBe(true)
    expect((await feedback.getExport({ id: report.data.id, jobId: exported.data.id }, actor)).success).toBe(true)
  })
})
