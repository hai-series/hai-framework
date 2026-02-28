/**
 * =============================================================================
 * @h-ai/scheduler - 数据库操作
 * =============================================================================
 *
 * 本文件封装定时任务模块的数据库相关逻辑，包括：
 * - 日志表的创建与初始化
 * - 执行日志的持久化
 * - 执行日志的查询
 *
 * @module scheduler-db
 * =============================================================================
 */

import type { Result } from '@h-ai/core'
import type { LogQueryOptions, SchedulerError, TaskExecutionLog } from './scheduler-types.js'

import { core, err, ok } from '@h-ai/core'

import { db } from '@h-ai/db'

import { SchedulerErrorCode } from './scheduler-config.js'
import { schedulerM } from './scheduler-i18n.js'

const logger = core.logger.child({ module: 'scheduler', scope: 'db' })

/** 校验表名只包含合法 SQL 标识符字符 */
const VALID_TABLE_NAME = /^\w+$/

// =============================================================================
// 日志表初始化
// =============================================================================

/**
 * 创建执行日志表
 *
 * @param tableName - 日志表名
 * @returns 创建结果
 */
export async function ensureLogTable(tableName: string): Promise<Result<void, SchedulerError>> {
  if (!VALID_TABLE_NAME.test(tableName)) {
    return err({
      code: SchedulerErrorCode.DB_SAVE_FAILED,
      message: schedulerM('scheduler_dbSaveFailed', { params: { error: `Invalid table name: ${tableName}` } }),
    })
  }

  try {
    const ddlResult = await db.ddl.createTable(tableName, {
      id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
      task_id: { type: 'TEXT', notNull: true },
      task_name: { type: 'TEXT', notNull: true },
      task_type: { type: 'TEXT', notNull: true },
      status: { type: 'TEXT', notNull: true },
      result: { type: 'TEXT' },
      error: { type: 'TEXT' },
      started_at: { type: 'INTEGER', notNull: true },
      finished_at: { type: 'INTEGER', notNull: true },
      duration: { type: 'INTEGER', notNull: true },
    })

    if (!ddlResult.success) {
      return err({
        code: SchedulerErrorCode.DB_SAVE_FAILED,
        message: schedulerM('scheduler_dbSaveFailed', { params: { error: ddlResult.error.message } }),
        cause: ddlResult.error,
      })
    }

    // 为 task_id 创建索引
    await db.ddl.createIndex(tableName, `idx_${tableName}_task_id`, {
      columns: ['task_id'],
    })

    return ok(undefined)
  }
  catch (error) {
    return err({
      code: SchedulerErrorCode.DB_SAVE_FAILED,
      message: schedulerM('scheduler_dbSaveFailed', {
        params: { error: error instanceof Error ? error.message : String(error) },
      }),
      cause: error,
    })
  }
}

// =============================================================================
// 日志持久化
// =============================================================================

/**
 * 保存执行日志到数据库
 *
 * @param tableName - 日志表名
 * @param log - 任务执行日志
 */
export async function saveLog(tableName: string, log: TaskExecutionLog): Promise<void> {
  if (!VALID_TABLE_NAME.test(tableName))
    return

  try {
    await db.sql.execute(
      `INSERT INTO ${tableName} (task_id, task_name, task_type, status, result, error, started_at, finished_at, duration) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [log.taskId, log.taskName, log.taskType, log.status, log.result, log.error, log.startedAt, log.finishedAt, log.duration],
    )
  }
  catch (error) {
    logger.error('Failed to save execution log', { taskId: log.taskId, error })
  }
}

// =============================================================================
// 日志查询
// =============================================================================

/**
 * 查询执行日志
 *
 * @param tableName - 日志表名
 * @param options - 查询选项
 * @returns 日志列表
 */
export async function queryLogs(tableName: string, options?: LogQueryOptions): Promise<Result<TaskExecutionLog[], SchedulerError>> {
  if (!VALID_TABLE_NAME.test(tableName)) {
    return err({
      code: SchedulerErrorCode.DB_SAVE_FAILED,
      message: schedulerM('scheduler_dbSaveFailed', { params: { error: `Invalid table name: ${tableName}` } }),
    })
  }

  const { taskId, status, limit = 50, offset = 0 } = options ?? {}

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

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const sql = `SELECT id, task_id, task_name, task_type, status, result, error, started_at, finished_at, duration FROM ${tableName} ${where} ORDER BY id DESC LIMIT ? OFFSET ?`
  params.push(limit, offset)

  const queryResult = await db.sql.query<Record<string, unknown>>(sql, params)
  if (!queryResult.success) {
    return err({
      code: SchedulerErrorCode.DB_SAVE_FAILED,
      message: schedulerM('scheduler_dbSaveFailed', { params: { error: queryResult.error.message } }),
      cause: queryResult.error,
    })
  }

  const logs: TaskExecutionLog[] = queryResult.data.map(row => ({
    id: row.id as number,
    taskId: row.task_id as string,
    taskName: row.task_name as string,
    taskType: row.task_type as 'js' | 'api',
    status: row.status as 'success' | 'failed',
    result: (row.result as string) ?? null,
    error: (row.error as string) ?? null,
    startedAt: row.started_at as number,
    finishedAt: row.finished_at as number,
    duration: row.duration as number,
  }))

  return ok(logs)
}
