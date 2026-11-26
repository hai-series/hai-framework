import type { FeedbackReport } from '@h-ai/api-contract/feedback'
import type { HaiResult } from '@h-ai/core'
import type { DmlOperations, DmlWithTxOperations } from '@h-ai/reldb'
import type { createFeedbackCollection } from './feedback-collection.js'
import type { FeedbackJobRow, FeedbackReportRepository, FeedbackReportRow } from './feedback-repository.js'
import { randomUUID } from 'node:crypto'
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { storage } from '@h-ai/storage'
import { feedbackClockSql } from './feedback-clock.js'
import { feedbackM } from './feedback-i18n.js'
import { feedbackTextEquals, readFeedbackJson } from './feedback-repository.js'
import { feedbackObjectPrefix } from './feedback-storage-key.js'
import { HaiFeedbackError } from './feedback-types.js'

/**
 * 后台任务的调度配置与执行入口。
 * @example 模块内部上下文
 * ```ts
 * function workerInterval(options: FeedbackWorkerOptions) { return options.intervalMs }
 * ```
 */
interface FeedbackWorkerOptions {
  appId: string
  intervalMs: number
  leaseMs: number
  maxAttempts: number
  notificationsEnabled: boolean
  exportRetentionHours: number
  scopeQuotaId: (scopeId: string) => string
  collection: ReturnType<typeof createFeedbackCollection>
  executeJob: (job: FeedbackJobRow, report: FeedbackReport, payload: object, signal: AbortSignal) => Promise<HaiResult<unknown>>
}

/**
 * 管理持久任务的领取、租约、结算、人工重排和到期清理。
 * @example 模块内部上下文
 * ```ts
 * function startWorker(repository: FeedbackReportRepository, options: FeedbackWorkerOptions) {
 *   const worker = createFeedbackWorker(repository, options)
 *   worker.start()
 *   return worker
 * }
 * ```
 */
export function createFeedbackWorker(repo: FeedbackReportRepository, options: FeedbackWorkerOptions) {
  const table = repo.tables
  const clock = feedbackClockSql()
  const activeLease = `id = ? AND token = ? AND status = 'running' AND lease_until > ${clock}`

  function failed() {
    return core.err(HaiFeedbackError.OPERATION_FAILED, feedbackM('feedback_operationFailed'))
  }
  function conflict() {
    return core.err(HaiFeedbackError.CONFLICT, feedbackM('feedback_conflict'))
  }
  function missing() {
    return core.err(HaiFeedbackError.NOT_FOUND, feedbackM('feedback_notFound'))
  }

  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let running: Promise<HaiResult<{ processed: number }>> | null = null
  let idleRounds = 0
  let cleanupBacklog = false
  let cleanupAfter = 0
  let wakePending = false
  const shutdown = new AbortController()

  function schedule(delay: number) {
    if (stopped || !options.intervalMs)
      return
    if (timer)
      clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      void tick()
    }, delay)
    timer.unref()
  }
  function wakeWorker() {
    idleRounds = 0
    if (running)
      wakePending = true
    else
      schedule(options.intervalMs)
  }
  async function tick() {
    if (stopped)
      return
    const result = await runJobs()
    idleRounds = result.success && (result.data.processed > 0 || cleanupBacklog || wakePending)
      ? 0
      : Math.min(idleRounds + 1, 10)
    wakePending = false
    schedule(Math.min(30000, options.intervalMs * 2 ** idleRounds))
  }

  async function withLease<T>(job: FeedbackJobRow, work: (tx: DmlWithTxOperations, row: FeedbackReportRow) => Promise<HaiResult<T>>): Promise<HaiResult<T>> {
    return repo.transaction(async (tx) => {
      // 与用户完成采集的事务采用同一加锁顺序。
      const report = await repo.find(job.report_id, job.scope_id, tx, job.kind === 'cleanup')
      if (!report.success)
        return report
      if (!report.data)
        return missing()
      const lock = reldb.config?.type === 'sqlite'
        ? ''
        : ' FOR UPDATE'
      const owned = await tx.get(`SELECT id FROM ${table.jobs} WHERE ${activeLease}${lock}`, [job.id, job.token])
      if (!owned.success)
        return owned
      if (!owned.data)
        return conflict()
      const result = await work(tx, report.data)
      if (!result.success)
        return result
      const stillOwned = await tx.get(`SELECT id FROM ${table.jobs} WHERE ${activeLease}`, [job.id, job.token])
      return stillOwned.success && stillOwned.data
        ? result
        : conflict()
    })
  }

  async function notificationSummary(sql: DmlOperations, id: string) {
    if (!options.notificationsEnabled)
      return sql.execute(`UPDATE ${table.reports} SET notification_status = 'disabled' WHERE id = ?`, [id])
    return sql.execute(`UPDATE ${table.reports} SET notification_status = CASE
      WHEN EXISTS (SELECT 1 FROM ${table.jobs} WHERE report_id = ? AND kind = 'notify' AND (status = 'failed' OR last_error IS NOT NULL)) THEN 'failed'
      WHEN NOT EXISTS (SELECT 1 FROM ${table.jobs} WHERE report_id = ? AND kind = 'notify' AND status <> 'succeeded') THEN 'sent'
      WHEN EXISTS (SELECT 1 FROM ${table.jobs} WHERE report_id = ? AND kind = 'notify' AND status = 'running') THEN 'sending'
      WHEN EXISTS (SELECT 1 FROM ${table.jobs} WHERE report_id = ? AND kind = 'notify' AND status = 'pending' AND result IS NOT NULL) THEN 'deferred'
      ELSE 'pending' END WHERE id = ?`, [id, id, id, id, id])
  }
  async function runJobs(): Promise<HaiResult<{ processed: number }>> {
    if (stopped)
      return core.err(HaiFeedbackError.NOT_INITIALIZED, feedbackM('feedback_notInitialized'))
    if (running)
      return running
    running = core.context.run({ suppressLogObservers: true }, processJobs).catch(failed).finally(() => {
      running = null
    })
    return running
  }

  /**
   * 扫描阶段仅提取定位和加锁字段，领取后读取当前尝试次数及任务内容。
   * @example 模块内部上下文
   * ```ts
   * function jobReport(candidate: JobCandidate) { return candidate.report_id }
   * ```
   */
  type JobCandidate = Pick<FeedbackJobRow, 'id' | 'scope_id' | 'report_id' | 'kind'>
  const due = `((status = 'pending' AND next_run_at <= ${clock}) OR (status = 'running' AND lease_until <= ${clock}))`

  async function claimJob(candidate: JobCandidate) {
    return repo.transaction(async (tx) => {
      if (candidate.kind === 'collect' || candidate.kind === 'notify') {
        const locked = await repo.find(candidate.report_id, candidate.scope_id, tx, true)
        if (!locked.success)
          return locked
      }
      const token = randomUUID()
      const params: unknown[] = [token, options.leaseMs, candidate.id]
      const app = feedbackTextEquals('app_id', options.appId, params)
      const claimed = await tx.execute(`UPDATE ${table.jobs} SET status = 'running', token = ?, lease_until = ${clock} + ?, attempts = attempts + 1, updated_at = ${clock} WHERE id = ? AND ${app} AND ${due} AND (kind = 'cleanup' OR attempts < ?)`, [...params, options.maxAttempts])
      if (!claimed.success)
        return claimed
      if (claimed.data.changes) {
        if (candidate.kind === 'notify') {
          const summary = await notificationSummary(tx, candidate.report_id)
          if (!summary.success)
            return summary
        }
        return tx.get<FeedbackJobRow>(`SELECT * FROM ${table.jobs} WHERE id = ? AND token = ?`, [candidate.id, token])
      }

      // 已领取的尝试可能产生过外部效果。耗尽次数后保留终态供人工确认。
      const expiredParams: unknown[] = [HaiFeedbackError.OPERATION_FAILED.code, candidate.id]
      const expiredApp = feedbackTextEquals('app_id', options.appId, expiredParams)
      const exhausted = await tx.execute(`UPDATE ${table.jobs} SET status = 'failed', token = NULL, lease_until = 0, last_error = ?, updated_at = ${clock} WHERE id = ? AND ${expiredApp} AND ${due} AND kind <> 'cleanup' AND attempts >= ?`, [...expiredParams, options.maxAttempts])
      if (!exhausted.success)
        return exhausted
      if (exhausted.data.changes) {
        const summary = await syncJobReport(tx, candidate, 'failed')
        if (!summary.success)
          return summary
      }
      return core.ok(null)
    })
  }

  async function syncJobReport(tx: DmlWithTxOperations, job: JobCandidate, status: FeedbackJobRow['status']) {
    if (job.kind === 'notify')
      return notificationSummary(tx, job.report_id)
    if (job.kind === 'collect' && (status === 'failed' || status === 'succeeded'))
      return options.collection.settle(tx, job, status)
    return core.ok(undefined)
  }

  async function retry(tx: DmlWithTxOperations, reportId: string, kind: Exclude<FeedbackJobRow['kind'], 'cleanup'>) {
    const updated = await tx.execute(`UPDATE ${table.jobs} SET status = 'pending', attempts = 0, next_run_at = ${clock}, last_error = NULL WHERE report_id = ? AND kind = ? AND status IN ('failed', 'pending')`, [reportId, kind])
    if (!updated.success)
      return updated
    if (kind === 'collect') {
      const resumed = await options.collection.resume(tx, reportId)
      if (!resumed.success)
        return resumed
    }
    if (kind === 'notify') {
      const resumed = await notificationSummary(tx, reportId)
      if (!resumed.success)
        return resumed
    }
    return core.ok(undefined)
  }

  async function finishJob(job: FeedbackJobRow, result: HaiResult<unknown>) {
    return repo.transaction(async (tx) => {
      let outcome = result
      if (job.kind === 'collect' || job.kind === 'notify') {
        const locked = await repo.find(job.report_id, job.scope_id, tx, true)
        if (!locked.success)
          return locked
      }
      else if (job.kind === 'export' && result.success) {
        // ZIP 写入后仍按报告→任务的锁序检查有效期；迟到对象由到期清理回收。
        const live = await repo.find(job.report_id, job.scope_id, tx)
        if (!live.success)
          return live
        if (!live.data)
          outcome = missing()
      }
      const receipt = outcome.success && !!outcome.data && typeof outcome.data === 'object' && 'pending' in outcome.data && outcome.data.pending === true
      const purged = outcome.success && !!outcome.data && typeof outcome.data === 'object' && 'purged' in outcome.data && outcome.data.purged === true
      const status = outcome.success
        ? receipt ? 'pending' : 'succeeded'
        : job.kind !== 'cleanup' && Number(job.attempts) >= options.maxAttempts
          ? 'failed'
          : 'pending'
      const saved = purged
        ? await tx.execute(`DELETE FROM ${table.jobs} WHERE ${activeLease}`, [job.id, job.token])
        : await tx.execute(`UPDATE ${table.jobs} SET status = ?, attempts = attempts - ?, token = NULL, lease_until = 0, next_run_at = ${clock} + ?, updated_at = ${clock}, last_error = ?, result = CASE WHEN ? = 1 THEN ? ELSE result END WHERE ${activeLease}`, [
            status,
            receipt ? 1 : 0,
            Math.min(60000, 1000 * 2 ** Math.min(Number(job.attempts) - 1, 6)),
            outcome.success ? null : outcome.error.code,
            outcome.success ? 1 : 0,
            outcome.success
              ? JSON.stringify(outcome.data)
              : null,
            job.id,
            job.token,
          ])
      if (!saved.success || !saved.data.changes)
        return saved
      return syncJobReport(tx, job, status)
    })
  }

  async function processJobs(): Promise<HaiResult<{ processed: number }>> {
    let processed = 0
    const params: unknown[] = []
    const app = feedbackTextEquals('app_id', options.appId, params)
    const candidates = await reldb.sql.query<JobCandidate>(`SELECT id, report_id, scope_id, kind FROM ${table.jobs} WHERE ${app} AND ${due} ORDER BY next_run_at, id LIMIT 20`, params)
    if (!candidates.success)
      return candidates
    for (const candidate of candidates.data) {
      if (stopped)
        break
      const claimed = await claimJob(candidate)
      if (!claimed.success)
        return claimed
      const job = claimed.data
      if (!job)
        continue
      const renewal = setInterval(() => {
        void reldb.sql.execute(`UPDATE ${table.jobs} SET lease_until = ${clock} + ? WHERE ${activeLease}`, [options.leaseMs, job.id, job.token])
      }, Math.max(250, Math.floor(options.leaseMs / 3)))
      renewal.unref()
      try {
        const result = await executeOwnedJob(job).catch(failed)
        const saved = await finishJob(job, result)
        if (!saved.success)
          return saved
        processed++
      }
      finally {
        clearInterval(renewal)
      }
    }
    const swept = await sweepRetention(app, params)
    return swept.success
      ? core.ok({ processed })
      : swept
  }

  async function sweepRetention(app: string, params: unknown[]) {
    if (Date.now() < cleanupAfter)
      return core.ok(undefined)

    const expiredExports = await reldb.sql.query<Pick<FeedbackJobRow, 'id' | 'app_id' | 'result'>>(`SELECT id, app_id, result FROM ${table.jobs} WHERE ${app} AND kind = 'export' AND status = 'succeeded' AND created_at <= ${clock} - ? ORDER BY created_at, id LIMIT 20`, [...params, options.exportRetentionHours * 3600000])
    if (!expiredExports.success)
      return expiredExports
    for (const job of expiredExports.data) {
      if (job.app_id !== options.appId)
        continue
      const result = readFeedbackJson(job.result)
      if (result && typeof result === 'object' && 'key' in result && typeof result.key === 'string') {
        const deleted = await storage.file.delete(result.key)
        if (!deleted.success)
          return deleted
      }
      const marked = await reldb.sql.execute(`UPDATE ${table.jobs} SET status = 'failed', result = NULL, payload = ?, last_error = ? WHERE id = ? AND status = 'succeeded'`, [
        JSON.stringify({ expired: true }),
        HaiFeedbackError.NOT_FOUND.code,
        job.id,
      ])
      if (!marked.success)
        return marked
    }
    const quotaRows = await reldb.sql.query<{ id: string }>(`SELECT id FROM ${table.quotas} WHERE ${app} AND period > 0 AND period < ${clock} - 172800000 ORDER BY period, id LIMIT 100`, params)
    if (!quotaRows.success)
      return quotaRows
    if (quotaRows.data.length) {
      const removed = await reldb.sql.execute(`DELETE FROM ${table.quotas} WHERE id IN (${quotaRows.data.map(() => '?').join(',')})`, quotaRows.data.map(row => row.id))
      if (!removed.success)
        return removed
    }

    // 临时证据按应用限批清理；空闲节点不在每轮执行全表 DELETE。
    const expired = await reldb.sql.query<{ id: string }>(`SELECT id FROM ${table.evidence} WHERE ${app} AND report_id IS NULL AND expires_at < ? ORDER BY expires_at, id LIMIT 100`, [
      ...params,
      Date.now(),
    ])
    if (!expired.success)
      return expired
    if (expired.data.length) {
      const removed = await reldb.sql.execute(`DELETE FROM ${table.evidence} WHERE ${app} AND report_id IS NULL AND id IN (${expired.data.map(() => '?').join(',')})`, [
        ...params,
        ...expired.data.map(row => row.id),
      ])
      if (!removed.success)
        return removed
    }
    cleanupBacklog = expired.data.length === 100
    cleanupAfter = cleanupBacklog
      ? 0
      : Date.now() + 30000
    return core.ok(undefined)
  }

  async function executeOwnedJob(job: FeedbackJobRow): Promise<HaiResult<unknown>> {
    if (job.app_id !== options.appId)
      return missing()
    const owned = await reldb.sql.get(`SELECT id FROM ${table.jobs} WHERE ${activeLease}`, [job.id, job.token])
    if (!owned.success)
      return owned
    if (!owned.data)
      return conflict()
    const raw = readFeedbackJson(job.payload)
    const payload = raw && typeof raw === 'object'
      ? raw
      : {}
    const prefix = feedbackObjectPrefix(job.scope_id, job.report_id)
    if (job.kind === 'cleanup' && 'tombstone' in payload && payload.tombstone === true) {
      const cleared = await storage.dir.delete(prefix)
      if (!cleared.success)
        return cleared
      return 'until' in payload && typeof payload.until === 'number' && payload.until <= Date.now()
        ? core.ok({ purged: true })
        : core.ok({ pending: true })
    }
    const row = await repo.find(job.report_id, job.scope_id, reldb.sql, job.kind === 'cleanup')
    if (!row.success)
      return row
    if (!row.data || row.data.id !== job.report_id || row.data.scope_id !== job.scope_id || row.data.app_id !== options.appId)
      return missing()
    if (Number(row.data.deleting) && job.kind !== 'cleanup')
      return missing()
    const report = repo.report(row.data)
    return job.kind === 'cleanup'
      ? cleanupReport(job, report, prefix)
      : options.executeJob(job, report, payload, shutdown.signal)
  }

  async function cleanupReport(job: FeedbackJobRow, report: FeedbackReport, prefix: string) {
    const marked = await withLease(job, async (tx, locked) => {
      const updated = await tx.execute(`UPDATE ${table.reports} SET deleting = 1 WHERE id = ? AND expires_at <= ${clock}`, [report.id])
      if (!updated.success)
        return updated
      return updated.data.changes || Number(locked.deleting)
        ? core.ok(undefined)
        : conflict()
    })
    if (!marked.success)
      return marked
    const cleared = await storage.dir.delete(prefix)
    if (!cleared.success)
      return cleared
    const deleted = await withLease(job, async (tx) => {
      for (const name of [table.evidence, table.attachments, table.history]) {
        const removed = await tx.execute(`DELETE FROM ${name} WHERE report_id = ?`, [report.id])
        if (!removed.success)
          return removed
      }
      const reservation = await tx.get<{ reserved_bytes: number }>(`SELECT reserved_bytes FROM ${table.quotas} WHERE id = ?`, [report.id])
      if (!reservation.success)
        return reservation
      if (reservation.data) {
        const released = await tx.execute(`UPDATE ${table.quotas} SET report_count = report_count - 1, reserved_bytes = reserved_bytes - ?, updated_at = ${clock} WHERE id = ? AND reserved_bytes >= ? AND report_count > 0`, [
          Number(reservation.data.reserved_bytes),
          options.scopeQuotaId(report.scopeId),
          Number(reservation.data.reserved_bytes),
        ])
        if (!released.success || !released.data.changes) {
          return released.success
            ? conflict()
            : released
        }
        const removed = await tx.execute(`DELETE FROM ${table.quotas} WHERE id = ?`, [report.id])
        if (!removed.success)
          return removed
      }
      const removedJobs = await tx.execute(`DELETE FROM ${table.jobs} WHERE report_id = ? AND id <> ?`, [report.id, job.id])
      if (!removedJobs.success)
        return removedJobs
      // 仅保留一天最小清扫墓碑，重试删除可能在响应丢失或旧进程退出时迟到的对象。
      const tombstone = await tx.execute(`UPDATE ${table.jobs} SET payload = ?, result = NULL WHERE id = ? AND token = ?`, [
        JSON.stringify({ tombstone: true, prefix, until: Date.now() + 86400000 }),
        job.id,
        job.token,
      ])
      if (!tombstone.success)
        return tombstone
      const params: unknown[] = []
      const identity = `${feedbackTextEquals('id', report.id, params)} AND ${feedbackTextEquals('scope_id', report.scopeId, params)}`
      const removed = await tx.execute(`DELETE FROM ${table.reports} WHERE ${identity} AND expires_at <= ${clock}`, params)
      return removed.success
        ? core.ok({ pending: true })
        : removed
    })
    return deleted
  }

  function start() {
    if (!options.intervalMs || stopped)
      return
    schedule(options.intervalMs)
  }

  async function close() {
    stopped = true
    shutdown.abort()
    if (timer)
      clearTimeout(timer)
    await running
  }

  return {
    start,
    close,
    runJobs,
    wake: wakeWorker,
    withLease,
    retry,
  }
}
