/**
 * @h-ai/scheduler — 调度运行器
 *
 * 职责：
 * - 维护调度执行期间的进程内状态：运行中任务集合、tick 定时器、上一次 tick 分钟、
 *   分布式锁配置（nodeId / lockTtlSec）
 * - 实现 tick 调度循环（每分钟触发一次）
 * - 通过分布式锁防止多节点重复执行同一分钟的任务
 * - 将具体任务交给 scheduler-executor.ts 执行
 *
 * 此文件不感知任务注册/更新等业务逻辑，那些由 scheduler-functions.ts 负责。
 * @module scheduler-runner
 */

import type { SchedulerTaskRepository } from './repositories/index.js'
import type { TaskDefinition, TaskExecutionLog, TaskTriggerInfo } from './scheduler-types.js'

import { cache } from '@h-ai/cache'
import { core } from '@h-ai/core'

import { executeTask, interruptTask, persistExecutionLog } from './scheduler-executor.js'
import { getCron, getHooks, getTaskRegistry, unregisterTask } from './scheduler-functions.js'
import { schedulerM } from './scheduler-i18n.js'

const logger = core.logger.child({ module: 'scheduler', scope: 'runner' })

// ─── 运行状态 ───

/** 当前正在执行中的任务 ID 集合 */
const runningTasks = new Set<string>()

/** 调度器定时器 ID */
let tickTimer: ReturnType<typeof setInterval> | null = null

/** 上一次检查的分钟标记（防止同一分钟内多次触发） */
let lastTickMinute = -1

/** 当前节点 ID（分布式锁用） */
let currentNodeId = ''

/** 当前锁过期时间（秒，分布式锁用） */
let currentLockTtlSec = 300

/** 当前任务仓库（用于 deleteAfterRun 持久化删除） */
let currentTaskRepo: SchedulerTaskRepository | null = null

// ─── 运行状态访问器（供 main.ts 编排） ───

export function configureLock(nodeId: string, lockTtlSec: number): void {
  currentNodeId = nodeId
  currentLockTtlSec = lockTtlSec
}

export function setTaskRepository(repo: SchedulerTaskRepository | null): void {
  currentTaskRepo = repo
}

export function isTaskRunning(taskId: string): boolean {
  return runningTasks.has(taskId)
}

export function isTimerRunning(): boolean {
  return tickTimer !== null
}

// ─── 重置（供 close() 调用） ───

export function resetRunner(): void {
  runningTasks.clear()
  if (tickTimer) {
    clearInterval(tickTimer)
    tickTimer = null
  }
  lastTickMinute = -1
  currentNodeId = ''
  currentLockTtlSec = 300
  currentTaskRepo = null
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0)
    return

  await new Promise(resolve => setTimeout(resolve, ms))
}

function resolveRetryBackoffMs(task: TaskDefinition, attempt: number): number {
  const backoff = task.retry?.backoffMs
  if (!backoff || backoff.length === 0)
    return 0

  const index = Math.min(Math.max(attempt - 2, 0), backoff.length - 1)
  return backoff[index] ?? 0
}

// ─── 调度循环与任务执行 ───

function tick(): void {
  const now = new Date()
  const currentMinute = Math.floor(now.getTime() / 60000)
  if (currentMinute === lastTickMinute)
    return

  lastTickMinute = currentMinute

  for (const [taskId, task] of getTaskRegistry()) {
    if (task.enabled === false)
      continue

    const cron = getCron(taskId)
    if (!cron || !cron.match(now))
      continue

    if (runningTasks.has(taskId)) {
      logger.debug('Skipping task already running', { taskId, taskName: task.name })
      continue
    }

    void runTask(task, currentMinute, { type: 'scheduled', source: null }).catch((error) => {
      logger.error('Unhandled task execution error', { taskId, error })
    })
  }
}

export async function runTask(
  task: TaskDefinition,
  minuteTimestamp?: number,
  trigger: TaskTriggerInfo = { type: 'manual', source: null },
): Promise<TaskExecutionLog> {
  const lockKey = minuteTimestamp !== undefined ? `hai:scheduler:${task.id}:${minuteTimestamp}` : undefined

  if (cache.isInitialized && lockKey) {
    const now = Date.now()
    const buildLockFailureLog = (error: string): TaskExecutionLog => ({
      id: 0,
      taskId: task.id,
      taskName: task.name,
      taskType: task.handler?.kind ?? 'hook',
      triggerType: trigger.type,
      triggerSource: trigger.source,
      status: 'failed',
      result: null,
      error,
      startedAt: now,
      finishedAt: now,
      duration: 0,
    })

    let lockResult: Awaited<ReturnType<typeof cache.lock.acquire>>
    try {
      lockResult = await cache.lock.acquire(lockKey, { ttl: currentLockTtlSec, owner: currentNodeId })
    }
    catch (error) {
      const errorMessage = schedulerM('scheduler_lockAcquireFailed', {
        params: { taskId: task.id },
      })
      const log = buildLockFailureLog(errorMessage)
      logger.error('Failed to acquire distributed lock', { taskId: task.id, minuteTimestamp, error })
      await persistExecutionLog(log)
      return log
    }

    if (lockResult.success && !lockResult.data) {
      logger.debug('Skipping task, another node holds the lock', { taskId: task.id, minuteTimestamp })
      return interruptTask(
        task,
        trigger,
        schedulerM('scheduler_lockAcquireFailed', { params: { taskId: task.id } }),
        getHooks(),
      )
    }

    if (!lockResult.success) {
      const errorMessage = schedulerM('scheduler_lockAcquireFailed', {
        params: { taskId: task.id },
      })
      const log = buildLockFailureLog(errorMessage)
      logger.error('Failed to acquire distributed lock', { taskId: task.id, minuteTimestamp, error: lockResult.error.message })
      await persistExecutionLog(log)
      return log
    }
  }

  if (runningTasks.has(task.id)) {
    return interruptTask(
      task,
      trigger,
      schedulerM('scheduler_taskRunning', { params: { taskId: task.id } }),
      getHooks(),
    )
  }

  runningTasks.add(task.id)

  try {
    const maxAttempts = Math.max(1, task.retry?.maxAttempts ?? 1)
    let log: TaskExecutionLog | null = null

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      log = await executeTask(task, trigger, getHooks())
      if (log.status !== 'failed')
        break

      if (attempt >= maxAttempts)
        break

      const backoffMs = resolveRetryBackoffMs(task, attempt + 1)
      logger.warn('Retrying failed task execution', {
        taskId: task.id,
        attempt,
        maxAttempts,
        backoffMs,
      })
      await sleep(backoffMs)
    }

    if (!log) {
      return interruptTask(
        task,
        trigger,
        schedulerM('scheduler_executionFailed', { params: { error: 'Task execution produced no log' } }),
        getHooks(),
      )
    }

    if (log.status === 'failed')
      logger.warn('Task execution failed', { taskId: task.id, error: log.error })
    else if (log.status === 'interrupted')
      logger.debug('Task execution interrupted', { taskId: task.id, error: log.error })
    else
      logger.debug('Task execution succeeded', { taskId: task.id, duration: log.duration })

    if (task.deleteAfterRun === true) {
      const unregisterResult = await unregisterTask(task.id, currentTaskRepo)
      if (!unregisterResult.success) {
        logger.warn('Failed to auto-delete one-time task after run', {
          taskId: task.id,
          error: unregisterResult.error.message,
        })
      }
      else {
        logger.info('Auto-deleted one-time task after run', { taskId: task.id })
      }
    }

    return log
  }
  finally {
    runningTasks.delete(task.id)
  }
}

export function startTimer(tickInterval: number): void {
  lastTickMinute = -1
  tickTimer = setInterval(() => tick(), tickInterval)
}

export function stopTimer(): void {
  if (!tickTimer)
    return

  clearInterval(tickTimer)
  tickTimer = null
}
