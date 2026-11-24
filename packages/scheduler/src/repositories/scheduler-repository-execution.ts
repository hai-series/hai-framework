/**
 * 跨节点执行日志与任务串行槽；唯一约束和 owner 条件是调度正确性的依据。
 * @module scheduler-repository-execution
 */

import type { HaiResult } from '@h-ai/core'
import type { DmlOperations, ExecuteResult, ReldbFunctions } from '@h-ai/reldb'
import type { SchedulerExecutionEntry, SchedulerExecutionState, TaskDefinition, TaskExecutionLog, TaskTriggerInfo } from '../scheduler-types.js'
import { createHash, randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { core } from '@h-ai/core'
import { BaseReldbCrudRepository } from '@h-ai/reldb'
import { schedulerM } from '../scheduler-i18n.js'
import { HaiSchedulerError } from '../scheduler-types.js'
import { databaseClockSql } from './scheduler-database-clock.js'

const TABLE = 'hai_scheduler_executions'
const RECOVERABLE = '((status = \'claimed\' AND attempt_count = 0) OR (idempotent = TRUE AND attempt_count < max_attempts))'
const ISOLATE = `status = 'unknown', owner = NULL, leased_until = 0, log_json = NULL,
  log_persistence = CASE WHEN logs_json IS NOT NULL THEN 'pending' ELSE log_persistence END`

/**
 * 内部持久执行记录；owner 不对运维查询输出。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * async function inspect(repository: SchedulerExecutionRepository) {
 *   const result = await repository.expired()
 *   if (!result.success) return result
 *   const records: StoredExecution[] = result.data
 *   return records.map(executionEntry)
 * }
 * ```
 */
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
  /** 终态回执，或在退避期间保存下一次可执行时间。 */
  logJson?: string
  /** 已完成尝试的日志 JSON；退避、进程接管及日志补写共用。 */
  logsJson?: string
  /** 等待重试时，从 logJson 解出的数据库毫秒截止点。 */
  retryAt?: number
  /** 与业务阶段独立的日志投影状态。 */
  logPersistence: 'pending' | 'persisted' | 'unconfirmed'
  /** 最近共享状态更新时间（Unix 毫秒）。 */
  updatedAt: number
  /** 初次领取时间（Unix 毫秒）。 */
  createdAt: number
}

/**
 * 稳定 occurrence 包含 taskId，避免不同任务的相同业务键冲突。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const scheduledId = executionId('daily-report', 'scheduled', String(Math.floor(1792705800000 / 60000)))
 * const manualId = executionId('daily-report', 'manual', 'report-2026-10-23')
 * ```
 */
export function executionId(taskId: string, type: string, key: string): string {
  return createHash('sha256').update(JSON.stringify([taskId, type, key])).digest('hex')
}

/**
 * 执行定义的持久快照。数据库行编号区分删除后重新注册的同名任务；配置任务没有该字段。
 * @example 模块内部上下文
 * ```ts
 * const snapshot: ExecutionTaskSnapshot = { id: 'daily-report', name: 'Report', cron: '0 2 * * *', definitionRowId: 42 }
 * ```
 */
export interface ExecutionTaskSnapshot extends TaskDefinition {
  definitionRowId?: number
}

/**
 * 公共状态投影只保留运维元数据。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * async function read(repository: SchedulerExecutionRepository, id: string) {
 *   const found = await repository.byOccurrence(id)
 *   if (!found.success) return found
 *   return found.data ? executionEntry(found.data) : null
 * }
 * ```
 */
export function executionEntry(row: StoredExecution): SchedulerExecutionEntry {
  return {
    occurrenceId: row.occurrenceId,
    taskId: row.taskId,
    status: row.status,
    sequence: row.sequence,
    attemptCount: row.attemptCount,
    updatedAt: row.updatedAt,
    logPersistence: row.logPersistence,
  }
}

/** 统一持久状态失败；不回退为本地执行。 */
function failed(cause?: unknown) {
  return core.err(HaiSchedulerError.DB_SAVE_FAILED, schedulerM('scheduler_executionStateFailed'), cause)
}

/**
 * 执行仓库；active_task 唯一列直到已确认的终态才释放，覆盖 cron/manual/跨分钟。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * async function claimOnce(db: ReldbFunctions) {
 *   const repository = new SchedulerExecutionRepository(db)
 *   const task: TaskDefinition = { id: 'daily-report', name: '每日报表', cron: '0 2 * * *', timezone: 'UTC' }
 *   const id = executionId(task.id, 'manual', 'report-2026-10-23')
 *   const claimed = await repository.claim(task, id, { type: 'manual', source: null }, 'node-report', 60000)
 *   if (!claimed.success || !claimed.data) return claimed
 *   const begun = await repository.begin(claimed.data, 60000)
 *   if (!begun.success) return begun
 *   return executionEntry(claimed.data)
 * }
 * ```
 */
export class SchedulerExecutionRepository extends BaseReldbCrudRepository<StoredExecution> {
  constructor(db: ReldbFunctions) {
    super(db, {
      table: TABLE,
      idColumn: 'sequence',
      idField: 'sequence',
      fields: [
        {
          fieldName: 'sequence',
          columnName: 'sequence',
          def: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
          select: true,
          create: false,
          update: false,
        },
        ...[
          [
            'occurrenceId',
            'occurrence_id',
            true,
            true,
          ],
          ['taskId', 'task_id', true, false],
          [
            'activeTask',
            'active_task',
            false,
            true,
          ],
          ['status', 'status', true, false],
          ['owner', 'owner', false, false],
          ['snapshot', 'snapshot', true, false],
          [
            'triggerJson',
            'trigger_json',
            true,
            false,
          ],
          ['logJson', 'log_json', false, false],
          ['logsJson', 'logs_json', false, false],
          [
            'logPersistence',
            'log_persistence',
            true,
            false,
          ],
        ].map(([fieldName, columnName, notNull, unique]) => ({
          fieldName: String(fieldName),
          columnName: String(columnName),
          def: {
            type: [
              'snapshot',
              'triggerJson',
              'logJson',
              'logsJson',
            ].includes(String(fieldName))
              ? 'JSON' as const
              : 'TEXT' as const,
            notNull: Boolean(notNull),
            unique: Boolean(unique),
          },
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
        {
          fieldName: 'idempotent',
          columnName: 'idempotent',
          def: { type: 'BOOLEAN', notNull: true },
          select: true,
          create: true,
          update: true,
        },
      ],
    })
  }

  /** 等待执行表就绪并验证当前字段定义。 */
  ready(): Promise<HaiResult<void>> {
    return this.ensureSchema()
  }

  /**
   * 只按已初始化的数据库类型选择存储端毫秒时钟。
   * PostgreSQL/MySQL 使用执行时钟，不能使用固定在事务/语句开始处的时间快照。
   * 期限表达式直接进入有 owner 条件的 SQL；先 SELECT 时间再写入仍有等待窗口。
   *
   * @example
   * ```ts
   * // 模块内部上下文：当前仓库实例仅生成固定白名单 SQL，不接收调用方表达式。
   * const deadlinePredicate = `leased_until > ${this.databaseClock()}`
   * ```
   */
  private databaseClock(): string {
    return databaseClockSql(this.db.config?.type)
  }

  private retryDeadline(): string {
    if (this.db.config?.type === 'postgresql')
      return 'CAST(log_json ->> \'retryAt\' AS BIGINT)'
    if (this.db.config?.type === 'mysql')
      return 'CAST(JSON_UNQUOTE(JSON_EXTRACT(log_json, \'$.retryAt\')) AS SIGNED)'
    return 'json_extract(log_json, \'$.retryAt\')'
  }

  private withExecutionLock<T>(id: string, write: (sql: DmlOperations) => Promise<HaiResult<T>>): Promise<HaiResult<T>> {
    if (this.db.config?.type === 'sqlite')
      return write(this.db.sql)

    // PostgreSQL 可能在等待行锁前已求值 WHERE；持锁后再执行带存储时钟条件的写入。
    return this.db.tx.wrapResult(async (tx) => {
      const locked = await tx.get(`SELECT occurrence_id FROM ${TABLE} WHERE occurrence_id = ? FOR UPDATE`, [id])
      return locked.success && locked.data
        ? write(tx)
        : failed(locked.success ? undefined : locked.error)
    })
  }

  /** 同毫秒内的持久状态版本仍单调增加，日志确认/人工裁定不依赖节点墙钟。 */
  private nextUpdatedAt(): string {
    const clock = this.databaseClock()
    return `CASE WHEN updated_at >= ${clock} THEN updated_at + 1 ELSE ${clock} END`
  }

  /** 存储端毫秒时钟供 cron 计算共享分钟身份；读取失败停止本轮调度，不回退节点时钟。 */
  async currentTime(sql = this.db.sql): Promise<HaiResult<number>> {
    const result = await sql.get<{ now: number | string }>(`SELECT ${this.databaseClock()} AS now`)
    if (!result.success)
      return failed(result.error)
    const now = Number(result.data?.now)
    return Number.isSafeInteger(now) && now >= 0
      ? core.ok(now)
      : failed()
  }

  /** 读取统一校验 BIGINT，不能把 PG 字符串时间或舍入的序号用于 owner 判断。 */
  private normalize(row: StoredExecution): HaiResult<StoredExecution> {
    const value = { ...row }
    // JSON 大载荷避免 MySQL 的 TEXT→VARCHAR(255) 映射；驱动解码后统一恢复内部 JSON 文本契约。
    for (const field of [
      'snapshot',
      'triggerJson',
      'logJson',
      'logsJson',
    ] as const) {
      if (row[field] !== undefined && row[field] !== null && typeof row[field] !== 'string')
        value[field] = JSON.stringify(row[field])
    }
    for (const field of [
      'sequence',
      'leasedUntil',
      'attemptCount',
      'maxAttempts',
      'updatedAt',
      'createdAt',
    ] as const) {
      const number = Number(row[field])
      if (!Number.isSafeInteger(number) || number < 0)
        return failed()
      value[field] = number
    }
    if (value.logJson && (value.status === 'claimed' || value.status === 'running')) {
      try {
        const checkpoint: { retryAt?: unknown } = JSON.parse(value.logJson)
        if (typeof checkpoint.retryAt !== 'number' || !Number.isSafeInteger(checkpoint.retryAt) || checkpoint.retryAt < 0)
          return failed()
        value.retryAt = checkpoint.retryAt
      }
      catch (error) {
        return failed(error)
      }
    }
    return core.ok(value)
  }

  /** 按稳定回执读取。@example await repository.byOccurrence(id) */
  async byOccurrence(id: string): Promise<HaiResult<StoredExecution | null>> {
    const rows = await this.findAll({
      where: 'occurrence_id = ?',
      params: [id],
      limit: 1,
    })
    if (!rows.success)
      return failed(rows.error)
    return rows.data[0]
      ? this.normalize(rows.data[0])
      : core.ok(null)
  }

  /** 有界读取过期执行，跨分钟恢复原 occurrence，而不是创建新的副作用身份。@example await repository.expired() */
  async expired(): Promise<HaiResult<StoredExecution[]>> {
    return this.rows(`status IN (?, ?) AND leased_until <= ${this.databaseClock()}`, ['claimed', 'running'], 100, 0)
  }

  /** 任务被删除或触发元数据损坏时，过期记录隔离为 unknown，允许可信人工核对而非永久悬挂。 */
  async isolateExpired(row: StoredExecution): Promise<HaiResult<void>> {
    return this.withExecutionLock(row.occurrenceId, async (sql) => {
      const result = await sql.execute(
        `UPDATE ${TABLE} SET ${ISOLATE}, updated_at = ${this.nextUpdatedAt()}
         WHERE occurrence_id = ? AND owner = ? AND leased_until <= ${this.databaseClock()} AND status IN (?, ?)`,
        [
          row.occurrenceId,
          row.owner,
          'claimed',
          'running',
        ],
      )
      return result.success && result.data.changes === 1
        ? core.ok(undefined)
        : failed(result.success ? undefined : result.error)
    })
  }

  /** 成功账本同时是一次性定义的失效记录；即使定义尚未清除，也禁止再次运行。 */
  async completedDefinition(task: ExecutionTaskSnapshot, registeredAt?: number): Promise<HaiResult<boolean>> {
    try {
      const expected: unknown = JSON.parse(JSON.stringify(task))
      const { definitionRowId, ...definition } = task
      const legacy: unknown = registeredAt === undefined || definitionRowId === undefined
        ? undefined
        : JSON.parse(JSON.stringify(definition))
      let sequence = 0
      for (;;) {
        const rows = await this.db.sql.query<{ sequence: number | string, snapshot: unknown, created_at: number | string }>(
          `SELECT sequence, snapshot, created_at FROM ${TABLE} WHERE task_id = ? AND status = ? AND sequence > ? ORDER BY sequence LIMIT 100`,
          [task.id, 'success', sequence],
        )
        if (!rows.success)
          return failed(rows.error)
        for (const row of rows.data) {
          const snapshot: unknown = typeof row.snapshot === 'string'
            ? JSON.parse(row.snapshot)
            : row.snapshot
          if (isDeepStrictEqual(snapshot, expected))
            return core.ok(true)
          // 旧成功记录没有定义行号。只接受当前定义登记后的同内容记录。
          if (legacy !== undefined && registeredAt !== undefined && Number(row.created_at) >= registeredAt && isDeepStrictEqual(snapshot, legacy))
            return core.ok(true)
          const next = Number(row.sequence)
          if (!Number.isSafeInteger(next) || next <= sequence)
            return failed()
          sequence = next
        }
        if (rows.data.length < 100)
          return core.ok(false)
      }
    }
    catch (error) {
      return failed(error)
    }
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
   * @example await repository.confirmLogs(row, receipt)
   */
  async confirmLogs(row: StoredExecution, receipt: TaskExecutionLog): Promise<HaiResult<void>> {
    if (!row.logsJson)
      return failed()
    const result = await this.db.sql.execute(
      `UPDATE ${TABLE} SET log_persistence = ?, log_json = ?, updated_at = ${this.nextUpdatedAt()}
       WHERE occurrence_id = ? AND updated_at = ? AND log_persistence = ? AND status NOT IN (?, ?)`,
      [
        'persisted',
        JSON.stringify({
          ...receipt,
          persistence: { status: 'persisted' },
        }),
        row.occurrenceId,
        row.updatedAt,
        'pending',
        'claimed',
        'running',
      ],
    )
    if (result.success && result.data.changes === 1)
      return core.ok(undefined)
    const current = await this.byOccurrence(row.occurrenceId)
    return current.success && current.data?.logPersistence === 'persisted' && current.data.logsJson === row.logsJson
      ? core.ok(undefined)
      : failed()
  }

  private async rows(where: string, params: unknown[], limit: number, offset: number): Promise<HaiResult<StoredExecution[]>> {
    const result = await this.findAll({
      where,
      params,
      limit,
      offset,
      orderBy: 'sequence ASC',
    })
    if (!result.success)
      return failed(result.error)
    const rows: StoredExecution[] = []
    for (const row of result.data) {
      const normalized = this.normalize(row)
      if (!normalized.success)
        return normalized
      rows.push(normalized.data)
    }
    return core.ok(rows)
  }

  /**
   * 唯一 active_task 防止不同 occurrence 并行；同 occurrence 只可恢复安全的过期记录。
   * @example await repository.claim(task, id, trigger, nodeId, leaseMs)
   */
  async claim(task: ExecutionTaskSnapshot, id: string, trigger: TaskTriggerInfo, nodeId: string, leaseMs: number): Promise<HaiResult<StoredExecution | null>> {
    const ready = await this.ensureReady()
    if (!ready.success)
      return failed(ready.error)
    const clock = this.databaseClock()
    const owner = `${nodeId}:${randomUUID()}`
    const postgres = this.db.config?.type === 'postgresql'
    // 两个唯一约束都可能命中，后续读取区分已有执行和被其他 occurrence 占用的槽。
    const conflictClause = postgres ? ' ON CONFLICT DO NOTHING' : ''
    let created: HaiResult<ExecuteResult>
    try {
      // INSERT 的期限和初始时间与存储端同一语句计算，不接受本机 Date.now() 授权。
      created = await this.db.sql.execute(
        `INSERT INTO ${TABLE} (occurrence_id, task_id, active_task, status, owner, leased_until, attempt_count, max_attempts, idempotent, snapshot, trigger_json, log_persistence, updated_at, created_at)
         VALUES (?, ?, ?, ?, ?, ${clock} + ?, 0, ?, ?, ?, ?, ?, ${clock}, ${clock})${conflictClause}`,
        [
          id,
          task.id,
          task.id,
          'claimed',
          owner,
          leaseMs,
          task.retry?.maxAttempts ?? 1,
          postgres
            ? task.idempotent === true
            : Number(task.idempotent === true),
          JSON.stringify(task),
          JSON.stringify(trigger),
          'unconfirmed',
        ],
      )
    }
    catch (cause) {
      return failed(cause)
    }
    if (postgres && !created.success)
      return failed(created.error)
    const existing = await this.byOccurrence(id)
    if (!existing.success)
      return existing
    if (!existing.data) {
      // 冲突可能来自另一个 occurrence 的串行槽；只有实际存在占用者才按正常竞争处理。
      const active = await this.findAll({
        where: 'active_task = ?',
        params: [task.id],
        limit: 1,
      })
      return active.success && active.data.length > 0
        ? core.ok(null)
        : failed(created.success ? undefined : created.error)
    }
    const row = existing.data
    if ([
      'success',
      'failed',
      'interrupted',
      'discarded',
    ].includes(row.status)) {
      return core.ok(row)
    }
    if (row.status === 'unknown')
      return core.ok(null)
    if (created.success && created.data.changes === 1) {
      return core.ok(row.owner === owner
        ? row
        : null)
    }

    const recovered = await this.withExecutionLock(id, async (sql) => {
      // 读取和写入之间，旧 owner 可能已开始执行或用掉最后一次尝试；以最终条件为准。
      const eligible = `occurrence_id = ? AND owner = ? AND leased_until <= ${clock} AND status IN (?, ?)`
      const previous = [id, row.owner, 'claimed', 'running']
      const changed = await sql.execute(
        `UPDATE ${TABLE} SET status = ?, owner = ?, leased_until = ${clock} + ?, updated_at = ${this.nextUpdatedAt()}
         WHERE ${eligible} AND ${RECOVERABLE}`,
        ['claimed', owner, leaseMs, ...previous],
      )
      if (!changed.success)
        return failed(changed.error)
      if (changed.data.changes === 1)
        return core.ok(true)
      const isolated = await sql.execute(
        `UPDATE ${TABLE} SET ${ISOLATE}, updated_at = ${this.nextUpdatedAt()}
         WHERE ${eligible} AND NOT ${RECOVERABLE}`,
        previous,
      )
      return isolated.success
        ? core.ok(false)
        : failed(isolated.error)
    })
    if (!recovered.success)
      return recovered
    if (!recovered.data)
      return core.ok(null)

    const current = await this.byOccurrence(id)
    return current.success
      ? core.ok(current.data?.owner === owner
          ? current.data
          : null)
      : current
  }

  /** 外部副作用前的条件门闩，并原子递增持久尝试次数。@example await repository.begin(row, leaseMs) */
  async begin(row: StoredExecution, leaseMs: number): Promise<HaiResult<number>> {
    const clock = this.databaseClock()
    const begun = await this.withExecutionLock(row.occurrenceId, async (sql) => {
      const startedAt = await this.currentTime(sql)
      if (!startedAt.success)
        return startedAt
      const result = await sql.execute(
        `UPDATE ${TABLE} SET status = ?, attempt_count = attempt_count + 1, log_json = NULL,
            leased_until = ${clock} + ?, updated_at = ${this.nextUpdatedAt()}
         WHERE occurrence_id = ? AND owner = ? AND leased_until > ${clock} AND status IN (?, ?)
           AND attempt_count = ? AND attempt_count < max_attempts
           AND (log_json IS NULL OR ${clock} >= ${this.retryDeadline()})`,
        [
          'running',
          leaseMs,
          row.occurrenceId,
          row.owner,
          'claimed',
          'running',
          row.attemptCount,
        ],
      )
      return result.success && result.data.changes === 1
        ? startedAt
        : failed(result.success ? undefined : result.error)
    })
    if (begun.success) {
      row.status = 'running'
      row.attemptCount += 1
      delete row.retryAt
    }
    return begun
  }

  /** 只续租仍然有效的 owner；过期凭据不能复活。@example await repository.renew(row, leaseMs) */
  async renew(row: StoredExecution, leaseMs: number): Promise<HaiResult<void>> {
    const clock = this.databaseClock()
    return this.withExecutionLock(row.occurrenceId, async (sql) => {
      const result = await sql.execute(
        `UPDATE ${TABLE} SET leased_until = ${clock} + ?, updated_at = ${this.nextUpdatedAt()}
         WHERE occurrence_id = ? AND owner = ? AND leased_until > ${clock} AND status IN (?, ?)`,
        [
          leaseMs,
          row.occurrenceId,
          row.owner,
          'claimed',
          'running',
        ],
      )
      return result.success && result.data.changes === 1
        ? core.ok(undefined)
        : failed(result.success ? undefined : result.error)
    })
  }

  /** 保存已完成的失败尝试和下一次允许开始的 DB 时间，恢复时沿用同一执行及预算。 */
  async checkpointRetry(row: StoredExecution, logs: TaskExecutionLog[], delay: number): Promise<HaiResult<number>> {
    const clock = this.databaseClock()
    const jsonObject = this.db.config?.type === 'postgresql'
      ? 'jsonb_build_object'
      : 'json_object'
    return this.withExecutionLock(row.occurrenceId, async (sql) => {
      const result = await sql.execute(
        `UPDATE ${TABLE} SET log_json = ${jsonObject}('retryAt', ${clock} + ?), logs_json = ?, updated_at = ${this.nextUpdatedAt()}
         WHERE occurrence_id = ? AND owner = ? AND leased_until > ${clock} AND status = ?
           AND idempotent = TRUE AND attempt_count = ? AND attempt_count < max_attempts`,
        [
          delay,
          JSON.stringify(logs),
          row.occurrenceId,
          row.owner,
          'running',
          row.attemptCount,
        ],
      )
      if (!result.success || result.data.changes !== 1)
        return failed(result.success ? undefined : result.error)
      const stored = await sql.get<{ retry_at: number | string }>(
        `SELECT ${this.retryDeadline()} AS retry_at FROM ${TABLE} WHERE occurrence_id = ? AND owner = ?`,
        [row.occurrenceId, row.owner],
      )
      const retryAt = Number(stored.success ? stored.data?.retry_at : undefined)
      return Number.isSafeInteger(retryAt) && retryAt > 0
        ? core.ok(retryAt)
        : failed(stored.success ? undefined : stored.error)
    })
  }

  /** 有效 owner 确认终态；unknown 保留串行槽，阻止下一 cron/manual 与旧副作用并行。@example await repository.finish(row, log) */
  async finish(row: StoredExecution, log: TaskExecutionLog, logs: TaskExecutionLog[] = [log]): Promise<HaiResult<void>> {
    const clock = this.databaseClock()
    return this.withExecutionLock(row.occurrenceId, async (sql) => {
      const result = await sql.execute(
        `UPDATE ${TABLE} SET status = ?, active_task = ?, owner = NULL, leased_until = 0, log_json = ?, logs_json = ?, log_persistence = ?, updated_at = ${this.nextUpdatedAt()}
         WHERE occurrence_id = ? AND owner = ? AND leased_until > ${clock} AND status IN (?, ?)`,
        [
          log.status,
          log.status === 'unknown'
            ? row.taskId
            : null,
          JSON.stringify(log),
          JSON.stringify(logs),
          'pending',
          row.occurrenceId,
          row.owner,
          'claimed',
          'running',
        ],
      )
      return result.success && result.data.changes === 1
        ? core.ok(undefined)
        : failed(result.success ? undefined : result.error)
    })
  }

  /** 人工隔离旧 runner 后条件裁定；不重排旧 occurrence，只有成功裁定才释放任务槽。@example await repository.resolve(id, 'discarded', updatedAt) */
  async resolve(id: string, status: 'success' | 'discarded', expectedUpdatedAt: number): Promise<HaiResult<void>> {
    const result = await this.db.sql.execute(
      `UPDATE ${TABLE} SET status = ?, active_task = NULL, updated_at = ${this.nextUpdatedAt()} WHERE occurrence_id = ? AND status = ? AND updated_at = ?`,
      [
        status,
        id,
        'unknown',
        expectedUpdatedAt,
      ],
    )
    return result.success && result.data.changes === 1
      ? core.ok(undefined)
      : failed()
  }
}
