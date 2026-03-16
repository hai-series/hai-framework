/**
 * @h-ai/scheduler — 定时任务服务主入口
 *
 * 本文件提供统一的 `scheduler` 对象，聚合所有定时任务功能。
 * 仅负责生命周期管理（init / close）和 API 编排，
 * 调度运行逻辑委托给 scheduler-runner.ts。
 * @module scheduler-main
 */

import type { Result } from '@h-ai/core'

import type { SchedulerConfig } from './scheduler-config.js'
import type {
  LogQueryOptions,
  SchedulerError,
  SchedulerFunctions,
  SchedulerInitInput,
  TaskDefinition,
  TaskExecutionLog,
  TaskUpdateInput,
} from './scheduler-types.js'
import { core, err, ok } from '@h-ai/core'

import { reldb } from '@h-ai/reldb'

import { SchedulerLockRepository, SchedulerLogRepository, SchedulerTaskRepository } from './repositories/index.js'
import { SchedulerConfigSchema, SchedulerErrorCode } from './scheduler-config.js'
import { SCHEDULER_LOCK_TABLE, SCHEDULER_LOG_TABLE, SCHEDULER_TASK_TABLE } from './scheduler-constants.js'
import { parseCronExpression } from './scheduler-cron.js'
import { schedulerM } from './scheduler-i18n.js'
import { getTask, getTaskRegistry, hasTask, isTaskRunning, isTimerRunning, registerInMemory, resetRunner, runTask, setCronCache, setLockRepository, setLogRepository, setTask, startTimer, stopTimer, unregisterFromMemory } from './scheduler-runner.js'

const logger = core.logger.child({ module: 'scheduler', scope: 'main' })

// ─── 内部状态 ───

/** 当前配置 */
let currentConfig: SchedulerConfig | null = null

/** 并发初始化防护标志 */
let initInProgress = false

/** 任务定义仓库 */
let taskRepo: SchedulerTaskRepository | null = null

/** 执行日志仓库 */
let logRepo: SchedulerLogRepository | null = null

/** 分布式锁仓库 */
let lockRepo: SchedulerLockRepository | null = null

// ─── 未初始化工具集 ───

const notInitialized = core.module.createNotInitializedKit<SchedulerError>(
  SchedulerErrorCode.NOT_INITIALIZED,
  () => schedulerM('scheduler_notInitialized'),
)

// ─── 内部辅助函数 ───

/** DB 初始化：创建仓库实例，失败时自动降级 */
async function initDatabase(parsed: SchedulerConfig): Promise<SchedulerConfig> {
  if (!parsed.enableDb)
    return parsed

  if (!reldb.isInitialized) {
    logger.warn('DB not initialized, disabling DB logging')
    return { ...parsed, enableDb: false }
  }

  taskRepo = new SchedulerTaskRepository(reldb, SCHEDULER_TASK_TABLE)
  logRepo = new SchedulerLogRepository(reldb, SCHEDULER_LOG_TABLE)
  lockRepo = new SchedulerLockRepository(reldb, SCHEDULER_LOCK_TABLE)

  // 通知 runner 使用日志仓库
  setLogRepository(logRepo)

  // 配置分布式锁：使用配置的 nodeId 或自动生成
  const nodeId = parsed.nodeId ?? crypto.randomUUID()
  setLockRepository(lockRepo, nodeId, parsed.lockExpireMs)
  logger.info('Distributed lock configured', { nodeId, lockExpireMs: parsed.lockExpireMs })

  return parsed
}

/** 加载持久化的 API 任务 */
async function loadPersistedTasks(): Promise<void> {
  if (!taskRepo)
    return

  const loadResult = await taskRepo.loadTasks()
  if (!loadResult.success) {
    logger.warn('Failed to load persisted tasks', { error: loadResult.error.message })
    return
  }

  let loadedCount = 0
  for (const task of loadResult.data) {
    const regResult = registerInMemory(task)
    if (regResult.success) {
      loadedCount++
      logger.debug('Loaded persisted task', { taskId: task.id, taskName: task.name })
    }
    else {
      logger.warn('Failed to load persisted task', { taskId: task.id, error: regResult.error.message })
    }
  }

  if (loadedCount > 0) {
    logger.info('Loaded persisted tasks', { count: loadedCount })
  }
}

/** 从配置加载预定义任务 */
function loadConfigTasks(tasks: TaskDefinition[]): void {
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

    const regResult = registerInMemory(task)
    if (regResult.success) {
      loadedCount++
      logger.debug('Loaded config task', { taskId: task.id, taskName: task.name })
    }
    else {
      logger.warn('Failed to load config task', { taskId: task.id, error: regResult.error.message })
    }
  }

  if (loadedCount > 0) {
    logger.info('Loaded config tasks', { count: loadedCount })
  }
}

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
   * 解析配置、创建仓库实例（若 enableDb 为 true）。
   * 若 DB 未初始化，自动降级为 `enableDb: false`。
   * 启用 DB 时，自动加载之前持久化的 API 任务。
   * 同时加载配置中传入的预定义任务（DB 中已存在的同 ID 任务优先）。
   * 重复调用会先关闭前一次实例。
   *
   * @param config - 调度器配置（可选，所有字段有默认值）
   * @returns 成功返回 `ok(undefined)`；配置异常返回 `INIT_FAILED` 错误
   */
  async init(config?: SchedulerInitInput): Promise<Result<void, SchedulerError>> {
    // 并发初始化防护：避免多次 init 同时执行导致资源泄漏
    if (initInProgress) {
      logger.warn('Scheduler init already in progress, skipping concurrent call')
      return err({
        code: SchedulerErrorCode.INIT_FAILED,
        message: schedulerM('scheduler_initFailed', { params: { error: 'Concurrent initialization detected' } }),
      })
    }
    initInProgress = true

    try {
      if (currentConfig) {
        logger.warn('Scheduler module is already initialized, reinitializing')
        await scheduler.close()
      }

      logger.info('Initializing scheduler module')

      const { tasks: configTasks, ...configOptions } = config ?? {}

      const parseResult = SchedulerConfigSchema.safeParse(configOptions)
      if (!parseResult.success) {
        logger.error('Scheduler config validation failed', { error: parseResult.error.message })
        return err({
          code: SchedulerErrorCode.CONFIG_ERROR,
          message: schedulerM('scheduler_configError', { params: { error: parseResult.error.message } }),
          cause: parseResult.error,
        })
      }

      try {
        currentConfig = await initDatabase(parseResult.data)

        // 先加载 DB 中持久化的任务（优先级高）
        await loadPersistedTasks()

        // 再加载配置中的预定义任务（不覆盖 DB 中已有的同 ID 任务）
        if (configTasks && configTasks.length > 0) {
          loadConfigTasks(configTasks)
        }

        logger.info('Scheduler module initialized', { enableDb: currentConfig.enableDb })
        return ok(undefined)
      }
      catch (error) {
        currentConfig = null
        taskRepo = null
        logRepo = null
        lockRepo = null
        setLogRepository(null)
        setLockRepository(null, '', 300000)
        logger.error('Scheduler initialization failed', { error })
        return err({
          code: SchedulerErrorCode.INIT_FAILED,
          message: schedulerM('scheduler_initFailed', {
            params: { error: error instanceof Error ? error.message : String(error) },
          }),
          cause: error,
        })
      }
    }
    finally {
      initInProgress = false
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

    const regResult = registerInMemory(task)
    if (!regResult.success)
      return regResult

    // 持久化 API 任务到数据库
    if (taskRepo && task.type === 'api') {
      const saveResult = await taskRepo.saveTask(task)
      if (!saveResult.success) {
        logger.warn('Failed to persist task definition', { taskId: task.id, error: saveResult.error.message })
      }
    }

    logger.info('Task registered', { taskId: task.id, taskName: task.name, cron: task.cron, persisted: task.type === 'api' && !!taskRepo })
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
    if (taskRepo) {
      const deleteResult = await taskRepo.deleteTask(taskId)
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

    // 构建更新后的任务（按 type 分支构建，避免类型断言）
    let updatedTask: TaskDefinition
    if (existingTask.type === 'js') {
      updatedTask = {
        ...existingTask,
        ...(updates.name !== undefined ? { name: updates.name } : {}),
        ...(updates.cron !== undefined ? { cron: updates.cron } : {}),
        ...(updates.enabled !== undefined ? { enabled: updates.enabled } : {}),
      }
    }
    else {
      updatedTask = {
        ...existingTask,
        ...(updates.name !== undefined ? { name: updates.name } : {}),
        ...(updates.cron !== undefined ? { cron: updates.cron } : {}),
        ...(updates.enabled !== undefined ? { enabled: updates.enabled } : {}),
        ...(updates.api !== undefined ? { api: updates.api } : {}),
      }
    }

    setTask(taskId, updatedTask)

    // 同步到数据库
    if (taskRepo && existingTask.type === 'api') {
      const updateResult = await taskRepo.updateTask(taskId, updates)
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

    if (isTaskRunning(taskId)) {
      return err({
        code: SchedulerErrorCode.EXECUTION_FAILED,
        message: schedulerM('scheduler_taskRunning', { params: { taskId } }),
      })
    }

    logger.info('Manually triggering task', { taskId })
    const log = await runTask(task)
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
    if (!currentConfig)
      return notInitialized.result()

    if (!logRepo) {
      return err({
        code: SchedulerErrorCode.DB_SAVE_FAILED,
        message: schedulerM('scheduler_dbNotInitialized'),
      })
    }

    return logRepo.queryLogs(options)
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
    taskRepo = null
    logRepo = null
    lockRepo = null
    logger.info('Scheduler module closed')
  },
}
