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
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { z } from 'zod'

import { executionEntry, executionId, SchedulerExecutionRepository, SchedulerLogRepository, SchedulerTaskRepository } from './repositories/index.js'
import { ExecutionResolutionSchema, SchedulerConfigSchema, TriggerTaskSchema } from './scheduler-config.js'
import { cancelTaskDefinitionReads, clearHooks, drainTaskDefinitions, getHooks, getTask, getTaskRegistry, loadConfigTasks, loadPersistedTasks, queryTaskLogs, registerTask, resetTaskState, setHooks, unregisterTask, updateRegisteredTask } from './scheduler-functions.js'
import { schedulerM } from './scheduler-i18n.js'
import { clearJsTaskHandlerCache } from './scheduler-js-compiler.js'
import { configureExecution, drainRunner, isTimerRunning, repairExecutionLogs, replayTaskReceipt, resetRunner, runTask, setLogRepository, setTaskRepository, startTimer, stopTimer } from './scheduler-runner.js'
import { HaiSchedulerError } from './scheduler-types.js'

const logger = core.logger.child({ module: 'scheduler', scope: 'main' })

let currentConfig: SchedulerConfig | null = null
let initInProgress: { controller: AbortController, done: Promise<HaiResult<void>> } | null = null
let closeInProgress: Promise<void> | null = null
let taskRepo: SchedulerTaskRepository | null = null
let logRepo: SchedulerLogRepository | null = null
let executionRepo: SchedulerExecutionRepository | null = null
const executionIdSchema = z.string().regex(/^[a-f\d]{64}$/)
const executionListSchema = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).max(1_000_000).default(0),
})

const notInitialized = core.module.createNotInitializedKit(
  HaiSchedulerError.NOT_INITIALIZED,
  () => schedulerM('scheduler_notInitialized'),
)

async function initDatabase() {
  if (!reldb.isInitialized) {
    logger.error('enableDb is true but @h-ai/reldb is not initialized')
    throw new Error(schedulerM('scheduler_reldbNotInitialized'))
  }

  const repositories = {
    task: new SchedulerTaskRepository(reldb),
    log: new SchedulerLogRepository(reldb),
    execution: new SchedulerExecutionRepository(reldb),
  }
  for (const ready of await Promise.all([
    repositories.task.ready(),
    repositories.log.ready(),
    repositories.execution.ready(),
  ])) {
    if (!ready.success)
      throw ready.error
  }
  return repositories
}

function stopAcceptingWork(): void {
  currentConfig = null
  stopTimer()
  cancelTaskDefinitionReads()
}

async function disposeScheduler(): Promise<void> {
  stopAcceptingWork()
  await drainRunner()
  await drainTaskDefinitions()
  clearJsTaskHandlerCache()
  resetTaskState()
  resetRunner()
  setLogRepository(null)
  setTaskRepository(null)
  taskRepo = null
  logRepo = null
  executionRepo = null
}

async function initializeScheduler(config: SchedulerInitInput | undefined, previousClose: Promise<void> | null, signal: AbortSignal): Promise<HaiResult<void>> {
  try {
    if (previousClose)
      await previousClose
    signal.throwIfAborted()
    if (currentConfig) {
      logger.warn('Scheduler module is already initialized, reinitializing')
      await disposeScheduler()
    }
    signal.throwIfAborted()

    logger.info('Initializing scheduler module')
    const { tasks = [], hooks = {}, ...options } = config ?? {}
    const parsed = SchedulerConfigSchema.safeParse(options)
    if (!parsed.success) {
      logger.error('Scheduler config validation failed', { error: parsed.error.message })
      return core.err(
        HaiSchedulerError.CONFIG_ERROR,
        schedulerM('scheduler_configError', {
          params: { error: parsed.error.message },
        }),
        parsed.error,
      )
    }

    const repositories = await initDatabase()
    signal.throwIfAborted()
    const persisted = await loadPersistedTasks(repositories.task)
    signal.throwIfAborted()
    if (!persisted.success)
      return persisted
    const configured = await loadConfigTasks(tasks, repositories.execution)
    signal.throwIfAborted()
    if (!configured.success)
      return configured

    taskRepo = repositories.task
    logRepo = repositories.log
    executionRepo = repositories.execution
    setTaskRepository(taskRepo)
    setLogRepository(logRepo, {
      maxLogs: parsed.data.maxLogs,
      retentionDays: parsed.data.retentionDays,
    })
    setHooks(hooks)
    const nodeId = parsed.data.nodeId ?? crypto.randomUUID()
    configureExecution(executionRepo, nodeId, parsed.data.leaseMs)
    currentConfig = { ...parsed.data, nodeId }
    logger.info('Scheduler module initialized', { nodeId, leaseMs: currentConfig.leaseMs, taskCount: getTaskRegistry().size })
    return core.ok(undefined)
  }
  catch (error) {
    if (!signal.aborted)
      logger.error('Scheduler initialization failed', { error })
    return core.err(
      HaiSchedulerError.INIT_FAILED,
      schedulerM('scheduler_initFailed', {
        params: {
          error: error instanceof Error
            ? error.message
            : String(error),
        },
      }),
      error,
    )
  }
  finally {
    if (!currentConfig)
      await disposeScheduler()
  }
}

function normalizeTriggerInput(options?: TriggerTaskInput): { type: 'manual', source: string | null } {
  return {
    type: 'manual',
    source: options?.source ?? null,
  }
}

/**
 * 定时任务公共入口；先初始化共享 RelDB，再注册/触发/启动；关闭会排空任务和日志修复，宿主最后关闭数据库。
 *
 * @example
 * ```ts
 * import { core } from '@h-ai/core'
 * import { reldb } from '@h-ai/reldb'
 * import { scheduler } from '@h-ai/scheduler'
 *
 * // 本地开发示例；生产使用所有节点共同连接的 PostgreSQL/MySQL。
 * const database = await reldb.init({ type: 'sqlite', database: ':memory:' })
 * if (!database.success) throw new Error(database.error.message)
 * try {
 *   const initialized = await scheduler.init({ hooks: { onTaskExecute: ({ context }) => ({ taskId: context.taskId }) } })
 *   if (!initialized.success) throw new Error(initialized.error.message)
 *   const registered = await scheduler.register({ id: 'daily-report', name: '每日报表', cron: '0 2 * * *', timezone: 'UTC' })
 *   if (!registered.success) throw new Error(registered.error.message)
 *   const executed = await scheduler.trigger('daily-report', { idempotencyKey: 'report-2026-10-23' })
 *   if (!executed.success) throw new Error(executed.error.message)
 *   // 业务 status 与 persistence 分开判断；pending 只补日志，不重跑业务。
 *   const status = executed.data.status
 *   const persistence = executed.data.persistence.status
 * } finally {
 *   await scheduler.close()
 *   const closed = await reldb.close()
 *   if (!closed.success) {
 *     core.logger.error('Database cleanup failed', { errorCode: closed.error.code })
 *     process.exitCode = 1
 *   }
 * }
 * ```
 */
export const scheduler: SchedulerFunctions = {
  execution: {
    async get(id) {
      if (!currentConfig || !executionRepo)
        return notInitialized.result()
      if (!executionIdSchema.safeParse(id).success)
        return core.err(HaiSchedulerError.CONFIG_ERROR, schedulerM('scheduler_executionInputInvalid'))
      const row = await executionRepo.byOccurrence(id)
      return row.success
        ? core.ok(row.data
            ? executionEntry(row.data)
            : null)
        : row
    },
    async listUnknown(options) {
      if (!currentConfig || !executionRepo)
        return notInitialized.result()
      const parsed = executionListSchema.safeParse(options ?? {})
      if (!parsed.success)
        return core.err(HaiSchedulerError.CONFIG_ERROR, schedulerM('scheduler_executionInputInvalid'))
      const rows = await executionRepo.unknown(parsed.data.limit, parsed.data.offset)
      return rows.success
        ? core.ok(rows.data.map(executionEntry))
        : rows
    },
    async listLogFailures(options) {
      if (!currentConfig || !executionRepo)
        return notInitialized.result()
      const parsed = executionListSchema.safeParse(options ?? {})
      if (!parsed.success)
        return core.err(HaiSchedulerError.CONFIG_ERROR, schedulerM('scheduler_executionInputInvalid'))
      const rows = await executionRepo.pendingLogs(parsed.data.limit, parsed.data.offset)
      return rows.success
        ? core.ok(rows.data.map(executionEntry))
        : rows
    },
    async repairLog(id) {
      if (!currentConfig || !executionRepo || closeInProgress)
        return notInitialized.result()
      if (!executionIdSchema.safeParse(id).success)
        return core.err(HaiSchedulerError.CONFIG_ERROR, schedulerM('scheduler_executionInputInvalid'))
      return repairExecutionLogs(id)
    },
    async resolveUnknown(id, resolution) {
      if (!currentConfig || !executionRepo)
        return notInitialized.result()
      const parsed = ExecutionResolutionSchema.safeParse(resolution)
      if (!executionIdSchema.safeParse(id).success || !parsed.success)
        return core.err(HaiSchedulerError.CONFIG_ERROR, schedulerM('scheduler_executionInputInvalid'))
      return executionRepo.resolve(id, parsed.data.status, parsed.data.expectedUpdatedAt)
    },
  },
  async init(config?: SchedulerInitInput): Promise<HaiResult<void>> {
    if (initInProgress) {
      logger.warn('Scheduler init already in progress, skipping concurrent call')
      return core.err(
        HaiSchedulerError.INIT_FAILED,
        schedulerM('scheduler_initFailed', {
          params: { error: 'Concurrent initialization detected' },
        }),
      )
    }

    const controller = new AbortController()
    const done = initializeScheduler(config, closeInProgress, controller.signal)
    initInProgress = { controller, done }
    try {
      return await done
    }
    finally {
      initInProgress = null
    }
  },

  /** 刷新数据库任务投影，不执行任何任务。 */
  async refreshTasks(): Promise<HaiResult<void>> {
    if (!currentConfig)
      return notInitialized.result()
    return loadPersistedTasks(taskRepo)
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
    if (updateResult.success) {
      logger.info('Task updated', {
        taskId,
        updates: Object.keys(updates),
      })
    }

    return updateResult
  },

  start(): HaiResult<void> {
    if (!currentConfig)
      return notInitialized.result()

    if (isTimerRunning()) {
      return core.err(
        HaiSchedulerError.ALREADY_RUNNING,
        schedulerM('scheduler_alreadyRunning'),
      )
    }

    startTimer(currentConfig.tickInterval)
    logger.info('Scheduler started', { tickInterval: currentConfig.tickInterval })
    return core.ok(undefined)
  },

  stop(): HaiResult<void> {
    if (!currentConfig)
      return notInitialized.result()

    if (!isTimerRunning()) {
      return core.err(
        HaiSchedulerError.NOT_RUNNING,
        schedulerM('scheduler_notRunning'),
      )
    }

    stopTimer()
    logger.info('Scheduler stopped')
    return core.ok(undefined)
  },

  async trigger(taskId: string, options?: TriggerTaskInput): Promise<HaiResult<TaskExecutionLog>> {
    if (!currentConfig || !executionRepo)
      return notInitialized.result()
    const parsed = TriggerTaskSchema.safeParse(options ?? {})
    if (!parsed.success)
      return core.err(HaiSchedulerError.CONFIG_ERROR, schedulerM('scheduler_executionInputInvalid'))

    const config = currentConfig
    const execution = executionRepo
    const receipt = parsed.data.idempotencyKey
      ? executionId(taskId, 'manual', parsed.data.idempotencyKey)
      : undefined
    if (receipt) {
      const replay = await replayTaskReceipt(execution, receipt)
      if (currentConfig !== config)
        return notInitialized.result()
      if (!replay.success)
        return replay
      if (replay.data)
        return core.ok(replay.data)
    }
    const refreshed = await loadPersistedTasks(taskRepo)
    if (!refreshed.success)
      return refreshed
    if (currentConfig !== config)
      return notInitialized.result()

    const task = getTask(taskId)
    if (!task) {
      if (receipt) {
        const replay = await replayTaskReceipt(execution, receipt)
        if (currentConfig !== config)
          return notInitialized.result()
        if (!replay.success)
          return replay
        if (replay.data)
          return core.ok(replay.data)
      }
      return core.err(
        HaiSchedulerError.TASK_NOT_FOUND,
        schedulerM('scheduler_taskNotFound', {
          params: { taskId },
        }),
      )
    }

    const log = await runTask(task, undefined, normalizeTriggerInput(parsed.data), parsed.data)
    return core.ok(log)
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
    return core.ok(undefined)
  },

  clearHooks(): HaiResult<void> {
    if (!currentConfig)
      return notInitialized.result()

    clearHooks()
    return core.ok(undefined)
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
    if (closeInProgress)
      return closeInProgress

    logger.info('Closing scheduler module')
    const initializing = initInProgress
    initializing?.controller.abort(new Error(schedulerM('scheduler_closing')))
    stopAcceptingWork()
    closeInProgress = (async () => {
      await initializing?.done
      await disposeScheduler()
      logger.info('Scheduler module closed')
    })()
    try {
      await closeInProgress
    }
    finally {
      closeInProgress = null
    }
  },
}
