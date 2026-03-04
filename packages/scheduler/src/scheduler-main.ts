/**
 * @h-ai/scheduler — 定时任务服务主入口
 *
 * 本文件提供统一的 `scheduler` 对象，聚合所有定时任务功能。 仅负责生命周期管理（init / close）和 API 编排， 调度运行逻辑委托给 scheduler-runner.ts。
 * @module scheduler-main
 */

import type { Result } from '@h-ai/core'

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

import { reldb } from '@h-ai/reldb'

import { SchedulerConfigSchema, SchedulerErrorCode } from './scheduler-config.js'
import { parseCronExpression } from './scheduler-cron.js'
import { deleteTaskDefinition, ensureLogTable, ensureTaskTable, loadTaskDefinitions, queryLogs, saveTaskDefinition, updateTaskDefinition } from './scheduler-db.js'
import { schedulerM } from './scheduler-i18n.js'
import { getTask, getTaskRegistry, hasTask, isTimerRunning, registerInMemory, resetRunner, runTask, setCronCache, setTask, startTimer, stopTimer, unregisterFromMemory } from './scheduler-runner.js'

const logger = core.logger.child({ module: 'scheduler', scope: 'main' })

// ─── 内部状态 ───

/** 当前配置 */
let currentConfig: SchedulerConfig | null = null

// ─── 未初始化工具集 ───

const notInitialized = core.module.createNotInitializedKit<SchedulerError>(
  SchedulerErrorCode.NOT_INITIALIZED,
  () => schedulerM('scheduler_notInitialized'),
)

// ─── 统一调度器服务对象 ───

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
      logger.warn('Scheduler module is already initialized, reinitializing')
      await scheduler.close()
    }

    logger.info('Initializing scheduler module')

    const parseResult = SchedulerConfigSchema.safeParse(config ?? {})
    if (!parseResult.success) {
      logger.error('Scheduler config validation failed', { error: parseResult.error.message })
      return err({
        code: SchedulerErrorCode.CONFIG_ERROR,
        message: schedulerM('scheduler_configError', { params: { error: parseResult.error.message } }),
        cause: parseResult.error,
      })
    }
    const parsed = parseResult.data

    try {
      currentConfig = parsed

      // 如果启用 DB，创建日志表和任务表
      if (parsed.enableDb) {
        if (!reldb.isInitialized) {
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
      if (currentConfig.enableDb && reldb.isInitialized) {
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

    if (hasTask(task.id)) {
      return err({
        code: SchedulerErrorCode.TASK_ALREADY_EXISTS,
        message: schedulerM('scheduler_taskAlreadyExists', { params: { taskId: task.id } }),
      })
    }

    const regResult = registerInMemory(task)
    if (!regResult.success)
      return regResult

    // 持久化 API 任务到数据库
    if (currentConfig.enableDb && reldb.isInitialized && task.type === 'api') {
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

    if (!hasTask(taskId)) {
      return err({
        code: SchedulerErrorCode.TASK_NOT_FOUND,
        message: schedulerM('scheduler_taskNotFound', { params: { taskId } }),
      })
    }

    unregisterFromMemory(taskId)

    // 从数据库中删除持久化的任务定义
    if (currentConfig.enableDb && reldb.isInitialized) {
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

    const existingTask = getTask(taskId)
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
      setCronCache(taskId, cronResult.data)
    }

    // 构建更新后的任务
    const updatedTask: TaskDefinition = {
      ...existingTask,
      ...(updates.name !== undefined ? { name: updates.name } : {}),
      ...(updates.cron !== undefined ? { cron: updates.cron } : {}),
      ...(updates.enabled !== undefined ? { enabled: updates.enabled } : {}),
      ...(updates.api !== undefined && existingTask.type === 'api' ? { api: updates.api } : {}),
    } as TaskDefinition

    setTask(taskId, updatedTask)

    // 同步到数据库
    if (currentConfig.enableDb && reldb.isInitialized && existingTask.type === 'api') {
      const updateResult = await updateTaskDefinition(currentConfig.taskTableName, taskId, {
        ...updates,
        ...(updates.api !== undefined ? { api: updates.api } : {}),
      })
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

    if (isTimerRunning()) {
      return err({
        code: SchedulerErrorCode.ALREADY_RUNNING,
        message: schedulerM('scheduler_alreadyRunning'),
      })
    }

    startTimer(currentConfig)

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

    if (!isTimerRunning()) {
      return err({
        code: SchedulerErrorCode.NOT_RUNNING,
        message: schedulerM('scheduler_notRunning'),
      })
    }

    stopTimer()

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

    const task = getTask(taskId)
    if (!task) {
      return err({
        code: SchedulerErrorCode.TASK_NOT_FOUND,
        message: schedulerM('scheduler_taskNotFound', { params: { taskId } }),
      })
    }

    logger.info('Manually triggering task', { taskId })
    const log = await runTask(task, currentConfig)
    return ok(log)
  },

  /**
   * 查询执行日志
   *
   * 需启用 DB（`enableDb: true` 且 `@h-ai/reldb` 已初始化）。
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

    if (!currentConfig.enableDb || !reldb.isInitialized) {
      return err({
        code: SchedulerErrorCode.DB_SAVE_FAILED,
        message: schedulerM('scheduler_dbNotInitialized'),
      })
    }

    return queryLogs(currentConfig.tableName, options)
  },

  /** 获取已注册任务 */
  get tasks(): ReadonlyMap<string, TaskDefinition> {
    return getTaskRegistry()
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
    return isTimerRunning()
  },

  /**
   * 关闭调度器
   *
   * 停止定时器、清空任务注册表和 cron 缓存、重置所有内部状态。
   * 多次调用安全。
   */
  async close(): Promise<void> {
    if (!currentConfig) {
      logger.info('Scheduler module already closed, skipping')
      return
    }

    logger.info('Closing scheduler module')
    resetRunner()
    currentConfig = null
    logger.info('Scheduler module closed')
  },
}
