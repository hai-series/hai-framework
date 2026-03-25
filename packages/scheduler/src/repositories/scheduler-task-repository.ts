/**
 * @h-ai/scheduler — 任务定义仓库
 *
 * 基于 @h-ai/reldb BaseReldbCrudRepository 实现统一任务定义的持久化与查询。
 * @module scheduler-task-repository
 */

import type { HaiResult } from '@h-ai/core'
import type { ReldbFunctions } from '@h-ai/reldb'

import type { TaskDefinition, TaskUpdateInput } from '../scheduler-types.js'
import { core, err, ok } from '@h-ai/core'
import { BaseReldbCrudRepository } from '@h-ai/reldb'
import { z } from 'zod'

import { schedulerM } from '../scheduler-i18n.js'
import { HaiSchedulerError } from '../scheduler-types.js'

const logger = core.logger.child({ module: 'scheduler', scope: 'task-repository' })

const SCHEDULER_TASK_TABLE = 'hai_scheduler_tasks'

const TaskParamsSchema = z.record(z.string(), z.unknown())
const TaskRetryPolicySchema = z.object({
  maxAttempts: z.number().int().min(1),
  backoffMs: z.array(z.number().int().min(0)).optional(),
})
const ApiTaskConfigSchema = z.object({
  kind: z.literal('api'),
  url: z.string().min(1),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.unknown().optional(),
  timeout: z.number().int().positive().optional(),
})
const JsTaskConfigSchema = z.object({
  kind: z.literal('js'),
  code: z.string().min(1),
  timeout: z.number().int().positive().optional(),
})
const TaskHandlerConfigSchema = z.discriminatedUnion('kind', [ApiTaskConfigSchema, JsTaskConfigSchema])

interface TaskRow {
  id: number
  taskId: string
  taskName: string
  description: string | null
  cron: string
  enabled: boolean
  deleteAfterRun: boolean
  retry: unknown
  params: unknown
  handler: unknown
  createdAt: Date
  updatedAt: Date
}

export class SchedulerTaskRepository extends BaseReldbCrudRepository<TaskRow> {
  constructor(db: ReldbFunctions) {
    super(db, {
      table: SCHEDULER_TASK_TABLE,
      idColumn: 'id',
      fields: [
        { fieldName: 'id', columnName: 'id', def: { type: 'INTEGER', primaryKey: true, autoIncrement: true }, select: true, create: false, update: false },
        { fieldName: 'taskId', columnName: 'task_id', def: { type: 'TEXT', notNull: true, unique: true }, select: true, create: true, update: false },
        { fieldName: 'taskName', columnName: 'task_name', def: { type: 'TEXT', notNull: true }, select: true, create: true, update: true },
        { fieldName: 'description', columnName: 'description', def: { type: 'TEXT' }, select: true, create: true, update: true },
        { fieldName: 'cron', columnName: 'cron', def: { type: 'TEXT', notNull: true }, select: true, create: true, update: true },
        { fieldName: 'enabled', columnName: 'enabled', def: { type: 'BOOLEAN', notNull: true, defaultValue: true }, select: true, create: true, update: true },
        { fieldName: 'deleteAfterRun', columnName: 'delete_after_run', def: { type: 'BOOLEAN', notNull: true, defaultValue: false }, select: true, create: true, update: true },
        { fieldName: 'retry', columnName: 'retry', def: { type: 'JSON' }, select: true, create: true, update: true },
        { fieldName: 'params', columnName: 'params', def: { type: 'JSON' }, select: true, create: true, update: true },
        { fieldName: 'handler', columnName: 'handler', def: { type: 'JSON' }, select: true, create: true, update: true },
        { fieldName: 'createdAt', columnName: 'created_at', def: { type: 'TIMESTAMP' }, select: true, create: true, update: false },
        { fieldName: 'updatedAt', columnName: 'updated_at', def: { type: 'TIMESTAMP' }, select: true, create: false, update: true },
      ],
    })
  }

  async saveTask(task: TaskDefinition): Promise<HaiResult<void>> {
    try {
      const createResult = await this.create({
        taskId: task.id,
        taskName: task.name,
        description: task.description ?? null,
        cron: task.cron,
        enabled: task.enabled !== false,
        deleteAfterRun: task.deleteAfterRun === true,
        retry: task.retry ?? null,
        params: task.params ?? {},
        handler: task.handler ?? null,
        createdAt: new Date(),
      })

      if (!createResult.success) {
        logger.error('Failed to save task definition', { taskId: task.id, error: createResult.error.message })
        return err(
          HaiSchedulerError.DB_SAVE_FAILED,
          schedulerM('scheduler_dbSaveFailed', { params: { error: createResult.error.message } }),
          createResult.error,
        )
      }

      return ok(undefined)
    }
    catch (error) {
      logger.error('Failed to save task definition', { taskId: task.id, error })
      return err(
        HaiSchedulerError.DB_SAVE_FAILED,
        schedulerM('scheduler_dbSaveFailed', {
          params: { error: error instanceof Error ? error.message : String(error) },
        }),
        error,
      )
    }
  }

  async updateTask(taskId: string, updates: TaskUpdateInput): Promise<HaiResult<void>> {
    try {
      const rows = await this.findAll({ where: 'task_id = ?', params: [taskId], limit: 1 })
      if (!rows.success) {
        return err(
          HaiSchedulerError.DB_SAVE_FAILED,
          schedulerM('scheduler_dbSaveFailed', { params: { error: rows.error.message } }),
          rows.error,
        )
      }

      if (rows.data.length === 0)
        return ok(undefined)

      const data: Partial<TaskRow> = {}
      if (updates.name !== undefined)
        data.taskName = updates.name
      if (updates.description !== undefined)
        data.description = updates.description ?? null
      if (updates.cron !== undefined)
        data.cron = updates.cron
      if (updates.enabled !== undefined)
        data.enabled = updates.enabled
      if (updates.deleteAfterRun !== undefined)
        data.deleteAfterRun = updates.deleteAfterRun
      if (updates.retry !== undefined)
        data.retry = updates.retry ?? null
      if (updates.params !== undefined)
        data.params = updates.params
      if (updates.handler !== undefined)
        data.handler = updates.handler ?? null

      data.updatedAt = new Date()

      if (Object.keys(data).length <= 1)
        return ok(undefined)

      const updateResult = await this.updateById(rows.data[0].id, data)
      if (!updateResult.success) {
        logger.error('Failed to update task definition', { taskId, error: updateResult.error.message })
        return err(
          HaiSchedulerError.DB_SAVE_FAILED,
          schedulerM('scheduler_dbSaveFailed', { params: { error: updateResult.error.message } }),
          updateResult.error,
        )
      }

      return ok(undefined)
    }
    catch (error) {
      logger.error('Failed to update task definition', { taskId, error })
      return err(
        HaiSchedulerError.DB_SAVE_FAILED,
        schedulerM('scheduler_dbSaveFailed', {
          params: { error: error instanceof Error ? error.message : String(error) },
        }),
        error,
      )
    }
  }

  async deleteTask(taskId: string): Promise<HaiResult<void>> {
    try {
      const rows = await this.findAll({ where: 'task_id = ?', params: [taskId], limit: 1 })
      if (!rows.success) {
        return err(
          HaiSchedulerError.DB_SAVE_FAILED,
          schedulerM('scheduler_dbSaveFailed', { params: { error: rows.error.message } }),
          rows.error,
        )
      }

      if (rows.data.length === 0)
        return ok(undefined)

      const deleteResult = await this.deleteById(rows.data[0].id)
      if (!deleteResult.success) {
        logger.error('Failed to delete task definition', { taskId, error: deleteResult.error.message })
        return err(
          HaiSchedulerError.DB_SAVE_FAILED,
          schedulerM('scheduler_dbSaveFailed', { params: { error: deleteResult.error.message } }),
          deleteResult.error,
        )
      }

      return ok(undefined)
    }
    catch (error) {
      logger.error('Failed to delete task definition', { taskId, error })
      return err(
        HaiSchedulerError.DB_SAVE_FAILED,
        schedulerM('scheduler_dbSaveFailed', {
          params: { error: error instanceof Error ? error.message : String(error) },
        }),
        error,
      )
    }
  }

  async loadTasks(): Promise<HaiResult<TaskDefinition[]>> {
    try {
      const rows = await this.findAll({ orderBy: 'id ASC' })
      if (!rows.success) {
        return err(
          HaiSchedulerError.DB_SAVE_FAILED,
          schedulerM('scheduler_dbSaveFailed', { params: { error: rows.error.message } }),
          rows.error,
        )
      }

      const tasks: TaskDefinition[] = []
      for (const row of rows.data) {
        const paramsResult = TaskParamsSchema.safeParse(row.params ?? {})
        if (!paramsResult.success) {
          logger.warn('Skipping task with invalid params', { taskId: row.taskId, error: paramsResult.error.message })
          continue
        }

        const handlerResult = row.handler == null
          ? { success: true as const, data: undefined }
          : TaskHandlerConfigSchema.safeParse(row.handler)

        if (!handlerResult.success) {
          logger.warn('Skipping task with invalid handler config', { taskId: row.taskId, error: handlerResult.error.message })
          continue
        }

        const retryResult = row.retry == null
          ? { success: true as const, data: undefined }
          : TaskRetryPolicySchema.safeParse(row.retry)

        if (!retryResult.success) {
          logger.warn('Skipping task with invalid retry policy', { taskId: row.taskId, error: retryResult.error.message })
          continue
        }

        tasks.push({
          id: row.taskId,
          name: row.taskName,
          ...(row.description ? { description: row.description } : {}),
          cron: row.cron,
          enabled: row.enabled,
          deleteAfterRun: row.deleteAfterRun,
          ...(retryResult.data ? { retry: retryResult.data } : {}),
          params: paramsResult.data,
          ...(handlerResult.data ? { handler: handlerResult.data } : {}),
        })
      }

      return ok(tasks)
    }
    catch (error) {
      logger.error('Failed to load task definitions', { error })
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
