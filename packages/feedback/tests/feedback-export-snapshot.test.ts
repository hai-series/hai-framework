import type { HaiResult } from '@h-ai/core'
import { Buffer } from 'node:buffer'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { reldb } from '@h-ai/reldb'
import { storage } from '@h-ai/storage'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { feedback, HaiFeedbackError } from '../src/index.js'

const appId = 'export-snapshot'
const actor = {
  scopeId: 'snapshot-team',
  userId: 'owner',
  permissions: ['feedback:*'],
}
const config = {
  appId,
  notification: { mode: 'disabled' as const },
  worker: { intervalMs: 0, maxAttempts: 1 },
}
let directory: string | undefined

function accepted<T>(result: HaiResult<T>): T {
  if (!result.success)
    throw new Error(result.error.message)
  return result.data
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'hai-feedback-export-snapshot-'))
  accepted(await reldb.init({ type: 'sqlite', database: ':memory:' }))
  accepted(await storage.init({ type: 'local', root: directory }))
  accepted(await feedback.init(config))
})

afterEach(async () => {
  vi.restoreAllMocks()
  await feedback.close()
  await storage.close()
  await reldb.close()
  if (directory)
    await rm(directory, { recursive: true, force: true })
  directory = undefined
})

describe('反馈导出证据快照', () => {
  it('只记录证据引用，后续证据和处理动作不改变已登记的 ZIP 或重试结果', async () => {
    accepted(await feedback.init({
      ...config,
      worker: { ...config.worker, maxAttempts: 2 },
    }))
    const report = accepted(await feedback.submit({
      appId,
      submissionId: 'frozen-evidence',
      category: 'bug',
      description: '保存失败',
      evidence: [
        {
          id: 'early',
          source: 'browser',
          sequence: 1,
          kind: 'log',
          timestamp: Date.now(),
          data: { message: 'first' },
        },
      ],
    }, actor))
    const row = accepted(await reldb.sql.get<{ payload: string }>('SELECT payload FROM hai_feedback_reports WHERE id = ?', [report.id]))
    expect(JSON.parse(row?.payload ?? 'null')).toEqual({ category: 'bug', description: '保存失败' })
    expect(accepted(await feedback.get(report.id, actor)).report).toEqual(report)

    const job = accepted(await feedback.export({ id: report.id }, actor))
    const stored = accepted(await reldb.sql.get<{ payload: string, snapshot_revision: number }>('SELECT payload, snapshot_revision FROM hai_feedback_jobs WHERE id = ?', [job.id]))
    const snapshot: unknown = JSON.parse(stored?.payload ?? 'null')
    expect(snapshot).toHaveProperty('evidenceCount', 2)
    expect(snapshot).not.toHaveProperty('evidence')
    expect(stored?.snapshot_revision).toBe(report.evidenceRevision)

    accepted(await feedback.appendEvidence({
      id: report.id,
      evidence: [
        {
          id: 'late',
          source: 'browser',
          sequence: 2,
          kind: 'log',
          timestamp: Date.now(),
          data: { message: 'second' },
        },
      ],
    }, actor))
    accepted(await feedback.setStatus({ id: report.id, expectedVersion: report.version, status: 'handled' }, actor))

    accepted(await feedback.runJobs())
    const first = accepted(await feedback.getExport({ id: report.id, jobId: job.id }, actor))
    const contents = accepted(await feedback.readBundle(Buffer.from(first.dataBase64, 'base64')))
    expect(contents.report).toMatchObject({ status: 'pending', version: report.version, evidenceRevision: report.evidenceRevision })
    expect(contents.evidence.map(item => item.id)).toContain('early')
    expect(contents.evidence.map(item => item.id)).not.toContain('late')

    // 模拟对象已写入、执行者在旧租约内未登记成功，由新租约接管同一个 ZIP。
    accepted(await reldb.sql.execute(
      'UPDATE hai_feedback_jobs SET status = ?, attempts = 1, token = ?, lease_until = 0, result = NULL WHERE id = ?',
      ['running', 'previous-export-worker', job.id],
    ))
    accepted(await feedback.runJobs())
    const retry = accepted(await feedback.getExport({ id: report.id, jobId: job.id }, actor))
    expect(retry.dataBase64).toBe(first.dataBase64)
    const detail = accepted(await feedback.get(report.id, actor))
    expect(detail.jobs).toContainEqual(expect.objectContaining({ id: job.id, status: 'succeeded', attempts: 2 }))
  })

  it('证据已不完整时使导出失败，且不写入 ZIP', async () => {
    const report = accepted(await feedback.submit({ appId, submissionId: 'missing-evidence' }, actor))
    const job = accepted(await feedback.export({ id: report.id }, actor))
    accepted(await reldb.sql.execute('DELETE FROM hai_feedback_evidence WHERE report_id = ?', [report.id]))
    const put = vi.spyOn(storage.file, 'put')

    accepted(await feedback.runJobs())
    expect(put).not.toHaveBeenCalled()
    const detail = accepted(await feedback.get(report.id, actor))
    expect(detail.jobs).toContainEqual(expect.objectContaining({ id: job.id, status: 'failed' }))
    expect(await feedback.getExport({ id: report.id, jobId: job.id }, actor)).toMatchObject({
      success: false,
      error: { code: HaiFeedbackError.OPERATION_FAILED.code },
    })
  })

  it('zIP 写入期间报告到期，不登记导出成功', async () => {
    const report = accepted(await feedback.submit({ appId, submissionId: 'expires-during-export' }, actor))
    const job = accepted(await feedback.export({ id: report.id }, actor))
    const writing = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const put = storage.file.put
    vi.spyOn(storage.file, 'put').mockImplementation(async (key, bytes, options) => {
      if (key.endsWith('.zip')) {
        writing.resolve()
        await release.promise
      }
      return put(key, bytes, options)
    })
    const worker = feedback.runJobs()
    try {
      await Promise.race([
        writing.promise,
        worker.then(() => { throw new Error('Worker did not reach the ZIP write') }),
      ])
      accepted(await reldb.sql.execute('UPDATE hai_feedback_reports SET expires_at = 0 WHERE id = ?', [report.id]))
    }
    finally {
      release.resolve()
      accepted(await worker)
    }

    const stored = accepted(await reldb.sql.get('SELECT status, result FROM hai_feedback_jobs WHERE id = ?', [job.id]))
    expect(stored).toMatchObject({ status: 'failed', result: null })
    expect(await feedback.getExport({ id: report.id, jobId: job.id }, actor)).toMatchObject({
      success: false,
      error: { code: HaiFeedbackError.NOT_FOUND.code },
    })
  })
})
