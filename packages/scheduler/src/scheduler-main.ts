/**
 * =============================================================================
 * @h-ai/scheduler - 定时任务服务主入口
 * =============================================================================
 *
 * 本文件提供统一的 `scheduler` 对象，聚合所有定时任务功能。
 *
 * 使用方式：
 * 1. 调用 `scheduler.init()` 初始化
 * 2. 通过 `scheduler.register()` 注册任务
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
 * // 初始化 DB（可选，用于记录执行日志）
 * await db.init({ type: 'sqlite', database: './scheduler.db' })
 *
 * // 初始化调度器
 * await scheduler.init({ enableDb: true })
 *
 * // 注册 JS 任务
 * scheduler.register({
 *   id: 'cleanup',
 *   name: '清理过期数据',
 *   cron: '0 2 * * *',
 *   type: 'js',
 *   handler: async () => { console.log('cleanup') },
 * })
 *
 * // 注册 API 任务
 * scheduler.register({
 *   id: 'health-check',
 *   name: '健康检查',
 *   cron: '0 * * * *',
 *   type: 'api',
 *   api: { url: 'https://api.example.com/health' },
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
} from './scheduler-types.js'
import { core, err, ok } from '@h-ai/core'

import { db } from '@h-ai/db'

import { SchedulerConfigSchema, SchedulerErrorCode } from './scheduler-config.js'
import { parseCronExpression } from './scheduler-cron.js'
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
// 数据库操作
// =============================================================================

/**
 * 创建执行日志表
 */
async function ensureLogTable(tableName: string): Promise<Result<void, SchedulerError>> {
  try {
    const ddlResult = await db.ddl.createTable(tableName, {
      id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
      task_id: { type: 'TEXT', notNull: true },
      task_name: { type: 'TEXT', notNull: true },
      task_type: { type: 'TEXT', notNull: true },
      status: { type: 'TEXT', notNull: true },
      result: { type: 'TEXT' },
      error: { type: 'TEXT' },
      started_at: { type: 'INTEGER', notNull: true },
      finished_at: { type: 'INTEGER', notNull: true },
      duration: { type: 'INTEGER', notNull: true },
    })

    if (!ddlResult.success) {
      return err({
        code: SchedulerErrorCode.DB_SAVE_FAILED,
        message: schedulerM('scheduler_dbSaveFailed', { params: { error: ddlResult.error.message } }),
        cause: ddlResult.error,
      })
    }

    // 为 task_id 创建索引
    await db.ddl.createIndex(tableName, `idx_${tableName}_task_id`, {
      columns: ['task_id'],
    })

    return ok(undefined)
  }
  catch (error) {
    return err({
      code: SchedulerErrorCode.DB_SAVE_FAILED,
      message: schedulerM('scheduler_dbSaveFailed', {
        params: { error: error instanceof Error ? error.message : String(error) },
      }),
      cause: error,
    })
  }
}

/**
 * 保存执行日志到数据库
 */
async function saveLog(log: TaskExecutionLog): Promise<void> {
  if (!currentConfig?.enableDb || !db.isInitialized)
    return

  try {
    await db.sql.execute(
      `INSERT INTO ${currentConfig.tableName} (task_id, task_name, task_type, status, result, error, started_at, finished_at, duration) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [log.taskId, log.taskName, log.taskType, log.status, log.result, log.error, log.startedAt, log.finishedAt, log.duration],
    )
  }
  catch (error) {
    logger.error('Failed to save execution log', { taskId: log.taskId, error })
  }
}

/**
 * 查询执行日志
 */
async function queryLogs(options?: LogQueryOptions): Promise<Result<TaskExecutionLog[], SchedulerError>> {
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

  const { taskId, status, limit = 50, offset = 0 } = options ?? {}

  const conditions: string[] = []
  const params: unknown[] = []

  if (taskId) {
    conditions.push('task_id = ?')
    params.push(taskId)
  }
  if (status) {
    conditions.push('status = ?')
    params.push(status)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const sql = `SELECT id, task_id, task_name, task_type, status, result, error, started_at, finished_at, duration FROM ${currentConfig.tableName} ${where} ORDER BY id DESC LIMIT ? OFFSET ?`
  params.push(limit, offset)

  const queryResult = await db.sql.query<Record<string, unknown>>(sql, params)
  if (!queryResult.success) {
    return err({
      code: SchedulerErrorCode.DB_SAVE_FAILED,
      message: schedulerM('scheduler_dbSaveFailed', { params: { error: queryResult.error.message } }),
      cause: queryResult.error,
    })
  }

  const logs: TaskExecutionLog[] = queryResult.data.map(row => ({
    id: row.id as number,
    taskId: row.task_id as string,
    taskName: row.task_name as string,
    taskType: row.task_type as 'js' | 'api',
    status: row.status as 'success' | 'failed',
    result: (row.result as string) ?? null,
    error: (row.error as string) ?? null,
    startedAt: row.started_at as number,
    finishedAt: row.finished_at as number,
    duration: row.duration as number,
  }))

  return ok(logs)
}

// =============================================================================
// 调度逻辑
// =============================================================================

/**
 * 调度 tick：每秒检查一次，在分钟变化时检测并执行匹配的任务
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
 */
async function runTask(task: TaskDefinition): Promise<TaskExecutionLog> {
  const log = await executeTask({
    id: task.id,
    name: task.name,
    type: task.type,
    handler: task.type === 'js' ? task.handler : undefined,
    api: task.type === 'api' ? task.api : undefined,
  })

  await saveLog(log)

  if (log.status === 'failed') {
    logger.warn('Task execution failed', { taskId: task.id, error: log.error })
  }
  else {
    logger.info('Task execution succeeded', { taskId: task.id, duration: log.duration })
  }

  return log
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

      // 如果启用 DB，创建日志表
      if (parsed.enableDb) {
        if (!db.isInitialized) {
          logger.warn('DB not initialized, disabling DB logging')
          currentConfig = { ...parsed, enableDb: false }
        }
        else {
          const tableResult = await ensureLogTable(parsed.tableName)
          if (!tableResult.success) {
            logger.warn('Failed to create log table, disabling DB logging', { error: tableResult.error.message })
            currentConfig = { ...parsed, enableDb: false }
          }
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
   */
  register(task: TaskDefinition): Result<void, SchedulerError> {
    if (!currentConfig)
      return notInitialized.result()

    if (taskRegistry.has(task.id)) {
      return err({
        code: SchedulerErrorCode.TASK_ALREADY_EXISTS,
        message: schedulerM('scheduler_taskAlreadyExists', { params: { taskId: task.id } }),
      })
    }

    // 解析 cron 表达式
    const cronResult = parseCronExpression(task.cron)
    if (!cronResult.success)
      return cronResult

    taskRegistry.set(task.id, task)
    cronCache.set(task.id, cronResult.data)

    logger.info('Task registered', { taskId: task.id, taskName: task.name, cron: task.cron })
    return ok(undefined)
  },

  /**
   * 注销任务
   */
  unregister(taskId: string): Result<void, SchedulerError> {
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

    logger.info('Task unregistered', { taskId })
    return ok(undefined)
  },

  /**
   * 启动调度
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
   */
  async getLogs(options?: LogQueryOptions): Promise<Result<TaskExecutionLog[], SchedulerError>> {
    return queryLogs(options)
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
