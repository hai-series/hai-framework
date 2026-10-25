import type { FeedbackContext } from '../src/index.js'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { core, err } from '@h-ai/core'
import { HaiReachError, reach } from '@h-ai/reach'
import { reldb } from '@h-ai/reldb'
import { storage } from '@h-ai/storage'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { readFeedbackBundle } from '../src/bundle/index.js'
import { feedback, HaiFeedbackError } from '../src/index.js'

const actor: FeedbackContext = { scopeId: 'tenant-a', userId: 'user-a' }
const admin: FeedbackContext = { ...actor, userId: 'administrator', permissions: ['feedback:*'] }
const other: FeedbackContext = { scopeId: 'tenant-b', userId: 'user-b', permissions: ['feedback:*'] }
const config = { appId: 'test-app', recipients: ['admin@example.test'], notificationProvider: 'email', adminUrl: 'http://localhost/admin/feedback', workerIntervalMs: 0, collectionTimeoutMs: 60000 }
let root: string
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'hai-feedback-workflow-'))
  expect((await reldb.init({ type: 'sqlite', database: join(root, 'feedback.sqlite') })).success).toBe(true)
  expect((await storage.init({ type: 'local', root: join(root, 'objects') })).success).toBe(true)
  expect((await reach.init({ providers: [{ name: 'email', type: 'console' }] })).success).toBe(true)
  expect((await feedback.init(config)).success).toBe(true)
})
afterAll(async () => {
  vi.restoreAllMocks()
  await feedback.close()
  await reach.close()
  await storage.close()
  await reldb.close()
  if (root)
    await rm(root, { recursive: true, force: true })
})

describe.sequential('反馈公开流程', () => {
  it('允许空描述、同一提交幂等，并拒绝借同一标识替换现场', async () => {
    const first = await feedback.submit({ submissionId: 'empty-1', appId: config.appId }, actor)
    expect(first.success).toBe(true)
    if (!first.success)
      return
    const retry = await feedback.submit({ submissionId: 'empty-1', appId: config.appId }, actor)
    expect(retry.success && retry.data.id).toBe(first.data.id)
    const different = await feedback.submit({ submissionId: 'empty-1', appId: config.appId, description: 'changed' }, actor)
    expect(different).toMatchObject({ success: false, error: { code: HaiFeedbackError.CONFLICT.code } })
    const hidden = await feedback.get(first.data.id, other)
    expect(hidden.success).toBe(false)
    expect((await feedback.list({}, actor)).success).toBe(false)
  })

  it('身份字段含分隔符时仍按完整范围和用户独立受理', async () => {
    const firstActor = { scopeId: 'one:two', userId: 'three' }
    const secondActor = { scopeId: 'one', userId: 'two:three' }
    const input = { submissionId: 'identity-tuple', appId: config.appId }
    const first = await feedback.submit(input, firstActor)
    const second = await feedback.submit(input, secondActor)
    expect(first.success && second.success).toBe(true)
    if (!first.success || !second.success)
      return
    expect(second.data.scopeId).toBe(secondActor.scopeId)
    expect(second.data.userId).toBe(secondActor.userId)
    expect(second.data.id).not.toBe(first.data.id)
    const retried = await feedback.submit(input, secondActor)
    expect(retried.success && retried.data.id).toBe(second.data.id)
    expect((await feedback.get(first.data.id, secondActor)).success).toBe(false)
  })

  it('分页筛选仅返回当前范围，处理/撤销保留历史且拒绝过期版本', async () => {
    const first = await feedback.submit({ submissionId: 'filter-1', appId: config.appId, description: 'needle_literal_%', appVersion: 'v1' }, actor)
    expect(first.success).toBe(true)
    if (!first.success)
      return
    const list = await feedback.list({ page: 1, pageSize: 1, search: 'needle_literal_%', appVersion: 'v1' }, admin)
    expect(list.success).toBe(true)
    if (list.success) {
      expect(list.data.total).toBe(1)
      expect(list.data.items[0]?.id).toBe(first.data.id)
    }
    const handled = await feedback.setStatus({ id: first.data.id, status: 'handled', expectedVersion: 1 }, admin)
    expect(handled.success && handled.data.status).toBe('handled')
    expect((await feedback.setStatus({ id: first.data.id, status: 'pending', expectedVersion: 1 }, admin)).success).toBe(false)
    const reopened = await feedback.setStatus({ id: first.data.id, status: 'pending', expectedVersion: 2, note: 'reopened' }, admin)
    expect(reopened.success).toBe(true)
    const detail = await feedback.get(first.data.id, admin)
    expect(detail.success && detail.data.history.length).toBe(2)
  })

  it('证据持久化ACK、重试去重、同序号冲突和脱敏均可验证', async () => {
    const report = await feedback.submit({ submissionId: 'evidence-1', appId: config.appId }, actor)
    expect(report.success).toBe(true)
    if (!report.success)
      return
    const event = { id: 'entry-1', source: 'browser:1', sequence: 1, kind: 'log' as const, timestamp: Date.now(), data: { message: 'failed', password: 'fixture-secret', authorization: 'Bearer fixture-token' } }
    const saved = await feedback.appendEvidence({ id: report.data.id, evidence: [event] }, actor)
    expect(saved.success).toBe(true)
    if (saved.success)
      expect(saved.data.acknowledged).toEqual(['entry-1'])
    const retry = await feedback.appendEvidence({ id: report.data.id, evidence: [event] }, actor)
    expect(retry.success && retry.data.evidenceRevision).toBe(saved.success && saved.data.evidenceRevision)
    const changed = await feedback.appendEvidence({ id: report.data.id, evidence: [{ ...event, data: { message: 'different' } }] }, actor)
    expect(changed.success).toBe(false)
    const page = await feedback.getEvidence({ id: report.data.id, source: 'browser:1', pageSize: 1 }, actor)
    expect(page.success && page.data.total).toBe(1)
    expect(JSON.stringify(page)).not.toContain('fixture-secret')
    expect(JSON.stringify(page)).not.toContain('fixture-token')
    expect((await feedback.getEvidence({ id: report.data.id }, other)).success).toBe(false)
  })

  it('分页排序方向由服务端应用，并使用唯一标识稳定处理同一时间的记录', async () => {
    for (const submissionId of ['sort-first', 'sort-second']) {
      expect((await feedback.submit({ submissionId, appId: config.appId, description: 'sort-direction-fixture' }, actor)).success).toBe(true)
    }
    const ascending = await feedback.list({ search: 'sort-direction-fixture', sortDirection: 'asc' }, admin)
    const descending = await feedback.list({ search: 'sort-direction-fixture', sortDirection: 'desc' }, admin)
    expect(ascending.success && descending.success).toBe(true)
    if (ascending.success && descending.success) {
      expect(ascending.data.total).toBe(2)
      expect(ascending.data.items.map(item => item.id)).toEqual(descending.data.items.map(item => item.id).reverse())
    }
  })

  it('同一批次的冲突证据不返回虚假ACK，事务整体回滚', async () => {
    const report = await feedback.submit({ submissionId: 'batch-conflict', appId: config.appId }, actor)
    expect(report.success).toBe(true)
    if (!report.success)
      return
    const event = { id: 'batch-entry', source: 'browser:conflict-batch', sequence: 1, kind: 'log' as const, timestamp: Date.now(), data: { message: 'first' } }
    const result = await feedback.appendEvidence({ id: report.data.id, evidence: [event, { ...event, id: 'changed-entry', data: { message: 'changed' } }] }, actor)
    expect(result).toMatchObject({ success: false, error: { code: HaiFeedbackError.CONFLICT.code } })
    const stored = await feedback.getEvidence({ id: report.data.id, source: event.source }, actor)
    expect(stored.success && stored.data.total).toBe(0)
  })

  it.each(['video/webm', 'video/mp4'])('短录屏%s校验容器字节，上传和授权读取保留原内容', async (contentType) => {
    const bytes = contentType === 'video/webm' ? Buffer.from([0x1A, 0x45, 0xDF, 0xA3, 0, 0, 0, 0, 0, 0, 0, 0]) : Buffer.from([0, 0, 0, 12, 102, 116, 121, 112, 105, 115, 111, 109])
    const invalid = Buffer.alloc(bytes.length)
    for (const [key, data] of [['valid', bytes], ['invalid', invalid]] as const) {
      const report = await feedback.submit({ submissionId: `recording-${contentType}-${key}`, appId: config.appId, attachments: [{ id: 'recording', name: 'recording', contentType, size: data.length, checksum: createHash('sha256').update(data).digest('hex') }] }, actor)
      expect(report.success).toBe(true)
      if (!report.success)
        return
      const uploaded = await feedback.uploadAttachment({ id: report.data.id, attachmentId: 'recording', dataBase64: data.toString('base64') }, actor)
      expect(uploaded.success).toBe(key === 'valid')
      if (key === 'valid') {
        const loaded = await feedback.getAttachment({ id: report.data.id, attachmentId: 'recording' }, actor)
        expect(loaded.success && loaded.data.dataBase64).toBe(data.toString('base64'))
        expect((await feedback.getAttachment({ id: report.data.id, attachmentId: 'recording' }, other)).success).toBe(false)
      }
    }
  })

  it('截图验证字节/类型/checksum，私有读授权并随离线包导出', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/x9sAAAAASUVORK5CYII=', 'base64')
    const checksum = createHash('sha256').update(png).digest('hex')
    const report = await feedback.submit({ submissionId: 'image-1', appId: config.appId, attachments: [{ id: 'screen', name: 'screen.png', contentType: 'image/png', size: png.length, checksum }] }, actor)
    expect(report.success).toBe(true)
    if (!report.success)
      return
    const bad = await feedback.uploadAttachment({ id: report.data.id, attachmentId: 'screen', dataBase64: Buffer.alloc(png.length).toString('base64') }, actor)
    expect(bad.success).toBe(false)
    const upload = await feedback.uploadAttachment({ id: report.data.id, attachmentId: 'screen', dataBase64: png.toString('base64') }, actor)
    expect(upload.success).toBe(true)
    expect((await feedback.uploadAttachment({ id: report.data.id, attachmentId: 'screen', dataBase64: png.toString('base64') }, actor)).success).toBe(true)
    expect((await feedback.getAttachment({ id: report.data.id, attachmentId: 'screen' }, other)).success).toBe(false)
    const downloaded = await feedback.getAttachment({ id: report.data.id, attachmentId: 'screen' }, actor)
    expect(downloaded.success && downloaded.data.dataBase64).toBe(png.toString('base64'))
    expect((await feedback.completeCollection({ id: report.data.id, missing: [] }, actor)).success).toBe(true)
    expect((await feedback.runJobs()).success).toBe(true)
    const exported = await feedback.export({ id: report.data.id }, admin)
    expect(exported.success).toBe(true)
    if (!exported.success)
      return
    expect((await feedback.runJobs()).success).toBe(true)
    const archive = await feedback.getExport({ id: report.data.id, jobId: exported.data.id }, admin)
    expect(archive.success).toBe(true)
    if (!archive.success)
      return
    const bundle = await readFeedbackBundle(Buffer.from(archive.data.dataBase64, 'base64'))
    expect(bundle.success).toBe(true)
    if (bundle.success)
      expect(bundle.data.manifest.files.some(file => file.attachmentId === 'screen')).toBe(true)
  })

  it('通知失败不丢反馈，重新初始化后可人工重试持久任务', async () => {
    const report = await feedback.submit({ submissionId: 'mail-retry', appId: config.appId }, actor)
    expect(report.success).toBe(true)
    if (!report.success)
      return
    const send = vi.spyOn(reach, 'send').mockResolvedValue(err(HaiReachError.SEND_FAILED, 'SMTP fixture unavailable'))
    await feedback.completeCollection({ id: report.data.id }, actor)
    await feedback.runJobs()
    const failed = await feedback.get(report.data.id, admin)
    expect(failed.success && failed.data.report.notificationStatus).toBe('failed')
    send.mockRestore()
    await feedback.close()
    expect((await feedback.init(config)).success).toBe(true)
    expect((await feedback.retry({ id: report.data.id, target: 'notify' }, admin)).success).toBe(true)
    await feedback.runJobs()
    const detail = await feedback.get(report.data.id, admin)
    expect(detail.success && detail.data.report.notificationStatus).toBe('sent')
  })

  it('前后日志通过可信用户/请求范围关联，不混入其他租户', async () => {
    const requestId = 'request-feedback-window'
    core.context.run({ scopeId: actor.scopeId, userId: actor.userId, requestId }, () => {
      for (let i = 0; i < 110; i++) core.logger.info(`before-${i}`)
      core.logger.error('window-error')
      for (let i = 0; i < 110; i++) core.logger.info(`after-${i}`)
    })
    core.context.run({ scopeId: other.scopeId, userId: other.userId, requestId }, () => core.logger.error('private-other-tenant-marker'))
    const report = await feedback.submit({ submissionId: 'server-window', appId: config.appId }, actor)
    expect(report.success).toBe(true)
    if (!report.success)
      return
    await feedback.completeCollection({ id: report.data.id }, actor)
    await feedback.runJobs()
    const events = await feedback.getEvidence({ id: report.data.id, requestId, pageSize: 100 }, admin)
    expect(events.success).toBe(true)
    if (events.success) {
      expect(events.data.total).toBe(201)
      expect(JSON.stringify(events.data)).not.toContain('private-other-tenant-marker')
    }
  })
})
