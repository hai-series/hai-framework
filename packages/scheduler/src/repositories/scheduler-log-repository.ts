/**
 * @h-ai/scheduler — 执行日志仓库
 *
 * 基于 @h-ai/reldb BaseReldbCrudRepository 实现执行日志的持久化与查询。
 * @module scheduler-log-repository
 */

import type { HaiResult, PaginatedResult } from '@h-ai/core'
import type { ReldbFunctions } from '@h-ai/reldb'
import type { LogQueryOptions, SchedulerLogCleanupPolicy, TaskExecutionLog } from '../scheduler-types.js'

import { core, err, ok } from '@h-ai/core'
import { BaseReldbCrudRepository } from '@h-ai/reldb'

import { schedulerM } from '../scheduler-i18n.js'
import { HaiSchedulerError } from '../scheduler-types.js'

const logger = core.logger.child({ module: 'scheduler', scope: 'log-repository' })

const SCHEDULER_LOG_TABLE = 'hai_scheduler_logs'

interface LogRow {
  id: number
  taskId: string
  taskName: string
  taskType: string
  triggerType: string
  triggerSource: string | null
  status: string
  result: string | null
  error: string | null
  startedAt: number
  finishedAt: number
  duration: number
}

export class SchedulerLogRepository extends BaseReldbCrudRepository<LogRow> {
  constructor(db: ReldbFunctions) {
    super(db, {
      table: SCHEDULER_LOG_TABLE,
      idColumn: 'id',
      fields: [
        { fieldName: 'id', columnName: 'id', def: { type: 'INTEGER', primaryKey: true, autoIncrement: true }, select: true, create: false, update: false },
        { fieldName: 'taskId', columnName: 'task_id', def: { type: 'TEXT', notNull: true }, select: true, create: true, update: false },
        { fieldName: 'taskName', columnName: 'task_name', def: { type: 'TEXT', notNull: true }, select: true, create: true, update: false },
        { fieldName: 'taskType', columnName: 'task_type', def: { type: 'TEXT', notNull: true }, select: true, create: true, update: false },
        { fieldName: 'triggerType', columnName: 'trigger_type', def: { type: 'TEXT', notNull: true }, select: true, create: true, update: false },
        { fieldName: 'triggerSource', columnName: 'trigger_source', def: { type: 'TEXT' }, select: true, create: true, update: false },
        { fieldName: 'status', columnName: 'status', def: { type: 'TEXT', notNull: true }, select: true, create: true, update: false },
        { fieldName: 'result', columnName: 'result', def: { type: 'TEXT' }, select: true, create: true, update: false },
        { fieldName: 'error', columnName: 'error', def: { type: 'TEXT' }, select: true, create: true, update: false },
        { fieldName: 'startedAt', columnName: 'started_at', def: { type: 'INTEGER', notNull: true }, select: true, create: true, update: false },
        { fieldName: 'finishedAt', columnName: 'finished_at', def: { type: 'INTEGER', notNull: true }, select: true, create: true, update: false },
        { fieldName: 'duration', columnName: 'duration', def: { type: 'INTEGER', notNull: true }, select: true, create: true, update: false },
      ],
    })
  }

  async saveLog(log: TaskExecutionLog): Promise<void> {
    try {
      const createResult = await this.create({
        taskId: log.taskId,
        taskName: log.taskName,
        taskType: log.taskType,
        triggerType: log.triggerType,
        triggerSource: log.triggerSource,
        status: log.status,
        result: log.result,
        error: log.error,
        startedAt: log.startedAt,
        finishedAt: log.finishedAt,
        duration: log.duration,
      })

      if (!createResult.success)
        logger.error('Failed to save execution log', { taskId: log.taskId, error: createResult.error.message })
    }
    catch (error) {
      logger.error('Failed to save execution log', { taskId: log.taskId, error })
    }
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
        orderBy: 'id DESC',
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
        items: pageResult.data.items.map(row => ({
          id: row.id,
          taskId: row.taskId,
          taskName: row.taskName,
          taskType: row.taskType as TaskExecutionLog['taskType'],
          triggerType: row.triggerType as TaskExecutionLog['triggerType'],
          triggerSource: row.triggerSource ?? null,
          status: row.status as TaskExecutionLog['status'],
          result: row.result ?? null,
          error: row.error ?? null,
          startedAt: row.startedAt,
          finishedAt: row.finishedAt,
          duration: row.duration,
        })),
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
