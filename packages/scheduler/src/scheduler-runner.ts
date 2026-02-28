/**
 * =============================================================================
 * @h-ai/scheduler - 调度运行器
 * =============================================================================
 *
 * 本文件封装定时任务的调度运行逻辑，包括：
 * - tick 定时器回调（每分钟检测并触发匹配 cron 的任务）
 * - 任务执行与日志持久化
 * - 内存注册（cron 解析与缓存）
 *
 * 与 scheduler-main.ts 分离，保持入口文件只做生命周期管理和 API 编排。
 *
 * @module scheduler-runner
 * =============================================================================
 */

import type { Result } from '@h-ai/core'
import type { Cron } from 'croner'

import type { SchedulerConfig } from './scheduler-config.js'
import type { SchedulerError, TaskDefinition, TaskExecutionLog } from './scheduler-types.js'

import { core, ok } from '@h-ai/core'

import { db } from '@h-ai/db'

import { parseCronExpression } from './scheduler-cron.js'
import { saveLog } from './scheduler-db.js'
import { executeTask } from './scheduler-executor.js'

const logger = core.logger.child({ module: 'scheduler', scope: 'runner' })

// =============================================================================
// 内部状态（由 main.ts 通过 API 管理生命周期）
// =============================================================================

/** 注册的任务 */
const taskRegistry = new Map<string, TaskDefinition>()

/** 解析后的 Cron 实例缓存 */
const cronCache = new Map<string, Cron>()

/** 当前正在执行中的任务 ID 集合（防止同一任务并发执行） */
const runningTasks = new Set<string>()

/** 调度器定时器 ID */
let tickTimer: ReturnType<typeof setInterval> | null = null

/** 上一次检查的分钟标记（防止同一分钟重复触发） */
let lastTickMinute = -1

// =============================================================================
// 调度逻辑
// =============================================================================

/**
 * 调度 tick：定时器回调（内部函数，通过 startTimer 间接调用）
 *
 * 每次调用检查当前分钟是否已变化，若变化则遍历注册表，
 * 对匹配 cron 的任务异步执行（不阻塞后续任务检测）。
 * 同一分钟内只触发一次，防止重复执行。
 *
 * @param config - 当前调度器配置（用于判断是否启用 DB）
 */
function tick(config: SchedulerConfig): void {
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
      // 跳过正在执行的任务，防止并发重复执行
      if (runningTasks.has(taskId)) {
        logger.debug('Skipping task already running', { taskId, taskName: task.name })
        continue
      }
      logger.info('Triggering scheduled task', { taskId, taskName: task.name })
      // 异步执行，不阻塞 tick；捕获未处理拒绝
      void runTask(task, config).catch((error) => {
        logger.error('Unhandled task execution error', { taskId, error })
      })
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
 * @param config - 当前调度器配置
 * @returns 任务执行日志
 */
export async function runTask(task: TaskDefinition, config: SchedulerConfig): Promise<TaskExecutionLog> {
  runningTasks.add(task.id)
  try {
    const log = await executeTask({
      id: task.id,
      name: task.name,
      type: task.type,
      handler: task.type === 'js' ? task.handler : undefined,
      api: task.type === 'api' ? task.api : undefined,
    })

    if (config.enableDb && db.isInitialized) {
      await saveLog(config.tableName, log)
    }

    if (log.status === 'failed') {
      logger.warn('Task execution failed', { taskId: task.id, error: log.error })
    }
    else {
      logger.info('Task execution succeeded', { taskId: task.id, duration: log.duration })
    }

    return log
  }
  finally {
    runningTasks.delete(task.id)
  }
}

// =============================================================================
// 注册与缓存管理
// =============================================================================

/**
 * 在内存中注册任务（不触发持久化）
 *
 * 解析 cron 表达式并缓存到 cronCache，将任务存入 taskRegistry。
 *
 * @param task - 任务定义
 * @returns 成功返回 `ok(undefined)`；cron 无效返回 `INVALID_CRON`
 */
export function registerInMemory(task: TaskDefinition): Result<void, SchedulerError> {
  const cronResult = parseCronExpression(task.cron)
  if (!cronResult.success)
    return cronResult

  taskRegistry.set(task.id, task)
  cronCache.set(task.id, cronResult.data)
  return ok(undefined)
}

/**
 * 从内存中移除任务注册
 *
 * @param taskId - 任务 ID
 */
export function unregisterFromMemory(taskId: string): void {
  taskRegistry.delete(taskId)
  cronCache.delete(taskId)
}

/**
 * 检查任务是否已注册
 *
 * @param taskId - 任务 ID
 * @returns 是否存在
 */
export function hasTask(taskId: string): boolean {
  return taskRegistry.has(taskId)
}

/**
 * 获取已注册任务
 *
 * @param taskId - 任务 ID
 * @returns 任务定义，未找到返回 undefined
 */
export function getTask(taskId: string): TaskDefinition | undefined {
  return taskRegistry.get(taskId)
}

/**
 * 更新内存中的任务定义
 *
 * @param taskId - 任务 ID
 * @param task - 新的任务定义
 */
export function setTask(taskId: string, task: TaskDefinition): void {
  taskRegistry.set(taskId, task)
}

/**
 * 更新 cron 缓存
 *
 * @param taskId - 任务 ID
 * @param cron - 新的 Cron 实例
 */
export function setCronCache(taskId: string, cron: Cron): void {
  cronCache.set(taskId, cron)
}

/**
 * 获取任务注册表（只读）
 *
 * @returns 注册表的只读引用
 */
export function getTaskRegistry(): ReadonlyMap<string, TaskDefinition> {
  return taskRegistry
}

// =============================================================================
// 定时器管理
// =============================================================================

/**
 * 启动调度定时器
 *
 * @param config - 调度器配置（tickInterval 决定检查频率）
 */
export function startTimer(config: SchedulerConfig): void {
  lastTickMinute = -1
  tickTimer = setInterval(() => tick(config), config.tickInterval)
}

/**
 * 停止调度定时器
 */
export function stopTimer(): void {
  if (tickTimer !== null) {
    clearInterval(tickTimer)
    tickTimer = null
  }
}

/**
 * 定时器是否正在运行
 *
 * @returns 是否有活跃定时器
 */
export function isTimerRunning(): boolean {
  return tickTimer !== null
}

/**
 * 重置所有运行器内部状态
 *
 * 清空任务注册表、cron 缓存、停止定时器。
 * 由 `scheduler.close()` 调用。
 */
export function resetRunner(): void {
  stopTimer()
  taskRegistry.clear()
  cronCache.clear()
  runningTasks.clear()
  lastTickMinute = -1
}
