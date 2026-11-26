import type { FeedbackReport } from '@h-ai/api-contract/feedback'
import type { DmlWithTxOperations } from '@h-ai/reldb'
import type { FeedbackJobRow, FeedbackReportRepository } from './feedback-repository.js'
import { core } from '@h-ai/core'
import { feedbackClockSql } from './feedback-clock.js'
import { readFeedbackJson } from './feedback-repository.js'

/**
 * 完成客户端采集时需要的任务字段。
 * @example 模块内部上下文
 * ```ts
 * function activeCollection(job: CollectionJob) { return job.status === 'pending' || job.status === 'running' }
 * ```
 */
type CollectionJob = Pick<FeedbackJobRow, 'id' | 'status' | 'payload'>

/**
 * 统一读取任务中的采集进度，并在调用方持有报告锁的事务内更新材料状态。
 * @example 模块内部上下文
 * ```ts
 * function reportNeedsBusinessEvidence(repo: FeedbackReportRepository, payload: unknown) {
 *   return createFeedbackCollection(repo).progress(payload).businessEvidence
 * }
 * ```
 */
export function createFeedbackCollection(repo: FeedbackReportRepository) {
  const table = repo.tables
  const clock = feedbackClockSql()

  function progress(value: unknown) {
    const raw = readFeedbackJson(value)
    const payload = raw && typeof raw === 'object'
      ? raw
      : {}
    return {
      payload,
      valid: raw === payload,
      anchor: 'anchor' in payload && typeof payload.anchor === 'number'
        ? payload.anchor
        : undefined,
      businessEvidence: 'businessEvidence' in payload && payload.businessEvidence === true,
      clientComplete: 'clientComplete' in payload && payload.clientComplete === true,
      clientMissing: 'clientMissing' in payload && payload.clientMissing === true,
      serverCaptured: 'serverCaptured' in payload && payload.serverCaptured === true,
      serverMissing: 'serverMissing' in payload && payload.serverMissing === true,
    }
  }

  function findJob(tx: DmlWithTxOperations, reportId: string) {
    return tx.get<CollectionJob>(`SELECT id, status, payload FROM ${table.jobs} WHERE report_id = ? AND kind = 'collect'`, [reportId])
  }

  async function completeClient(tx: DmlWithTxOperations, report: FeedbackReport, job: CollectionJob | null, hasMissing: boolean) {
    const current = progress(job?.payload)
    let status = report.collectionStatus
    if (hasMissing && status === 'complete') {
      const partial = await tx.execute(`UPDATE ${table.reports} SET collection_status = 'partial', updated_at = ${clock} WHERE id = ?`, [report.id])
      if (!partial.success)
        return partial
      status = 'partial'
    }
    if (job && (!current.clientComplete || (hasMissing && !current.clientMissing))) {
      const marked = await tx.execute(`UPDATE ${table.jobs} SET payload = ? WHERE id = ?`, [
        JSON.stringify({
          ...current.payload,
          clientComplete: true,
          ...(hasMissing
            ? { clientMissing: true }
            : {}),
        }),
        job.id,
      ])
      if (!marked.success)
        return marked
    }
    if (!current.clientComplete) {
      const next = await tx.execute(`UPDATE ${table.jobs} SET next_run_at = ${clock}, updated_at = ${clock} WHERE report_id = ? AND kind IN ('collect', 'notify', 'webhook') AND status = 'pending'`, [report.id])
      if (!next.success)
        return next
    }
    return core.ok(status)
  }

  function completeServer(tx: DmlWithTxOperations, job: FeedbackJobRow, payload: object, serverMissing: boolean) {
    return tx.execute(`UPDATE ${table.jobs} SET payload = ? WHERE id = ? AND token = ?`, [
      JSON.stringify({ ...payload, serverCaptured: true, serverMissing }),
      job.id,
      job.token,
    ])
  }

  function resume(tx: DmlWithTxOperations, reportId: string) {
    return tx.execute(`UPDATE ${table.reports} SET collection_status = 'collecting' WHERE id = ? AND deleting = 0 AND EXISTS (SELECT 1 FROM ${table.jobs} WHERE report_id = ? AND kind = 'collect' AND status = 'pending')`, [reportId, reportId])
  }

  async function settle(tx: DmlWithTxOperations, job: Pick<FeedbackJobRow, 'id' | 'report_id'>, status: 'failed' | 'succeeded') {
    if (status === 'failed')
      return tx.execute(`UPDATE ${table.reports} SET collection_status = 'failed', updated_at = ${clock} WHERE id = ? AND deleting = 0`, [job.report_id])

    const current = await tx.get<{ payload: unknown }>(`SELECT payload FROM ${table.jobs} WHERE id = ?`, [job.id])
    if (!current.success)
      return current
    const state = progress(current.data?.payload)
    const files = await tx.query<{ status: string }>(`SELECT status FROM ${table.attachments} WHERE report_id = ?`, [job.report_id])
    if (!files.success)
      return files
    const reasons = await tx.get<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table.evidence} WHERE report_id = ? AND kind = 'missing'`, [job.report_id])
    if (!reasons.success)
      return reasons
    const partial = state.serverMissing || state.clientMissing || Number(reasons.data?.count ?? 0) > 0 || files.data.some(item => item.status !== 'available')
    return tx.execute(`UPDATE ${table.reports} SET collection_status = ?, updated_at = ${clock} WHERE id = ? AND deleting = 0`, [
      partial ? 'partial' : 'complete',
      job.report_id,
    ])
  }

  return {
    progress,
    findJob,
    completeClient,
    completeServer,
    resume,
    settle,
  }
}
