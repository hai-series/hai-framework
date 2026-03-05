/**
 * @h-ai/scheduler — 任务定义仓库
 *
 * 基于 @h-ai/reldb BaseReldbCrudRepository 实现任务定义的持久化与查询。
 * 仅 API 类型任务可持久化（JS 任务的 handler 不可序列化）。
 * @module scheduler-task-repository
 */

import type { Result } from '@h-ai/core'
import type { ReldbFunctions } from '@h-ai/reldb'
import type { SchedulerError, TaskDefinitionApi, TaskUpdateInput } from '../scheduler-types.js'

import { core, err, ok } from '@h-ai/core'
import { BaseReldbCrudRepository } from '@h-ai/reldb'

import { ApiTaskConfigSchema, SchedulerErrorCode } from '../scheduler-config.js'
import { schedulerM } from '../scheduler-i18n.js'

const logger = core.logger.child({ module: 'scheduler', scope: 'task-repository' })

// ─── 任务行类型（数据库行映射） ───

/** 任务定义数据库行 */
interface TaskRow {
  id: number
  taskId: string
  taskName: string
  cron: string
  taskType: string
  enabled: boolean
  apiConfig: unknown
  createdAt: Date
  updatedAt: Date
}

// ─── 仓库 ───

/**
 * 任务定义仓库
 *
 * 通过 BaseReldbCrudRepository 自动建表、字段映射与类型转换。
 * 此类仅供 scheduler-main.ts 内部使用，不通过 index.ts 对外导出。
 */
export class SchedulerTaskRepository extends BaseReldbCrudRepository<TaskRow> {
  constructor(db: ReldbFunctions, tableName: string) {
    super(db, {
      table: tableName,
      idColumn: 'id',
      fields: [
        { fieldName: 'id', columnName: 'id', def: { type: 'INTEGER', primaryKey: true, autoIncrement: true }, select: true, create: false, update: false },
        { fieldName: 'taskId', columnName: 'task_id', def: { type: 'TEXT', notNull: true, unique: true }, select: true, create: true, update: false },
        { fieldName: 'taskName', columnName: 'task_name', def: { type: 'TEXT', notNull: true }, select: true, create: true, update: true },
        { fieldName: 'cron', columnName: 'cron', def: { type: 'TEXT', notNull: true }, select: true, create: true, update: true },
        { fieldName: 'taskType', columnName: 'task_type', def: { type: 'TEXT', notNull: true }, select: true, create: true, update: false },
        { fieldName: 'enabled', columnName: 'enabled', def: { type: 'BOOLEAN', notNull: true, defaultValue: true }, select: true, create: true, update: true },
        { fieldName: 'apiConfig', columnName: 'api_config', def: { type: 'JSON' }, select: true, create: true, update: true },
        { fieldName: 'createdAt', columnName: 'created_at', def: { type: 'TIMESTAMP' }, select: true, create: true, update: false },
        { fieldName: 'updatedAt', columnName: 'updated_at', def: { type: 'TIMESTAMP' }, select: true, create: false, update: true },
      ],
    })
  }

  /**
   * 保存 API 任务定义
   *
   * @param task - API 类型任务定义
   * @returns 成功返回 ok(undefined)；失败返回 DB_SAVE_FAILED
   */
  async saveTask(task: TaskDefinitionApi): Promise<Result<void, SchedulerError>> {
    try {
      const now = new Date()
      const createResult = await this.create({
        taskId: task.id,
        taskName: task.name,
        cron: task.cron,
        taskType: task.type,
        enabled: task.enabled !== false,
        apiConfig: task.api,
        createdAt: now,
      })

      if (!createResult.success) {
        logger.error('Failed to save task definition', { taskId: task.id, error: createResult.error.message })
        return err({
          code: SchedulerErrorCode.DB_SAVE_FAILED,
          message: schedulerM('scheduler_dbSaveFailed', { params: { error: createResult.error.message } }),
          cause: createResult.error,
        })
      }

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
   * 根据 task_id 查找行并更新指定字段。
   *
   * @param taskId - 任务 ID
   * @param updates - 需要更新的字段
   * @returns 成功返回 ok(undefined)；失败返回 DB_SAVE_FAILED
   */
  async updateTask(taskId: string, updates: TaskUpdateInput): Promise<Result<void, SchedulerError>> {
    try {
      // 查找行 ID
      const rows = await this.findAll({ where: 'task_id = ?', params: [taskId], limit: 1 })
      if (!rows.success) {
        return err({
          code: SchedulerErrorCode.DB_SAVE_FAILED,
          message: schedulerM('scheduler_dbSaveFailed', { params: { error: rows.error.message } }),
          cause: rows.error,
        })
      }

      if (rows.data.length === 0) {
        return ok(undefined)
      }

      const row = rows.data[0]
      const data: Partial<TaskRow> = {}
      if (updates.name !== undefined)
        data.taskName = updates.name
      if (updates.cron !== undefined)
        data.cron = updates.cron
      if (updates.enabled !== undefined)
        data.enabled = updates.enabled
      if (updates.api !== undefined)
        data.apiConfig = updates.api

      if (Object.keys(data).length === 0) {
        return ok(undefined)
      }

      const updateResult = await this.updateById(row.id, data)
      if (!updateResult.success) {
        logger.error('Failed to update task definition', { taskId, error: updateResult.error.message })
        return err({
          code: SchedulerErrorCode.DB_SAVE_FAILED,
          message: schedulerM('scheduler_dbSaveFailed', { params: { error: updateResult.error.message } }),
          cause: updateResult.error,
        })
      }

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
   * 删除任务定义
   *
   * @param taskId - 任务 ID
   * @returns 成功返回 ok(undefined)；失败返回 DB_SAVE_FAILED
   */
  async deleteTask(taskId: string): Promise<Result<void, SchedulerError>> {
    try {
      const rows = await this.findAll({ where: 'task_id = ?', params: [taskId], limit: 1 })
      if (!rows.success) {
        return err({
          code: SchedulerErrorCode.DB_SAVE_FAILED,
          message: schedulerM('scheduler_dbSaveFailed', { params: { error: rows.error.message } }),
          cause: rows.error,
        })
      }

      if (rows.data.length === 0) {
        return ok(undefined)
      }

      const deleteResult = await this.deleteById(rows.data[0].id)
      if (!deleteResult.success) {
        logger.error('Failed to delete task definition', { taskId, error: deleteResult.error.message })
        return err({
          code: SchedulerErrorCode.DB_SAVE_FAILED,
          message: schedulerM('scheduler_dbSaveFailed', { params: { error: deleteResult.error.message } }),
          cause: deleteResult.error,
        })
      }

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
   * 加载所有持久化的任务定义
   *
   * 从数据库加载所有行，校验 api_config JSON 格式，返回 TaskDefinitionApi 数组。
   *
   * @returns 成功返回 API 任务定义数组；失败返回 DB_SAVE_FAILED
   */
  async loadTasks(): Promise<Result<TaskDefinitionApi[], SchedulerError>> {
    try {
      const rows = await this.findAll({ orderBy: 'id ASC' })
      if (!rows.success) {
        return err({
          code: SchedulerErrorCode.DB_SAVE_FAILED,
          message: schedulerM('scheduler_dbSaveFailed', { params: { error: rows.error.message } }),
          cause: rows.error,
        })
      }

      const tasks: TaskDefinitionApi[] = []
      for (const row of rows.data) {
        // 校验 api_config 结构
        const apiParsed = ApiTaskConfigSchema.safeParse(row.apiConfig)
        if (!apiParsed.success) {
          logger.warn('Skipping task with invalid api_config structure', { taskId: row.taskId, error: apiParsed.error.message })
          continue
        }

        tasks.push({
          id: row.taskId,
          name: row.taskName,
          cron: row.cron,
          type: 'api' as const,
          enabled: row.enabled,
          api: apiParsed.data,
        })
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
}
