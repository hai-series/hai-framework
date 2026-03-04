/**
 * @h-ai/scheduler — 数据库操作
 *
 * 本文件封装定时任务模块的数据库相关逻辑，包括： - 日志表的创建与初始化 - 执行日志的持久化 - 执行日志的查询 - 任务定义的持久化与加载
 * @module scheduler-db
 */

import type { Result } from '@h-ai/core'
import type { ApiTaskConfig, LogQueryOptions, SchedulerError, TaskDefinitionApi, TaskExecutionLog } from './scheduler-types.js'

import { core, err, ok } from '@h-ai/core'

import { reldb } from '@h-ai/reldb'

import { SchedulerErrorCode } from './scheduler-config.js'
import { schedulerM } from './scheduler-i18n.js'

const logger = core.logger.child({ module: 'scheduler', scope: 'db' })

/** 校验表名只包含合法 SQL 标识符字符 */
const VALID_TABLE_NAME = /^\w+$/

// ─── 日志表初始化 ───

/**
 * 创建执行日志表（含 task_id 索引）
 *
 * 若表已存在，由 `reldb.ddl.createTable` 内部处理幂等。
 * 表名必须满足 `/^\w+$/`，否则直接返回失败 Result。
 *
 * @param tableName - 日志表名（仅允许字母、数字、下划线）
 * @returns 成功返回 `ok(undefined)`；失败返回 `DB_SAVE_FAILED` 错误
 */
export async function ensureLogTable(tableName: string): Promise<Result<void, SchedulerError>> {
  if (!VALID_TABLE_NAME.test(tableName)) {
    return err({
      code: SchedulerErrorCode.DB_SAVE_FAILED,
      message: schedulerM('scheduler_dbSaveFailed', { params: { error: `Invalid table name: ${tableName}` } }),
    })
  }

  try {
    const ddlResult = await reldb.ddl.createTable(tableName, {
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
    await reldb.ddl.createIndex(tableName, `idx_${tableName}_task_id`, {
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

// ─── 任务定义表初始化 ───

/**
 * 创建任务定义持久化表
 *
 * 用于存储 API 类型的任务定义，启动时加载。
 * task_id 列设置唯一索引。
 *
 * @param taskTableName - 任务定义表名（仅允许字母、数字、下划线）
 * @returns 成功返回 `ok(undefined)`；失败返回 `DB_SAVE_FAILED` 错误
 */
export async function ensureTaskTable(taskTableName: string): Promise<Result<void, SchedulerError>> {
  if (!VALID_TABLE_NAME.test(taskTableName)) {
    return err({
      code: SchedulerErrorCode.DB_SAVE_FAILED,
      message: schedulerM('scheduler_dbSaveFailed', { params: { error: `Invalid table name: ${taskTableName}` } }),
    })
  }

  try {
    const ddlResult = await reldb.ddl.createTable(taskTableName, {
      id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
      task_id: { type: 'TEXT', notNull: true, unique: true },
      task_name: { type: 'TEXT', notNull: true },
      cron: { type: 'TEXT', notNull: true },
      task_type: { type: 'TEXT', notNull: true },
      enabled: { type: 'INTEGER', notNull: true, defaultValue: 1 },
      api_config: { type: 'TEXT' },
      created_at: { type: 'INTEGER', notNull: true },
      updated_at: { type: 'INTEGER', notNull: true },
    })

    if (!ddlResult.success) {
      return err({
        code: SchedulerErrorCode.DB_SAVE_FAILED,
        message: schedulerM('scheduler_dbSaveFailed', { params: { error: ddlResult.error.message } }),
        cause: ddlResult.error,
      })
    }

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

// ─── 任务定义持久化 ───

/**
 * 保存 API 任务定义到数据库
 *
 * 仅 API 类型任务可持久化（JS 任务的 handler 不可序列化）。
 * 使用 INSERT 方式写入，task_id 唯一约束保证不重复。
 *
 * @param taskTableName - 任务定义表名
 * @param task - API 类型任务定义
 * @returns 成功返回 `ok(undefined)`；失败返回 `DB_SAVE_FAILED` 错误
 */
export async function saveTaskDefinition(taskTableName: string, task: TaskDefinitionApi): Promise<Result<void, SchedulerError>> {
  if (!VALID_TABLE_NAME.test(taskTableName)) {
    return err({
      code: SchedulerErrorCode.DB_SAVE_FAILED,
      message: schedulerM('scheduler_dbSaveFailed', { params: { error: `Invalid table name: ${taskTableName}` } }),
    })
  }

  try {
    const now = Date.now()
    await reldb.sql.execute(
      `INSERT INTO ${taskTableName} (task_id, task_name, cron, task_type, enabled, api_config, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [task.id, task.name, task.cron, task.type, task.enabled !== false ? 1 : 0, JSON.stringify(task.api), now, now],
    )
    logger.debug('Task definition saved', { taskId: task.id })
    return ok(undefined)
  }
  catch (error) {
    logger.error('Failed to save task definition', { taskId: task.id, error })
    return err({
      code: SchedulerErrorCode.DB_SAVE_FAILED,
      message: schedulerM('scheduler_dbSaveFailed', {
        params: { error: error instanceof Error ? error.message : String(error) },
      }),
      cause: error,
    })
  }
}

/**
 * 更新持久化的任务定义
 *
 * 根据 task_id 更新指定字段（name、cron、enabled、api_config）。
 *
 * @param taskTableName - 任务定义表名
 * @param taskId - 任务 ID
 * @param updates - 需要更新的字段
 * @param updates.name - 任务名称
 * @param updates.cron - cron 表达式
 * @param updates.enabled - 是否启用
 * @param updates.api - API 调用配置
 * @returns 成功返回 `ok(undefined)`；失败返回 `DB_SAVE_FAILED` 错误
 */
export async function updateTaskDefinition(
  taskTableName: string,
  taskId: string,
  updates: { name?: string, cron?: string, enabled?: boolean, api?: ApiTaskConfig },
): Promise<Result<void, SchedulerError>> {
  if (!VALID_TABLE_NAME.test(taskTableName)) {
    return err({
      code: SchedulerErrorCode.DB_SAVE_FAILED,
      message: schedulerM('scheduler_dbSaveFailed', { params: { error: `Invalid table name: ${taskTableName}` } }),
    })
  }

  const setClauses: string[] = []
  const params: unknown[] = []

  if (updates.name !== undefined) {
    setClauses.push('task_name = ?')
    params.push(updates.name)
  }
  if (updates.cron !== undefined) {
    setClauses.push('cron = ?')
    params.push(updates.cron)
  }
  if (updates.enabled !== undefined) {
    setClauses.push('enabled = ?')
    params.push(updates.enabled ? 1 : 0)
  }
  if (updates.api !== undefined) {
    setClauses.push('api_config = ?')
    params.push(JSON.stringify(updates.api))
  }

  if (setClauses.length === 0) {
    return ok(undefined)
  }

  setClauses.push('updated_at = ?')
  params.push(Date.now())
  params.push(taskId)

  try {
    await reldb.sql.execute(
      `UPDATE ${taskTableName} SET ${setClauses.join(', ')} WHERE task_id = ?`,
      params,
    )
    logger.debug('Task definition updated', { taskId })
    return ok(undefined)
  }
  catch (error) {
    logger.error('Failed to update task definition', { taskId, error })
    return err({
      code: SchedulerErrorCode.DB_SAVE_FAILED,
      message: schedulerM('scheduler_dbSaveFailed', {
        params: { error: error instanceof Error ? error.message : String(error) },
      }),
      cause: error,
    })
  }
}

/**
 * 从数据库中删除任务定义
 *
 * @param taskTableName - 任务定义表名
 * @param taskId - 任务 ID
 * @returns 成功返回 `ok(undefined)`；失败返回 `DB_SAVE_FAILED` 错误
 */
export async function deleteTaskDefinition(taskTableName: string, taskId: string): Promise<Result<void, SchedulerError>> {
  if (!VALID_TABLE_NAME.test(taskTableName)) {
    return err({
      code: SchedulerErrorCode.DB_SAVE_FAILED,
      message: schedulerM('scheduler_dbSaveFailed', { params: { error: `Invalid table name: ${taskTableName}` } }),
    })
  }

  try {
    await reldb.sql.execute(
      `DELETE FROM ${taskTableName} WHERE task_id = ?`,
      [taskId],
    )
    logger.debug('Task definition deleted', { taskId })
    return ok(undefined)
  }
  catch (error) {
    logger.error('Failed to delete task definition', { taskId, error })
    return err({
      code: SchedulerErrorCode.DB_SAVE_FAILED,
      message: schedulerM('scheduler_dbSaveFailed', {
        params: { error: error instanceof Error ? error.message : String(error) },
      }),
      cause: error,
    })
  }
}

/**
 * 从数据库加载所有持久化的任务定义
 *
 * 仅加载 API 类型任务。返回 TaskDefinitionApi 数组。
 *
 * @param taskTableName - 任务定义表名
 * @returns 成功返回 API 任务定义数组；失败返回 `DB_SAVE_FAILED` 错误
 */
export async function loadTaskDefinitions(taskTableName: string): Promise<Result<TaskDefinitionApi[], SchedulerError>> {
  if (!VALID_TABLE_NAME.test(taskTableName)) {
    return err({
      code: SchedulerErrorCode.DB_SAVE_FAILED,
      message: schedulerM('scheduler_dbSaveFailed', { params: { error: `Invalid table name: ${taskTableName}` } }),
    })
  }

  try {
    const queryResult = await reldb.sql.query<Record<string, unknown>>(
      `SELECT task_id, task_name, cron, task_type, enabled, api_config FROM ${taskTableName}`,
    )

    if (!queryResult.success) {
      return err({
        code: SchedulerErrorCode.DB_SAVE_FAILED,
        message: schedulerM('scheduler_dbSaveFailed', { params: { error: queryResult.error.message } }),
        cause: queryResult.error,
      })
    }

    const tasks: TaskDefinitionApi[] = []
    for (const row of queryResult.data) {
      const taskId = row.task_id as string
      try {
        tasks.push({
          id: taskId,
          name: row.task_name as string,
          cron: row.cron as string,
          type: 'api' as const,
          enabled: (row.enabled as number) === 1,
          api: JSON.parse(row.api_config as string),
        })
      }
      catch (parseError) {
        logger.warn('Skipping task with invalid api_config JSON', { taskId, error: parseError })
      }
    }

    return ok(tasks)
  }
  catch (error) {
    logger.error('Failed to load task definitions', { error })
    return err({
      code: SchedulerErrorCode.DB_SAVE_FAILED,
      message: schedulerM('scheduler_dbSaveFailed', {
        params: { error: error instanceof Error ? error.message : String(error) },
      }),
      cause: error,
    })
  }
}

// ─── 日志持久化 ───

/**
 * 保存执行日志到数据库
 *
 * 使用参数化查询写入，不会抛出异常——写入失败仅记录日志。
 * 表名不合法时静默跳过。
 *
 * @param tableName - 日志表名（仅允许字母、数字、下划线）
 * @param log - 任务执行日志
 */
export async function saveLog(tableName: string, log: TaskExecutionLog): Promise<void> {
  if (!VALID_TABLE_NAME.test(tableName))
    return

  try {
    await reldb.sql.execute(
      `INSERT INTO ${tableName} (task_id, task_name, task_type, status, result, error, started_at, finished_at, duration) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [log.taskId, log.taskName, log.taskType, log.status, log.result, log.error, log.startedAt, log.finishedAt, log.duration],
    )
  }
  catch (error) {
    logger.error('Failed to save execution log', { taskId: log.taskId, error })
  }
}

// ─── 日志查询 ───

/**
 * 查询执行日志
 *
 * 支持按 taskId、status 过滤，以及分页（limit/offset）。
 * 所有过滤条件均使用参数化查询，防止 SQL 注入。
 * 结果按 id 降序排列（最新日志在前）。
 *
 * @param tableName - 日志表名（仅允许字母、数字、下划线）
 * @param options - 查询选项（taskId、status、limit、offset）
 * @returns 成功返回日志数组；表名非法或查询失败返回 `DB_SAVE_FAILED` 错误
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

  const queryResult = await reldb.sql.query<Record<string, unknown>>(sql, params)
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
