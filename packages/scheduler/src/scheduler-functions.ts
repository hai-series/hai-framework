/**
 * @h-ai/scheduler — 业务函数
 *
 * 职责：
 * - 维护任务注册表（内存 Map）、cron 实例缓存、全局生命周期回调（hooks）状态
 * - 实现任务注册 / 注销 / 更新 / 批量加载等业务逻辑
 * - 实现执行日志分页查询
 *
 * 此文件不感知定时器、执行租约、执行并发等调度运行细节，那些由 scheduler-runner.ts 负责。
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

/**
 * 读取本节点已校验的任务投影；共享定义由刷新流程更新。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const enabled = [...getTaskRegistry().values()].filter(task => task.enabled !== false)
 * ```
 */
export function getTaskRegistry(): ReadonlyMap<string, TaskDefinition> {
  return taskRegistry
}

/**
 * 按任务 ID 读取本地只读投影，不访问数据库。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const task = getTask('daily-report')
 * if (task) {
 *   const cronExpression = task.cron
 * }
 * ```
 */
export function getTask(taskId: string): TaskDefinition | undefined {
  return taskRegistry.get(taskId)
}

/**
 * 检查当前投影是否含任务；不代替共享数据库的唯一约束。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * if (!hasTask('daily-report')) {
 *   const registered = await registerTask({ id: 'daily-report', name: '每日报表', cron: '0 2 * * *', timezone: 'UTC' })
 *   if (!registered.success) return registered
 * }
 * return getTask('daily-report')
 * ```
 */
export function hasTask(taskId: string): boolean {
  return taskRegistry.has(taskId)
}

/**
 * 发布已校验且已持久化的任务投影，并推进本地快照代际。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const task: TaskDefinition = { id: 'daily-report', name: '每日报表', cron: '0 2 * * *', timezone: 'UTC' }
 * setTask(task.id, task)
 * ```
 */
export function setTask(taskId: string, task: TaskDefinition): void {
  definitionEpoch++
  taskRegistry.set(taskId, task)
}

/**
 * 删除本地投影并推进代际；公共注销先确认数据库删除成功。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * deleteTask('daily-report')
 * deleteCron('daily-report')
 * ```
 */
export function deleteTask(taskId: string): void {
  definitionEpoch++
  taskRegistry.delete(taskId)
}

// ─── Cron 缓存访问器 ───

/**
 * 读取任务已解析的 cron；时区由任务定义明确或默认 UTC。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const cron = getCron('daily-report')
 * const due = cron?.match(new Date('2026-10-23T02:00:00Z')) ?? false
 * ```
 */
export function getCron(taskId: string): Cron | undefined {
  return cronCache.get(taskId)
}

/**
 * 缓存已成功解析的 cron 实例。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const parsed = parseCronExpression('0 2 * * *', 'UTC')
 * if (!parsed.success) return parsed
 * setCron('daily-report', parsed.data)
 * return parsed.data
 * ```
 */
export function setCron(taskId: string, cron: Cron): void {
  cronCache.set(taskId, cron)
}

/**
 * 移除任务的 cron 缓存；不删除持久定义。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * deleteCron('daily-report')
 * ```
 */
export function deleteCron(taskId: string): void {
  cronCache.delete(taskId)
}

// ─── 生命周期回调访问器 ───

/**
 * 复制宿主回调配置；副作用的幂等与协作取消由宿主实现。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * setHooks({ onTaskExecute: ({ context, signal }) => {
 *   signal.throwIfAborted()
 *   return { taskId: context.taskId }
 * } })
 * ```
 */
export function setHooks(hooks: SchedulerTaskHooks): void {
  currentHooks = { ...hooks }
}

/**
 * 清空当前宿主回调，不能撤销已经开始的外部操作。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * clearHooks()
 * const remaining = getHooks().onTaskExecute
 * ```
 */
export function clearHooks(): void {
  currentHooks = {}
}

/**
 * 读取当前宿主回调的只读视图。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const hooks = getHooks()
 * const usesHostHandler = hooks.onTaskExecute !== undefined
 * ```
 */
export function getHooks(): Readonly<SchedulerTaskHooks> {
  return currentHooks
}

// ─── 重置（供 close() 调用） ───

/**
 * 关闭时使旧刷新快照失效并清空任务、cron 和宿主回调。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * // 关闭流程已排空 runner 后再丢弃所有投影与在途刷新句柄。
 * resetTaskState()
 * ```
 */
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

/**
 * 合并同一任务仓库的在途刷新；配置写入或关闭后不复用旧快照。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * async function refresh(repository: SchedulerTaskRepository) {
 *   const result = await loadPersistedTasks(repository)
 *   if (!result.success) return result
 *   return [...getTaskRegistry().values()]
 * }
 * ```
 */
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

/**
 * 顺序校验并加载初始化配置的本地投影；公共初始化随后按真实生命周期接入仓库。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const loaded = await loadConfigTasks([{ id: 'daily-report', name: '每日报表', cron: '0 2 * * *', timezone: 'UTC' }])
 * if (!loaded.success) return loaded
 * return [...getTaskRegistry().values()]
 * ```
 */
export async function loadConfigTasks(tasks: TaskDefinition[]): Promise<HaiResult<void>> {
  for (const task of tasks) {
    const registerResult = await registerTask(task)
    if (!registerResult.success)
      return registerResult
  }
  return ok(undefined)
}

/**
 * 校验完整定义并先持久化再开放本地调度；失败不发布半成品。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * async function register(repository: SchedulerTaskRepository) {
 *   const result = await registerTask({ id: 'daily-report', name: '每日报表', cron: '0 2 * * *', timezone: 'UTC' }, repository)
 *   if (!result.success) return result
 *   return getTask('daily-report')
 * }
 * ```
 */
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

/**
 * 先条件删除共享定义，再清除本地任务和 cron；失败保留原投影。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * async function unregister(repository: SchedulerTaskRepository) {
 *   const result = await unregisterTask('daily-report', repository)
 *   if (!result.success) return result
 *   return result
 * }
 * ```
 */
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

/**
 * 校验整个更新并先落库再替换投影；任何字段失败都不提前替换 cron。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * async function disable(repository: SchedulerTaskRepository) {
 *   const result = await updateRegisteredTask('daily-report', { enabled: false }, repository)
 *   if (!result.success) return result
 *   return result
 * }
 * ```
 */
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

/**
 * 按过滤和分页读取持久日志；没有仓库返回失败，不伪造空结果。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * async function inspect(repository: SchedulerLogRepository) {
 *   const logs = await queryTaskLogs(repository, { taskId: 'daily-report', pagination: { page: 1, pageSize: 20 } })
 *   if (!logs.success) return logs
 *   return logs.data.items
 * }
 * ```
 */
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
