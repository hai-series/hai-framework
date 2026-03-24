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

import type { PaginatedResult, Result } from '@h-ai/core'
import type { Cron } from 'croner'
import type { SchedulerLogRepository, SchedulerTaskRepository } from './repositories/index.js'
import type { LogQueryOptions, SchedulerError, SchedulerTaskHooks, TaskDefinition, TaskExecutionLog, TaskUpdateInput } from './scheduler-types.js'

import { core, err, ok } from '@h-ai/core'

import { SchedulerErrorCode } from './scheduler-config.js'
import { parseCronExpression } from './scheduler-cron.js'
import { schedulerM } from './scheduler-i18n.js'

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
): Promise<Result<void, SchedulerError>> {
  if (!task.id) {
    return err({
      code: SchedulerErrorCode.EXECUTION_FAILED,
      message: schedulerM('scheduler_taskIdEmpty'),
    })
  }

  if (hasTask(task.id)) {
    return err({
      code: SchedulerErrorCode.TASK_ALREADY_EXISTS,
      message: schedulerM('scheduler_taskAlreadyExists', { params: { taskId: task.id } }),
    })
  }

  const cronResult = parseCronExpression(task.cron)
  if (!cronResult.success)
    return cronResult

  const normalizedTask: TaskDefinition = {
    ...task,
    enabled: task.enabled !== false,
    params: task.params ?? {},
  }

  setTask(task.id, normalizedTask)
  setCron(task.id, cronResult.data)

  if (taskRepo) {
    const saveResult = await taskRepo.saveTask(normalizedTask)
    if (!saveResult.success) {
      logger.warn('Failed to persist task definition', { taskId: task.id, error: saveResult.error.message })
    }
  }

  return ok(undefined)
}

export async function unregisterTask(
  taskId: string,
  taskRepo?: SchedulerTaskRepository | null,
): Promise<Result<void, SchedulerError>> {
  if (!hasTask(taskId)) {
    return err({
      code: SchedulerErrorCode.TASK_NOT_FOUND,
      message: schedulerM('scheduler_taskNotFound', { params: { taskId } }),
    })
  }

  deleteTask(taskId)
  deleteCron(taskId)

  if (taskRepo) {
    const deleteResult = await taskRepo.deleteTask(taskId)
    if (!deleteResult.success) {
      logger.warn('Failed to delete persisted task definition', { taskId, error: deleteResult.error.message })
    }
  }

  return ok(undefined)
}

export async function updateRegisteredTask(
  taskId: string,
  updates: TaskUpdateInput,
  taskRepo?: SchedulerTaskRepository | null,
): Promise<Result<void, SchedulerError>> {
  const existingTask = getTask(taskId)
  if (!existingTask) {
    return err({
      code: SchedulerErrorCode.TASK_NOT_FOUND,
      message: schedulerM('scheduler_taskNotFound', { params: { taskId } }),
    })
  }

  if (updates.cron !== undefined) {
    const cronResult = parseCronExpression(updates.cron)
    if (!cronResult.success)
      return cronResult

    setCron(taskId, cronResult.data)
  }

  const updatedTask: TaskDefinition = {
    ...existingTask,
    ...(updates.name !== undefined ? { name: updates.name } : {}),
    ...(updates.cron !== undefined ? { cron: updates.cron } : {}),
    ...(updates.enabled !== undefined ? { enabled: updates.enabled } : {}),
    ...(updates.params !== undefined ? { params: updates.params } : {}),
    ...(updates.handler !== undefined ? { handler: updates.handler ?? undefined } : {}),
  }

  setTask(taskId, updatedTask)

  if (taskRepo) {
    const updateResult = await taskRepo.updateTask(taskId, updates)
    if (!updateResult.success) {
      logger.warn('Failed to update persisted task definition', { taskId, error: updateResult.error.message })
    }
  }

  return ok(undefined)
}

export async function queryTaskLogs(
  logRepo: SchedulerLogRepository | null,
  options?: LogQueryOptions,
): Promise<Result<PaginatedResult<TaskExecutionLog>, SchedulerError>> {
  if (!logRepo) {
    return err({
      code: SchedulerErrorCode.DB_SAVE_FAILED,
      message: schedulerM('scheduler_dbNotInitialized'),
    })
  }

  return logRepo.queryLogs(options)
}
