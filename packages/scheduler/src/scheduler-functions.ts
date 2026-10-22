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

import { TaskHandlerConfigSchema } from './repositories/scheduler-repository-task.js'
import { parseCronExpression } from './scheduler-cron.js'
import { schedulerM } from './scheduler-i18n.js'
import { HaiSchedulerError } from './scheduler-types.js'

const logger = core.logger.child({ module: 'scheduler', scope: 'functions' })

// ─── 任务注册表状态 ───

/** 已注册任务（键：taskId） */
const taskRegistry = new Map<string, TaskDefinition>()

/** 解析后的 Cron 实例缓存（键：taskId） */
const cronCache = new Map<string, Cron>()
const persistedTaskIds = new Set<string>()
let definitionEpoch = 0
/** 同一快照的并发读取共用一次查询，避免互相推进 epoch 后误判写冲突。 */
let activeRefresh: { repository: SchedulerTaskRepository, epoch: number, promise: Promise<HaiResult<void>> } | undefined

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
  definitionEpoch++
  taskRegistry.set(taskId, task)
}

export function deleteTask(taskId: string): void {
  definitionEpoch++
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
  definitionEpoch++
  activeRefresh = undefined
  persistedTaskIds.clear()
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
  if (!Number.isInteger(retry.maxAttempts) || retry.maxAttempts < 1 || retry.maxAttempts > 100) {
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

/** 合并同一任务仓库的在途刷新；配置写入或关闭后不复用旧快照。 */
export async function loadPersistedTasks(taskRepo: SchedulerTaskRepository | null): Promise<HaiResult<void>> {
  if (!taskRepo)
    return ok(undefined)

  const epoch = definitionEpoch
  if (activeRefresh?.repository === taskRepo && activeRefresh.epoch === epoch)
    return activeRefresh.promise
  const refresh = { repository: taskRepo, epoch, promise: refreshPersistedTasks(taskRepo, epoch) }
  activeRefresh = refresh
  try {
    return await refresh.promise
  }
  finally {
    if (activeRefresh === refresh)
      activeRefresh = undefined
  }
}

/** 验证完整持久快照后替换内存投影；发生本地写入时拒绝覆盖更新。 */
async function refreshPersistedTasks(taskRepo: SchedulerTaskRepository, epoch: number): Promise<HaiResult<void>> {
  const loadResult = await taskRepo.loadTasks()
  if (!loadResult.success)
    return loadResult

  if (epoch !== definitionEpoch)
    return err(HaiSchedulerError.EXECUTION_FAILED, schedulerM('scheduler_definitionsChanged'))

  // 先完整验证快照再整体替换；保留仅由本节点配置声明的任务。
  const nextTasks = new Map([...taskRegistry].filter(([id]) => !persistedTaskIds.has(id)))
  const nextCrons = new Map([...cronCache].filter(([id]) => !persistedTaskIds.has(id)))
  for (const task of loadResult.data) {
    if (!task.id)
      return err(HaiSchedulerError.CONFIG_ERROR, schedulerM('scheduler_taskIdEmpty'))
    if (nextTasks.has(task.id))
      return err(HaiSchedulerError.TASK_ALREADY_EXISTS, schedulerM('scheduler_taskAlreadyExists', { params: { taskId: task.id } }))
    const cronResult = parseCronExpression(task.cron, task.timezone)
    if (!cronResult.success)
      return cronResult
    nextTasks.set(task.id, task)
    nextCrons.set(task.id, cronResult.data)
  }
  definitionEpoch++
  taskRegistry.clear()
  cronCache.clear()
  persistedTaskIds.clear()
  for (const [id, task] of nextTasks)
    taskRegistry.set(id, task)
  for (const [id, cron] of nextCrons)
    cronCache.set(id, cron)
  for (const task of loadResult.data)
    persistedTaskIds.add(task.id)
  return ok(undefined)
}

export async function loadConfigTasks(tasks: TaskDefinition[]): Promise<HaiResult<void>> {
  for (const task of tasks) {
    const registerResult = await registerTask(task)
    if (!registerResult.success)
      return registerResult
  }
  return ok(undefined)
}

export async function registerTask(
  task: TaskDefinition,
  taskRepo?: SchedulerTaskRepository | null,
): Promise<HaiResult<void>> {
  if ((task.handler && !TaskHandlerConfigSchema.safeParse(task.handler).success)
    || (task.idempotent !== undefined && typeof task.idempotent !== 'boolean')) {
    return err(HaiSchedulerError.CONFIG_ERROR, schedulerM('scheduler_invalidHandlerConfig', { params: { taskId: task.id } }))
  }
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

  const cronResult = parseCronExpression(task.cron, task.timezone)
  if (!cronResult.success)
    return cronResult

  const retryResult = task.retry ? validateRetryPolicy(task.id, task.retry) : ok(undefined)
  if (!retryResult.success)
    return retryResult

  const normalizedTask: TaskDefinition = {
    ...task,
    description: normalizeTaskDescription(task.description),
    timezone: task.timezone,
    enabled: task.enabled !== false,
    idempotent: task.idempotent === true,
    deleteAfterRun: task.deleteAfterRun === true,
    retry: retryResult.data,
    params: task.params ?? {},
  }

  if (taskRepo) {
    const saveResult = await taskRepo.saveTask(normalizedTask)
    if (!saveResult.success) {
      logger.warn('Failed to persist task definition', { taskId: task.id, error: saveResult.error.message })
      return err(
        HaiSchedulerError.DB_SAVE_FAILED,
        schedulerM('scheduler_dbSaveFailed', { params: { error: saveResult.error.message } }),
        saveResult.error,
      )
    }
    persistedTaskIds.add(task.id)
  }

  // 成功落库后才开放调度，失败的保存不能提前执行。
  setTask(task.id, normalizedTask)
  setCron(task.id, cronResult.data)

  return ok(undefined)
}

export async function unregisterTask(
  taskId: string,
  taskRepo?: SchedulerTaskRepository | null,
  expected?: TaskDefinition,
): Promise<HaiResult<void>> {
  if (!hasTask(taskId)) {
    return err(
      HaiSchedulerError.TASK_NOT_FOUND,
      schedulerM('scheduler_taskNotFound', { params: { taskId } }),
    )
  }

  if (taskRepo) {
    const deleteResult = await taskRepo.deleteTask(taskId, expected)
    if (!deleteResult.success) {
      // 删除失败保留原投影；数据库不可用时调度刷新也会阻止执行。
      logger.warn('Failed to delete persisted task definition', { taskId, error: deleteResult.error.message })
      return err(
        HaiSchedulerError.DB_SAVE_FAILED,
        schedulerM('scheduler_dbSaveFailed', { params: { error: deleteResult.error.message } }),
        deleteResult.error,
      )
    }
    if (expected && !deleteResult.data)
      return ok(undefined)
  }

  deleteTask(taskId)
  deleteCron(taskId)
  persistedTaskIds.delete(taskId)

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

  // 完整验证与持久化成功前，不发布任何部分更新。
  let updatedCron = getCron(taskId)

  if (updates.cron !== undefined || updates.timezone !== undefined) {
    const cronExpression = updates.cron ?? existingTask.cron
    const timezone = updates.timezone === null ? undefined : (updates.timezone ?? existingTask.timezone)
    const cronResult = parseCronExpression(cronExpression, timezone)
    if (!cronResult.success)
      return cronResult

    updatedCron = cronResult.data
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
    ? normalizeTaskDescription(updates.description) ?? ''
    : undefined

  const normalizedUpdates: TaskUpdateInput = {
    ...updates,
    ...(updates.description !== undefined ? { description: normalizedDescription } : {}),
    ...(updates.retry !== undefined ? { retry: normalizedRetry } : {}),
  }

  if ((updates.handler && !TaskHandlerConfigSchema.safeParse(updates.handler).success)
    || (updates.idempotent !== undefined && typeof updates.idempotent !== 'boolean')) {
    return err(HaiSchedulerError.CONFIG_ERROR, schedulerM('scheduler_invalidHandlerConfig', { params: { taskId } }))
  }

  const updatedTask: TaskDefinition = {
    ...existingTask,
    ...(normalizedUpdates.name !== undefined ? { name: normalizedUpdates.name } : {}),
    ...(normalizedUpdates.description !== undefined ? { description: normalizedUpdates.description || undefined } : {}),
    ...(normalizedUpdates.cron !== undefined ? { cron: normalizedUpdates.cron } : {}),
    ...(normalizedUpdates.timezone !== undefined ? { timezone: normalizedUpdates.timezone ?? undefined } : {}),
    ...(normalizedUpdates.enabled !== undefined ? { enabled: normalizedUpdates.enabled } : {}),
    ...(normalizedUpdates.idempotent !== undefined ? { idempotent: normalizedUpdates.idempotent } : {}),
    ...(normalizedUpdates.deleteAfterRun !== undefined ? { deleteAfterRun: normalizedUpdates.deleteAfterRun } : {}),
    ...(normalizedUpdates.retry !== undefined ? { retry: normalizedUpdates.retry ?? undefined } : {}),
    ...(normalizedUpdates.params !== undefined ? { params: normalizedUpdates.params } : {}),
    ...(normalizedUpdates.handler !== undefined ? { handler: normalizedUpdates.handler ?? undefined } : {}),
  }

  if (taskRepo) {
    const updateResult = await taskRepo.updateTask(taskId, normalizedUpdates)
    if (!updateResult.success) {
      logger.warn('Failed to update persisted task definition', { taskId, error: updateResult.error.message })
      return err(
        HaiSchedulerError.DB_SAVE_FAILED,
        schedulerM('scheduler_dbSaveFailed', { params: { error: updateResult.error.message } }),
        updateResult.error,
      )
    }
  }

  setTask(taskId, updatedTask)
  if (updatedCron)
    setCron(taskId, updatedCron)

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
