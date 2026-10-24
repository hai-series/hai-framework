import type { HaiResult } from '@h-ai/core'
import type { DmlOperations, DmlWithTxOperations, ReldbTableDef } from '@h-ai/reldb'
import { FeedbackReportSchema } from '@h-ai/api-contract/feedback'
import { err, ok } from '@h-ai/core'
import { BaseReldbCrudRepository, reldb } from '@h-ai/reldb'
import { feedbackM } from './feedback-i18n.js'
import { HaiFeedbackError } from './feedback-types.js'

// 表与列只能来自本模块静态定义，所有动态值均使用参数绑定。
const REPORTS = 'hai_feedback_reports'
const EVIDENCE = 'hai_feedback_evidence'
const ATTACHMENTS = 'hai_feedback_attachments'
const HISTORY = 'hai_feedback_history'
const JOBS = 'hai_feedback_jobs'

// 仅允许本模块静态身份列；不能把外部输入拼成 SQL 标识符。
const identityColumns = ['id', 'report_id', 'scope_id', 'app_id', 'user_id', 'source', 'request_id', 'error_id', 'client_id'] as const

/**
 * 内部身份等值条件：保留索引预筛，并在 MySQL 中排除 CI/PAD SPACE 排序规则的别名。
 * 参数在生成占位符时一并追加，避免方言差异导致绑定错位。
 * @example 模块内部上下文
 * ```ts
 * const params: unknown[] = []
 * const condition = feedbackTextEquals('scope_id', 'tenant-A', params)
 * void condition
 * ```
 */
export function feedbackTextEquals(column: typeof identityColumns[number], value: string, params: unknown[]): string {
  if (!identityColumns.includes(column))
    throw new Error('Invalid feedback identity column')
  params.push(value)
  if (reldb.config?.type !== 'mysql')
    return `${column} = ?`
  params.push(value)
  return `(${column} = ? AND CAST(${column} AS BINARY) = CAST(? AS BINARY))`
}

const reportDef: ReldbTableDef = {
  id: { type: 'TEXT', primaryKey: true },
  scope_id: { type: 'TEXT', notNull: true },
  user_id: { type: 'TEXT', notNull: true },
  app_id: { type: 'TEXT', notNull: true },
  number: { type: 'TEXT', notNull: true },
  app_version: { type: 'TEXT' },
  summary: { type: 'TEXT', notNull: true },
  submission_key: { type: 'TEXT', notNull: true, unique: true },
  submission_hash: { type: 'TEXT', notNull: true },
  status: { type: 'TEXT', notNull: true },
  collection_status: { type: 'TEXT', notNull: true },
  notification_status: { type: 'TEXT', notNull: true },
  created_at: { type: 'BIGINT', notNull: true },
  updated_at: { type: 'BIGINT', notNull: true },
  version: { type: 'INTEGER', notNull: true },
  revision: { type: 'INTEGER', notNull: true },
  evidence_count: { type: 'INTEGER', notNull: true },
  evidence_bytes: { type: 'BIGINT', notNull: true },
  collect_deadline: { type: 'BIGINT', notNull: true },
  expires_at: { type: 'BIGINT', notNull: true },
  payload: { type: 'JSON', notNull: true },
  deleting: { type: 'INTEGER', notNull: true },
}

/**
 * 内部持久记录；payload 使用 JSON 以容纳跨数据库的长描述。
 * @example 模块内部上下文
 * ```ts
 * function reportIdentity(row: FeedbackReportRow) { return { id: row.id, scopeId: row.scope_id } }
 * void reportIdentity
 * ```
 */
export interface FeedbackReportRow {
  id: string
  scope_id: string
  user_id: string
  app_id: string
  number: string
  app_version: string | null
  summary: string
  submission_key: string
  submission_hash: string
  status: string
  collection_status: string
  notification_status: string
  created_at: number
  updated_at: number
  version: number
  revision: number
  evidence_count: number
  evidence_bytes: number
  collect_deadline: number
  expires_at: number
  payload: unknown
  deleting: number
}

/**
 * 内部任务行；租约与正文不通过公开 API 泄漏。
 * @example 模块内部上下文
 * ```ts
 * function ownedJob(row: FeedbackJobRow, token: string) { return row.status === 'running' && row.token === token }
 * void ownedJob
 * ```
 */
export interface FeedbackJobRow {
  id: string
  app_id: string
  snapshot_revision: number | null
  snapshot_version: number | null
  report_id: string
  scope_id: string
  kind: 'collect' | 'notify' | 'export' | 'cleanup'
  status: 'pending' | 'running' | 'succeeded' | 'failed'
  token: string | null
  lease_until: number
  attempts: number
  next_run_at: number
  created_at: number
  updated_at: number
  last_error: string | null
  payload: unknown
  result: unknown
}

/**
 * 内部证据行，单条结构化事件保持可分页/按请求定位。
 * @example 模块内部上下文
 * ```ts
 * function eventPosition(row: FeedbackEvidenceRow) { return `${row.source}:${row.sequence}` }
 * void eventPosition
 * ```
 */
export interface FeedbackEvidenceRow {
  id: string
  report_id: string | null
  scope_id: string
  user_id: string
  app_id: string
  source: string
  sequence: number
  kind: string
  timestamp: number
  request_id: string | null
  error_id: string | null
  revision: number
  bytes: number
  expires_at: number
  payload: unknown
}

/**
 * 内部附件行，客户端永远不能指定 object_key。
 * @example 模块内部上下文
 * ```ts
 * function availableObject(row: FeedbackAttachmentRow) { return row.status === 'available' ? row.object_key : null }
 * void availableObject
 * ```
 */
export interface FeedbackAttachmentRow {
  id: string
  client_id: string
  report_id: string
  scope_id: string
  object_key: string
  status: 'pending' | 'available' | 'failed'
  size: number
  checksum: string
  updated_at: number
  payload: unknown
}

/**
 * 数据库返回 JSON 在各驱动间可能为文本或对象，集中归一化。
 * @example 模块内部上下文
 * ```ts
 * const decoded = readFeedbackJson('{"status":"pending"}')
 * void decoded
 * ```
 */
export function readFeedbackJson(value: unknown): unknown {
  return typeof value === 'string' ? JSON.parse(value) : value
}

/**
 * 内部仓库，沿用框架建表屏障；SQL 只用于跨实体事务和条件提交。
 * @example 模块内部上下文
 * ```ts
 * async function findReport(id: string, scopeId: string) {
 *   const repository = new FeedbackReportRepository()
 *   const ready = await repository.ready()
 *   return ready.success ? repository.find(id, scopeId) : ready
 * }
 * void findReport
 * ```
 */
export class FeedbackReportRepository extends BaseReldbCrudRepository<FeedbackReportRow> {
  readonly tables = { reports: REPORTS, evidence: EVIDENCE, attachments: ATTACHMENTS, history: HISTORY, jobs: JOBS }

  constructor() {
    super(reldb, {
      table: REPORTS,
      fields: Object.entries(reportDef).map(([name, def]) => ({ fieldName: name, columnName: name, def, select: true, create: true, update: name !== 'id' })),
    })
  }

  async ready(): Promise<HaiResult<void>> {
    const report = await this.ensureReady()
    if (!report.success)
      return report
    const definitions: Array<[string, ReldbTableDef]> = [
      [EVIDENCE, {
        id: { type: 'TEXT', primaryKey: true },
        report_id: { type: 'TEXT' },
        scope_id: { type: 'TEXT', notNull: true },
        user_id: { type: 'TEXT', notNull: true },
        app_id: { type: 'TEXT', notNull: true },
        source: { type: 'TEXT', notNull: true },
        sequence: { type: 'BIGINT', notNull: true },
        kind: { type: 'TEXT', notNull: true },
        timestamp: { type: 'BIGINT', notNull: true },
        request_id: { type: 'TEXT' },
        error_id: { type: 'TEXT' },
        revision: { type: 'INTEGER', notNull: true },
        bytes: { type: 'INTEGER', notNull: true },
        expires_at: { type: 'BIGINT', notNull: true },
        payload: { type: 'JSON', notNull: true },
      }],
      [ATTACHMENTS, {
        id: { type: 'TEXT', primaryKey: true },
        client_id: { type: 'TEXT', notNull: true },
        report_id: { type: 'TEXT', notNull: true },
        scope_id: { type: 'TEXT', notNull: true },
        object_key: { type: 'TEXT', notNull: true },
        status: { type: 'TEXT', notNull: true },
        size: { type: 'BIGINT', notNull: true },
        checksum: { type: 'TEXT', notNull: true },
        updated_at: { type: 'BIGINT', notNull: true },
        payload: { type: 'JSON', notNull: true },
      }],
      [HISTORY, { id: { type: 'TEXT', primaryKey: true }, report_id: { type: 'TEXT', notNull: true }, payload: { type: 'JSON', notNull: true } }],
      [JOBS, {
        id: { type: 'TEXT', primaryKey: true },
        app_id: { type: 'TEXT', notNull: true },
        snapshot_revision: { type: 'INTEGER' },
        snapshot_version: { type: 'INTEGER' },
        report_id: { type: 'TEXT', notNull: true },
        scope_id: { type: 'TEXT', notNull: true },
        kind: { type: 'TEXT', notNull: true },
        status: { type: 'TEXT', notNull: true },
        token: { type: 'TEXT' },
        lease_until: { type: 'BIGINT', notNull: true },
        attempts: { type: 'INTEGER', notNull: true },
        next_run_at: { type: 'BIGINT', notNull: true },
        created_at: { type: 'BIGINT', notNull: true },
        updated_at: { type: 'BIGINT', notNull: true },
        last_error: { type: 'TEXT' },
        payload: { type: 'JSON', notNull: true },
        result: { type: 'JSON' },
      }],
    ]
    for (const [table, definition] of definitions) {
      const created = await reldb.ddl.createTable(table, definition)
      if (!created.success)
        return created
    }
    const indexes = [
      { table: REPORTS, name: 'hai_feedback_reports_scope_time', columns: ['scope_id', 'created_at'] },
      { table: REPORTS, name: 'hai_feedback_reports_scope_status', columns: ['scope_id', 'status', 'created_at'] },
      { table: EVIDENCE, name: 'hai_feedback_evidence_report_seq', columns: ['report_id', 'source', 'sequence'] },
      { table: EVIDENCE, name: 'hai_feedback_evidence_temp_scope', columns: ['scope_id', 'user_id', 'timestamp'] },
      { table: ATTACHMENTS, name: 'hai_feedback_attachments_report', columns: ['report_id'] },
      { table: HISTORY, name: 'hai_feedback_history_report', columns: ['report_id'] },
      { table: JOBS, name: 'hai_feedback_jobs_pending', columns: ['app_id', 'status', 'next_run_at'] },
      { table: JOBS, name: 'hai_feedback_jobs_snapshot', columns: ['report_id', 'snapshot_revision', 'snapshot_version'] },
    ]
    for (const index of indexes) {
      // MySQL 的 CREATE INDEX 不支持 IF NOT EXISTS；重启和多节点启动须核验真实索引定义。
      const inspect = async (): Promise<HaiResult<boolean>> => {
        const found = await reldb.sql.query<{ column_name: string, non_unique: number }>('SELECT COLUMN_NAME AS column_name, NON_UNIQUE AS non_unique FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? ORDER BY SEQ_IN_INDEX', [index.table, index.name])
        if (!found.success)
          return found
        if (!found.data.length)
          return ok(false)
        const matches = found.data.length === index.columns.length && found.data.every((column, position) => column.column_name === index.columns[position] && Number(column.non_unique) === 1)
        return matches ? ok(true) : err(HaiFeedbackError.CONFIG_ERROR, feedbackM('feedback_configError'))
      }
      if (reldb.config?.type === 'mysql') {
        const existing = await inspect()
        if (!existing.success)
          return existing
        if (existing.data)
          continue
      }
      const result = await reldb.ddl.createIndex(index.table, index.name, { columns: index.columns })
      if (!result.success) {
        // 两个进程可能同时观察到缺失；仅另一进程已建立完全一致的索引才视为完成。
        if (reldb.config?.type === 'mysql') {
          const concurrent = await inspect()
          if (concurrent.success && concurrent.data)
            continue
        }
        return result
      }
    }
    return ok(undefined)
  }

  async find(id: string, scope: string, sql: DmlOperations = reldb.sql) {
    const lock = sql !== reldb.sql && reldb.config?.type !== 'sqlite' ? ' FOR UPDATE' : ''
    const params: unknown[] = []
    const condition = `${feedbackTextEquals('id', id, params)} AND ${feedbackTextEquals('scope_id', scope, params)}`
    const result = await sql.get<FeedbackReportRow>(`SELECT * FROM ${REPORTS} WHERE ${condition}${lock}`, params)
    return result.success && result.data && (result.data.id !== id || result.data.scope_id !== scope) ? ok(null) : result
  }

  report(row: FeedbackReportRow) {
    return FeedbackReportSchema.parse({
      ...FeedbackReportSchema.parse(readFeedbackJson(row.payload)),
      status: row.status,
      collectionStatus: row.collection_status,
      notificationStatus: row.notification_status,
      updatedAt: Number(row.updated_at),
      version: Number(row.version),
      evidenceRevision: Number(row.revision),
    })
  }

  /** 显式事务逐步检查 HaiResult；业务失败也执行 rollback。 */
  async transaction<T>(work: (tx: DmlWithTxOperations) => Promise<HaiResult<T>>): Promise<HaiResult<T>> {
    const begun = await reldb.tx.begin()
    if (!begun.success)
      return begun
    try {
      const result = await work(begun.data)
      if (!result.success) {
        const rollback = await begun.data.rollback()
        return rollback.success ? result : rollback
      }
      const committed = await begun.data.commit()
      return committed.success ? result : committed
    }
    catch {
      await begun.data.rollback()
      return err(HaiFeedbackError.OPERATION_FAILED, feedbackM('feedback_operationFailed'))
    }
  }
}
