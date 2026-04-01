/**
 * @h-ai/scheduler — 定时任务服务主入口
 *
 * 本文件仅负责生命周期管理（init / close）与 API 编排；
 * 具体业务逻辑委托给 scheduler-functions.ts / scheduler-runner.ts。
 * @module scheduler-main
 */

import type { HaiResult, PaginatedResult } from '@h-ai/core'

import type { SchedulerConfig } from './scheduler-config.js'
import type { LogQueryOptions, SchedulerFunctions, SchedulerInitInput, SchedulerTaskHooks, TaskDefinition, TaskExecutionLog, TaskUpdateInput, TriggerTaskInput } from './scheduler-types.js'
import { cache } from '@h-ai/cache'
import { core, err, ok } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'

import { SchedulerLogRepository, SchedulerTaskRepository } from './repositories/index.js'
import { SchedulerConfigSchema } from './scheduler-config.js'
import { setLogRepository } from './scheduler-executor.js'
import { clearHooks, getHooks, getTask, getTaskRegistry, loadConfigTasks, loadPersistedTasks, queryTaskLogs, registerTask, resetTaskState, setHooks, unregisterTask, updateRegisteredTask } from './scheduler-functions.js'
import { schedulerM } from './scheduler-i18n.js'
import { clearJsTaskHandlerCache } from './scheduler-js-compiler.js'
import { configureLock, isTaskRunning, isTimerRunning, resetRunner, runTask, setTaskRepository, startTimer, stopTimer } from './scheduler-runner.js'
import { HaiSchedulerError } from './scheduler-types.js'

const logger = core.logger.child({ module: 'scheduler', scope: 'main' })

let currentConfig: SchedulerConfig | null = null
let initInProgress = false
let taskRepo: SchedulerTaskRepository | null = null
let logRepo: SchedulerLogRepository | null = null

const notInitialized = core.module.createNotInitializedKit(
  HaiSchedulerError.NOT_INITIALIZED,
  () => schedulerM('scheduler_notInitialized'),
)

async function initDatabase(parsed: SchedulerConfig): Promise<SchedulerConfig> {
  if (!parsed.enableDb)
    return parsed

  if (!reldb.isInitialized) {
    logger.error('enableDb is true but @h-ai/reldb is not initialized')
    throw new Error(schedulerM('scheduler_reldbNotInitialized'))
  }

  taskRepo = new SchedulerTaskRepository(reldb)
  logRepo = new SchedulerLogRepository(reldb)
  setTaskRepository(taskRepo)
  setLogRepository(logRepo, {
    maxLogs: parsed.maxLogs,
    retentionDays: parsed.retentionDays,
  })

  const nodeId = parsed.nodeId ?? crypto.randomUUID()
  const lockTtlSec = Math.ceil(parsed.lockExpireMs / 1000)
  configureLock(nodeId, lockTtlSec)

  if (cache.isInitialized)
    logger.info('Distributed lock configured (cache-based)', { nodeId, lockTtlSec })
  else
    logger.warn('Cache module not initialized, distributed lock will be enabled when cache becomes available')

  return { ...parsed, nodeId }
}

function normalizeTriggerInput(options?: TriggerTaskInput): { type: 'manual', source: string | null } {
  return {
    type: 'manual',
    source: options?.source ?? null,
  }
}

export const scheduler: SchedulerFunctions = {
  async init(config?: SchedulerInitInput): Promise<HaiResult<void>> {
    if (initInProgress) {
      logger.warn('Scheduler init already in progress, skipping concurrent call')
      return err(
        HaiSchedulerError.INIT_FAILED,
        schedulerM('scheduler_initFailed', { params: { error: 'Concurrent initialization detected' } }),
      )
    }

    initInProgress = true
    try {
      if (currentConfig) {
        logger.warn('Scheduler module is already initialized, reinitializing')
        await scheduler.close()
      }

      logger.info('Initializing scheduler module')
      const { tasks = [], hooks = {}, ...configOptions } = config ?? {}

      const parseResult = SchedulerConfigSchema.safeParse(configOptions)
      if (!parseResult.success) {
        logger.error('Scheduler config validation failed', { error: parseResult.error.message })
        return err(
          HaiSchedulerError.CONFIG_ERROR,
          schedulerM('scheduler_configError', { params: { error: parseResult.error.message } }),
          parseResult.error,
        )
      }

      try {
        currentConfig = await initDatabase(parseResult.data)
        setHooks(hooks)

        await loadPersistedTasks(taskRepo)
        if (tasks.length > 0)
          await loadConfigTasks(tasks)

        logger.info('Scheduler module initialized', { enableDb: currentConfig.enableDb, taskCount: getTaskRegistry().size })
        return ok(undefined)
      }
      catch (error) {
        logger.error('Scheduler initialization failed', { error })
        await scheduler.close()
        return err(
          HaiSchedulerError.INIT_FAILED,
          schedulerM('scheduler_initFailed', {
            params: { error: error instanceof Error ? error.message : String(error) },
          }),
          error,
        )
      }
    }
    finally {
      initInProgress = false
    }
  },

  async register(task: TaskDefinition): Promise<HaiResult<void>> {
    if (!currentConfig)
      return notInitialized.result()

    const registerResult = await registerTask(task, taskRepo)
    if (registerResult.success) {
      logger.info('Task registered', { taskId: task.id, taskName: task.name, cron: task.cron })
    }
    return registerResult
  },

  async unregister(taskId: string): Promise<HaiResult<void>> {
    if (!currentConfig)
      return notInitialized.result()

    const unregisterResult = await unregisterTask(taskId, taskRepo)
    if (unregisterResult.success)
      logger.info('Task unregistered', { taskId })

    return unregisterResult
  },

  async updateTask(taskId: string, updates: TaskUpdateInput): Promise<HaiResult<void>> {
    if (!currentConfig)
      return notInitialized.result()

    const updateResult = await updateRegisteredTask(taskId, updates, taskRepo)
    if (updateResult.success)
      logger.info('Task updated', { taskId, updates: Object.keys(updates) })

    return updateResult
  },

  start(): HaiResult<void> {
    if (!currentConfig)
      return notInitialized.result()

    if (isTimerRunning()) {
      return err(
        HaiSchedulerError.ALREADY_RUNNING,
        schedulerM('scheduler_alreadyRunning'),
      )
    }

    startTimer(currentConfig.tickInterval)
    logger.info('Scheduler started', { tickInterval: currentConfig.tickInterval })
    return ok(undefined)
  },

  stop(): HaiResult<void> {
    if (!currentConfig)
      return notInitialized.result()

    if (!isTimerRunning()) {
      return err(
        HaiSchedulerError.NOT_RUNNING,
        schedulerM('scheduler_notRunning'),
      )
    }

    stopTimer()
    logger.info('Scheduler stopped')
    return ok(undefined)
  },

  async trigger(taskId: string, options?: TriggerTaskInput): Promise<HaiResult<TaskExecutionLog>> {
    if (!currentConfig)
      return notInitialized.result()

    const task = getTask(taskId)
    if (!task) {
      return err(
        HaiSchedulerError.TASK_NOT_FOUND,
        schedulerM('scheduler_taskNotFound', { params: { taskId } }),
      )
    }

    if (isTaskRunning(taskId)) {
      return err(
        HaiSchedulerError.EXECUTION_FAILED,
        schedulerM('scheduler_taskRunning', { params: { taskId } }),
      )
    }

    const log = await runTask(task, undefined, normalizeTriggerInput(options))
    return ok(log)
  },

  async getLogs(options?: LogQueryOptions): Promise<HaiResult<PaginatedResult<TaskExecutionLog>>> {
    if (!currentConfig)
      return notInitialized.result()

    return queryTaskLogs(logRepo, options)
  },

  setHooks(hooks: SchedulerTaskHooks): HaiResult<void> {
    if (!currentConfig)
      return notInitialized.result()

    setHooks(hooks)
    return ok(undefined)
  },

  clearHooks(): HaiResult<void> {
    if (!currentConfig)
      return notInitialized.result()

    clearHooks()
    return ok(undefined)
  },

  get tasks(): ReadonlyMap<string, TaskDefinition> {
    return getTaskRegistry()
  },

  get config(): SchedulerConfig | null {
    return currentConfig
  },

  get hooks(): Readonly<SchedulerTaskHooks> {
    return getHooks()
  },

  get isInitialized(): boolean {
    return currentConfig !== null
  },

  get isRunning(): boolean {
    return isTimerRunning()
  },

  async close(): Promise<void> {
    if (!currentConfig) {
      logger.info('Scheduler module already closed, skipping')
      return
    }

    logger.info('Closing scheduler module')
    stopTimer()
    clearJsTaskHandlerCache()
    resetTaskState()
    resetRunner()
    setLogRepository(null)
    setTaskRepository(null)
    currentConfig = null
    taskRepo = null
    logRepo = null
    logger.info('Scheduler module closed')
  },
}
