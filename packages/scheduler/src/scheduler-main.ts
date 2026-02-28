/**
 * =============================================================================
 * @h-ai/scheduler - 定时任务服务主入口
 * =============================================================================
 *
 * 本文件提供统一的 `scheduler` 对象，聚合所有定时任务功能。
 *
 * 使用方式：
 * 1. 调用 `scheduler.init()` 初始化（自动加载持久化任务）
 * 2. 通过 `scheduler.register()` 注册任务（API 任务自动持久化）
 * 3. 调用 `scheduler.start()` 启动调度
 * 4. 可选：`scheduler.trigger()` 手动触发
 * 5. `scheduler.stop()` 停止调度
 * 6. `scheduler.close()` 关闭
 *
 * @example
 * ```ts
 * import { scheduler } from '@h-ai/scheduler'
 * import { db } from '@h-ai/db'
 *
 * // 初始化 DB（可选，用于持久化任务和记录执行日志）
 * await db.init({ type: 'sqlite', database: './scheduler.db' })
 *
 * // 初始化调度器（自动加载之前持久化的 API 任务）
 * await scheduler.init({ enableDb: true })
 *
 * // 注册 API 任务（自动持久化到 DB）
 * await scheduler.register({
 *   id: 'health-check',
 *   name: '健康检查',
 *   cron: '0 * * * *',
 *   type: 'api',
 *   api: { url: 'https://api.example.com/health' },
 * })
 *
 * // 注册 JS 任务（不持久化，仅存在于内存）
 * await scheduler.register({
 *   id: 'cleanup',
 *   name: '清理过期数据',
 *   cron: '0 2 * * *',
 *   type: 'js',
 *   handler: async () => ({ cleaned: true }),
 * })
 *
 * // 启动调度
 * scheduler.start()
 *
 * // 关闭
 * scheduler.stop()
 * await scheduler.close()
 * ```
 *
 * @module scheduler-main
 * =============================================================================
 */

import type { Result } from '@h-ai/core'
import type { Cron } from 'croner'

import type { SchedulerConfig, SchedulerConfigInput } from './scheduler-config.js'
import type {
  LogQueryOptions,
  SchedulerError,
  SchedulerFunctions,
  TaskDefinition,
  TaskExecutionLog,
  TaskUpdateInput,
} from './scheduler-types.js'
import { core, err, ok } from '@h-ai/core'

import { db } from '@h-ai/db'

import { SchedulerConfigSchema, SchedulerErrorCode } from './scheduler-config.js'
import { parseCronExpression } from './scheduler-cron.js'
import { deleteTaskDefinition, ensureLogTable, ensureTaskTable, loadTaskDefinitions, queryLogs, saveLog, saveTaskDefinition, updateTaskDefinition } from './scheduler-db.js'
import { executeTask } from './scheduler-executor.js'
import { schedulerM } from './scheduler-i18n.js'

const logger = core.logger.child({ module: 'scheduler', scope: 'main' })

// =============================================================================
// 内部状态
// =============================================================================

/** 当前配置 */
let currentConfig: SchedulerConfig | null = null

/** 注册的任务 */
const taskRegistry = new Map<string, TaskDefinition>()

/** 解析后的 Cron 实例缓存 */
const cronCache = new Map<string, Cron>()

/** 调度器定时器 ID */
let tickTimer: ReturnType<typeof setInterval> | null = null

/** 上一次检查的分钟标记（防止同一分钟重复触发） */
let lastTickMinute = -1

// =============================================================================
// 调度逻辑
// =============================================================================

/**
 * 调度 tick：定时器回调
 *
 * 每次调用检查当前分钟是否已变化，若变化则遍历注册表，
 * 对匹配 cron 的任务异步执行（不阻塞后续任务检测）。
 * 同一分钟内只触发一次，防止重复执行。
 */
function tick(): void {
  const now = new Date()
  const currentMinute = now.getFullYear() * 100000000
    + (now.getMonth() + 1) * 1000000
    + now.getDate() * 10000
    + now.getHours() * 100
    + now.getMinutes()

  // 同一分钟只触发一次
  if (currentMinute === lastTickMinute)
    return
  lastTickMinute = currentMinute

  for (const [taskId, task] of taskRegistry) {
    if (task.enabled === false)
      continue

    const cron = cronCache.get(taskId)
    if (!cron)
      continue

    if (cron.match(now)) {
      logger.info('Triggering scheduled task', { taskId, taskName: task.name })
      // 异步执行，不阻塞 tick
      void runTask(task)
    }
  }
}

/**
 * 执行任务并保存日志
 *
 * 调用 `executeTask` 获取执行结果，若启用 DB 则持久化日志。
 * 执行成功/失败均记录到日志。
 *
 * @param task - 已注册的任务定义
 * @returns 任务执行日志
 */
async function runTask(task: TaskDefinition): Promise<TaskExecutionLog> {
  const log = await executeTask({
    id: task.id,
    name: task.name,
    type: task.type,
    handler: task.type === 'js' ? task.handler : undefined,
    api: task.type === 'api' ? task.api : undefined,
  })

  if (currentConfig?.enableDb && db.isInitialized) {
    await saveLog(currentConfig.tableName, log)
  }

  if (log.status === 'failed') {
    logger.warn('Task execution failed', { taskId: task.id, error: log.error })
  }
  else {
    logger.info('Task execution succeeded', { taskId: task.id, duration: log.duration })
  }

  return log
}

/**
 * 在内存中注册任务（不触发持久化）
 *
 * @param task - 任务定义
 * @returns 成功返回 `ok(undefined)`；cron 无效返回 `INVALID_CRON`
 */
function registerInMemory(task: TaskDefinition): Result<void, SchedulerError> {
  const cronResult = parseCronExpression(task.cron)
  if (!cronResult.success)
    return cronResult

  taskRegistry.set(task.id, task)
  cronCache.set(task.id, cronResult.data)
  return ok(undefined)
}

// =============================================================================
// 未初始化工具集
// =============================================================================

const notInitialized = core.module.createNotInitializedKit<SchedulerError>(
  SchedulerErrorCode.NOT_INITIALIZED,
  () => schedulerM('scheduler_notInitialized'),
)

// =============================================================================
// 统一调度器服务对象
// =============================================================================

/**
 * 定时任务调度器服务对象
 *
 * 统一的定时任务管理入口。
 */
export const scheduler: SchedulerFunctions = {
  /**
   * 初始化调度器
   *
   * 解析配置、创建日志表和任务表（若 enableDb 为 true）。
   * 若 DB 未初始化或表创建失败，自动降级为 `enableDb: false`。
   * 启用 DB 时，自动加载之前持久化的 API 任务。
   * 重复调用会先关闭前一次实例。
   *
   * @param config - 调度器配置（可选，所有字段有默认值）
   * @returns 成功返回 `ok(undefined)`；配置异常返回 `INIT_FAILED` 错误
   */
  async init(config?: SchedulerConfigInput): Promise<Result<void, SchedulerError>> {
    if (currentConfig) {
      logger.warn('Scheduler already initialized, reinitializing')
      await scheduler.close()
    }

    logger.info('Initializing scheduler module')

    try {
      const parsed = SchedulerConfigSchema.parse(config ?? {})
      currentConfig = parsed

      // 如果启用 DB，创建日志表和任务表
      if (parsed.enableDb) {
        if (!db.isInitialized) {
          logger.warn('DB not initialized, disabling DB logging')
          currentConfig = { ...parsed, enableDb: false }
        }
        else {
          const logTableResult = await ensureLogTable(parsed.tableName)
          if (!logTableResult.success) {
            logger.warn('Failed to create log table, disabling DB logging', { error: logTableResult.error.message })
            currentConfig = { ...parsed, enableDb: false }
          }
          else {
            const taskTableResult = await ensureTaskTable(parsed.taskTableName)
            if (!taskTableResult.success) {
              logger.warn('Failed to create task table, disabling DB logging', { error: taskTableResult.error.message })
              currentConfig = { ...parsed, enableDb: false }
            }
          }
        }
      }

      // 加载持久化的任务
      if (currentConfig.enableDb && db.isInitialized) {
        const loadResult = await loadTaskDefinitions(currentConfig.taskTableName)
        if (loadResult.success) {
          for (const task of loadResult.data) {
            const regResult = registerInMemory(task)
            if (regResult.success) {
              logger.debug('Loaded persisted task', { taskId: task.id, taskName: task.name })
            }
            else {
              logger.warn('Failed to load persisted task', { taskId: task.id, error: regResult.error.message })
            }
          }
          if (loadResult.data.length > 0) {
            logger.info('Loaded persisted tasks', { count: loadResult.data.length })
          }
        }
        else {
          logger.warn('Failed to load persisted tasks', { error: loadResult.error.message })
        }
      }

      logger.info('Scheduler module initialized', { enableDb: currentConfig.enableDb })
      return ok(undefined)
    }
    catch (error) {
      currentConfig = null
      logger.error('Scheduler initialization failed', { error })
      return err({
        code: SchedulerErrorCode.INIT_FAILED,
        message: schedulerM('scheduler_initFailed', {
          params: { error: error instanceof Error ? error.message : String(error) },
        }),
        cause: error,
      })
    }
  },

  /**
   * 注册任务
   *
   * 解析 cron 表达式并缓存，将任务存入注册表。
   * 同一 taskId 不允许重复注册，需先 `unregister` 后再注册。
   * 若启用 DB 且任务类型为 API，任务定义将自动持久化到数据库。
   *
   * @param task - 任务定义（JS 或 API 类型）
   * @returns 成功返回 `ok(undefined)`；重复注册返回 `TASK_ALREADY_EXISTS`，cron 无效返回 `INVALID_CRON`
   */
  async register(task: TaskDefinition): Promise<Result<void, SchedulerError>> {
    if (!currentConfig)
      return notInitialized.result()

    if (taskRegistry.has(task.id)) {
      return err({
        code: SchedulerErrorCode.TASK_ALREADY_EXISTS,
        message: schedulerM('scheduler_taskAlreadyExists', { params: { taskId: task.id } }),
      })
    }

    const regResult = registerInMemory(task)
    if (!regResult.success)
      return regResult

    // 持久化 API 任务到数据库
    if (currentConfig.enableDb && db.isInitialized && task.type === 'api') {
      const saveResult = await saveTaskDefinition(currentConfig.taskTableName, task)
      if (!saveResult.success) {
        logger.warn('Failed to persist task definition', { taskId: task.id, error: saveResult.error.message })
      }
    }

    logger.info('Task registered', { taskId: task.id, taskName: task.name, cron: task.cron, persisted: task.type === 'api' && currentConfig.enableDb })
    return ok(undefined)
  },

  /**
   * 注销任务
   *
   * 从注册表和 cron 缓存中移除指定任务。
   * 若启用 DB，同时从数据库中删除持久化的任务定义。
   *
   * @param taskId - 任务 ID
   * @returns 成功返回 `ok(undefined)`；任务不存在返回 `TASK_NOT_FOUND`
   */
  async unregister(taskId: string): Promise<Result<void, SchedulerError>> {
    if (!currentConfig)
      return notInitialized.result()

    if (!taskRegistry.has(taskId)) {
      return err({
        code: SchedulerErrorCode.TASK_NOT_FOUND,
        message: schedulerM('scheduler_taskNotFound', { params: { taskId } }),
      })
    }

    taskRegistry.delete(taskId)
    cronCache.delete(taskId)

    // 从数据库中删除持久化的任务定义
    if (currentConfig.enableDb && db.isInitialized) {
      const deleteResult = await deleteTaskDefinition(currentConfig.taskTableName, taskId)
      if (!deleteResult.success) {
        logger.warn('Failed to delete persisted task definition', { taskId, error: deleteResult.error.message })
      }
    }

    logger.info('Task unregistered', { taskId })
    return ok(undefined)
  },

  /**
   * 更新任务
   *
   * 更新已注册任务的配置（cron、name、enabled、api 等）。
   * 若更新了 cron 表达式，重新解析并缓存。
   * 若启用 DB 且任务类型为 API，更新后的任务定义将同步到数据库。
   *
   * @param taskId - 任务 ID
   * @param updates - 需要更新的字段
   * @returns 成功返回 `ok(undefined)`；任务不存在返回 `TASK_NOT_FOUND`，cron 无效返回 `INVALID_CRON`
   */
  async updateTask(taskId: string, updates: TaskUpdateInput): Promise<Result<void, SchedulerError>> {
    if (!currentConfig)
      return notInitialized.result()

    const existingTask = taskRegistry.get(taskId)
    if (!existingTask) {
      return err({
        code: SchedulerErrorCode.TASK_NOT_FOUND,
        message: schedulerM('scheduler_taskNotFound', { params: { taskId } }),
      })
    }

    // 若更新了 cron，需要重新解析
    if (updates.cron !== undefined) {
      const cronResult = parseCronExpression(updates.cron)
      if (!cronResult.success)
        return cronResult
      cronCache.set(taskId, cronResult.data)
    }

    // 构建更新后的任务
    const updatedTask: TaskDefinition = {
      ...existingTask,
      ...(updates.name !== undefined ? { name: updates.name } : {}),
      ...(updates.cron !== undefined ? { cron: updates.cron } : {}),
      ...(updates.enabled !== undefined ? { enabled: updates.enabled } : {}),
      ...(updates.api !== undefined && existingTask.type === 'api' ? { api: updates.api } : {}),
    } as TaskDefinition

    taskRegistry.set(taskId, updatedTask)

    // 同步到数据库
    if (currentConfig.enableDb && db.isInitialized && existingTask.type === 'api') {
      const dbUpdates: { name?: string, cron?: string, enabled?: boolean, api?: Record<string, unknown> } = {}
      if (updates.name !== undefined)
        dbUpdates.name = updates.name
      if (updates.cron !== undefined)
        dbUpdates.cron = updates.cron
      if (updates.enabled !== undefined)
        dbUpdates.enabled = updates.enabled
      if (updates.api !== undefined)
        dbUpdates.api = updates.api as Record<string, unknown>

      const updateResult = await updateTaskDefinition(currentConfig.taskTableName, taskId, dbUpdates)
      if (!updateResult.success) {
        logger.warn('Failed to update persisted task definition', { taskId, error: updateResult.error.message })
      }
    }

    logger.info('Task updated', { taskId, updates: Object.keys(updates) })
    return ok(undefined)
  },

  /**
   * 启动调度
   *
   * 以 `tickInterval` 间隔启动定时器，每分钟检测并执行匹配的任务。
   * 不允许重复启动。
   *
   * @returns 成功返回 `ok(undefined)`；已在运行返回 `ALREADY_RUNNING`
   */
  start(): Result<void, SchedulerError> {
    if (!currentConfig)
      return notInitialized.result()

    if (tickTimer !== null) {
      return err({
        code: SchedulerErrorCode.ALREADY_RUNNING,
        message: schedulerM('scheduler_alreadyRunning'),
      })
    }

    lastTickMinute = -1
    tickTimer = setInterval(tick, currentConfig.tickInterval)

    logger.info('Scheduler started', { tickInterval: currentConfig.tickInterval })
    return ok(undefined)
  },

  /**
   * 停止调度
   *
   * 清除定时器，已提交的异步任务不受影响。
   *
   * @returns 成功返回 `ok(undefined)`；未运行时返回 `NOT_RUNNING`
   */
  stop(): Result<void, SchedulerError> {
    if (!currentConfig)
      return notInitialized.result()

    if (tickTimer === null) {
      return err({
        code: SchedulerErrorCode.NOT_RUNNING,
        message: schedulerM('scheduler_notRunning'),
      })
    }

    clearInterval(tickTimer)
    tickTimer = null

    logger.info('Scheduler stopped')
    return ok(undefined)
  },

  /**
   * 手动触发任务
   *
   * 立即执行指定任务，不受 cron 调度约束。
   * 执行日志会自动保存到数据库（若启用 DB）。
   *
   * @param taskId - 任务 ID
   * @returns 成功返回执行日志；任务不存在返回 `TASK_NOT_FOUND`
   */
  async trigger(taskId: string): Promise<Result<TaskExecutionLog, SchedulerError>> {
    if (!currentConfig)
      return notInitialized.result()

    const task = taskRegistry.get(taskId)
    if (!task) {
      return err({
        code: SchedulerErrorCode.TASK_NOT_FOUND,
        message: schedulerM('scheduler_taskNotFound', { params: { taskId } }),
      })
    }

    logger.info('Manually triggering task', { taskId })
    const log = await runTask(task)
    return ok(log)
  },

  /**
   * 查询执行日志
   *
   * 需启用 DB（`enableDb: true` 且 `@h-ai/db` 已初始化）。
   *
   * @param options - 查询选项（taskId、status、limit、offset）
   * @returns 成功返回日志数组；DB 未启用返回 `DB_SAVE_FAILED`
   */
  async getLogs(options?: LogQueryOptions): Promise<Result<TaskExecutionLog[], SchedulerError>> {
    if (!currentConfig) {
      return err({
        code: SchedulerErrorCode.NOT_INITIALIZED,
        message: schedulerM('scheduler_notInitialized'),
      })
    }

    if (!currentConfig.enableDb || !db.isInitialized) {
      return err({
        code: SchedulerErrorCode.DB_SAVE_FAILED,
        message: schedulerM('scheduler_dbNotInitialized'),
      })
    }

    return queryLogs(currentConfig.tableName, options)
  },

  /** 获取已注册任务 */
  get tasks(): ReadonlyMap<string, TaskDefinition> {
    return taskRegistry
  },

  /** 当前配置 */
  get config(): SchedulerConfig | null {
    return currentConfig
  },

  /** 是否已初始化 */
  get isInitialized(): boolean {
    return currentConfig !== null
  },

  /** 是否正在运行 */
  get isRunning(): boolean {
    return tickTimer !== null
  },

  /**
   * 关闭调度器
   *
   * 停止定时器、清空任务注册表和 cron 缓存、重置所有内部状态。
   * 多次调用安全。
   */
  async close(): Promise<void> {
    if (tickTimer !== null) {
      clearInterval(tickTimer)
      tickTimer = null
    }

    taskRegistry.clear()
    cronCache.clear()
    currentConfig = null
    lastTickMinute = -1

    logger.info('Scheduler module closed')
  },
}
