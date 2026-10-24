import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { core } from '@h-ai/core'
import { reach } from '@h-ai/reach'
import { reldb } from '@h-ai/reldb'
import { storage } from '@h-ai/storage'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { feedback } from '../src/index.js'

const actor = { scopeId: 'retention-scope', userId: 'owner', permissions: ['feedback:*'] }
const config = { appId: 'retention-app', recipients: ['admin@example.test'], adminUrl: 'http://localhost/admin/feedback', workerIntervalMs: 0 }
let directory: string | undefined
let previousLevel = core.logger.getLevel()

beforeEach(async () => {
  previousLevel = core.logger.getLevel()
  core.logger.setLevel('fatal')
  directory = await mkdtemp(join(tmpdir(), 'hai-feedback-retention-'))
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

async function expire(id: string) {
  expect((await reldb.sql.execute('UPDATE hai_feedback_reports SET expires_at = 0 WHERE id = ?', [id])).success).toBe(true)
  expect((await reldb.sql.execute('UPDATE hai_feedback_jobs SET next_run_at = 0 WHERE report_id = ? AND kind = \'cleanup\'', [id])).success).toBe(true)
  expect((await feedback.runJobs()).success).toBe(true)
  expect((await feedback.get(id, actor)).success).toBe(false)
}

describe.sequential('反馈数据保留与顺序', () => {
  it('已到期反馈删除正文、历史、证据及导出job内固定快照，不能残留诊断原文', async () => {
    const marker = 'private-retention-evidence-marker'
    const report = await feedback.submit({ submissionId: 'expired-snapshot', appId: config.appId, description: marker, evidence: [{ id: 'private-evidence', source: 'browser:retention', sequence: 1, kind: 'log', timestamp: Date.now(), data: { message: marker } }] }, actor)
    expect(report.success).toBe(true)
    if (!report.success)
      return
    expect((await feedback.completeCollection({ id: report.data.id }, actor)).success).toBe(true)
    expect((await feedback.runJobs()).success).toBe(true)
    expect((await feedback.setStatus({ id: report.data.id, status: 'handled', expectedVersion: 1, note: marker }, actor)).success).toBe(true)
    const exported = await feedback.export({ id: report.data.id }, actor)
    expect(exported.success).toBe(true)
    if (!exported.success)
      return
    expect((await feedback.runJobs()).success).toBe(true)
    expect((await feedback.getExport({ id: report.data.id, jobId: exported.data.id }, actor)).success).toBe(true)
    await expire(report.data.id)
    expect((await feedback.getExport({ id: report.data.id, jobId: exported.data.id }, actor)).success).toBe(false)
    const jobs = await reldb.sql.query<{ payload: unknown, result: unknown }>('SELECT payload, result FROM hai_feedback_jobs WHERE report_id = ?', [report.data.id])
    expect(jobs.success).toBe(true)
    if (jobs.success)
      expect(JSON.stringify(jobs.data)).not.toContain(marker)
    for (const table of ['hai_feedback_reports', 'hai_feedback_evidence', 'hai_feedback_history', 'hai_feedback_attachments']) {
      const field = table === 'hai_feedback_reports' ? 'id' : 'report_id'
      const rows = await reldb.sql.get<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table} WHERE ${field} = ?`, [report.data.id])
      expect(rows.success && Number(rows.data?.count)).toBe(0)
    }
  })

  it('到期清理涵盖未登记在export结果中的失败尝试对象', async () => {
    const bytes = Buffer.from('private attachment')
    const report = await feedback.submit({ submissionId: 'expired-orphan-object', appId: config.appId, attachments: [{ id: 'attachment', name: 'note.txt', contentType: 'text/plain', size: bytes.length, checksum: createHash('sha256').update(bytes).digest('hex') }] }, actor)
    expect(report.success).toBe(true)
    if (!report.success)
      return
    expect((await feedback.uploadAttachment({ id: report.data.id, attachmentId: 'attachment', dataBase64: bytes.toString('base64') }, actor)).success).toBe(true)
    expect((await feedback.completeCollection({ id: report.data.id }, actor)).success).toBe(true)
    expect((await feedback.runJobs()).success).toBe(true)
    const objects = await storage.dir.list({ prefix: 'feedback/' })
    expect(objects.success).toBe(true)
    if (!objects.success)
      return
    const attachment = objects.data.files.find(file => file.key.includes(report.data.id))
    expect(attachment).toBeDefined()
    if (!attachment)
      return
    // 模拟外部对象已写成而进程在保存作业结果前崩溃；DB 中没有此 key。
    const prefix = attachment.key.slice(0, attachment.key.lastIndexOf('/') + 1)
    expect((await storage.file.put(`${prefix}exports/old-owner-attempt.zip`, Buffer.from('orphan private snapshot'))).success).toBe(true)
    await expire(report.data.id)
    const remaining = await storage.dir.list({ prefix })
    expect(remaining.success).toBe(true)
    if (remaining.success)
      expect(remaining.data.files).toEqual([])
    const tombstones = await reldb.sql.query<{ id: string, kind: string, payload: unknown, result: unknown }>('SELECT id, kind, payload, result FROM hai_feedback_jobs WHERE report_id = ?', [report.data.id])
    expect(tombstones.success).toBe(true)
    if (!tombstones.success)
      return
    expect(tombstones.data).toHaveLength(1)
    const tombstone = tombstones.data[0]!
    expect(tombstone.kind).toBe('cleanup')
    const payload: unknown = typeof tombstone.payload === 'string' ? JSON.parse(tombstone.payload) : tombstone.payload
    expect(payload).toMatchObject({ tombstone: true, prefix })
    expect(Object.keys(payload as object).sort()).toEqual(['prefix', 'tombstone', 'until'])
    // 报告已被删除后，旧进程才完成对象写入；墓碑仍须继续清扫，不受普通maxAttempts限制。
    expect((await storage.file.put(`${prefix}exports/late-old-owner.zip`, Buffer.from('late private snapshot'))).success).toBe(true)
    expect((await reldb.sql.execute('UPDATE hai_feedback_jobs SET next_run_at = 0, attempts = 999 WHERE id = ?', [tombstone.id])).success).toBe(true)
    expect((await feedback.runJobs()).success).toBe(true)
    const afterLateObject = await storage.dir.list({ prefix })
    expect(afterLateObject.success && afterLateObject.data.files).toEqual([])
    const live = await reldb.sql.get<{ status: string }>('SELECT status FROM hai_feedback_jobs WHERE id = ?', [tombstone.id])
    expect(live.success && live.data?.status).toBe('pending')
    // 用fixture将24小时窗口推进到终点，最终清理墓碑本身。
    expect((await reldb.sql.execute('UPDATE hai_feedback_jobs SET next_run_at = 0, payload = ? WHERE id = ?', [JSON.stringify({ tombstone: true, prefix, until: Date.now() - 1 }), tombstone.id])).success).toBe(true)
    expect((await feedback.runJobs()).success).toBe(true)
    const final = await reldb.sql.get<{ count: number }>('SELECT COUNT(*) AS count FROM hai_feedback_jobs WHERE report_id = ?', [report.data.id])
    expect(final.success && Number(final.data?.count)).toBe(0)
  })

  it('导出排队快照过期后，同一当前修订可重新申请有效离线包', async () => {
    await feedback.close()
    expect((await feedback.init({ ...config, maxAttempts: 1 })).success).toBe(true)
    const report = await feedback.submit({ submissionId: 'expired-export-snapshot', appId: config.appId }, actor)
    expect(report.success).toBe(true)
    if (!report.success)
      return
    expect((await feedback.completeCollection({ id: report.data.id }, actor)).success).toBe(true)
    expect((await feedback.runJobs()).success).toBe(true)
    const initial = await feedback.export({ id: report.data.id }, actor)
    expect(initial.success).toBe(true)
    if (!initial.success)
      return
    const stored = await reldb.sql.get<{ payload: unknown }>('SELECT payload FROM hai_feedback_jobs WHERE id = ?', [initial.data.id])
    expect(stored.success && stored.data).toBeTruthy()
    if (!stored.success || !stored.data)
      return
    const snapshot: unknown = typeof stored.data.payload === 'string' ? JSON.parse(stored.data.payload) : stored.data.payload
    if (!snapshot || typeof snapshot !== 'object')
      throw new Error('Export fixture payload unavailable')
    expect((await reldb.sql.execute('UPDATE hai_feedback_jobs SET payload = ? WHERE id = ?', [JSON.stringify({ ...snapshot, snapshotExpiresAt: 0 }), initial.data.id])).success).toBe(true)
    expect((await feedback.runJobs()).success).toBe(true)
    expect((await feedback.getExport({ id: report.data.id, jobId: initial.data.id }, actor)).success).toBe(false)
    const renewed = await feedback.export({ id: report.data.id }, actor)
    expect(renewed.success).toBe(true)
    if (!renewed.success)
      return
    expect((await feedback.runJobs()).success).toBe(true)
    expect((await feedback.getExport({ id: report.data.id, jobId: renewed.data.id }, actor)).success).toBe(true)
  })

  it('管理员按反馈编号搜索时，分页列表准确返回对应反馈', async () => {
    const report = await feedback.submit({ submissionId: 'search-report-number', appId: config.appId, description: 'A description without its feedback number' }, actor)
    expect(report.success).toBe(true)
    if (!report.success)
      return
    expect((await feedback.submit({ submissionId: 'search-another-report', appId: config.appId, description: 'Unrelated feedback' }, actor)).success).toBe(true)
    const page = await feedback.list({ search: report.data.number, page: 1, pageSize: 1 }, actor)
    expect(page.success).toBe(true)
    if (page.success) {
      expect(page.data.total).toBe(1)
      expect(page.data.items.map(item => item.id)).toEqual([report.data.id])
    }
  })
})
