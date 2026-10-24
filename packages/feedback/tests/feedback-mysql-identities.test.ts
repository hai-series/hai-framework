/** 真实 MySQL CI/PAD SPACE 排序规则下，反馈身份、分页、窗口及任务必须保持字节精确。 */
import type { FeedbackEvidenceInput } from '@h-ai/api-contract/feedback'
import type { DbTestEnv } from '../../reldb/tests/helpers/reldb-test-suite.js'
import type { FeedbackContext } from '../src/index.js'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { core, err } from '@h-ai/core'
import { reach } from '@h-ai/reach'
import { reldb } from '@h-ai/reldb'
import { HaiStorageError, storage } from '@h-ai/storage'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mysqlEnv } from '../../reldb/tests/helpers/reldb-test-suite.js'
import { readFeedbackBundle } from '../src/bundle/index.js'
import { feedback, HaiFeedbackError } from '../src/index.js'

const owner: FeedbackContext = { scopeId: 'tenant-A', userId: 'user-A', permissions: ['feedback:*'] }
const settings = { recipients: ['admin@example.test'], adminUrl: 'http://localhost/admin/feedback', workerIntervalMs: 0, collectionTimeoutMs: 60000 }

describe.sequential('mysql反馈身份字节精确隔离', () => {
  let environment: DbTestEnv | undefined
  let directory: string | undefined
  let previousLevel = core.logger.getLevel()
  let serial = 0
  let appId = ''

  async function configure(app: string) {
    expect((await feedback.init({ ...settings, appId: app })).success).toBe(true)
  }

  beforeAll(async () => {
    previousLevel = core.logger.getLevel()
    core.logger.setLevel('fatal')
    environment = await mysqlEnv()
    directory = await mkdtemp(join(tmpdir(), 'hai-feedback-mysql-identity-'))
    expect((await reldb.init(environment.config)).success).toBe(true)
    expect((await storage.init({ type: 'local', root: directory })).success).toBe(true)
    expect((await reach.init({ providers: [{ name: 'email', type: 'console' }] })).success).toBe(true)
    await configure('identity-bootstrap')
    // 显式采用大小写/重音折叠且忽略尾空格的排序规则，不依赖测试镜像默认值。
    for (const table of ['hai_feedback_reports', 'hai_feedback_evidence', 'hai_feedback_attachments', 'hai_feedback_history', 'hai_feedback_jobs']) {
      expect((await reldb.ddl.raw(`ALTER TABLE ${table} CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)).success).toBe(true)
    }
    await feedback.close()
  }, 180000)

  beforeEach(async () => {
    vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    appId = `mysql-identity-${++serial}`
    await configure(appId)
  })

  afterEach(async () => {
    await feedback.close()
    vi.restoreAllMocks()
  })

  afterAll(async () => {
    try {
      await feedback.close()
      await reach.close()
      await storage.close()
      await reldb.close()
      if (directory)
        await rm(directory, { recursive: true, force: true })
    }
    finally {
      await environment?.release?.()
      core.logger.setLevel(previousLevel)
    }
  }, 60000)

  it('大小写、重音与尾空格范围在分页计数及读写授权前精确隔离', async () => {
    const local = await feedback.submit({ appId, submissionId: 'own-scope' }, owner)
    expect(local.success).toBe(true)
    if (!local.success)
      return
    const foreignIds: string[] = []
    for (const scopeId of ['tenant-a', 'ténant-A', 'tenant-A ']) {
      const submitted = await feedback.submit({ appId, submissionId: 'same-submission', description: `Private ${scopeId}` }, { ...owner, scopeId })
      expect(submitted.success).toBe(true)
      if (submitted.success)
        foreignIds.push(submitted.data.id)
    }
    const folded = await reldb.sql.get<{ count: number }>('SELECT COUNT(*) AS count FROM hai_feedback_reports WHERE app_id = ? AND scope_id = ?', [appId, owner.scopeId])
    expect(folded.success && Number(folded.data?.count)).toBe(4)
    const listed = await feedback.list({ page: 1, pageSize: 1 }, owner)
    expect(listed.success).toBe(true)
    if (listed.success) {
      expect(listed.data.total).toBe(1)
      expect(listed.data.items.map(item => item.id)).toEqual([local.data.id])
    }
    for (const id of foreignIds) {
      expect(await feedback.get(id, owner)).toMatchObject({ success: false, error: { code: HaiFeedbackError.NOT_FOUND.code } })
      expect(await feedback.setStatus({ id, status: 'handled', expectedVersion: 1 }, owner)).toMatchObject({ success: false, error: { code: HaiFeedbackError.NOT_FOUND.code } })
      expect(await feedback.export({ id }, owner)).toMatchObject({ success: false, error: { code: HaiFeedbackError.NOT_FOUND.code } })
    }
  })

  it('分页列表在LIMIT和COUNT之前精确限定应用', async () => {
    const upper = `${appId}-Orders`
    const lower = `${appId}-orders`
    await configure(upper)
    const foreign = await feedback.submit({ appId: upper, submissionId: 'upper-app' }, owner)
    expect(foreign.success).toBe(true)
    await configure(lower)
    const local = await feedback.submit({ appId: lower, submissionId: 'lower-app' }, owner)
    expect(local.success).toBe(true)
    if (!local.success)
      return
    const listed = await feedback.list({ page: 1, pageSize: 1 }, owner)
    expect(listed.success).toBe(true)
    if (listed.success) {
      expect(listed.data.total).toBe(1)
      expect(listed.data.items.map(item => item.id)).toEqual([local.data.id])
    }
    const wrongFilter = await feedback.list({ appId: upper }, owner)
    expect(wrongFilter.success && wrongFilter.data.total).toBe(0)
  })

  it('共享临时日志在截断前精确限定app、scope与user', async () => {
    const upper = `${appId}-Capture`
    const lower = `${appId}-capture`
    const logger = core.logger.create({ name: 'identity-log-fixture', level: 'info', format: 'json' })
    const log = (actor: FeedbackContext, requestId: string, marker: string) => core.context.run({ scopeId: actor.scopeId, userId: actor.userId, requestId }, () => logger.error(marker))
    await configure(upper)
    log(owner, 'own-request', 'OWN-IDENTITY-MARKER')
    log({ ...owner, scopeId: 'tenant-a' }, 'foreign-scope', 'FOREIGN-SCOPE-MARKER')
    log({ ...owner, scopeId: 'tenant-A ' }, 'foreign-padding', 'FOREIGN-PADDING-MARKER')
    log({ ...owner, userId: 'user-a' }, 'foreign-user', 'FOREIGN-USER-MARKER')
    await feedback.close()
    await configure(lower)
    log(owner, 'foreign-app', 'FOREIGN-APP-MARKER')
    await feedback.close()
    // 新运行时只有共享数据库中的旧窗口，不能靠本机严格过滤掩盖查询问题。
    await configure(upper)
    const report = await feedback.submit({ appId: upper, submissionId: 'collect-exact-identities' }, owner)
    expect(report.success).toBe(true)
    if (!report.success)
      return
    expect((await feedback.completeCollection({ id: report.data.id }, owner)).success).toBe(true)
    expect((await feedback.runJobs()).success).toBe(true)
    const events = await feedback.getEvidence({ id: report.data.id, kind: 'error', pageSize: 100 }, owner)
    expect(events.success).toBe(true)
    if (events.success) {
      expect(events.data.total).toBe(1)
      expect(JSON.stringify(events.data.items)).toContain('OWN-IDENTITY-MARKER')
      expect(JSON.stringify(events.data.items)).not.toContain('FOREIGN-')
    }
  })

  it('来源、请求和错误锚点保持精确匹配，错误窗口不被CI别名混合', async () => {
    const window = (source: string, requestId: string, errorId: string, offset: number): FeedbackEvidenceInput[] => [
      { id: `${errorId}-before`, source, requestId, sequence: offset, kind: 'log', timestamp: Date.now(), data: { marker: `${errorId}-before` } },
      { id: errorId, source, requestId, errorId, sequence: offset + 1, kind: 'error', timestamp: Date.now(), data: { marker: errorId } },
      { id: `${errorId}-after`, source, requestId, sequence: offset + 2, kind: 'log', timestamp: Date.now(), data: { marker: `${errorId}-after` } },
    ]
    const first = window('browser:Source', 'Request-A', 'Error-A', 0)
    const otherSource = window('browser:source', 'Request-A', 'Other-Source', 0)
    const otherRequest = window('browser:Source', 'request-a', 'error-a', 10)
    const report = await feedback.submit({ appId, submissionId: 'source-request-error', evidence: [...first, ...otherSource, ...otherRequest] }, owner)
    expect(report.success).toBe(true)
    if (!report.success)
      return
    const source = await feedback.getEvidence({ id: report.data.id, source: 'browser:Source' }, owner)
    expect(source.success && source.data.total).toBe(6)
    const request = await feedback.getEvidence({ id: report.data.id, requestId: 'Request-A' }, owner)
    expect(request.success && request.data.total).toBe(6)
    for (const events of [first, otherRequest]) {
      const result = await feedback.getEvidence({ id: report.data.id, errorId: events[1]!.id }, owner)
      expect(result.success).toBe(true)
      if (result.success)
        expect(result.data.items.map(item => item.id).sort()).toEqual(events.map(item => item.id).sort())
    }
  })

  it('同反馈A/a附件分别上传、读取、重试及导出，不相互替换', async () => {
    const upper = Buffer.from('UPPER-ATTACHMENT')
    const lower = Buffer.from('lower-attachment')
    const metadata = (id: string, bytes: Buffer) => ({ id, name: `${id}.txt`, contentType: 'text/plain', size: bytes.length, checksum: createHash('sha256').update(bytes).digest('hex') })
    const report = await feedback.submit({ appId, submissionId: 'attachment-case', attachments: [metadata('A', upper), metadata('a', lower)] }, owner)
    expect(report.success).toBe(true)
    if (!report.success)
      return
    expect((await feedback.uploadAttachment({ id: report.data.id, attachmentId: 'A', dataBase64: upper.toString('base64') }, owner)).success).toBe(true)
    const put = vi.spyOn(storage.file, 'put').mockResolvedValueOnce(err(HaiStorageError.OPERATION_FAILED, 'Fixture unavailable'))
    const failed = await feedback.uploadAttachment({ id: report.data.id, attachmentId: 'a', dataBase64: lower.toString('base64') }, owner)
    expect(failed.success).toBe(false)
    put.mockRestore()
    expect((await feedback.retry({ id: report.data.id, target: 'attachment', targetId: 'A' }, owner)).success).toBe(true)
    const detail = await feedback.get(report.data.id, owner)
    expect(detail.success).toBe(true)
    if (detail.success) {
      expect(detail.data.attachments.find(item => item.id === 'A')?.status).toBe('available')
      expect(detail.data.attachments.find(item => item.id === 'a')?.status).toBe('failed')
    }
    expect((await feedback.uploadAttachment({ id: report.data.id, attachmentId: 'a', dataBase64: lower.toString('base64') }, owner)).success).toBe(true)
    for (const [attachmentId, bytes] of [['A', upper], ['a', lower]] as const) {
      const downloaded = await feedback.getAttachment({ id: report.data.id, attachmentId }, owner)
      expect(downloaded.success).toBe(true)
      if (downloaded.success)
        expect(Buffer.from(downloaded.data.dataBase64, 'base64')).toEqual(bytes)
    }
    expect((await feedback.completeCollection({ id: report.data.id }, owner)).success).toBe(true)
    const exported = await feedback.export({ id: report.data.id }, owner)
    expect(exported.success).toBe(true)
    if (!exported.success)
      return
    expect((await feedback.runJobs()).success).toBe(true)
    const downloaded = await feedback.getExport({ id: report.data.id, jobId: exported.data.id }, owner)
    expect(downloaded.success).toBe(true)
    if (!downloaded.success)
      return
    const bundle = await readFeedbackBundle(Buffer.from(downloaded.data.dataBase64, 'base64'))
    expect(bundle.success).toBe(true)
    if (bundle.success) {
      for (const [id, bytes] of [['A', upper], ['a', lower]] as const) {
        const file = bundle.data.manifest.files.find(item => item.attachmentId === id)
        expect(file).toBeDefined()
        if (file)
          expect(bundle.data.files[file.path]).toEqual(new Uint8Array(bytes))
      }
    }
  })

  it('大小写不同应用的worker不能claim或完成对方持久任务', async () => {
    const upper = `${appId}-Worker`
    const lower = `${appId}-worker`
    await configure(upper)
    const report = await feedback.submit({ appId: upper, submissionId: 'worker-app-identity' }, owner)
    expect(report.success).toBe(true)
    if (!report.success)
      return
    expect((await feedback.completeCollection({ id: report.data.id }, owner)).success).toBe(true)
    await configure(lower)
    const processed = await feedback.runJobs()
    expect(processed.success && processed.data.processed).toBe(0)
    const jobs = await reldb.sql.query<{ attempts: number, status: string }>('SELECT attempts, status FROM hai_feedback_jobs WHERE report_id = ?', [report.data.id])
    expect(jobs.success).toBe(true)
    if (jobs.success) {
      expect(jobs.data.length).toBeGreaterThan(0)
      expect(jobs.data.every(job => Number(job.attempts) === 0 && job.status === 'pending')).toBe(true)
    }
    await configure(upper)
    const owned = await feedback.get(report.data.id, owner)
    expect(owned.success && owned.data.report.collectionStatus).toBe('collecting')
  })
})
