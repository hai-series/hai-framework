/**
 * @h-ai/scheduler — 调度运行器
 *
 * 本文件封装定时任务的调度运行逻辑，包括： - tick 定时器回调（每分钟检测并触发匹配 cron 的任务） - 任务执行与日志持久化 - 内存注册（cron 解析与缓存）
 * @module scheduler-runner
 */

import type { Result } from '@h-ai/core'
import type { Cron } from 'croner'

import type { SchedulerLogRepository } from './repositories/index.js'
import type { SchedulerConfig } from './scheduler-config.js'
import type { SchedulerError, TaskDefinition, TaskExecutionLog } from './scheduler-types.js'

import { cache } from '@h-ai/cache'
import { core, ok } from '@h-ai/core'

import { parseCronExpression } from './scheduler-cron.js'
import { executeTask } from './scheduler-executor.js'

const logger = core.logger.child({ module: 'scheduler', scope: 'runner' })

// ─── 内部状态（由 main.ts 通过 API 管理生命周期） ───

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

/** 日志仓库实例（由 main.ts 在 init 时注入） */
let currentLogRepo: SchedulerLogRepository | null = null

/** 当前节点 ID（用于分布式锁 owner） */
let currentNodeId: string = ''

/** 锁过期时间（秒） */
let currentLockTtlSec: number = 300

/**
 * 设置日志仓库实例
 *
 * 由 scheduler-main.ts 在 init/close 时调用，用于注入或清除日志仓库。
 *
 * @param repo - 日志仓库实例或 null
 */
export function setLogRepository(repo: SchedulerLogRepository | null): void {
  currentLogRepo = repo
}

/**
 * 配置分布式锁
 *
 * 由 scheduler-main.ts 在 init 时调用，配置锁参数。
 * 分布式锁基于 @h-ai/cache 模块实现，运行时通过 cache.isInitialized 动态检测可用性。
 *
 * @param nodeId - 当前节点标识（用于 lock owner）
 * @param lockTtlSec - 锁过期时间（秒）
 */
export function configureLock(nodeId: string, lockTtlSec: number): void {
  currentNodeId = nodeId
  currentLockTtlSec = lockTtlSec
}

// ─── 调度逻辑 ───

/**
 * 调度 tick：定时器回调（内部函数，通过 startTimer 间接调用）
 *
 * 每次调用检查当前分钟是否已变化，若变化则遍历注册表，
 * 对匹配 cron 的任务异步执行（不阻塞后续任务检测）。
 * 同一分钟内只触发一次，防止重复执行。
 */
function tick(): void {
  const now = new Date()
  const currentMinute = Math.floor(now.getTime() / 60000)

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
      void runTask(task, currentMinute).catch((error) => {
        logger.error('Unhandled task execution error', { taskId, error })
      })
    }
  }
}

/**
 * 执行任务并保存日志
 *
 * 若启用分布式锁，先尝试获锁，获锁成功后执行任务。
 * 调用 `executeTask` 获取执行结果，若启用 DB 则持久化日志。
 * 执行成功/失败均记录到日志。
 *
 * @param task - 已注册的任务定义
 * @param minuteTimestamp - 当前分钟时间戳（用于分布式锁键），手动触发时可省略
 * @returns 任务执行日志
 */
export async function runTask(task: TaskDefinition, minuteTimestamp?: number): Promise<TaskExecutionLog> {
  // 分布式锁：多节点场景下确保同一任务同一分钟只执行一次
  const lockKey = minuteTimestamp !== undefined ? `scheduler:${task.id}:${minuteTimestamp}` : undefined
  if (cache.isInitialized && lockKey) {
    const lockResult = await cache.lock.acquire(lockKey, { ttl: currentLockTtlSec, owner: currentNodeId })
    if (lockResult.success && !lockResult.data) {
      logger.info('Skipping task, another node holds the lock', { taskId: task.id, minuteTimestamp })
      // 返回一条跳过日志（不持久化）
      return {
        id: 0,
        taskId: task.id,
        taskName: task.name,
        taskType: task.type,
        status: 'failed',
        result: null,
        error: 'Skipped: another node holds the distributed lock',
        startedAt: Date.now(),
        finishedAt: Date.now(),
        duration: 0,
      }
    }
  }

  runningTasks.add(task.id)
  try {
    const log = await executeTask({
      id: task.id,
      name: task.name,
      type: task.type,
      handler: task.type === 'js' ? task.handler : undefined,
      api: task.type === 'api' ? task.api : undefined,
    })

    if (currentLogRepo) {
      await currentLogRepo.saveLog(log)
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

// ─── 注册与缓存管理 ───

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
 * 检查任务是否正在执行中
 *
 * @param taskId - 任务 ID
 * @returns 是否正在执行
 */
export function isTaskRunning(taskId: string): boolean {
  return runningTasks.has(taskId)
}

/**
 * 获取任务注册表（只读）
 *
 * @returns 注册表的只读引用
 */
export function getTaskRegistry(): ReadonlyMap<string, TaskDefinition> {
  return taskRegistry
}

// ─── 定时器管理 ───

/**
 * 启动调度定时器
 *
 * @param config - 调度器配置（tickInterval 决定检查频率）
 */
export function startTimer(config: SchedulerConfig): void {
  lastTickMinute = -1
  tickTimer = setInterval(() => tick(), config.tickInterval)
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
  currentLogRepo = null
  currentNodeId = ''
  currentLockTtlSec = 300
}
