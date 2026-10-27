import type { FeedbackAttachment, FeedbackEvidence, FeedbackEvidenceInput, FeedbackHistory, FeedbackJob, FeedbackReport } from '@h-ai/api-contract/feedback'
import type { HaiResult } from '@h-ai/core'
import type { DmlOperations, DmlWithTxOperations } from '@h-ai/reldb'
import type { FeedbackCapture } from './feedback-capture.js'
import type { FeedbackConfig } from './feedback-config.js'
import type { FeedbackAttachmentRow, FeedbackEvidenceRow, FeedbackJobRow, FeedbackReportRepository, FeedbackReportRow } from './feedback-repository.js'
import type { FeedbackCollectedEvidence, FeedbackContext, FeedbackFunctions, FeedbackInitOptions, FeedbackWebhookEvent } from './feedback-types.js'
import { Buffer } from 'node:buffer'
import { createHash, createHmac, randomUUID } from 'node:crypto'
import {
  FeedbackAppendEvidenceInputSchema,
  FeedbackAttachmentInputSchema,
  FeedbackAttachmentSchema,
  FeedbackCompleteInputSchema,
  FeedbackEvidenceInputSchema,
  FeedbackEvidenceQuerySchema,
  FeedbackEvidenceSchema,
  FeedbackExportInputSchema,
  FeedbackHistorySchema,
  FeedbackJobSchema,
  FeedbackListInputSchema,
  FeedbackRetryInputSchema,
  FeedbackSetStatusInputSchema,
  FeedbackSubmitInputSchema,
  FeedbackUploadInputSchema,
  resolveFeedbackBudget,
} from '@h-ai/api-contract/feedback'
import { core, err, ok } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { storage } from '@h-ai/storage'
import { createFeedbackBundle } from './bundle/index.js'
import { feedbackClockSql } from './feedback-clock.js'
import { feedbackM } from './feedback-i18n.js'
import { feedbackTextEquals, readFeedbackJson } from './feedback-repository.js'
import { canonicalFeedbackJson, redactFeedbackText, sanitizeFeedbackValue } from './feedback-sanitize.js'
import { HaiFeedbackError } from './feedback-types.js'

/**
 * 内部运行时，任务资源由模块生命周期停止。
 * @example 模块内部上下文
 * ```ts
 * async function drain(runtime: FeedbackRuntime) { await runtime.close() }
 * void drain
 * ```
 */
export type FeedbackRuntime = Omit<FeedbackFunctions, 'init' | 'close' | 'config' | 'budget' | 'isInitialized'> & { start: () => void, close: () => Promise<void> }

/** 将异常留在公共 HaiResult 边界之内；不向用户返回 SDK/SQL/凭据原文。 */
function failed() {
  return err(HaiFeedbackError.OPERATION_FAILED, feedbackM('feedback_operationFailed'))
}
function invalid() {
  return err(HaiFeedbackError.INVALID_INPUT, feedbackM('feedback_invalidInput'))
}
function conflict() {
  return err(HaiFeedbackError.CONFLICT, feedbackM('feedback_conflict'))
}
function forbidden() {
  return err(HaiFeedbackError.FORBIDDEN, feedbackM('feedback_forbidden'))
}
function missing() {
  return err(HaiFeedbackError.NOT_FOUND, feedbackM('feedback_notFound'))
}
function limited() {
  return err(HaiFeedbackError.LIMIT_EXCEEDED, feedbackM('feedback_limitExceeded'))
}
function hash(value: string | Uint8Array) {
  return createHash('sha256').update(value).digest('hex')
}
function permitted(actor: FeedbackContext, permission: string) {
  return actor.permissions?.includes('feedback:*') || actor.permissions?.includes(permission)
}
function validActor(actor: FeedbackContext) {
  return !!actor && typeof actor.scopeId === 'string' && actor.scopeId.length > 0 && actor.scopeId.length <= 128 && typeof actor.userId === 'string' && actor.userId.length > 0 && actor.userId.length <= 128
}
function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[character] ?? character)
}

/**
 * 服务端操作编排，数据表/存储/通知均使用依赖的公开入口。
 * @example 模块内部上下文
 * ```ts
 * function createRuntime(repository: FeedbackReportRepository, config: FeedbackConfig, capture: FeedbackCapture) {
 *   return createFeedbackOperations(repository, config, capture)
 * }
 * void createRuntime
 * ```
 */
export function createFeedbackOperations(repo: FeedbackReportRepository, config: FeedbackConfig, capture: FeedbackCapture, options: FeedbackInitOptions = {}): FeedbackRuntime {
  const budget = resolveFeedbackBudget(config)
  const table = repo.tables
  const clock = feedbackClockSql()
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let running: Promise<HaiResult<{ processed: number }>> | null = null
  let idleRounds = 0
  let cleanupBacklog = false
  let cleanupAfter = 0
  let wakePending = false
  const shutdown = new AbortController()

  function schedule(delay: number) {
    if (stopped || !config.workerIntervalMs)
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
      schedule(config.workerIntervalMs)
  }
  async function tick() {
    if (stopped)
      return
    const result = await runJobs()
    idleRounds = result.success && (result.data.processed > 0 || cleanupBacklog || wakePending) ? 0 : Math.min(idleRounds + 1, 10)
    wakePending = false
    schedule(Math.min(30000, config.workerIntervalMs * 2 ** idleRounds))
  }
  const collectEvidence = options.collectEvidence

  function quotaExceeded() {
    return err(HaiFeedbackError.QUOTA_EXCEEDED, feedbackM('feedback_quotaExceeded'))
  }
  function scopeQuotaId(scopeId: string) {
    return hash(JSON.stringify([config.appId, scopeId, 'storage']))
  }

  /** 同一数据库事务先预留最大材料及导出容量，避免多节点先检查后写穿透。 */
  async function reserveQuota(tx: DmlWithTxOperations, actor: FeedbackContext, reportId: string) {
    const time = await tx.get<{ now: number }>(`SELECT ${clock} AS now`)
    if (!time.success)
      return time
    const now = Number(time.data?.now)
    if (!Number.isFinite(now))
      return failed()
    const day = Math.floor(now / 86400000) * 86400000
    const bytes = budget.maxTotalBytes * (config.maxExportsPerReport + 1)
    const buckets = [
      { id: scopeQuotaId(actor.scopeId), period: 0, maxReports: Number.MAX_SAFE_INTEGER, maxBytes: config.maxStoredBytesPerScope },
      { id: hash(JSON.stringify([config.appId, actor.scopeId, actor.userId, day])), period: day, maxReports: config.maxReportsPerUserDay, maxBytes: config.maxBytesPerUserDay },
    ]
    for (const bucket of buckets) {
      const suffix = reldb.config?.type === 'mysql' ? 'ON DUPLICATE KEY UPDATE id = id' : 'ON CONFLICT (id) DO NOTHING'
      const inserted = await tx.execute(`INSERT INTO ${table.quotas} (id, app_id, scope_id, user_id, period, report_count, reserved_bytes, updated_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?) ${suffix}`, [bucket.id, config.appId, actor.scopeId, bucket.period === 0 ? '' : actor.userId, bucket.period, now])
      if (!inserted.success)
        return inserted
      const reserved = await tx.execute(`UPDATE ${table.quotas} SET report_count = report_count + 1, reserved_bytes = reserved_bytes + ?, updated_at = ? WHERE id = ? AND report_count < ? AND reserved_bytes <= ?`, [bytes, now, bucket.id, bucket.maxReports, bucket.maxBytes - bytes])
      if (!reserved.success)
        return reserved
      if (!reserved.data.changes)
        return quotaExceeded()
    }
    return tx.execute(`INSERT INTO ${table.quotas} (id, app_id, scope_id, user_id, period, report_count, reserved_bytes, report_bytes, export_limit, updated_at) VALUES (?, ?, ?, ?, -1, 1, ?, ?, ?, ?)`, [reportId, config.appId, actor.scopeId, actor.userId, bytes, budget.maxTotalBytes, config.maxExportsPerReport, now])
  }

  async function access(id: string, actor: FeedbackContext, permission?: string, sql: DmlOperations = reldb.sql): Promise<HaiResult<FeedbackReportRow>> {
    if (!validActor(actor))
      return forbidden()
    const result = await repo.find(id, actor.scopeId, sql)
    if (!result.success)
      return result
    if (!result.data || result.data.id !== id || result.data.scope_id !== actor.scopeId || result.data.app_id !== config.appId || Number(result.data.deleting))
      return missing()
    if (permission ? !permitted(actor, permission) : (result.data.user_id !== actor.userId && !permitted(actor, 'feedback:read')))
      return forbidden()
    return ok(result.data)
  }

  async function accessWrite(id: string, actor: FeedbackContext, sql: DmlOperations = reldb.sql) {
    const result = await access(id, actor, permitted(actor, 'feedback:process') ? 'feedback:process' : undefined, sql)
    if (!result.success)
      return result
    return result.data.user_id === actor.userId || permitted(actor, 'feedback:process') ? result : forbidden()
  }

  async function insertJob(tx: DmlOperations, report: FeedbackReport, kind: FeedbackJobRow['kind'], suffix: string, payload: unknown, nextRun: number) {
    const id = hash(`${report.id}:${kind}:${suffix}`)
    const previous = await tx.get<FeedbackJobRow>(`SELECT * FROM ${table.jobs} WHERE id = ?`, [id])
    if (!previous.success)
      return previous
    if (previous.data)
      return ok(id)
    const now = Date.now()
    const inserted = await tx.execute(`INSERT INTO ${table.jobs} (id, app_id, snapshot_revision, snapshot_version, report_id, scope_id, kind, status, token, lease_until, attempts, next_run_at, created_at, updated_at, last_error, payload, result) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${clock} + ?, ?, ?, ?, ?, ?)`, [id, config.appId, kind === 'export' ? report.evidenceRevision : null, kind === 'export' ? report.version : null, report.id, report.scopeId, kind, 'pending', null, 0, 0, Math.max(0, nextRun - now), now, now, null, JSON.stringify(payload), null])
    return inserted.success ? ok(id) : inserted
  }

  function jobData(row: FeedbackJobRow): FeedbackJob {
    const result = readFeedbackJson(row.result)
    return FeedbackJobSchema.parse({ id: row.id, feedbackId: row.report_id, type: row.kind, status: row.status, attempts: Number(row.attempts), createdAt: Number(row.created_at), updatedAt: Number(row.updated_at), nextRunAt: Number(row.next_run_at), lastError: row.last_error ?? undefined, result: result && typeof result === 'object' ? { available: true } : undefined })
  }

  function attachmentData(row: FeedbackAttachmentRow): FeedbackAttachment {
    return FeedbackAttachmentSchema.parse({ ...FeedbackAttachmentSchema.parse(readFeedbackJson(row.payload)), status: row.status })
  }

  async function appendInside(tx: DmlWithTxOperations, row: FeedbackReportRow, events: FeedbackEvidenceInput[], internal = false): Promise<HaiResult<{ acknowledged: string[], evidenceRevision: number }>> {
    const acknowledged: string[] = []
    const additions: Array<{ key: string, event: FeedbackEvidenceInput, bytes: number }> = []
    for (const input of events) {
      if (!internal && input.source.startsWith('server:'))
        return invalid()
      const event = FeedbackEvidenceInputSchema.parse(sanitizeFeedbackValue(input))
      const key = hash(`${row.id}:${event.source}:${event.sequence}`)
      const previous = await tx.get<FeedbackEvidenceRow>(`SELECT * FROM ${table.evidence} WHERE id = ?`, [key])
      if (!previous.success)
        return previous
      if (previous.data) {
        if (canonicalFeedbackJson(readFeedbackJson(previous.data.payload)) !== canonicalFeedbackJson(event))
          return conflict()
      }
      else {
        const bytes = Buffer.byteLength(JSON.stringify(event))
        if (bytes > 1024 * 1024)
          return limited()
        const staged = additions.find(item => item.key === key)
        if (staged && canonicalFeedbackJson(staged.event) !== canonicalFeedbackJson(event))
          return conflict()
        if (!staged)
          additions.push({ key, event, bytes })
      }
      acknowledged.push(event.id)
    }
    if (!additions.length)
      return ok({ acknowledged, evidenceRevision: Number(row.revision) })
    const bytes = additions.reduce((total, item) => total + item.bytes, 0)
    const revision = Number(row.revision) + 1
    const params: unknown[] = [additions.length, bytes, revision, Date.now()]
    const identity = `${feedbackTextEquals('id', row.id, params)} AND ${feedbackTextEquals('scope_id', row.scope_id, params)}`
    params.push(row.revision, additions.length, budget.maxEvidenceCount, bytes, budget.maxEvidenceBytes)
    const changed = await tx.execute(`UPDATE ${table.reports} SET evidence_count = evidence_count + ?, evidence_bytes = evidence_bytes + ?, revision = ?, updated_at = ? WHERE ${identity} AND revision = ? AND deleting = 0 AND evidence_count + ? <= ? AND evidence_bytes + ? <= ?`, params)
    if (!changed.success)
      return changed
    if (!changed.data.changes)
      return Number(row.evidence_count) + additions.length > budget.maxEvidenceCount || Number(row.evidence_bytes) + bytes > budget.maxEvidenceBytes ? limited() : conflict()
    for (const { key, event, bytes: itemBytes } of additions) {
      const inserted = await tx.execute(`INSERT INTO ${table.evidence} (id, report_id, scope_id, user_id, app_id, source, sequence, kind, timestamp, request_id, error_id, revision, bytes, expires_at, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [key, row.id, row.scope_id, row.user_id, row.app_id, event.source, event.sequence, event.kind, event.timestamp, event.requestId ?? null, event.errorId ?? null, revision, itemBytes, row.expires_at, JSON.stringify(event)])
      if (!inserted.success)
        return inserted
    }
    return ok({ acknowledged, evidenceRevision: revision })
  }

  async function appendInternal(id: string, actor: FeedbackContext, events: FeedbackEvidenceInput[]) {
    return repo.transaction(async (tx) => {
      const row = await access(id, actor, undefined, tx)
      return row.success ? appendInside(tx, row.data, events, true) : row
    })
  }

  async function attachments(id: string, sql: DmlOperations = reldb.sql) {
    return sql.query<FeedbackAttachmentRow>(`SELECT * FROM ${table.attachments} WHERE report_id = ? ORDER BY id`, [id])
  }
  async function withLease<T>(job: FeedbackJobRow, work: (tx: DmlWithTxOperations) => Promise<HaiResult<T>>): Promise<HaiResult<T>> {
    return repo.transaction(async (tx) => {
      const lock = reldb.config?.type === 'sqlite' ? '' : ' FOR UPDATE'
      const owned = await tx.get(`SELECT id FROM ${table.jobs} WHERE id = ? AND token = ? AND status = 'running' AND lease_until > ${clock}${lock}`, [job.id, job.token])
      if (!owned.success)
        return owned
      if (!owned.data)
        return conflict()
      const result = await work(tx)
      if (!result.success)
        return result
      const stillOwned = await tx.get(`SELECT id FROM ${table.jobs} WHERE id = ? AND token = ? AND status = 'running' AND lease_until > ${clock}`, [job.id, job.token])
      return stillOwned.success && stillOwned.data ? result : conflict()
    })
  }

  async function notificationSummary(id: string) {
    if (config.notificationMode === 'disabled')
      return reldb.sql.execute(`UPDATE ${table.reports} SET notification_status = 'disabled' WHERE id = ?`, [id])
    return reldb.sql.execute(`UPDATE ${table.reports} SET notification_status = CASE
      WHEN EXISTS (SELECT 1 FROM ${table.jobs} WHERE report_id = ? AND kind = 'notify' AND (status = 'failed' OR last_error IS NOT NULL)) THEN 'failed'
      WHEN NOT EXISTS (SELECT 1 FROM ${table.jobs} WHERE report_id = ? AND kind = 'notify' AND status <> 'succeeded') THEN 'sent'
      WHEN EXISTS (SELECT 1 FROM ${table.jobs} WHERE report_id = ? AND kind = 'notify' AND status = 'running') THEN 'sending'
      WHEN EXISTS (SELECT 1 FROM ${table.jobs} WHERE report_id = ? AND kind = 'notify' AND status = 'pending' AND result IS NOT NULL) THEN 'deferred'
      ELSE 'pending' END WHERE id = ?`, [id, id, id, id, id])
  }
  async function history(id: string, sql: DmlOperations = reldb.sql) {
    const result = await sql.query<{ payload: unknown }>(`SELECT payload FROM ${table.history} WHERE report_id = ? ORDER BY id`, [id])
    return result.success ? ok(result.data.map(row => FeedbackHistorySchema.parse(readFeedbackJson(row.payload)))) : result
  }
  async function evidence(id: string, revision: number, sql: DmlOperations = reldb.sql) {
    const result = await sql.query<FeedbackEvidenceRow>(`SELECT * FROM ${table.evidence} WHERE report_id = ? AND revision <= ? ORDER BY timestamp, source, sequence`, [id, revision])
    return result.success ? ok(result.data.map(row => FeedbackEvidenceSchema.parse({ ...FeedbackEvidenceInputSchema.parse(readFeedbackJson(row.payload)), feedbackId: id, revision: Number(row.revision) }))) : result
  }

  async function runJobs(): Promise<HaiResult<{ processed: number }>> {
    if (stopped)
      return err(HaiFeedbackError.NOT_INITIALIZED, feedbackM('feedback_notInitialized'))
    if (running)
      return running
    running = core.context.run({ suppressLogObservers: true }, processJobs).catch(failed).finally(() => {
      running = null
    })
    return running
  }

  const operations: FeedbackRuntime = {
    start() {
      if (!config.workerIntervalMs || stopped)
        return
      schedule(config.workerIntervalMs)
    },
    async close() {
      stopped = true
      shutdown.abort()
      if (timer)
        clearTimeout(timer)
      await running
    },

    async submit(input, actor) {
      if (!validActor(actor))
        return forbidden()
      if (actor.permissions !== undefined && !permitted(actor, 'feedback:create'))
        return forbidden()
      const parsed = FeedbackSubmitInputSchema.safeParse(input)
      if (!parsed.success || parsed.data.appId !== config.appId)
        return invalid()
      const sanitized = FeedbackSubmitInputSchema.parse(sanitizeFeedbackValue(parsed.data))
      if (sanitized.evidence?.some(event => event.source.startsWith('server:')))
        return invalid()
      const submissionKey = hash(JSON.stringify([actor.scopeId, actor.userId, config.appId, sanitized.submissionId]))
      const digest = hash(canonicalFeedbackJson(sanitized))
      const existing = await reldb.sql.get<FeedbackReportRow>(`SELECT * FROM ${table.reports} WHERE submission_key = ?`, [submissionKey])
      if (!existing.success)
        return existing
      if (existing.data && (existing.data.scope_id !== actor.scopeId || existing.data.user_id !== actor.userId || existing.data.app_id !== config.appId))
        return conflict()
      if (existing.data && Number(existing.data.deleting))
        return missing()
      if (existing.data)
        return existing.data.submission_hash === digest ? ok(repo.report(existing.data)) : conflict()
      const now = Date.now()
      const id = `fb_${randomUUID()}`
      const report: FeedbackReport = {
        id,
        number: `FB-${new Date(now).toISOString().slice(0, 10).replaceAll('-', '')}-${id.slice(-8).toUpperCase()}`,
        appId: config.appId,
        scopeId: actor.scopeId,
        userId: actor.userId,
        description: sanitized.description,
        category: sanitized.category,
        contact: sanitized.contact,
        url: sanitized.url,
        summary: (sanitized.description?.trim() || sanitized.url || feedbackM('feedback_defaultSummary')).slice(0, 200),
        appVersion: sanitized.appVersion ?? config.appVersion,
        buildId: sanitized.buildId ?? config.buildId,
        commit: sanitized.commit ?? config.commit,
        status: 'pending',
        collectionStatus: 'collecting',
        notificationStatus: config.notificationMode === 'disabled' ? 'disabled' : 'pending',
        createdAt: now,
        updatedAt: now,
        version: 1,
        evidenceRevision: 1,
      }
      const row: FeedbackReportRow = { id, scope_id: actor.scopeId, user_id: actor.userId, app_id: config.appId, number: report.number, app_version: report.appVersion ?? null, summary: report.summary ?? '', submission_key: submissionKey, submission_hash: digest, status: 'pending', collection_status: 'collecting', notification_status: report.notificationStatus, created_at: now, updated_at: now, version: 1, revision: 1, evidence_count: 0, evidence_bytes: 0, collect_deadline: now + config.collectionTimeoutMs, expires_at: now + config.retentionDays * 86400000, payload: report, deleting: 0 }
      const result = await repo.transaction(async (tx) => {
        const inserted = await repo.create({ ...row }, tx)
        if (!inserted.success)
          return inserted
        const reservation = await reserveQuota(tx, actor, id)
        if (!reservation.success)
          return reservation
        // 受理与环境证据共同提交；环境写入失败时同一 submissionId 可安全重试。
        const initial = await appendInside(tx, row, [...sanitized.evidence ?? [], capture.environment()], true)
        if (!initial.success)
          return initial
        if ((sanitized.attachments ?? []).reduce((total, file) => total + file.size, 0) > budget.maxAttachmentsBytes)
          return limited()
        for (const attachment of sanitized.attachments ?? []) {
          if (attachment.id.startsWith('server:') || attachment.size > budget.maxAttachmentBytes || !allowedContentType(attachment.contentType))
            return invalid()
          const attachmentId = hash(`${id}:${attachment.id}`)
          const data: FeedbackAttachment = { ...attachment, feedbackId: id, status: 'pending' }
          const saved = await tx.execute(`INSERT INTO ${table.attachments} (id, client_id, report_id, scope_id, object_key, status, size, checksum, updated_at, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [attachmentId, attachment.id, id, actor.scopeId, `feedback/${hash(actor.scopeId).slice(0, 16)}/${id}/${attachmentId}`, 'pending', attachment.size, attachment.checksum, now, JSON.stringify(data)])
          if (!saved.success)
            return saved
        }
        for (const recipient of config.notificationMode === 'disabled' ? [] : config.notificationMode === 'console' ? ['console'] : config.recipients) {
          const saved = await insertJob(tx, report, 'notify', recipient, { recipient }, row.collect_deadline)
          if (!saved.success)
            return saved
        }
        if (config.webhookUrl) {
          const webhook = await insertJob(tx, report, 'webhook', 'created', { url: config.webhookUrl }, row.collect_deadline)
          if (!webhook.success)
            return webhook
        }
        const collected = await insertJob(tx, report, 'collect', 'initial', { anchor: sanitized.anchor?.timestamp ?? now, businessEvidence: !!collectEvidence }, row.collect_deadline)
        if (!collected.success)
          return collected
        const cleanup = await insertJob(tx, report, 'cleanup', 'expiry', {}, row.expires_at)
        if (!cleanup.success)
          return cleanup
        return ok({ ...report, evidenceRevision: initial.data.evidenceRevision })
      })
      if (!result.success) {
        const duplicate = await reldb.sql.get<FeedbackReportRow>(`SELECT * FROM ${table.reports} WHERE submission_key = ?`, [submissionKey])
        if (!duplicate.success || !duplicate.data)
          return result
        if (duplicate.data.scope_id !== actor.scopeId || duplicate.data.user_id !== actor.userId || duplicate.data.app_id !== config.appId)
          return conflict()
        if (Number(duplicate.data.deleting))
          return missing()
        return duplicate.data.submission_hash === digest ? ok(repo.report(duplicate.data)) : conflict()
      }
      wakeWorker()
      const current = await repo.find(id, actor.scopeId)
      return current.success && current.data ? ok(repo.report(current.data)) : result
    },

    async list(input, actor) {
      if (!validActor(actor) || !permitted(actor, 'feedback:read'))
        return forbidden()
      const parsed = FeedbackListInputSchema.safeParse(input)
      if (!parsed.success)
        return invalid()
      const query = parsed.data
      if (query.from !== undefined && query.to !== undefined && query.from > query.to)
        return invalid()
      const params: unknown[] = []
      const conditions = [feedbackTextEquals('scope_id', actor.scopeId, params), feedbackTextEquals('app_id', config.appId, params), 'deleting = 0']
      for (const [column, value] of [['status', query.status], ['collection_status', query.collectionStatus], ['notification_status', query.notificationStatus], ['app_id', query.appId]] as const) {
        if (value) {
          if (column === 'app_id') {
            conditions.push(feedbackTextEquals(column, value, params))
          }
          else {
            conditions.push(`${column} = ?`)
            params.push(value)
          }
        }
      }
      if (query.from !== undefined) {
        conditions.push('created_at >= ?')
        params.push(query.from)
      }
      if (query.to !== undefined) {
        conditions.push('created_at <= ?')
        params.push(query.to)
      }
      // 用独立的短摘要列执行跨数据库筛选，不扫描诊断 JSON 大字段。
      if (query.search) {
        conditions.push('(number LIKE ? ESCAPE \'!\' OR summary LIKE ? ESCAPE \'!\')')
        const search = `%${query.search.replaceAll('!', '!!').replaceAll('%', '!%').replaceAll('_', '!_')}%`
        params.push(search, search)
      }
      if (query.appVersion) {
        conditions.push('app_version = ?')
        params.push(query.appVersion)
      }
      const direction = query.sortDirection === 'asc' ? 'ASC' : 'DESC'
      const page = await reldb.sql.queryPage<FeedbackReportRow>({ sql: `SELECT * FROM ${table.reports} WHERE ${conditions.join(' AND ')} ORDER BY created_at ${direction}, id ${direction}`, params, pagination: { page: query.page, pageSize: query.pageSize } })
      return page.success ? ok({ ...page.data, items: page.data.items.map(row => repo.report(row)) }) : page
    },

    async get(id, actor) {
      const report = await access(id, actor)
      if (!report.success)
        return report
      const files = await attachments(id)
      if (!files.success)
        return files
      const changes = await history(id)
      if (!changes.success)
        return changes
      const jobs = await reldb.sql.query<FeedbackJobRow>(`SELECT * FROM ${table.jobs} WHERE report_id = ? ORDER BY created_at, id`, [id])
      return jobs.success ? ok({ report: repo.report(report.data), attachments: files.data.map(attachmentData), history: changes.data, jobs: jobs.data.map(jobData) }) : jobs
    },

    async getEvidence(input, actor) {
      const parsed = FeedbackEvidenceQuerySchema.safeParse(input)
      if (!parsed.success)
        return invalid()
      const accessResult = await access(parsed.data.id, actor)
      if (!accessResult.success)
        return accessResult
      const query = parsed.data
      const params: unknown[] = []
      const conditions = [feedbackTextEquals('report_id', query.id, params), feedbackTextEquals('scope_id', actor.scopeId, params)]
      for (const [column, value] of [['source', query.source], ['kind', query.kind], ['request_id', query.requestId]] as const) {
        if (value) {
          if (column === 'kind') {
            conditions.push(`${column} = ?`)
            params.push(value)
          }
          else {
            conditions.push(feedbackTextEquals(column, value, params))
          }
        }
      }
      if (query.errorId) {
        const anchorParams: unknown[] = []
        const anchorIdentity = `${feedbackTextEquals('report_id', query.id, anchorParams)} AND ${feedbackTextEquals('error_id', query.errorId, anchorParams)}`
        const anchor = await reldb.sql.get<FeedbackEvidenceRow>(`SELECT * FROM ${table.evidence} WHERE ${anchorIdentity} AND kind = 'error'`, anchorParams)
        if (!anchor.success)
          return anchor
        if (!anchor.data)
          return ok({ items: [], total: 0, page: query.page ?? 1, pageSize: query.pageSize ?? 20 })
        const contextParams: unknown[] = []
        const contextIdentity = `${feedbackTextEquals('report_id', query.id, contextParams)} AND ${feedbackTextEquals('source', anchor.data.source, contextParams)}`
        const request = anchor.data.request_id ? feedbackTextEquals('request_id', anchor.data.request_id, contextParams) : 'request_id IS NULL'
        const before = await reldb.sql.query<{ id: string }>(`SELECT id FROM ${table.evidence} WHERE ${contextIdentity} AND ${request} AND kind IN ('log', 'error') AND sequence <= ? ORDER BY sequence DESC LIMIT 101`, [...contextParams, anchor.data.sequence])
        if (!before.success)
          return before
        const after = await reldb.sql.query<{ id: string }>(`SELECT id FROM ${table.evidence} WHERE ${contextIdentity} AND ${request} AND kind IN ('log', 'error') AND sequence > ? ORDER BY sequence ASC LIMIT 100`, [...contextParams, anchor.data.sequence])
        if (!after.success)
          return after
        const ids = [...before.data, ...after.data].map(row => row.id)
        conditions.push(`id IN (${ids.map(() => '?').join(',')})`)
        params.push(...ids)
      }
      if (query.from !== undefined) {
        conditions.push('timestamp >= ?')
        params.push(query.from)
      }
      if (query.to !== undefined) {
        conditions.push('timestamp <= ?')
        params.push(query.to)
      }
      const page = await reldb.sql.queryPage<FeedbackEvidenceRow>({ sql: `SELECT * FROM ${table.evidence} WHERE ${conditions.join(' AND ')} ORDER BY timestamp, source, sequence`, params, pagination: { page: query.page, pageSize: query.pageSize } })
      return page.success ? ok({ ...page.data, items: page.data.items.map(row => FeedbackEvidenceSchema.parse({ ...FeedbackEvidenceInputSchema.parse(readFeedbackJson(row.payload)), feedbackId: query.id, revision: Number(row.revision) })) }) : page
    },

    async setStatus(input, actor) {
      const parsed = FeedbackSetStatusInputSchema.safeParse(input)
      if (!parsed.success)
        return invalid()
      return repo.transaction(async (tx) => {
        const row = await access(input.id, actor, input.status === 'handled' ? 'feedback:process' : 'feedback:reopen', tx)
        if (!row.success)
          return row
        if (Number(row.data.version) !== parsed.data.expectedVersion)
          return conflict()
        if (row.data.status === parsed.data.status)
          return ok(repo.report(row.data))
        const now = Date.now()
        const params: unknown[] = [parsed.data.status, now]
        const identity = `${feedbackTextEquals('id', input.id, params)} AND ${feedbackTextEquals('scope_id', actor.scopeId, params)}`
        params.push(parsed.data.expectedVersion)
        const updated = await tx.execute(`UPDATE ${table.reports} SET status = ?, version = version + 1, updated_at = ? WHERE ${identity} AND version = ?`, params)
        if (!updated.success)
          return updated
        if (!updated.data.changes)
          return conflict()
        const change: FeedbackHistory = { id: randomUUID(), feedbackId: input.id, userId: actor.userId, from: repo.report(row.data).status, to: parsed.data.status, timestamp: now, note: parsed.data.note ? redactFeedbackText(parsed.data.note) : undefined }
        const previousHistory = await history(input.id, tx)
        if (!previousHistory.success)
          return previousHistory
        if (Buffer.byteLength(JSON.stringify([...previousHistory.data, change])) > 256 * 1024)
          return limited()
        const saved = await tx.execute(`INSERT INTO ${table.history} (id, report_id, payload) VALUES (?, ?, ?)`, [change.id, input.id, JSON.stringify(change)])
        return saved.success ? ok({ ...repo.report(row.data), status: parsed.data.status, version: parsed.data.expectedVersion + 1, updatedAt: now }) : saved
      })
    },

    async appendEvidence(input, actor) {
      const parsed = FeedbackAppendEvidenceInputSchema.safeParse(input)
      if (!parsed.success)
        return invalid()
      return repo.transaction(async (tx) => {
        const row = await accessWrite(input.id, actor, tx)
        if (!row.success)
          return row
        if (Number(row.data.collect_deadline) + 5 * 60000 < Date.now())
          return conflict()
        return appendInside(tx, row.data, parsed.data.evidence)
      })
    },

    async completeCollection(input, actor) {
      const parsed = FeedbackCompleteInputSchema.safeParse(input)
      if (!parsed.success)
        return invalid()
      const row = await accessWrite(input.id, actor)
      if (!row.success)
        return row
      if (parsed.data.missing?.length) {
        const saved = await appendInternal(input.id, actor, [{ id: randomUUID(), source: 'collection', sequence: Date.now(), kind: 'missing', timestamp: Date.now(), data: { missing: parsed.data.missing }, missingReason: 'collection_incomplete' }])
        if (!saved.success)
          return saved
      }
      const next = await reldb.sql.execute(`UPDATE ${table.jobs} SET next_run_at = ${clock}, updated_at = ${clock} WHERE report_id = ? AND kind IN ('collect', 'notify', 'webhook') AND status = 'pending'`, [input.id])
      return next.success ? ok(repo.report(row.data)) : next
    },

    async uploadAttachment(input, actor) {
      return upload(input, actor)
    },
    async getAttachment(input, actor) {
      const row = await access(input.id, actor)
      if (!row.success)
        return row
      const params: unknown[] = []
      const identity = `${feedbackTextEquals('report_id', input.id, params)} AND ${feedbackTextEquals('client_id', input.attachmentId, params)} AND ${feedbackTextEquals('scope_id', actor.scopeId, params)}`
      const found = await reldb.sql.get<FeedbackAttachmentRow>(`SELECT * FROM ${table.attachments} WHERE ${identity}`, params)
      if (!found.success)
        return found
      if (!found.data || found.data.report_id !== input.id || found.data.scope_id !== actor.scopeId || found.data.client_id !== input.attachmentId || found.data.status !== 'available')
        return missing()
      const bytes = await storage.file.get(found.data.object_key)
      if (!bytes.success)
        return bytes
      if (hash(bytes.data) !== found.data.checksum)
        return err(HaiFeedbackError.CHECKSUM_MISMATCH, feedbackM('feedback_checksumMismatch'))
      const metadata = attachmentData(found.data)
      return ok({ name: metadata.name, contentType: metadata.contentType, dataBase64: bytes.data.toString('base64') })
    },

    async retry(input, actor) {
      const parsed = FeedbackRetryInputSchema.safeParse(input)
      if (!parsed.success)
        return invalid()
      const permission = input.target === 'export' ? 'feedback:export' : 'feedback:process'
      const row = await access(input.id, actor, permission)
      if (!row.success)
        return row
      if (input.target === 'attachment') {
        const params: unknown[] = [Date.now()]
        const identity = `${feedbackTextEquals('report_id', input.id, params)} AND ${feedbackTextEquals('client_id', input.targetId ?? '', params)} AND ${feedbackTextEquals('scope_id', actor.scopeId, params)}`
        const updated = await reldb.sql.execute(`UPDATE ${table.attachments} SET status = 'pending', updated_at = ? WHERE ${identity} AND status = 'failed'`, params)
        return updated.success ? ok(undefined) : updated
      }
      const updated = await reldb.sql.execute(`UPDATE ${table.jobs} SET status = 'pending', attempts = 0, next_run_at = ${clock}, last_error = NULL WHERE report_id = ? AND kind = ? AND status IN ('failed', 'pending')`, [input.id, input.target])
      if (updated.success && input.target === 'collect') {
        const resumed = await reldb.sql.execute(`UPDATE ${table.reports} SET collection_status = 'collecting' WHERE id = ? AND deleting = 0 AND EXISTS (SELECT 1 FROM ${table.jobs} WHERE report_id = ? AND kind = 'collect' AND status = 'pending')`, [input.id, input.id])
        if (!resumed.success)
          return resumed
      }
      if (updated.success)
        wakeWorker()
      return updated.success ? ok(undefined) : updated
    },

    async export(input, actor) {
      const parsed = FeedbackExportInputSchema.safeParse(input)
      if (!parsed.success)
        return invalid()
      const result = await repo.transaction(async (tx) => {
        const row = await access(input.id, actor, 'feedback:export', tx)
        if (!row.success)
          return row
        const revision = parsed.data.evidenceRevision ?? Number(row.data.revision)
        if (revision > Number(row.data.revision))
          return conflict()
        const snapshotVersion = revision === Number(row.data.revision) ? ' AND snapshot_version = ?' : ''
        const previous = await tx.get<FeedbackJobRow>(`SELECT * FROM ${table.jobs} WHERE report_id = ? AND kind = 'export' AND snapshot_revision = ?${snapshotVersion} ORDER BY created_at DESC, id DESC LIMIT 1`, [input.id, revision, ...(snapshotVersion ? [row.data.version] : [])])
        if (!previous.success)
          return previous
        if (previous.data) {
          const snapshot = readFeedbackJson(previous.data.payload)
          const live = snapshot && typeof snapshot === 'object' && 'snapshotExpiresAt' in snapshot && typeof snapshot.snapshotExpiresAt === 'number' && snapshot.snapshotExpiresAt > Date.now()
          if ((previous.data.status === 'succeeded' && Number(previous.data.created_at) + config.exportRetentionHours * 3600000 > Date.now()) || (previous.data.status !== 'succeeded' && live))
            return ok(jobData(previous.data))
        }
        if (revision < Number(row.data.revision)) {
          return missing()
        }
        const exports = await tx.get<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table.jobs} WHERE report_id = ? AND kind = 'export'`, [input.id])
        if (!exports.success)
          return exports
        const reservation = await tx.get<{ report_bytes: number, export_limit: number }>(`SELECT report_bytes, export_limit FROM ${table.quotas} WHERE id = ?`, [input.id])
        if (!reservation.success)
          return reservation
        if (!reservation.data || Number(exports.data?.count ?? 0) >= Math.min(config.maxExportsPerReport, Number(reservation.data.export_limit)))
          return quotaExceeded()
        const events = await evidence(input.id, revision, tx)
        if (!events.success)
          return events
        const files = await attachments(input.id, tx)
        if (!files.success)
          return files
        const changes = await history(input.id, tx)
        if (!changes.success)
          return changes
        const suffix = `${revision}:${row.data.version}${previous.data ? `:${previous.data.id}` : ''}`
        const added = await insertJob(tx, repo.report(row.data), 'export', suffix, { report: repo.report(row.data), evidence: events.data, attachments: files.data, history: changes.data, maxBytes: Number(reservation.data.report_bytes), snapshotExpiresAt: Date.now() + 3600000 }, Date.now())
        if (!added.success)
          return added
        const job = await tx.get<FeedbackJobRow>(`SELECT * FROM ${table.jobs} WHERE id = ?`, [added.data])
        return job.success && job.data ? ok(jobData(job.data)) : missing()
      })
      if (result.success)
        wakeWorker()
      return result
    },

    async getExport(input, actor) {
      const row = await access(input.id, actor, 'feedback:export')
      if (!row.success)
        return row
      const params: unknown[] = []
      const identity = `${feedbackTextEquals('id', input.jobId, params)} AND ${feedbackTextEquals('report_id', input.id, params)} AND ${feedbackTextEquals('scope_id', actor.scopeId, params)} AND ${feedbackTextEquals('app_id', config.appId, params)}`
      const job = await reldb.sql.get<FeedbackJobRow>(`SELECT * FROM ${table.jobs} WHERE ${identity} AND kind = 'export'`, params)
      if (!job.success)
        return job
      if (!job.data)
        return missing()
      if (job.data.status === 'pending' || job.data.status === 'running') {
        const snapshot = readFeedbackJson(job.data.payload)
        if (!snapshot || typeof snapshot !== 'object' || !('snapshotExpiresAt' in snapshot) || typeof snapshot.snapshotExpiresAt !== 'number')
          return failed()
        if (snapshot.snapshotExpiresAt < Date.now())
          return missing()
        return err(HaiFeedbackError.CONFLICT, feedbackM('feedback_exportPending'))
      }
      if (Number(job.data.created_at) + config.exportRetentionHours * 3600000 <= Date.now())
        return missing()
      if (job.data.status === 'failed')
        return failed()
      const data = readFeedbackJson(job.data.result)
      if (!data || typeof data !== 'object' || !('key' in data) || typeof data.key !== 'string')
        return missing()
      const bytes = await storage.file.get(data.key)
      if (!bytes.success)
        return bytes
      if (!('checksum' in data) || typeof data.checksum !== 'string' || hash(bytes.data) !== data.checksum)
        return err(HaiFeedbackError.CHECKSUM_MISMATCH, feedbackM('feedback_checksumMismatch'))
      return ok({ name: `${repo.report(row.data).number}.zip`, contentType: 'application/zip', dataBase64: bytes.data.toString('base64') })
    },

    runJobs,
  }

  // 附件和后台任务在同一运行时内共享受权查询与固定快照。
  async function upload(input: Parameters<FeedbackFunctions['uploadAttachment']>[0], actor: FeedbackContext): ReturnType<FeedbackFunctions['uploadAttachment']> {
    const parsed = FeedbackUploadInputSchema.safeParse(input)
    if (!parsed.success)
      return invalid()
    const row = await accessWrite(input.id, actor)
    if (!row.success)
      return row
    const params: unknown[] = []
    const identity = `${feedbackTextEquals('report_id', input.id, params)} AND ${feedbackTextEquals('client_id', input.attachmentId, params)} AND ${feedbackTextEquals('scope_id', actor.scopeId, params)}`
    const found = await reldb.sql.get<FeedbackAttachmentRow>(`SELECT * FROM ${table.attachments} WHERE ${identity}`, params)
    if (!found.success)
      return found
    if (!found.data || found.data.report_id !== input.id || found.data.scope_id !== actor.scopeId || found.data.client_id !== input.attachmentId)
      return missing()
    const attachment = found.data
    const metadata = attachmentData(attachment)
    const bytes = Buffer.from(parsed.data.dataBase64, 'base64')
    if (bytes.length !== Number(attachment.size) || bytes.length > budget.maxAttachmentBytes || !matchesContentType(bytes, metadata.contentType))
      return invalid()
    if (hash(bytes) !== attachment.checksum)
      return err(HaiFeedbackError.CHECKSUM_MISMATCH, feedbackM('feedback_checksumMismatch'))
    const stored = await storage.file.put(attachment.object_key, bytes, { contentType: metadata.contentType, ifNoneMatch: '*', signal: AbortSignal.timeout(30000) })
    if (!stored.success) {
      const existing = await storage.file.get(attachment.object_key)
      if (!existing.success || hash(existing.data) !== attachment.checksum) {
        await reldb.sql.execute(`UPDATE ${table.attachments} SET status = 'failed', updated_at = ? WHERE id = ? AND status <> 'available'`, [Date.now(), attachment.id])
        return stored
      }
    }
    const updated = await repo.transaction(async (tx) => {
      const live = await accessWrite(input.id, actor, tx)
      if (!live.success)
        return live
      const currentParams: unknown[] = []
      const currentIdentity = `${feedbackTextEquals('id', attachment.id, currentParams)} AND ${feedbackTextEquals('scope_id', actor.scopeId, currentParams)}`
      const currentFile = await tx.get<FeedbackAttachmentRow>(`SELECT * FROM ${table.attachments} WHERE ${currentIdentity}`, currentParams)
      if (!currentFile.success)
        return currentFile
      if (!currentFile.data || currentFile.data.id !== attachment.id || currentFile.data.report_id !== input.id || currentFile.data.scope_id !== actor.scopeId || currentFile.data.client_id !== input.attachmentId)
        return missing()
      if (currentFile.data.status === 'available')
        return ok(undefined)
      const confirmed = await tx.execute(`UPDATE ${table.attachments} SET status = 'available', updated_at = ${clock} WHERE ${currentIdentity}`, currentParams)
      if (!confirmed.success)
        return confirmed
      if (!confirmed.data.changes)
        return conflict()
      const revised = await tx.execute(`UPDATE ${table.reports} SET revision = revision + 1, updated_at = ${clock} WHERE id = ? AND deleting = 0`, [input.id])
      return revised.success && revised.data.changes ? ok(undefined) : conflict()
    })
    if (!updated.success) {
      if (updated.error.code === HaiFeedbackError.NOT_FOUND.code)
        await storage.file.delete(attachment.object_key)
      return updated
    }
    return ok({ ...metadata, status: 'available' })
  }

  /** 上传与最终关联分开；只有持有租约的事务能发布材料，孤立对象由反馈到期清理回收。 */
  async function collectBusiness(job: FeedbackJobRow, report: FeedbackReport, actor: FeedbackContext): Promise<HaiResult<void>> {
    const marker = hash(`${report.id}:server:business:0`)
    const previous = await reldb.sql.get(`SELECT id FROM ${table.evidence} WHERE id = ?`, [marker])
    if (!previous.success)
      return previous
    if (previous.data)
      return ok(undefined)
    if (!collectEvidence)
      return err(HaiFeedbackError.CONFIG_ERROR, feedbackM('feedback_configError'))
    const controller = new AbortController()
    const signal = AbortSignal.any([controller.signal, shutdown.signal])
    const timeout = setTimeout(() => controller.abort(), config.businessCollectionTimeoutMs)
    timeout.unref()
    let collected: FeedbackCollectedEvidence
    let onAbort: (() => void) | undefined
    try {
      collected = await Promise.race([
        Promise.resolve().then(() => collectEvidence({ report: Object.freeze({ ...report }), signal })),
        new Promise<never>((_resolve, reject) => {
          onAbort = () => reject(new Error('Feedback business collection aborted'))
          signal.addEventListener('abort', onAbort, { once: true })
          if (signal.aborted)
            onAbort()
        }),
      ])
    }
    catch {
      return failed()
    }
    finally {
      clearTimeout(timeout)
      if (onAbort)
        signal.removeEventListener('abort', onAbort)
    }
    if (!collected || typeof collected !== 'object' || (collected.text !== undefined && typeof collected.text !== 'string') || (collected.attachments !== undefined && !Array.isArray(collected.attachments)))
      return invalid()
    if ((collected.attachments?.length ?? 0) > budget.maxAttachmentCount)
      return limited()
    const files: Array<{ metadata: FeedbackAttachment, bytes: Buffer, key: string, rowId: string }> = []
    for (const input of collected.attachments ?? []) {
      if (!input || !(input.bytes instanceof Uint8Array) || typeof input.id !== 'string' || input.id.length > 100)
        return invalid()
      if (input.bytes.byteLength > budget.maxAttachmentBytes)
        return limited()
      let bytes = Buffer.from(input.bytes)
      if (!matchesContentType(bytes, input.contentType))
        return invalid()
      // 文本附件全文脱敏；压缩包是宿主生成的原始材料，不在服务端解压或执行。
      if (input.contentType === 'text/plain')
        bytes = Buffer.from(redactFeedbackText(bytes.toString('utf8')))
      if (input.contentType === 'application/json')
        bytes = Buffer.from(JSON.stringify(sanitizeFeedbackValue(JSON.parse(bytes.toString('utf8')))))
      if (bytes.length > budget.maxAttachmentBytes)
        return limited()
      const parsed = FeedbackAttachmentInputSchema.safeParse({ id: `server:business:${input.id}`, name: typeof input.name === 'string' ? redactFeedbackText(input.name) : input.name, contentType: input.contentType, size: bytes.length, checksum: hash(bytes) })
      if (!parsed.success || !input.id || files.some(file => file.metadata.id === parsed.data.id))
        return invalid()
      const rowId = hash(`${report.id}:${parsed.data.id}`)
      const key = `feedback/${hash(report.scopeId).slice(0, 16)}/${report.id}/business/${rowId}-${parsed.data.checksum}`
      files.push({ metadata: { ...parsed.data, feedbackId: report.id, status: 'available' }, bytes, key, rowId })
    }
    const event = FeedbackEvidenceInputSchema.safeParse(sanitizeFeedbackValue({ id: `business-${report.id}`, source: 'server:business', sequence: 0, kind: 'business', timestamp: report.createdAt, data: { ...collected.data, ...(collected.text !== undefined ? { text: collected.text } : {}), attachmentIds: files.map(file => file.metadata.id) } }))
    if (!event.success)
      return invalid()
    async function checkCapacity(sql: DmlOperations) {
      const existing = await attachments(report.id, sql)
      if (!existing.success)
        return existing
      if (existing.data.length + files.length > budget.maxAttachmentCount || existing.data.reduce((total, item) => total + Number(item.size), 0) + files.reduce((total, file) => total + file.bytes.length, 0) > budget.maxAttachmentsBytes)
        return limited()
      return ok(undefined)
    }
    // 首次上传前冻结业务文件清单；失败重试不能通过变化 ID/内容制造无限孤立对象。
    const frozenFiles = files.map(file => ({ id: file.rowId, size: file.bytes.length, checksum: file.metadata.checksum })).sort((left, right) => left.id.localeCompare(right.id))
    const frozen = await withLease(job, async (tx) => {
      const current = await tx.get<FeedbackJobRow>(`SELECT * FROM ${table.jobs} WHERE id = ?`, [job.id])
      if (!current.success || !current.data)
        return missing()
      const payload = readFeedbackJson(current.data.payload)
      if (!payload || typeof payload !== 'object')
        return invalid()
      if ('businessFiles' in payload)
        return canonicalFeedbackJson(payload.businessFiles) === canonicalFeedbackJson(frozenFiles) ? ok(undefined) : conflict()
      const updated = await tx.execute(`UPDATE ${table.jobs} SET payload = ? WHERE id = ? AND token = ?`, [JSON.stringify({ ...payload, businessFiles: frozenFiles }), job.id, job.token])
      return updated.success ? ok(undefined) : updated
    })
    if (!frozen.success)
      return frozen
    const capacity = await checkCapacity(reldb.sql)
    if (!capacity.success)
      return capacity
    for (const file of files) {
      const stored = await storage.file.put(file.key, file.bytes, { contentType: file.metadata.contentType, ifNoneMatch: '*', signal: AbortSignal.any([shutdown.signal, AbortSignal.timeout(30000)]) })
      if (!stored.success) {
        const existing = await storage.file.get(file.key)
        if (!existing.success || hash(existing.data) !== file.metadata.checksum)
          return stored
      }
    }
    return withLease(job, async (tx) => {
      const fresh = await access(report.id, actor, undefined, tx)
      if (!fresh.success)
        return fresh
      const completed = await tx.get(`SELECT id FROM ${table.evidence} WHERE id = ?`, [marker])
      if (!completed.success)
        return completed
      if (completed.data)
        return ok(undefined)
      const capacity = await checkCapacity(tx)
      if (!capacity.success)
        return capacity
      const appended = await appendInside(tx, fresh.data, [event.data], true)
      if (!appended.success)
        return appended
      for (const file of files) {
        const saved = await tx.execute(`INSERT INTO ${table.attachments} (id, client_id, report_id, scope_id, object_key, status, size, checksum, updated_at, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [file.rowId, file.metadata.id, report.id, actor.scopeId, file.key, 'available', file.bytes.length, file.metadata.checksum, Date.now(), JSON.stringify(file.metadata)])
        if (!saved.success)
          return saved
      }
      return ok(undefined)
    })
  }

  async function processJobs(): Promise<HaiResult<{ processed: number }>> {
    let processed = 0
    const candidateParams: unknown[] = []
    const appIdentity = feedbackTextEquals('app_id', config.appId, candidateParams)
    const candidates = await reldb.sql.query<FeedbackJobRow>(`SELECT * FROM ${table.jobs} WHERE ${appIdentity} AND ((status = 'pending' AND next_run_at <= ${clock}) OR (status = 'running' AND lease_until < ${clock})) ORDER BY next_run_at, id LIMIT 20`, candidateParams)
    if (!candidates.success)
      return candidates
    for (const job of candidates.data) {
      if (stopped)
        break
      if (job.app_id !== config.appId)
        continue
      const token = randomUUID()
      const claimParams: unknown[] = [token, config.leaseMs, job.id]
      const claimIdentity = feedbackTextEquals('app_id', config.appId, claimParams)
      const claimed = await reldb.sql.execute(`UPDATE ${table.jobs} SET status = 'running', token = ?, lease_until = ${clock} + ?, attempts = attempts + 1, updated_at = ${clock} WHERE id = ? AND ${claimIdentity} AND ((status = 'pending' AND next_run_at <= ${clock}) OR (status = 'running' AND lease_until < ${clock}))`, claimParams)
      if (!claimed.success)
        return claimed
      if (!claimed.data.changes)
        continue
      if (job.kind === 'notify')
        await notificationSummary(job.report_id)
      const renewal = setInterval(() => {
        void reldb.sql.execute(`UPDATE ${table.jobs} SET lease_until = ${clock} + ? WHERE id = ? AND token = ? AND status = 'running' AND lease_until > ${clock}`, [config.leaseMs, job.id, token])
      }, Math.max(250, Math.floor(config.leaseMs / 3)))
      renewal.unref()
      try {
        const result = await executeJob({ ...job, token, attempts: Number(job.attempts) + 1 })
        const pendingReceipt = result.success && !!result.data && typeof result.data === 'object' && 'pending' in result.data && result.data.pending === true
        const purged = result.success && !!result.data && typeof result.data === 'object' && 'purged' in result.data && result.data.purged === true
        const status = result.success ? pendingReceipt ? 'pending' : 'succeeded' : job.kind !== 'cleanup' && Number(job.attempts) + 1 >= config.maxAttempts ? 'failed' : 'pending'
        const saved = purged
          ? await reldb.sql.execute(`DELETE FROM ${table.jobs} WHERE id = ? AND token = ? AND status = 'running' AND lease_until > ${clock}`, [job.id, token])
          : await reldb.sql.execute(`UPDATE ${table.jobs} SET status = ?, attempts = attempts - ?, token = NULL, lease_until = 0, next_run_at = ${clock} + ?, updated_at = ${clock}, last_error = ?, result = CASE WHEN ? = 1 THEN ? ELSE result END WHERE id = ? AND token = ? AND status = 'running' AND lease_until > ${clock}`, [status, pendingReceipt ? 1 : 0, Math.min(60000, 1000 * 2 ** Math.min(Number(job.attempts), 6)), result.success ? null : result.error.code, result.success ? 1 : 0, result.success ? JSON.stringify(result.data) : null, job.id, token])
        if (!saved.success)
          return saved
        if (saved.data.changes && status === 'failed' && job.kind === 'collect') {
          const terminal = await reldb.sql.execute(`UPDATE ${table.reports} SET collection_status = 'failed', updated_at = ${clock} WHERE id = ? AND deleting = 0 AND EXISTS (SELECT 1 FROM ${table.jobs} WHERE id = ? AND status = 'failed')`, [job.report_id, job.id])
          if (!terminal.success)
            return terminal
        }
        // ZIP 按不可变任务快照复用同一个对象；只有最终租约提交能发布下载引用。
        if (job.kind === 'notify')
          await notificationSummary(job.report_id)
        processed++
      }
      catch {
        await reldb.sql.execute(`UPDATE ${table.jobs} SET status = ?, next_run_at = ${clock} + 60000, last_error = ?, token = NULL, lease_until = 0 WHERE id = ? AND token = ? AND lease_until > ${clock}`, [job.kind === 'cleanup' ? 'pending' : 'failed', HaiFeedbackError.OPERATION_FAILED.code, job.id, token])
        if (job.kind === 'collect')
          await reldb.sql.execute(`UPDATE ${table.reports} SET collection_status = 'failed', updated_at = ${clock} WHERE id = ? AND deleting = 0 AND EXISTS (SELECT 1 FROM ${table.jobs} WHERE id = ? AND status = 'failed')`, [job.report_id, job.id])
      }
      finally {
        clearInterval(renewal)
      }
    }
    if (Date.now() >= cleanupAfter) {
      const expiredExports = await reldb.sql.query<FeedbackJobRow>(`SELECT * FROM ${table.jobs} WHERE app_id = ? AND kind = 'export' AND status = 'succeeded' AND created_at <= ${clock} - ? ORDER BY created_at, id LIMIT 20`, [config.appId, config.exportRetentionHours * 3600000])
      if (!expiredExports.success)
        return expiredExports
      for (const job of expiredExports.data) {
        if (job.app_id !== config.appId)
          continue
        const result = readFeedbackJson(job.result)
        if (result && typeof result === 'object' && 'key' in result && typeof result.key === 'string') {
          const deleted = await storage.file.delete(result.key)
          if (!deleted.success)
            return deleted
        }
        const marked = await reldb.sql.execute(`UPDATE ${table.jobs} SET status = 'failed', result = NULL, payload = ?, last_error = ? WHERE id = ? AND status = 'succeeded'`, [JSON.stringify({ expired: true }), HaiFeedbackError.NOT_FOUND.code, job.id])
        if (!marked.success)
          return marked
      }
      const quotaRows = await reldb.sql.query<{ id: string }>(`SELECT id FROM ${table.quotas} WHERE app_id = ? AND period > 0 AND period < ${clock} - 172800000 ORDER BY period, id LIMIT 100`, [config.appId])
      if (!quotaRows.success)
        return quotaRows
      if (quotaRows.data.length) {
        const removed = await reldb.sql.execute(`DELETE FROM ${table.quotas} WHERE id IN (${quotaRows.data.map(() => '?').join(',')})`, quotaRows.data.map(row => row.id))
        if (!removed.success)
          return removed
      }
    }
    // 临时证据按应用限批清理；空闲节点不在每轮执行全表 DELETE。
    if (Date.now() >= cleanupAfter) {
      const params: unknown[] = []
      const identity = feedbackTextEquals('app_id', config.appId, params)
      const expired = await reldb.sql.query<{ id: string }>(`SELECT id FROM ${table.evidence} WHERE ${identity} AND report_id IS NULL AND expires_at < ? ORDER BY expires_at, id LIMIT 100`, [...params, Date.now()])
      if (!expired.success)
        return expired
      if (expired.data.length) {
        const removed = await reldb.sql.execute(`DELETE FROM ${table.evidence} WHERE ${identity} AND report_id IS NULL AND id IN (${expired.data.map(() => '?').join(',')})`, [...params, ...expired.data.map(row => row.id)])
        if (!removed.success)
          return removed
      }
      cleanupBacklog = expired.data.length === 100
      cleanupAfter = cleanupBacklog ? 0 : Date.now() + 30000
    }
    return ok({ processed })
  }

  async function executeJob(job: FeedbackJobRow): Promise<HaiResult<unknown>> {
    if (job.app_id !== config.appId)
      return missing()
    const owned = await reldb.sql.get(`SELECT id FROM ${table.jobs} WHERE id = ? AND token = ? AND status = 'running' AND lease_until > ${clock}`, [job.id, job.token])
    if (!owned.success)
      return owned
    if (!owned.data)
      return conflict()
    const raw = readFeedbackJson(job.payload)
    const payload = raw && typeof raw === 'object' ? raw : {}
    const prefix = `feedback/${hash(job.scope_id).slice(0, 16)}/${job.report_id}/`
    if (job.kind === 'cleanup' && 'tombstone' in payload && payload.tombstone === true) {
      const cleared = await storage.dir.delete(prefix)
      if (!cleared.success)
        return cleared
      return 'until' in payload && typeof payload.until === 'number' && payload.until <= Date.now() ? ok({ purged: true }) : ok({ pending: true })
    }
    const row = await repo.find(job.report_id, job.scope_id)
    if (!row.success)
      return row
    if (!row.data || row.data.id !== job.report_id || row.data.scope_id !== job.scope_id || row.data.app_id !== config.appId)
      return missing()
    if (Number(row.data.deleting) && job.kind !== 'cleanup')
      return missing()
    const report = repo.report(row.data)
    const actor: FeedbackContext = { scopeId: report.scopeId, userId: report.userId, permissions: ['feedback:*'] }
    if (job.kind === 'collect') {
      const anchor = 'anchor' in payload && typeof payload.anchor === 'number' ? payload.anchor : report.createdAt
      const captured = await capture.collect(report.scopeId, report.userId, anchor)
      const saved = await withLease(job, async (tx) => {
        const fresh = await access(report.id, actor, undefined, tx)
        return fresh.success ? appendInside(tx, fresh.data, captured.length ? captured : [{ id: `missing-server-${report.id}`, source: 'collection', sequence: 0, kind: 'missing', timestamp: report.createdAt, data: { source: 'server_logs' }, missingReason: 'no_correlated_server_logs' }], true) : fresh
      })
      if (!saved.success)
        return saved
      if ('businessEvidence' in payload && payload.businessEvidence === true) {
        const business = await collectBusiness(job, report, actor)
        if (!business.success)
          return business
      }
      const files = await attachments(report.id)
      if (!files.success)
        return files
      const reasons = await reldb.sql.get<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table.evidence} WHERE report_id = ? AND kind = 'missing'`, [report.id])
      if (!reasons.success)
        return reasons
      const partial = Number(reasons.data?.count ?? 0) > 0 || files.data.some(item => item.status !== 'available')
      const updated = await withLease(job, tx => tx.execute(`UPDATE ${table.reports} SET collection_status = ?, updated_at = ${clock} WHERE id = ?`, [partial ? 'partial' : 'complete', report.id]))
      return updated.success ? ok({ collected: captured.length }) : updated
    }
    if (job.kind === 'webhook') {
      if (!('url' in payload) || payload.url !== config.webhookUrl || !config.webhookUrl)
        return err(HaiFeedbackError.CONFIG_ERROR, feedbackM('feedback_configError'))
      // 材料仍在采集中时等待，不消耗发送尝试次数；终态失败也应通知接收方。
      if (report.collectionStatus === 'collecting')
        return ok({ pending: true })
      const frozen = await withLease(job, async (tx) => {
        const live = await access(report.id, actor, undefined, tx)
        if (!live.success)
          return live
        if (live.data.collection_status === 'collecting')
          return conflict()
        const stored = await tx.get<FeedbackJobRow>(`SELECT * FROM ${table.jobs} WHERE id = ?`, [job.id])
        if (!stored.success || !stored.data)
          return missing()
        const snapshot = readFeedbackJson(stored.data.payload)
        if (snapshot && typeof snapshot === 'object' && 'body' in snapshot && typeof snapshot.body === 'string')
          return ok(snapshot.body)
        const files = await attachments(report.id, tx)
        if (!files.success)
          return files
        const business = await tx.get(`SELECT id FROM ${table.evidence} WHERE id = ?`, [hash(`${report.id}:server:business:0`)])
        if (!business.success)
          return business
        const detailUrl = config.adminUrl ? new URL(config.adminUrl) : undefined
        detailUrl?.searchParams.set('feedback', report.id)
        const event: FeedbackWebhookEvent = { event: 'feedback.created', eventId: job.id, createdAt: report.createdAt, report: repo.report(live.data), evidence: { revision: Number(live.data.revision), business: !!business.data, attachments: files.data.map(attachmentData) }, ...(detailUrl ? { detailUrl: detailUrl.href } : {}) }
        const body = JSON.stringify(event)
        const saved = await tx.execute(`UPDATE ${table.jobs} SET payload = ? WHERE id = ? AND token = ?`, [JSON.stringify({ url: config.webhookUrl, body }), job.id, job.token])
        return saved.success ? ok(body) : saved
      })
      if (!frozen.success)
        return frozen
      const timestamp = String(Math.floor(Date.now() / 1000))
      const headers: Record<string, string> = { 'content-type': 'application/json', 'idempotency-key': job.id, 'x-hai-feedback-event': 'feedback.created', 'x-hai-feedback-timestamp': timestamp }
      if (config.webhookSecret)
        headers['x-hai-feedback-signature'] = `sha256=${createHmac('sha256', config.webhookSecret).update(`${timestamp}.${frozen.data}`).digest('hex')}`
      try {
        const response = await fetch(config.webhookUrl, { method: 'POST', headers, body: frozen.data, redirect: 'manual', signal: AbortSignal.any([shutdown.signal, AbortSignal.timeout(config.webhookTimeoutMs)]) })
        await response.body?.cancel()
        return response.ok ? ok({ status: response.status }) : failed()
      }
      catch {
        return failed()
      }
    }
    if (job.kind === 'notify') {
      if (config.notificationMode === 'disabled')
        return ok({ disabled: true })
      const recipient = 'recipient' in payload && typeof payload.recipient === 'string' ? payload.recipient : ''
      if (config.notificationMode === 'reach' && !config.recipients.includes(recipient))
        return invalid()
      // 受理通知与补采独立；发送前以数据库租约和存活报告再次确认副作用资格。
      const live = await withLease(job, tx => access(report.id, actor, undefined, tx))
      if (!live.success)
        return live
      const current = repo.report(live.data)
      if (config.notificationMode === 'console') {
        core.logger.info('Feedback notification', { module: 'feedback', number: current.number, appId: current.appId, appVersion: current.appVersion, buildId: current.buildId, commit: current.commit, collectionStatus: current.collectionStatus, ...(config.consoleContent === 'summary' ? { summary: current.summary } : {}) })
        return ok({ channel: 'console' })
      }
      const { HaiReachError, reach } = await import('@h-ai/reach')
      const materialStatus = {
        collecting: feedbackM('feedback_materialCollecting'),
        complete: feedbackM('feedback_materialComplete'),
        partial: feedbackM('feedback_materialPartial'),
        failed: feedbackM('feedback_materialFailed'),
      }[current.collectionStatus]
      const detailUrl = config.adminUrl ? new URL(config.adminUrl) : undefined
      detailUrl?.searchParams.set('feedback', report.id)
      const facts = [current.number, `${current.appId} ${current.appVersion ?? ''}`, `${feedbackM('feedback_submittedAt')}: ${new Date(current.createdAt).toISOString()}`, `${feedbackM('feedback_materialStatus')}: ${materialStatus}`, current.summary ?? '', ...(detailUrl ? [detailUrl.href] : [])]
      const isEmail = reach.config?.providers.find(provider => provider.name === config.notificationProvider)?.type === 'smtp'
      const body = isEmail ? facts.map(value => `<p>${escapeHtml(value)}</p>`).join('') : facts.join('\n')
      const sent = await reach.send({ provider: config.notificationProvider, to: recipient, subject: `${feedbackM('feedback_received')} ${current.number}`, body, idempotencyKey: job.id, deferPolicy: 'reject' })
      if (!sent.success && sent.error.code === HaiReachError.DND_BLOCKED.code)
        return ok({ pending: true, deferred: true })
      if (!sent.success)
        return sent
      if (!sent.data.success)
        return failed()
      if (sent.data.deferred) {
        return err(HaiFeedbackError.CONFIG_ERROR, feedbackM('feedback_configError'))
      }
      return ok({ messageId: sent.data.messageId ?? '' })
    }
    if (job.kind === 'export') {
      if (!('report' in payload) || !('evidence' in payload) || !('attachments' in payload))
        return invalid()
      const fixed = payload as { report: FeedbackReport, evidence: FeedbackEvidence[], history: FeedbackHistory[], attachments: FeedbackAttachmentRow[], maxBytes: number, snapshotExpiresAt: number }
      if (!Number.isSafeInteger(fixed.maxBytes) || fixed.maxBytes < 4 * 1024 * 1024 || fixed.maxBytes > 40 * 1024 * 1024)
        return invalid()
      if (fixed.snapshotExpiresAt < Date.now())
        return missing()
      const files: Array<{ id: string, name: string, contentType: string, checksum: string, bytes: Uint8Array }> = []
      const unavailable = fixed.attachments.filter(file => file.status !== 'available').map(file => `attachment:${file.client_id}:${file.status}`).sort()
      let total = Buffer.byteLength(JSON.stringify(fixed.evidence))
      for (const file of fixed.attachments) {
        if (file.status !== 'available')
          continue
        const stored = await storage.file.get(file.object_key)
        if (!stored.success)
          return stored
        if (hash(stored.data) !== file.checksum)
          return err(HaiFeedbackError.CHECKSUM_MISMATCH, feedbackM('feedback_checksumMismatch'))
        total += stored.data.length
        if (total > 64 * 1024 * 1024)
          return limited()
        const info = attachmentData(file)
        files.push({ id: info.id, name: info.name, contentType: info.contentType, checksum: info.checksum, bytes: stored.data })
      }
      const bundle = await createFeedbackBundle({ maxBytes: fixed.maxBytes, createdAt: Number(job.created_at), report: fixed.report, evidence: fixed.evidence, history: fixed.history, attachments: files, missing: unavailable })
      if (!bundle.success)
        return bundle
      const key = `feedback/${hash(report.scopeId).slice(0, 16)}/${report.id}/exports/${job.id}.zip`
      const stored = await storage.file.put(key, bundle.data, { contentType: 'application/zip', ifNoneMatch: '*' })
      if (!stored.success) {
        const existing = await storage.file.get(key)
        if (!existing.success || hash(existing.data) !== hash(bundle.data))
          return stored
      }
      return ok({ key, checksum: hash(bundle.data), size: bundle.data.length })
    }
    const marked = await withLease(job, async (tx) => {
      const locked = await repo.find(report.id, report.scopeId, tx)
      if (!locked.success)
        return locked
      if (!locked.data)
        return missing()
      const active = await tx.get<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table.jobs} WHERE report_id = ? AND kind = 'export' AND status IN ('pending', 'running')`, [report.id])
      if (!active.success)
        return active
      if (Number(active.data?.count ?? 0) > 0)
        return conflict()
      const updated = await tx.execute(`UPDATE ${table.reports} SET deleting = 1 WHERE id = ? AND expires_at <= ${clock}`, [report.id])
      if (!updated.success)
        return updated
      return updated.data.changes || Number(locked.data.deleting) ? ok(undefined) : conflict()
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
        const released = await tx.execute(`UPDATE ${table.quotas} SET report_count = report_count - 1, reserved_bytes = reserved_bytes - ?, updated_at = ${clock} WHERE id = ? AND reserved_bytes >= ? AND report_count > 0`, [Number(reservation.data.reserved_bytes), scopeQuotaId(report.scopeId), Number(reservation.data.reserved_bytes)])
        if (!released.success || !released.data.changes)
          return released.success ? conflict() : released
        const removed = await tx.execute(`DELETE FROM ${table.quotas} WHERE id = ?`, [report.id])
        if (!removed.success)
          return removed
      }
      const removedJobs = await tx.execute(`DELETE FROM ${table.jobs} WHERE report_id = ? AND id <> ?`, [report.id, job.id])
      if (!removedJobs.success)
        return removedJobs
      // 仅保留一天最小清扫墓碑，重试删除可能在响应丢失或旧进程退出时迟到的对象。
      const tombstone = await tx.execute(`UPDATE ${table.jobs} SET payload = ?, result = NULL WHERE id = ? AND token = ?`, [JSON.stringify({ tombstone: true, prefix, until: Date.now() + 86400000 }), job.id, job.token])
      if (!tombstone.success)
        return tombstone
      const params: unknown[] = []
      const identity = `${feedbackTextEquals('id', report.id, params)} AND ${feedbackTextEquals('scope_id', actor.scopeId, params)}`
      const removed = await tx.execute(`DELETE FROM ${table.reports} WHERE ${identity} AND expires_at <= ${clock}`, params)
      return removed.success ? ok({ pending: true }) : removed
    })
    return deleted
  }

  return operations
}

function allowedContentType(type: string) {
  return ['image/png', 'image/jpeg', 'image/webp', 'video/webm', 'video/mp4', 'text/plain', 'application/json', 'application/pdf', 'application/zip', 'application/gzip'].includes(type)
}
function matchesContentType(bytes: Buffer, type: string) {
  if (type === 'application/zip')
    return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4B && ((bytes[2] === 3 && bytes[3] === 4) || (bytes[2] === 5 && bytes[3] === 6))
  if (type === 'application/gzip')
    return bytes.length >= 10 && bytes[0] === 0x1F && bytes[1] === 0x8B && bytes[2] === 8
  if (type === 'image/png')
    return bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.readUInt32BE(16) * bytes.readUInt32BE(20) <= 32 * 1024 * 1024
  if (type === 'image/jpeg')
    return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  if (type === 'image/webp')
    return bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP'
  if (type === 'application/pdf')
    return bytes.subarray(0, 5).toString() === '%PDF-'
  if (type === 'video/webm')
    return bytes.length >= 12 && bytes.subarray(0, 4).equals(Buffer.from([0x1A, 0x45, 0xDF, 0xA3]))
  if (type === 'video/mp4')
    return bytes.length >= 12 && bytes.subarray(4, 8).toString() === 'ftyp'
  if (type === 'application/json') {
    try {
      JSON.parse(bytes.toString('utf8'))
      return true
    }
    catch {
      return false
    }
  }
  return type === 'text/plain' && !bytes.includes(0)
}
