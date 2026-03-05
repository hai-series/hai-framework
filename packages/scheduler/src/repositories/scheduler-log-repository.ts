/**
 * @h-ai/scheduler — 执行日志仓库
 *
 * 基于 @h-ai/reldb BaseReldbCrudRepository 实现执行日志的持久化与查询。
 * @module scheduler-log-repository
 */

import type { Result } from '@h-ai/core'
import type { ReldbFunctions } from '@h-ai/reldb'
import type { LogQueryOptions, SchedulerError, TaskExecutionLog } from '../scheduler-types.js'

import { core, err, ok } from '@h-ai/core'
import { BaseReldbCrudRepository } from '@h-ai/reldb'

import { SchedulerErrorCode } from '../scheduler-config.js'
import { schedulerM } from '../scheduler-i18n.js'

const logger = core.logger.child({ module: 'scheduler', scope: 'log-repository' })

// ─── 日志行类型（数据库行映射） ───

/** 执行日志数据库行 */
interface LogRow {
  id: number
  taskId: string
  taskName: string
  taskType: string
  status: string
  result: string | null
  error: string | null
  startedAt: number
  finishedAt: number
  duration: number
}

// ─── 仓库 ───

/**
 * 执行日志仓库
 *
 * 通过 BaseReldbCrudRepository 自动建表、字段映射与类型转换。
 * 此类仅供 scheduler-main.ts 内部使用，不通过 index.ts 对外导出。
 */
export class SchedulerLogRepository extends BaseReldbCrudRepository<LogRow> {
  constructor(db: ReldbFunctions, tableName: string) {
    super(db, {
      table: tableName,
      idColumn: 'id',
      fields: [
        { fieldName: 'id', columnName: 'id', def: { type: 'INTEGER', primaryKey: true, autoIncrement: true }, select: true, create: false, update: false },
        { fieldName: 'taskId', columnName: 'task_id', def: { type: 'TEXT', notNull: true }, select: true, create: true, update: false },
        { fieldName: 'taskName', columnName: 'task_name', def: { type: 'TEXT', notNull: true }, select: true, create: true, update: false },
        { fieldName: 'taskType', columnName: 'task_type', def: { type: 'TEXT', notNull: true }, select: true, create: true, update: false },
        { fieldName: 'status', columnName: 'status', def: { type: 'TEXT', notNull: true }, select: true, create: true, update: false },
        { fieldName: 'result', columnName: 'result', def: { type: 'TEXT' }, select: true, create: true, update: false },
        { fieldName: 'error', columnName: 'error', def: { type: 'TEXT' }, select: true, create: true, update: false },
        { fieldName: 'startedAt', columnName: 'started_at', def: { type: 'INTEGER', notNull: true }, select: true, create: true, update: false },
        { fieldName: 'finishedAt', columnName: 'finished_at', def: { type: 'INTEGER', notNull: true }, select: true, create: true, update: false },
        { fieldName: 'duration', columnName: 'duration', def: { type: 'INTEGER', notNull: true }, select: true, create: true, update: false },
      ],
    })
  }

  /**
   * 保存执行日志
   *
   * @param log - 任务执行日志
   */
  async saveLog(log: TaskExecutionLog): Promise<void> {
    try {
      const createResult = await this.create({
        taskId: log.taskId,
        taskName: log.taskName,
        taskType: log.taskType,
        status: log.status,
        result: log.result,
        error: log.error,
        startedAt: log.startedAt,
        finishedAt: log.finishedAt,
        duration: log.duration,
      })

      if (!createResult.success) {
        logger.error('Failed to save execution log', { taskId: log.taskId, error: createResult.error.message })
      }
    }
    catch (error) {
      logger.error('Failed to save execution log', { taskId: log.taskId, error })
    }
  }

  /**
   * 查询执行日志
   *
   * 支持按 taskId、status 过滤，以及分页（limit/offset）。
   * 结果按 id 降序排列（最新日志在前）。
   *
   * @param options - 查询选项（taskId、status、limit、offset）
   * @returns 成功返回日志数组；查询失败返回 DB_SAVE_FAILED
   */
  async queryLogs(options?: LogQueryOptions): Promise<Result<TaskExecutionLog[], SchedulerError>> {
    const { taskId, status, limit: rawLimit = 50, offset: rawOffset = 0 } = options ?? {}
    const limit = Math.max(1, Math.min(rawLimit, 1000))
    const offset = Math.max(0, rawOffset)

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

    const where = conditions.length > 0 ? conditions.join(' AND ') : undefined

    try {
      const rows = await this.findAll({
        where,
        params: params.length > 0 ? params : undefined,
        orderBy: 'id DESC',
        limit,
        offset,
      })

      if (!rows.success) {
        return err({
          code: SchedulerErrorCode.DB_SAVE_FAILED,
          message: schedulerM('scheduler_dbSaveFailed', { params: { error: rows.error.message } }),
          cause: rows.error,
        })
      }

      const logs: TaskExecutionLog[] = rows.data.map(row => ({
        id: row.id,
        taskId: row.taskId,
        taskName: row.taskName,
        taskType: row.taskType as 'js' | 'api',
        status: row.status as 'success' | 'failed',
        result: row.result ?? null,
        error: row.error ?? null,
        startedAt: row.startedAt,
        finishedAt: row.finishedAt,
        duration: row.duration,
      }))

      return ok(logs)
    }
    catch (error) {
      logger.error('Failed to query execution logs', { error })
      return err({
        code: SchedulerErrorCode.DB_SAVE_FAILED,
        message: schedulerM('scheduler_dbSaveFailed', {
          params: { error: error instanceof Error ? error.message : String(error) },
        }),
        cause: error,
      })
    }
  }
}
