/**
 * 跨节点执行日志与任务串行槽；唯一约束和 owner 条件是调度正确性的依据。
 * @module scheduler-execution-repository
 */
import type { HaiResult } from '@h-ai/core'
import type { ReldbFunctions } from '@h-ai/reldb'
import type { SchedulerExecutionEntry, SchedulerExecutionState, TaskDefinition, TaskExecutionLog, TaskTriggerInfo } from '../scheduler-types.js'
import { createHash, randomUUID } from 'node:crypto'
import { err, ok } from '@h-ai/core'
import { BaseReldbCrudRepository } from '@h-ai/reldb'
import { schedulerM } from '../scheduler-i18n.js'
import { HaiSchedulerError } from '../scheduler-types.js'

const TABLE = 'hai_scheduler_executions'

/** 内部持久执行记录；owner 不对运维查询输出。@example const rows = await repository.expired() */
export interface StoredExecution {
  /** 全局递增的数据库序号。 */
  sequence: number
  /** 固定执行身份，跨重试及恢复不变。 */
  occurrenceId: string
  /** 任务标识。 */
  taskId: string
  /** 占据的串行槽；只有确认终态才置空。 */
  activeTask?: string
  /** 共享状态机阶段。 */
  status: SchedulerExecutionState
  /** 当前领取独有的凭据。 */
  owner?: string
  /** 有效租约的 Unix 毫秒截止点。 */
  leasedUntil: number
  /** 已通过副作用门闩的次数。 */
  attemptCount: number
  /** 本 occurrence 保存的次数上限。 */
  maxAttempts: number
  /** 初次领取时声明的持久幂等能力。 */
  idempotent: boolean
  /** 首次领取时的任务定义 JSON。 */
  snapshot: string
  /** 首次触发的类型、来源和可选分钟槽 JSON。 */
  triggerJson: string
  /** 已确认结果 JSON，用于相同手动键返回持久结果。 */
  logJson?: string
  /** 已确认终态的全部尝试日志 JSON；日志投影失败或进程退出后仍可补写。 */
  logsJson?: string
  /** 与业务阶段独立的日志投影状态。 */
  logPersistence: 'pending' | 'persisted' | 'unconfirmed'
  /** 最近共享状态更新时间（Unix 毫秒）。 */
  updatedAt: number
  /** 初次领取时间（Unix 毫秒）。 */
  createdAt: number
}

/** 稳定 occurrence 包含 taskId，避免不同任务的相同业务键冲突。@example executionId(task.id, 'scheduled', String(minute)) */
export function executionId(taskId: string, type: string, key: string): string {
  return createHash('sha256').update(JSON.stringify([taskId, type, key])).digest('hex')
}

/** 公共状态投影只保留运维元数据。@example executionEntry(record) */
export function executionEntry(row: StoredExecution): SchedulerExecutionEntry {
  return { occurrenceId: row.occurrenceId, taskId: row.taskId, status: row.status, sequence: row.sequence, attemptCount: row.attemptCount, updatedAt: row.updatedAt, logPersistence: row.logPersistence }
}

/** 统一持久状态失败；不回退为本地执行。 */
function failed(cause?: unknown) {
  return err(HaiSchedulerError.DB_SAVE_FAILED, schedulerM('scheduler_executionStateFailed'), cause)
}

/**
 * 执行仓库；active_task 唯一列直到已确认的终态才释放，覆盖 cron/manual/跨分钟。
 * @example const repository = new SchedulerExecutionRepository(reldb)
 */
export class SchedulerExecutionRepository extends BaseReldbCrudRepository<StoredExecution> {
  constructor(db: ReldbFunctions) {
    super(db, {
      table: TABLE,
      idColumn: 'sequence',
      idField: 'sequence',
      fields: [
        { fieldName: 'sequence', columnName: 'sequence', def: { type: 'INTEGER', primaryKey: true, autoIncrement: true }, select: true, create: false, update: false },
        ...[
          ['occurrenceId', 'occurrence_id', true, true],
          ['taskId', 'task_id', true, false],
          ['activeTask', 'active_task', false, true],
          ['status', 'status', true, false],
          ['owner', 'owner', false, false],
          ['snapshot', 'snapshot', true, false],
          ['triggerJson', 'trigger_json', true, false],
          ['logJson', 'log_json', false, false],
          ['logsJson', 'logs_json', false, false],
          ['logPersistence', 'log_persistence', true, false],
        ].map(([fieldName, columnName, notNull, unique]) => ({
          fieldName: String(fieldName),
          columnName: String(columnName),
          def: { type: ['snapshot', 'triggerJson', 'logJson', 'logsJson'].includes(String(fieldName)) ? 'JSON' as const : 'TEXT' as const, notNull: Boolean(notNull), unique: Boolean(unique) },
          select: true,
          create: true,
          update: true,
        })),
        ...[
          ['leasedUntil', 'leased_until'],
          ['attemptCount', 'attempt_count'],
          ['maxAttempts', 'max_attempts'],
          ['updatedAt', 'updated_at'],
          ['createdAt', 'created_at'],
        ].map(([fieldName, columnName]) => ({
          fieldName,
          columnName,
          def: { type: 'BIGINT' as const, notNull: true },
          select: true,
          create: true,
          update: true,
        })),
        { fieldName: 'idempotent', columnName: 'idempotent', def: { type: 'BOOLEAN', notNull: true }, select: true, create: true, update: true },
      ],
    })
  }

  /** 读取统一校验 BIGINT，不能把 PG 字符串时间或舍入的序号用于 owner 判断。 */
  private normalize(row: StoredExecution): HaiResult<StoredExecution> {
    const value = { ...row }
    // JSON 大载荷避免 MySQL 的 TEXT→VARCHAR(255) 映射；驱动解码后统一恢复内部 JSON 文本契约。
    for (const field of ['snapshot', 'triggerJson', 'logJson', 'logsJson'] as const) {
      if (row[field] !== undefined && row[field] !== null && typeof row[field] !== 'string')
        value[field] = JSON.stringify(row[field])
    }
    for (const field of ['sequence', 'leasedUntil', 'attemptCount', 'maxAttempts', 'updatedAt', 'createdAt'] as const) {
      const number = Number(row[field])
      if (!Number.isSafeInteger(number) || number < 0)
        return failed()
      value[field] = number
    }
    return ok(value)
  }

  /** 按稳定回执读取。@example await repository.byOccurrence(id) */
  async byOccurrence(id: string): Promise<HaiResult<StoredExecution | null>> {
    const rows = await this.findAll({ where: 'occurrence_id = ?', params: [id], limit: 1 })
    if (!rows.success)
      return failed(rows.error)
    return rows.data[0] ? this.normalize(rows.data[0]) : ok(null)
  }

  /** 有界读取过期执行，跨分钟恢复原 occurrence，而不是创建新的副作用身份。@example await repository.expired() */
  async expired(): Promise<HaiResult<StoredExecution[]>> {
    return this.rows('status IN (?, ?) AND leased_until <= ?', ['claimed', 'running', Date.now()], 100, 0)
  }

  /** 任务被删除或触发元数据损坏时，过期记录隔离为 unknown，允许可信人工核对而非永久悬挂。 */
  async isolateExpired(row: StoredExecution): Promise<HaiResult<void>> {
    const now = Date.now()
    const result = await this.db.sql.execute(
      `UPDATE ${TABLE} SET status = ?, owner = NULL, leased_until = 0, updated_at = ?
       WHERE occurrence_id = ? AND owner = ? AND leased_until <= ? AND status IN (?, ?)`,
      ['unknown', now, row.occurrenceId, row.owner, now, 'claimed', 'running'],
    )
    return result.success && result.data.changes === 1 ? ok(undefined) : failed()
  }

  /** 有界读取待人工核对记录。@example await repository.unknown(50, 0) */
  async unknown(limit: number, offset: number): Promise<HaiResult<StoredExecution[]>> {
    return this.rows('status = ?', ['unknown'], limit, offset)
  }

  /** 仅查询已发布终态且日志待补写的回执。@example await repository.pendingLogs(50, 0) */
  async pendingLogs(limit: number, offset: number): Promise<HaiResult<StoredExecution[]>> {
    return this.rows('log_persistence = ? AND status NOT IN (?, ?)', ['pending', 'claimed', 'running'], limit, offset)
  }

  /**
   * 确认相同终态快照的日志投影；不变更业务状态，不重新领取任务。
   * @example await repository.confirmLogs(row)
   */
  async confirmLogs(row: StoredExecution): Promise<HaiResult<void>> {
    if (!row.logJson || !row.logsJson)
      return failed()
    const log = JSON.parse(row.logJson) as TaskExecutionLog
    const now = Date.now()
    const result = await this.db.sql.execute(
      `UPDATE ${TABLE} SET log_persistence = ?, log_json = ?, updated_at = CASE WHEN updated_at >= ? THEN updated_at + 1 ELSE ? END
       WHERE occurrence_id = ? AND updated_at = ? AND log_persistence = ? AND status NOT IN (?, ?)`,
      ['persisted', JSON.stringify({ ...log, persistence: { status: 'persisted' } }), now, now, row.occurrenceId, row.updatedAt, 'pending', 'claimed', 'running'],
    )
    if (result.success && result.data.changes === 1)
      return ok(undefined)
    const current = await this.byOccurrence(row.occurrenceId)
    return current.success && current.data?.logPersistence === 'persisted' && current.data.logsJson === row.logsJson ? ok(undefined) : failed()
  }

  private async rows(where: string, params: unknown[], limit: number, offset: number): Promise<HaiResult<StoredExecution[]>> {
    const result = await this.findAll({ where, params, limit, offset, orderBy: 'sequence ASC' })
    if (!result.success)
      return failed(result.error)
    const rows: StoredExecution[] = []
    for (const row of result.data) {
      const normalized = this.normalize(row)
      if (!normalized.success)
        return normalized
      rows.push(normalized.data)
    }
    return ok(rows)
  }

  /**
   * 唯一 active_task 防止不同 occurrence 并行；同 occurrence 只可恢复安全的过期记录。
   * @example await repository.claim(task, id, trigger, nodeId, leaseMs)
   */
  async claim(task: TaskDefinition, id: string, trigger: TaskTriggerInfo, nodeId: string, leaseMs: number): Promise<HaiResult<StoredExecution | null>> {
    const now = Date.now()
    const owner = `${nodeId}:${randomUUID()}`
    let created: HaiResult<unknown>
    try {
      created = await this.create({
        occurrenceId: id,
        taskId: task.id,
        activeTask: task.id,
        status: 'claimed',
        owner,
        leasedUntil: now + leaseMs,
        attemptCount: 0,
        maxAttempts: task.retry?.maxAttempts ?? 1,
        idempotent: task.idempotent === true,
        snapshot: JSON.stringify(task),
        triggerJson: JSON.stringify(trigger),
        logPersistence: 'unconfirmed',
        updatedAt: now,
        createdAt: now,
      })
    }
    catch (cause) {
      return failed(cause)
    }
    const existing = await this.byOccurrence(id)
    if (!existing.success)
      return existing
    if (!existing.data) {
      // 冲突可能来自另一个 occurrence 的串行槽；只有实际存在占用者才按正常竞争处理。
      const active = await this.findAll({ where: 'active_task = ?', params: [task.id], limit: 1 })
      return active.success && active.data.length > 0 ? ok(null) : failed(created.success ? undefined : created.error)
    }
    const row = existing.data
    if (created.success || ['success', 'failed', 'interrupted', 'discarded'].includes(row.status))
      return ok(row)
    if (row.status === 'unknown' || row.leasedUntil > now)
      return ok(null)
    if (row.status === 'running' && (!row.idempotent || row.attemptCount >= row.maxAttempts)) {
      const isolated = await this.db.sql.execute(
        `UPDATE ${TABLE} SET status = ?, owner = NULL, leased_until = 0, updated_at = ?
         WHERE occurrence_id = ? AND owner = ? AND leased_until <= ? AND status = ?`,
        ['unknown', now, id, row.owner, now, 'running'],
      )
      return isolated.success ? ok(null) : failed(isolated.error)
    }
    const recovered = await this.db.sql.execute(
      `UPDATE ${TABLE} SET status = ?, owner = ?, leased_until = ?, updated_at = ?
       WHERE occurrence_id = ? AND owner = ? AND leased_until <= ? AND status IN (?, ?)`,
      ['claimed', owner, now + leaseMs, now, id, row.owner, now, 'claimed', 'running'],
    )
    if (!recovered.success)
      return failed(recovered.error)
    return recovered.data.changes === 1 ? this.byOccurrence(id) : ok(null)
  }

  /** 外部副作用前的条件门闩，并原子递增持久尝试次数。@example await repository.begin(row, leaseMs) */
  async begin(row: StoredExecution, leaseMs: number): Promise<HaiResult<void>> {
    const now = Date.now()
    const result = await this.db.sql.execute(
      `UPDATE ${TABLE} SET status = ?, attempt_count = attempt_count + 1, leased_until = ?, updated_at = ?
       WHERE occurrence_id = ? AND owner = ? AND leased_until > ? AND status IN (?, ?) AND attempt_count < max_attempts`,
      ['running', now + leaseMs, now, row.occurrenceId, row.owner, now, 'claimed', 'running'],
    )
    if (!result.success || result.data.changes !== 1)
      return failed(result.success ? undefined : result.error)
    row.status = 'running'
    row.attemptCount += 1
    return ok(undefined)
  }

  /** 只续租仍然有效的 owner；过期凭据不能复活。@example await repository.renew(row, leaseMs) */
  async renew(row: StoredExecution, leaseMs: number): Promise<HaiResult<void>> {
    const now = Date.now()
    const result = await this.db.sql.execute(
      `UPDATE ${TABLE} SET leased_until = ?, updated_at = ? WHERE occurrence_id = ? AND owner = ? AND leased_until > ? AND status IN (?, ?)`,
      [now + leaseMs, now, row.occurrenceId, row.owner, now, 'claimed', 'running'],
    )
    return result.success && result.data.changes === 1 ? ok(undefined) : failed()
  }

  /** 有效 owner 确认终态；unknown 保留串行槽，阻止下一 cron/manual 与旧副作用并行。@example await repository.finish(row, log) */
  async finish(row: StoredExecution, log: TaskExecutionLog, logs: TaskExecutionLog[] = [log]): Promise<HaiResult<void>> {
    const now = Date.now()
    const result = await this.db.sql.execute(
      `UPDATE ${TABLE} SET status = ?, active_task = ?, owner = NULL, leased_until = 0, log_json = ?, logs_json = ?, log_persistence = ?, updated_at = ?
       WHERE occurrence_id = ? AND owner = ? AND leased_until > ? AND status IN (?, ?)`,
      [log.status, log.status === 'unknown' ? row.taskId : null, JSON.stringify(log), JSON.stringify(logs), 'pending', now, row.occurrenceId, row.owner, now, 'claimed', 'running'],
    )
    return result.success && result.data.changes === 1 ? ok(undefined) : failed()
  }

  /** 人工隔离旧 runner 后条件裁定；不重排旧 occurrence，只有成功裁定才释放任务槽。@example await repository.resolve(id, 'discarded', updatedAt) */
  async resolve(id: string, status: 'success' | 'discarded', expectedUpdatedAt: number): Promise<HaiResult<void>> {
    const result = await this.db.sql.execute(
      `UPDATE ${TABLE} SET status = ?, active_task = NULL, updated_at = ? WHERE occurrence_id = ? AND status = ? AND updated_at = ?`,
      [status, Math.max(Date.now(), expectedUpdatedAt + 1), id, 'unknown', expectedUpdatedAt],
    )
    return result.success && result.data.changes === 1 ? ok(undefined) : failed()
  }
}
