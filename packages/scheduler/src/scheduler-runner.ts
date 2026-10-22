/**
 * 共享数据库执行状态驱动 cron、手动触发与崩溃恢复。
 * @module scheduler-runner
 */
import type { SchedulerExecutionRepository, SchedulerTaskRepository, StoredExecution } from './repositories/index.js'
import type { TaskDefinition, TaskExecutionLog, TaskTriggerInfo, TriggerTaskInput } from './scheduler-types.js'
import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { core } from '@h-ai/core'
import { executionId } from './repositories/scheduler-execution-repository.js'
import { executeTask, interruptTask } from './scheduler-executor.js'
import { getCron, getHooks, getTask, getTaskRegistry, loadPersistedTasks, unregisterTask } from './scheduler-functions.js'
import { schedulerM } from './scheduler-i18n.js'

const logger = core.logger.child({ module: 'scheduler', scope: 'runner' })
const runningTasks = new Set<string>()
const activeRuns = new Map<Promise<TaskExecutionLog>, AbortController>()
let tickTimer: ReturnType<typeof setInterval> | null = null
let tickInProgress = false
let lastTickMinute = -1
let currentNodeId = ''
let currentLeaseMs = 300_000
let currentTaskRepo: SchedulerTaskRepository | null = null
let currentExecutionRepo: SchedulerExecutionRepository | null = null

/** 配置共享执行仓库和续租周期。@example configureExecution(repo, nodeId, 300_000) */
export function configureExecution(repo: SchedulerExecutionRepository | null, nodeId = '', leaseMs = 300_000): void {
  currentExecutionRepo = repo
  currentNodeId = nodeId
  currentLeaseMs = leaseMs
}

/** 指定共享任务定义仓库。@example setTaskRepository(repo) */
export function setTaskRepository(repo: SchedulerTaskRepository | null): void {
  currentTaskRepo = repo
}

/** 检查本实例计时器状态。@example isTimerRunning() */
export function isTimerRunning(): boolean {
  return tickTimer !== null
}

/** 完全排空执行链后重置实例状态。@example resetRunner() */
export function resetRunner(): void {
  runningTasks.clear()
  stopTimer()
  lastTickMinute = -1
  currentTaskRepo = null
  configureExecution(null)
}

async function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0 || signal.aborted)
    return
  await new Promise<void>((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', finish)
      resolve()
    }
    timer = setTimeout(finish, ms)
    signal.addEventListener('abort', finish, { once: true })
  })
}

/** 停止领取并等待取消链退出；取消不表示已撤销外部副作用。@example await drainRunner() */
export async function drainRunner(): Promise<void> {
  stopTimer()
  for (const controller of activeRuns.values())
    controller.abort(new Error(schedulerM('scheduler_closing')))
  await Promise.allSettled([...activeRuns.keys()])
}

async function tick(): Promise<void> {
  if (tickInProgress)
    return
  tickInProgress = true
  try {
    const refreshed = await loadPersistedTasks(currentTaskRepo)
    if (!refreshed.success || !tickTimer)
      return
    // 恢复跨分钟遗留的原 occurrence；非幂等 running 由仓库隔离，不能换身份重发。
    const expired = await currentExecutionRepo?.expired()
    if (expired?.success) {
      for (const row of expired.data) {
        const task = getTask(row.taskId)
        if (!task) {
          await currentExecutionRepo?.isolateExpired(row)
          continue
        }
        if (task && !runningTasks.has(task.id)) {
          let trigger: TaskTriggerInfo & { minute?: number }
          try {
            // 数据来自本模块写入的固定触发结构；坏 JSON 留在共享槽中供人工核对。
            trigger = JSON.parse(row.triggerJson) as TaskTriggerInfo & { minute?: number }
          }
          catch {
            await currentExecutionRepo?.isolateExpired(row)
            continue
          }
          void runTask(task, trigger.minute, trigger, undefined, row).catch(error => logger.warn('Execution recovery failed', { taskId: task.id, error }))
        }
      }
    }
    scheduleDueTasks()
  }
  finally {
    tickInProgress = false
  }
}

function scheduleDueTasks(): void {
  const currentMinute = Math.floor(Date.now() / 60_000)
  if (currentMinute === lastTickMinute)
    return
  lastTickMinute = currentMinute
  for (const [taskId, task] of getTaskRegistry()) {
    if (task.enabled === false || runningTasks.has(taskId))
      continue
    if (!getCron(taskId)?.match(new Date(currentMinute * 60_000)))
      continue
    void runTask(task, currentMinute, { type: 'scheduled', source: null }).catch(error => logger.error('Unhandled task execution error', { taskId, error }))
  }
}

/**
 * cron/manual/recovery 共用唯一任务串行槽与 occurrence 领取协议。
 * @example await runTask(task, minute, { type: 'scheduled', source: null })
 */
export function runTask(task: TaskDefinition, minuteTimestamp?: number, trigger: TaskTriggerInfo = { type: 'manual', source: null }, options?: TriggerTaskInput, recovery?: StoredExecution): Promise<TaskExecutionLog> {
  const controller = new AbortController()
  const run = runTaskExecution(task, minuteTimestamp, trigger, controller, options, recovery)
  activeRuns.set(run, controller)
  void run.finally(() => activeRuns.delete(run)).catch(() => {})
  return run
}

async function runTaskExecution(task: TaskDefinition, minute: number | undefined, trigger: TaskTriggerInfo, controller: AbortController, options?: TriggerTaskInput, recovery?: StoredExecution): Promise<TaskExecutionLog> {
  const repository = currentTaskRepo
  const executionRepo = currentExecutionRepo
  const hooks = getHooks()
  const leaseMs = currentLeaseMs
  const occurrenceId = recovery?.occurrenceId ?? executionId(task.id, trigger.type, minute === undefined ? options?.idempotencyKey ?? randomUUID() : String(minute))
  const interrupted = async (reason: string) => ({ ...await interruptTask(task, trigger, reason, {}, controller.signal), occurrenceId })
  if (!executionRepo)
    return interrupted(schedulerM('scheduler_executionStateFailed'))
  const claimed = await executionRepo.claim(task, occurrenceId, { ...trigger, ...(minute !== undefined ? { minute } : {}) }, currentNodeId, leaseMs)
  if (!claimed.success)
    return interrupted(claimed.error.message)
  if (!claimed.data)
    return interrupted(schedulerM('scheduler_taskRunning', { params: { taskId: task.id } }))
  const row = claimed.data
  if (!['claimed', 'running'].includes(row.status)) {
    if (minute === undefined) {
      // 已完成的相同手动幂等键返回持久结果，绝不重新执行。
      try {
        const log: TaskExecutionLog = row.logJson
          ? JSON.parse(row.logJson)
          : {
              id: 0,
              taskId: row.taskId,
              taskName: task.name,
              taskType: task.handler?.kind ?? 'hook',
              triggerType: trigger.type,
              triggerSource: trigger.source,
              status: 'interrupted',
              result: null,
              error: null,
              startedAt: row.createdAt,
              finishedAt: row.updatedAt,
              duration: row.updatedAt - row.createdAt,
            }
        const status = row.status === 'discarded' ? 'interrupted' : row.status as TaskExecutionLog['status']
        return { ...log, status, error: status === 'success' ? null : log.error, occurrenceId }
      }
      catch {
        return interrupted(schedulerM('scheduler_executionStateFailed'))
      }
    }
    return interrupted(schedulerM('scheduler_occurrenceHandled', { params: { taskId: task.id } }))
  }
  runningTasks.add(task.id)
  let timer: ReturnType<typeof setTimeout> | undefined
  let renewing: Promise<void> | undefined
  let stopped = false
  let lost = false
  const renew = async () => {
    try {
      const result = await executionRepo.renew(row, leaseMs)
      lost = !result.success
    }
    catch {
      lost = true
    }
    if (lost) {
      controller.abort(new Error(schedulerM('scheduler_executionStateFailed')))
    }
    else if (!stopped) {
      timer = setTimeout(() => {
        renewing = renew()
      }, Math.max(1, Math.floor(leaseMs / 3)))
    }
  }
  timer = setTimeout(() => {
    renewing = renew()
  }, Math.max(1, Math.floor(leaseMs / 3)))
  try {
    let log: TaskExecutionLog | undefined
    for (; row.attemptCount < row.maxAttempts;) {
      if (controller.signal.aborted)
        break
      const refreshed = await loadPersistedTasks(repository)
      const latest = getTask(task.id)
      let unchanged = false
      try {
        // JSON 快照不会保留 undefined 属性，比较时两侧都采用持久化表示。
        unchanged = latest !== undefined && isDeepStrictEqual(JSON.parse(JSON.stringify(latest)), JSON.parse(row.snapshot))
      }
      catch {}
      if (!refreshed.success || !latest || latest.enabled === false || !unchanged) {
        log = await interrupted(schedulerM('scheduler_taskNoLongerDue', { params: { taskId: task.id } }))
        // 曾开始的任务不能靠配置编辑抹去未知副作用；保留串行槽直到人工核对。
        if (row.attemptCount > 0)
          log.status = 'unknown'
        break
      }
      task = latest
      if (!task.handler && !hooks.onTaskExecute) {
        log = { ...await interruptTask(task, trigger, schedulerM('scheduler_taskHandlerMissing', { params: { taskId: task.id } }), hooks, controller.signal), occurrenceId }
        break
      }
      const begun = await executionRepo.begin(row, leaseMs)
      if (!begun.success) {
        lost = true
        break
      }
      log = await executeTask(task, trigger, hooks, controller.signal, { occurrenceId, executionToken: row.owner, sequence: row.sequence, attempt: row.attemptCount })
      log.occurrenceId = occurrenceId
      if (log.status !== 'failed' || !row.idempotent || row.attemptCount >= row.maxAttempts)
        break
      const delays = task.retry?.backoffMs ?? []
      const delay = delays[Math.min(row.attemptCount - 1, Math.max(0, delays.length - 1))] ?? 0
      await sleep(delay, controller.signal)
    }
    if (!log)
      log = await interrupted(schedulerM('scheduler_executionStateFailed'))
    if (lost) {
      // 取消和失租不是外部回滚；旧 owner 只返回 unknown，不能覆盖新节点的共享结果。
      return { ...log, status: 'unknown', error: schedulerM('scheduler_executionUnknown'), occurrenceId }
    }
    if (controller.signal.aborted && row.attemptCount > 0)
      log = { ...log, status: 'unknown', error: schedulerM('scheduler_executionUnknown') }
    const finished = await executionRepo.finish(row, log)
    if (!finished.success)
      return { ...log, status: 'unknown', error: finished.error.message, occurrenceId }
    if (task.deleteAfterRun && log.status === 'success') {
      const refreshed = await loadPersistedTasks(repository)
      if (refreshed.success && isDeepStrictEqual(getTask(task.id), task))
        await unregisterTask(task.id, repository, task)
    }
    return log
  }
  finally {
    stopped = true
    clearTimeout(timer)
    await renewing
    runningTasks.delete(task.id)
  }
}

/** 启动本实例扫描器，任务正确性不依赖扫描器时间槽。@example startTimer(1000) */
export function startTimer(tickInterval: number): void {
  lastTickMinute = -1
  tickTimer = setInterval(tick, tickInterval)
}

/** 停止新领取，已经开始的任务由 drainRunner 处理。@example stopTimer() */
export function stopTimer(): void {
  if (tickTimer)
    clearInterval(tickTimer)
  tickTimer = null
}
