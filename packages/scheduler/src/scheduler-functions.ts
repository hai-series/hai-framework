/**
 * @h-ai/scheduler — 业务函数
 *
 * 职责：
 * - 维护任务注册表（内存 Map）、cron 实例缓存、全局生命周期回调（hooks）状态
 * - 实现任务注册 / 注销 / 更新 / 批量加载等业务逻辑
 * - 实现执行日志分页查询
 *
 * 此文件不感知定时器、分布式锁、执行并发等调度运行细节，那些由 scheduler-runner.ts 负责。
 * @module scheduler-functions
 */

import type { HaiResult, PaginatedResult } from '@h-ai/core'
import type { Cron } from 'croner'
import type { SchedulerLogRepository, SchedulerTaskRepository } from './repositories/index.js'
import type { LogQueryOptions, SchedulerTaskHooks, TaskDefinition, TaskExecutionLog, TaskRetryPolicy, TaskUpdateInput } from './scheduler-types.js'

import { core, err, ok } from '@h-ai/core'

import { parseCronExpression } from './scheduler-cron.js'
import { schedulerM } from './scheduler-i18n.js'
import { HaiSchedulerError } from './scheduler-types.js'

const logger = core.logger.child({ module: 'scheduler', scope: 'functions' })

// ─── 任务注册表状态 ───

/** 已注册任务（键：taskId） */
const taskRegistry = new Map<string, TaskDefinition>()

/** 解析后的 Cron 实例缓存（键：taskId） */
const cronCache = new Map<string, Cron>()

/** 当前全局生命周期回调 */
let currentHooks: SchedulerTaskHooks = {}

// ─── 任务注册表访问器 ───

export function getTaskRegistry(): ReadonlyMap<string, TaskDefinition> {
  return taskRegistry
}

export function getTask(taskId: string): TaskDefinition | undefined {
  return taskRegistry.get(taskId)
}

export function hasTask(taskId: string): boolean {
  return taskRegistry.has(taskId)
}

export function setTask(taskId: string, task: TaskDefinition): void {
  taskRegistry.set(taskId, task)
}

export function deleteTask(taskId: string): void {
  taskRegistry.delete(taskId)
}

// ─── Cron 缓存访问器 ───

export function getCron(taskId: string): Cron | undefined {
  return cronCache.get(taskId)
}

export function setCron(taskId: string, cron: Cron): void {
  cronCache.set(taskId, cron)
}

export function deleteCron(taskId: string): void {
  cronCache.delete(taskId)
}

// ─── 生命周期回调访问器 ───

export function setHooks(hooks: SchedulerTaskHooks): void {
  currentHooks = { ...hooks }
}

export function clearHooks(): void {
  currentHooks = {}
}

export function getHooks(): Readonly<SchedulerTaskHooks> {
  return currentHooks
}

// ─── 重置（供 close() 调用） ───

export function resetTaskState(): void {
  taskRegistry.clear()
  cronCache.clear()
  currentHooks = {}
}

function normalizeTaskDescription(description: string | undefined): string | undefined {
  if (description === undefined)
    return undefined

  const trimmed = description.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function validateRetryPolicy(taskId: string, retry: TaskRetryPolicy): HaiResult<TaskRetryPolicy> {
  if (!Number.isInteger(retry.maxAttempts) || retry.maxAttempts < 1) {
    return err(
      HaiSchedulerError.EXECUTION_FAILED,
      schedulerM('scheduler_invalidRetryConfig', { params: { taskId } }),
    )
  }

  if (retry.backoffMs !== undefined) {
    const hasInvalidBackoff = retry.backoffMs.some(ms => !Number.isInteger(ms) || ms < 0)
    if (hasInvalidBackoff) {
      return err(
        HaiSchedulerError.EXECUTION_FAILED,
        schedulerM('scheduler_invalidRetryConfig', { params: { taskId } }),
      )
    }
  }

  return ok({
    maxAttempts: retry.maxAttempts,
    ...(retry.backoffMs ? { backoffMs: [...retry.backoffMs] } : {}),
  })
}

// ─── 业务函数 ───

export async function loadPersistedTasks(taskRepo: SchedulerTaskRepository | null): Promise<void> {
  if (!taskRepo)
    return

  const loadResult = await taskRepo.loadTasks()
  if (!loadResult.success) {
    logger.warn('Failed to load persisted tasks', { error: loadResult.error.message })
    return
  }

  let loadedCount = 0
  for (const task of loadResult.data) {
    const registerResult = await registerTask(task)
    if (registerResult.success) {
      loadedCount++
      logger.debug('Loaded persisted task', { taskId: task.id, taskName: task.name })
      continue
    }

    logger.warn('Failed to load persisted task', { taskId: task.id, error: registerResult.error.message })
  }

  if (loadedCount > 0)
    logger.info('Loaded persisted tasks', { count: loadedCount })
}

export async function loadConfigTasks(tasks: TaskDefinition[]): Promise<void> {
  let loadedCount = 0
  for (const task of tasks) {
    if (!task.id) {
      logger.warn('Skipping config task with empty id')
      continue
    }

    if (hasTask(task.id)) {
      logger.debug('Skipping config task, already registered from DB', { taskId: task.id })
      continue
    }

    const registerResult = await registerTask(task)
    if (registerResult.success) {
      loadedCount++
      logger.debug('Loaded config task', { taskId: task.id, taskName: task.name })
      continue
    }

    logger.warn('Failed to load config task', { taskId: task.id, error: registerResult.error.message })
  }

  if (loadedCount > 0)
    logger.info('Loaded config tasks', { count: loadedCount })
}

export async function registerTask(
  task: TaskDefinition,
  taskRepo?: SchedulerTaskRepository | null,
): Promise<HaiResult<void>> {
  if (!task.id) {
    return err(
      HaiSchedulerError.EXECUTION_FAILED,
      schedulerM('scheduler_taskIdEmpty'),
    )
  }

  if (hasTask(task.id)) {
    return err(
      HaiSchedulerError.TASK_ALREADY_EXISTS,
      schedulerM('scheduler_taskAlreadyExists', { params: { taskId: task.id } }),
    )
  }

  const cronResult = parseCronExpression(task.cron)
  if (!cronResult.success)
    return cronResult

  const retryResult = task.retry ? validateRetryPolicy(task.id, task.retry) : ok(undefined)
  if (!retryResult.success)
    return retryResult

  const normalizedTask: TaskDefinition = {
    ...task,
    description: normalizeTaskDescription(task.description),
    enabled: task.enabled !== false,
    deleteAfterRun: task.deleteAfterRun === true,
    retry: retryResult.data,
    params: task.params ?? {},
  }

  setTask(task.id, normalizedTask)
  setCron(task.id, cronResult.data)

  if (taskRepo) {
    const saveResult = await taskRepo.saveTask(normalizedTask)
    if (!saveResult.success) {
      // 持久化失败：回滚内存状态，避免内存与 DB 之间的状态漂移
      logger.warn('Failed to persist task definition, rolling back in-memory registration', { taskId: task.id, error: saveResult.error.message })
      deleteTask(task.id)
      deleteCron(task.id)
      return err(
        HaiSchedulerError.DB_SAVE_FAILED,
        schedulerM('scheduler_dbSaveFailed', { params: { error: saveResult.error.message } }),
        saveResult.error,
      )
    }
  }

  return ok(undefined)
}

export async function unregisterTask(
  taskId: string,
  taskRepo?: SchedulerTaskRepository | null,
): Promise<HaiResult<void>> {
  if (!hasTask(taskId)) {
    return err(
      HaiSchedulerError.TASK_NOT_FOUND,
      schedulerM('scheduler_taskNotFound', { params: { taskId } }),
    )
  }

  deleteTask(taskId)
  deleteCron(taskId)

  if (taskRepo) {
    const deleteResult = await taskRepo.deleteTask(taskId)
    if (!deleteResult.success) {
      // 持久化删除失败：不回滚内存（任务已不应再被调度），但将错误上报给调用方
      logger.warn('Failed to delete persisted task definition', { taskId, error: deleteResult.error.message })
      return err(
        HaiSchedulerError.DB_SAVE_FAILED,
        schedulerM('scheduler_dbSaveFailed', { params: { error: deleteResult.error.message } }),
        deleteResult.error,
      )
    }
  }

  return ok(undefined)
}

export async function updateRegisteredTask(
  taskId: string,
  updates: TaskUpdateInput,
  taskRepo?: SchedulerTaskRepository | null,
): Promise<HaiResult<void>> {
  const existingTask = getTask(taskId)
  if (!existingTask) {
    return err(
      HaiSchedulerError.TASK_NOT_FOUND,
      schedulerM('scheduler_taskNotFound', { params: { taskId } }),
    )
  }

  // 提前保存旧 cron 实例，供 DB 失败时回滚使用
  const existingCron = getCron(taskId)

  if (updates.cron !== undefined) {
    const cronResult = parseCronExpression(updates.cron)
    if (!cronResult.success)
      return cronResult

    setCron(taskId, cronResult.data)
  }

  let normalizedRetry: TaskRetryPolicy | null | undefined
  if (updates.retry !== undefined) {
    if (updates.retry === null) {
      normalizedRetry = null
    }
    else {
      const retryResult = validateRetryPolicy(taskId, updates.retry)
      if (!retryResult.success)
        return retryResult

      normalizedRetry = retryResult.data
    }
  }

  const normalizedDescription = updates.description !== undefined
    ? normalizeTaskDescription(updates.description)
    : undefined

  const normalizedUpdates: TaskUpdateInput = {
    ...updates,
    ...(updates.description !== undefined ? { description: normalizedDescription } : {}),
    ...(updates.retry !== undefined ? { retry: normalizedRetry } : {}),
  }

  const updatedTask: TaskDefinition = {
    ...existingTask,
    ...(normalizedUpdates.name !== undefined ? { name: normalizedUpdates.name } : {}),
    ...(normalizedUpdates.description !== undefined ? { description: normalizedUpdates.description } : {}),
    ...(normalizedUpdates.cron !== undefined ? { cron: normalizedUpdates.cron } : {}),
    ...(normalizedUpdates.enabled !== undefined ? { enabled: normalizedUpdates.enabled } : {}),
    ...(normalizedUpdates.deleteAfterRun !== undefined ? { deleteAfterRun: normalizedUpdates.deleteAfterRun } : {}),
    ...(normalizedUpdates.retry !== undefined ? { retry: normalizedUpdates.retry ?? undefined } : {}),
    ...(normalizedUpdates.params !== undefined ? { params: normalizedUpdates.params } : {}),
    ...(normalizedUpdates.handler !== undefined ? { handler: normalizedUpdates.handler ?? undefined } : {}),
  }

  setTask(taskId, updatedTask)

  if (taskRepo) {
    const updateResult = await taskRepo.updateTask(taskId, normalizedUpdates)
    if (!updateResult.success) {
      // 持久化更新失败：回滚内存状态，避免内存与 DB 之间的状态漂移
      logger.warn('Failed to update persisted task definition, rolling back in-memory update', { taskId, error: updateResult.error.message })
      setTask(taskId, existingTask)
      if (updates.cron !== undefined && existingCron)
        setCron(taskId, existingCron)
      return err(
        HaiSchedulerError.DB_SAVE_FAILED,
        schedulerM('scheduler_dbSaveFailed', { params: { error: updateResult.error.message } }),
        updateResult.error,
      )
    }
  }

  return ok(undefined)
}

export async function queryTaskLogs(
  logRepo: SchedulerLogRepository | null,
  options?: LogQueryOptions,
): Promise<HaiResult<PaginatedResult<TaskExecutionLog>>> {
  if (!logRepo) {
    return err(
      HaiSchedulerError.DB_SAVE_FAILED,
      schedulerM('scheduler_dbNotInitialized'),
    )
  }

  return logRepo.queryLogs(options)
}
