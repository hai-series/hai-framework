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

import type { TaskDefinition, TaskExecutionLog, TaskTriggerInfo } from './scheduler-types.js'

import { cache } from '@h-ai/cache'
import { core } from '@h-ai/core'

import { executeTask, interruptTask } from './scheduler-executor.js'
import { getCron, getHooks, getTaskRegistry } from './scheduler-functions.js'
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

// ─── 运行状态访问器（供 main.ts 编排） ───

export function configureLock(nodeId: string, lockTtlSec: number): void {
  currentNodeId = nodeId
  currentLockTtlSec = lockTtlSec
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
    const lockResult = await cache.lock.acquire(lockKey, { ttl: currentLockTtlSec, owner: currentNodeId })
    if (lockResult.success && !lockResult.data) {
      logger.debug('Skipping task, another node holds the lock', { taskId: task.id, minuteTimestamp })
      return interruptTask(
        task,
        trigger,
        schedulerM('scheduler_lockAcquireFailed', { params: { taskId: task.id } }),
        getHooks(),
      )
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
    const log = await executeTask(task, trigger, getHooks())
    if (log.status === 'failed')
      logger.warn('Task execution failed', { taskId: task.id, error: log.error })
    else if (log.status === 'interrupted')
      logger.debug('Task execution interrupted', { taskId: task.id, error: log.error })
    else
      logger.debug('Task execution succeeded', { taskId: task.id, duration: log.duration })

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
