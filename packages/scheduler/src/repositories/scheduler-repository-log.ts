/**
 * @h-ai/scheduler — 执行日志仓库
 *
 * 基于 @h-ai/reldb BaseReldbCrudRepository 实现执行日志的持久化与查询。
 * @module scheduler-repository-log
 */

import type { HaiResult, PaginatedResult } from '@h-ai/core'
import type { ReldbFunctions } from '@h-ai/reldb'
import type { LogQueryOptions, SchedulerLogCleanupPolicy, TaskExecutionLog } from '../scheduler-types.js'

import { isDeepStrictEqual } from 'node:util'
import { core, err, ok } from '@h-ai/core'
import { BaseReldbCrudRepository } from '@h-ai/reldb'

import { schedulerM } from '../scheduler-i18n.js'
import { HaiSchedulerError } from '../scheduler-types.js'

const logger = core.logger.child({ module: 'scheduler', scope: 'log-repository' })

const SCHEDULER_LOG_TABLE = 'hai_scheduler_logs'

/**
 * 内部持久日志行；UUID 是幂等主键，完整 payload 使用 JSON 保存而不截断结果。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * function persistedRow(payload: TaskExecutionLog): LogRow {
 *   return { id: payload.id, occurrenceId: payload.occurrenceId, taskId: payload.taskId, taskName: payload.taskName, taskType: payload.taskType, triggerType: payload.triggerType, triggerSource: payload.triggerSource, status: payload.status, payload, startedAt: payload.startedAt, finishedAt: payload.finishedAt, duration: payload.duration }
 * }
 * ```
 */
interface LogRow {
  id: string
  occurrenceId?: string
  taskId: string
  taskName: string
  taskType: string
  triggerType: string
  triggerSource: string | null
  status: string
  payload: TaskExecutionLog
  startedAt: number
  finishedAt: number
  duration: number
}

/**
 * 内部日志投影仓库；固定 UUID 与完整内容比对处理提交后回执丢失，不能因日志失败重跑业务。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * async function inspect(db: ReldbFunctions) {
 *   const repository = new SchedulerLogRepository(db)
 *   const logs = await repository.queryLogs({ taskId: 'daily-report', pagination: { page: 1, pageSize: 20 } })
 *   if (!logs.success) return logs
 *   return logs.data.items
 * }
 * ```
 */
export class SchedulerLogRepository extends BaseReldbCrudRepository<LogRow> {
  constructor(db: ReldbFunctions) {
    super(db, {
      table: SCHEDULER_LOG_TABLE,
      idColumn: 'id',
      fields: [
        { fieldName: 'id', columnName: 'id', def: { type: 'TEXT', primaryKey: true }, select: true, create: true, update: false },
        { fieldName: 'occurrenceId', columnName: 'occurrence_id', def: { type: 'TEXT' }, select: true, create: true, update: false },
        { fieldName: 'taskId', columnName: 'task_id', def: { type: 'TEXT', notNull: true }, select: true, create: true, update: false },
        { fieldName: 'taskName', columnName: 'task_name', def: { type: 'TEXT', notNull: true }, select: true, create: true, update: false },
        { fieldName: 'taskType', columnName: 'task_type', def: { type: 'TEXT', notNull: true }, select: true, create: true, update: false },
        { fieldName: 'triggerType', columnName: 'trigger_type', def: { type: 'TEXT', notNull: true }, select: true, create: true, update: false },
        { fieldName: 'triggerSource', columnName: 'trigger_source', def: { type: 'TEXT' }, select: true, create: true, update: false },
        { fieldName: 'status', columnName: 'status', def: { type: 'TEXT', notNull: true }, select: true, create: true, update: false },
        { fieldName: 'payload', columnName: 'payload', def: { type: 'JSON', notNull: true }, select: true, create: true, update: false },
        { fieldName: 'startedAt', columnName: 'started_at', def: { type: 'BIGINT', notNull: true }, select: true, create: true, update: false },
        { fieldName: 'finishedAt', columnName: 'finished_at', def: { type: 'BIGINT', notNull: true }, select: true, create: true, update: false },
        { fieldName: 'duration', columnName: 'duration', def: { type: 'INTEGER', notNull: true }, select: true, create: true, update: false },
      ],
    })
  }

  /**
   * 按固定 UUID 写入完整日志；写入失败后重读相同主键，只有真实内容相同才视为已保存。
   * @example `const saved = await repository.saveLog(log); if (!saved.success) return saved`
   */
  async saveLog(log: TaskExecutionLog): Promise<HaiResult<void>> {
    const payload: TaskExecutionLog = { ...log, persistence: { status: 'persisted' } }
    try {
      const created = await this.create({
        id: log.id,
        occurrenceId: log.occurrenceId,
        taskId: log.taskId,
        taskName: log.taskName,
        taskType: log.taskType,
        triggerType: log.triggerType,
        triggerSource: log.triggerSource,
        status: log.status,
        payload,
        startedAt: log.startedAt,
        finishedAt: log.finishedAt,
        duration: log.duration,
      })
      if (created.success)
        return ok(undefined)
    }
    catch {
      // 驱动可能在提交后丢失回执；下方真实读取确认，不依据重复错误文案猜测。
    }
    try {
      const existing = await this.findById(log.id)
      if (existing.success && existing.data && isDeepStrictEqual(existing.data.payload, payload))
        return ok(undefined)
    }
    catch {}
    return err(HaiSchedulerError.LOG_PERSIST_FAILED, schedulerM('scheduler_logPersistFailed'))
  }

  async queryLogs(options?: LogQueryOptions): Promise<HaiResult<PaginatedResult<TaskExecutionLog>>> {
    const { taskId, status, triggerType, triggerSource, startedAfter, startedBefore, pagination } = options ?? {}

    const conditions: string[] = []
    const params: unknown[] = []

    if (taskId) {
      conditions.push('task_id = ?')
      params.push(taskId)
    }
    if (status) {
      conditions.push('status = ?')
      params.push(status)
    }
    if (triggerType) {
      conditions.push('trigger_type = ?')
      params.push(triggerType)
    }
    if (triggerSource) {
      conditions.push('trigger_source = ?')
      params.push(triggerSource)
    }
    if (startedAfter !== undefined) {
      conditions.push('started_at >= ?')
      params.push(startedAfter)
    }
    if (startedBefore !== undefined) {
      conditions.push('started_at <= ?')
      params.push(startedBefore)
    }

    try {
      const pageResult = await this.findPage({
        where: conditions.length > 0 ? conditions.join(' AND ') : undefined,
        params: params.length > 0 ? params : undefined,
        orderBy: 'started_at DESC, id DESC',
        pagination,
        overrides: { defaultPageSize: 20, maxPageSize: 200 },
      })

      if (!pageResult.success) {
        return err(
          HaiSchedulerError.DB_SAVE_FAILED,
          schedulerM('scheduler_dbSaveFailed', { params: { error: pageResult.error.message } }),
          pageResult.error,
        )
      }

      return ok({
        ...pageResult.data,
        items: pageResult.data.items.map(row => ({ ...row.payload, persistence: { status: 'persisted' as const } })),
      })
    }
    catch (error) {
      logger.error('Failed to query execution logs', { error })
      return err(
        HaiSchedulerError.DB_SAVE_FAILED,
        schedulerM('scheduler_dbSaveFailed', {
          params: { error: error instanceof Error ? error.message : String(error) },
        }),
        error,
      )
    }
  }

  async cleanupLogs(policy: SchedulerLogCleanupPolicy): Promise<HaiResult<void>> {
    const { maxLogs, retentionDays } = policy
    if (!maxLogs && !retentionDays)
      return ok(undefined)

    try {
      if (retentionDays) {
        const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
        const retentionResult = await this.sql().execute(
          `DELETE FROM ${SCHEDULER_LOG_TABLE} WHERE started_at < ?`,
          [cutoff],
        )

        if (!retentionResult.success) {
          return err(
            HaiSchedulerError.DB_SAVE_FAILED,
            schedulerM('scheduler_dbSaveFailed', { params: { error: retentionResult.error.message } }),
            retentionResult.error,
          )
        }
      }

      if (maxLogs) {
        const maxLogsResult = await this.sql().execute(
          `DELETE FROM ${SCHEDULER_LOG_TABLE}
           WHERE id NOT IN (
             SELECT id FROM (
               SELECT id
               FROM ${SCHEDULER_LOG_TABLE}
               ORDER BY started_at DESC, id DESC
               LIMIT ?
             ) AS keep_logs
           )`,
          [maxLogs],
        )

        if (!maxLogsResult.success) {
          return err(
            HaiSchedulerError.DB_SAVE_FAILED,
            schedulerM('scheduler_dbSaveFailed', { params: { error: maxLogsResult.error.message } }),
            maxLogsResult.error,
          )
        }
      }

      return ok(undefined)
    }
    catch (error) {
      logger.error('Failed to cleanup execution logs', { error, maxLogs, retentionDays })
      return err(
        HaiSchedulerError.DB_SAVE_FAILED,
        schedulerM('scheduler_dbSaveFailed', {
          params: { error: error instanceof Error ? error.message : String(error) },
        }),
        error,
      )
    }
  }
}
