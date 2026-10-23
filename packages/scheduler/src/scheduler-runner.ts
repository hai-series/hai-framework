/**
 * 共享数据库执行状态驱动 cron、手动触发与崩溃恢复。
 * @module scheduler-runner
 */
import type { HaiResult } from '@h-ai/core'
import type { SchedulerExecutionRepository, SchedulerLogRepository, SchedulerTaskRepository, StoredExecution } from './repositories/index.js'
import type { SchedulerLogCleanupPolicy, TaskDefinition, TaskExecutionLog, TaskTriggerInfo, TriggerTaskInput } from './scheduler-types.js'
import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { core, err, ok } from '@h-ai/core'
import { z } from 'zod'
import { executionId } from './repositories/scheduler-repository-execution.js'
import { executeTask, interruptTask } from './scheduler-executor.js'
import { getCron, getHooks, getTask, getTaskRegistry, loadPersistedTasks, unregisterTask } from './scheduler-functions.js'
import { schedulerM } from './scheduler-i18n.js'
import { HaiSchedulerError } from './scheduler-types.js'

const logger = core.logger.child({ module: 'scheduler', scope: 'runner' })
const runningTasks = new Set<string>()
const activeRuns = new Map<Promise<TaskExecutionLog>, AbortController>()
const activeRepairs = new Set<Promise<HaiResult<void>>>()
let tickTimer: ReturnType<typeof setInterval> | null = null
let tickInProgress: ReturnType<typeof setInterval> | null = null
let lastTickMinute = -1
let currentNodeId = ''
let currentLeaseMs = 300_000
let currentTaskRepo: SchedulerTaskRepository | null = null
let currentExecutionRepo: SchedulerExecutionRepository | null = null
let currentLogRepo: SchedulerLogRepository | null = null
let currentCleanupPolicy: SchedulerLogCleanupPolicy = {}

/**
 * 绑定调用方拥有的日志仓库；关闭后不可由旧执行写入新实例。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * // 本轮实例拥有的仓库通过生命周期装配，不从后续 init 动态借用。
 * setLogRepository(null)
 * ```
 */
export function setLogRepository(repo: SchedulerLogRepository | null, policy: SchedulerLogCleanupPolicy = {}): void {
  currentLogRepo = repo
  currentCleanupPolicy = { ...policy }
}

const publishedLogSchema = z.object({
  id: z.uuid(),
  occurrenceId: z.string().regex(/^[a-f\d]{64}$/),
  taskId: z.string(),
  taskName: z.string(),
  taskType: z.enum(['api', 'js', 'hook']),
  triggerType: z.enum(['manual', 'scheduled']),
  triggerSource: z.string().nullable(),
  status: z.enum(['success', 'failed', 'interrupted', 'unknown']),
  result: z.string().nullable(),
  error: z.string().nullable(),
  startedAt: z.number().safe(),
  finishedAt: z.number().safe(),
  duration: z.number().safe(),
  persistence: z.object({ status: z.enum(['pending', 'persisted', 'unconfirmed']), error: z.object({ code: z.string(), message: z.string() }).optional() }),
})

/**
 * 只投影已通过 owner/lease 条件提交的完整尝试快照；补写不调用 handler 或业务 Hook。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const occurrenceId = 'a'.repeat(64)
 * const result = await repairExecutionLogs(occurrenceId)
 * if (!result.success) return result
 * // 成功仅表示已发布终态的日志投影已确认，未调用 handler。
 * return result.data
 * ```
 */
export function repairExecutionLogs(id: string): Promise<HaiResult<void>> {
  const operation = projectExecutionLogs(id)
  activeRepairs.add(operation)
  void operation.finally(() => activeRepairs.delete(operation)).catch(() => {})
  return operation
}

/** 对快照依赖执行补写，close 会等待本链路释放；不读取后来初始化实例的保留策略。 */
async function projectExecutionLogs(id: string): Promise<HaiResult<void>> {
  const execution = currentExecutionRepo
  const logs = currentLogRepo
  const cleanupPolicy = currentCleanupPolicy
  if (!execution || !logs)
    return err(HaiSchedulerError.LOG_PERSIST_FAILED, schedulerM('scheduler_logPersistFailed'))
  try {
    const found = await execution.byOccurrence(id)
    if (!found.success || !found.data || ['claimed', 'running'].includes(found.data.status))
      return err(HaiSchedulerError.LOG_PERSIST_FAILED, schedulerM('scheduler_logPersistFailed'))
    const row = found.data
    if (row.logPersistence === 'persisted')
      return ok(undefined)
    const parsed = z.array(publishedLogSchema).min(1).max(101).safeParse(JSON.parse(row.logsJson ?? 'null') as unknown)
    if (!parsed.success || parsed.data.some(log => log.occurrenceId !== id || log.taskId !== row.taskId))
      return err(HaiSchedulerError.LOG_PERSIST_FAILED, schedulerM('scheduler_logPersistFailed'))
    for (const log of parsed.data) {
      const saved = await logs.saveLog(log)
      if (!saved.success)
        return saved
    }
    const confirmed = await execution.confirmLogs(row)
    if (!confirmed.success)
      return err(HaiSchedulerError.LOG_PERSIST_FAILED, schedulerM('scheduler_logPersistFailed'))
    const cleanup = await logs.cleanupLogs(cleanupPolicy)
    if (!cleanup.success)
      logger.warn('Execution logs persisted but retention cleanup failed', { occurrenceId: id, errorCode: cleanup.error.code })
    return ok(undefined)
  }
  catch {
    return err(HaiSchedulerError.LOG_PERSIST_FAILED, schedulerM('scheduler_logPersistFailed'))
  }
}

/**
 * 配置共享执行仓库和续租周期。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * // 关闭流程排空后解除旧执行仓库绑定。
 * configureExecution(null)
 * ```
 */
export function configureExecution(repo: SchedulerExecutionRepository | null, nodeId = '', leaseMs = 300_000): void {
  currentExecutionRepo = repo
  currentNodeId = nodeId
  currentLeaseMs = leaseMs
}

/**
 * 指定共享任务定义仓库。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * // init/close 装配共享仓库；null 只供关闭解除绑定。
 * setTaskRepository(null)
 * ```
 */
export function setTaskRepository(repo: SchedulerTaskRepository | null): void {
  currentTaskRepo = repo
}

/**
 * 检查本实例计时器状态。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const wasRunning = isTimerRunning()
 * if (wasRunning) stopTimer()
 * ```
 */
export function isTimerRunning(): boolean {
  return tickTimer !== null
}

/**
 * 完全排空执行链后重置实例状态。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * await drainRunner()
 * resetRunner()
 * ```
 */
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

/**
 * 停止领取并等待取消链退出；取消不表示已撤销外部副作用。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * // signal 取消不会抹除未知外部效果；等待执行与补写释放当前实例依赖。
 * await drainRunner()
 * ```
 */
export async function drainRunner(): Promise<void> {
  stopTimer()
  for (const controller of activeRuns.values())
    controller.abort(new Error(schedulerM('scheduler_closing')))
  await Promise.allSettled([...activeRuns.keys()])
  await Promise.allSettled([...activeRepairs])
}

async function tick(): Promise<void> {
  const timer = tickTimer
  const repository = currentTaskRepo
  const executionRepo = currentExecutionRepo
  if (!timer || tickInProgress === timer)
    return
  tickInProgress = timer
  // stop/start 与 close/init 都创建新的计时器代际；旧数据库读取只能归属原扫描器。
  const isCurrent = () => tickTimer === timer && currentTaskRepo === repository && currentExecutionRepo === executionRepo
  try {
    const refreshed = await loadPersistedTasks(repository)
    if (!refreshed.success || !isCurrent())
      return
    // 恢复跨分钟遗留的原 occurrence；非幂等 running 由仓库隔离，不能换身份重发。
    const expired = await executionRepo?.expired()
    if (!isCurrent())
      return
    if (expired?.success) {
      for (const row of expired.data) {
        const task = getTask(row.taskId)
        if (!task) {
          await executionRepo?.isolateExpired(row)
          if (!isCurrent())
            return
          continue
        }
        if (task && !runningTasks.has(task.id)) {
          let trigger: TaskTriggerInfo & { minute?: number }
          try {
            // 数据来自本模块写入的固定触发结构；坏 JSON 留在共享槽中供人工核对。
            trigger = JSON.parse(row.triggerJson) as TaskTriggerInfo & { minute?: number }
          }
          catch {
            await executionRepo?.isolateExpired(row)
            if (!isCurrent())
              return
            continue
          }
          void runTask(task, trigger.minute, trigger, undefined, row).catch(error => logger.warn('Execution recovery failed', { taskId: task.id, error }))
        }
      }
    }
    const now = await executionRepo?.currentTime()
    if (now?.success && isCurrent())
      scheduleDueTasks(now.data)
  }
  finally {
    if (tickInProgress === timer)
      tickInProgress = null
  }
}

function scheduleDueTasks(databaseNow: number): void {
  // 同一现实分钟的身份与 cron 匹配都来自共享 DB，不能由各节点本机时钟选定。
  const currentMinute = Math.floor(databaseNow / 60_000)
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
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const task: TaskDefinition = { id: 'daily-report', name: '每日报表', cron: '0 2 * * *', timezone: 'UTC' }
 * const log = await runTask(task, undefined, { type: 'manual', source: 'console' }, { idempotencyKey: 'report-2026-10-23' })
 * // 业务成功仍可能等待日志补写；unknown 交可信核对，不能换键重试。
 * if (log.persistence.status === 'pending' && log.occurrenceId) {
 *   const repaired = await repairExecutionLogs(log.occurrenceId)
 *   if (!repaired.success) return repaired
 * }
 * return log
 * ```
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
  const logRepository = currentLogRepo
  const hooks = getHooks()
  const leaseMs = currentLeaseMs
  const occurrenceId = recovery?.occurrenceId ?? executionId(task.id, trigger.type, minute === undefined ? options?.idempotencyKey ?? randomUUID() : String(minute))
  const interrupted = async (reason: string, observationOnly = false): Promise<TaskExecutionLog> => {
    const log = { ...await interruptTask(task, trigger, reason, {}, controller.signal), occurrenceId }
    // 领取前的竞争/跳过只是一条观测事件，不代表 owner 已提交业务终态。
    if (observationOnly && logRepository) {
      const saved = await logRepository.saveLog(log)
      log.persistence = saved.success ? { status: 'persisted' } : { status: 'unconfirmed', error: { code: String(saved.error.code), message: saved.error.message } }
    }
    return log
  }
  if (!executionRepo)
    return interrupted(schedulerM('scheduler_executionStateFailed'), true)
  const claimed = await executionRepo.claim(task, occurrenceId, { ...trigger, ...(minute !== undefined ? { minute } : {}) }, currentNodeId, leaseMs)
  if (!claimed.success)
    return interrupted(claimed.error.message, true)
  if (!claimed.data)
    return interrupted(schedulerM('scheduler_taskRunning', { params: { taskId: task.id } }), true)
  const row = claimed.data
  if (!['claimed', 'running'].includes(row.status)) {
    if (minute === undefined) {
      // 已完成的相同手动幂等键返回持久结果，绝不重新执行。
      try {
        const log: TaskExecutionLog = row.logJson
          ? JSON.parse(row.logJson)
          : {
              id: randomUUID(),
              persistence: { status: 'unconfirmed' },
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
    return interrupted(schedulerM('scheduler_occurrenceHandled', { params: { taskId: task.id } }), true)
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
    const attempts: TaskExecutionLog[] = []
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
      attempts.push(log)
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
      return { ...log, status: 'unknown', persistence: { status: 'unconfirmed' }, error: schedulerM('scheduler_executionUnknown'), occurrenceId }
    }
    if (controller.signal.aborted && row.attemptCount > 0)
      log = { ...log, status: 'unknown', error: schedulerM('scheduler_executionUnknown') }
    const currentAttempt = attempts.findIndex(attempt => attempt.id === log.id)
    if (currentAttempt >= 0)
      attempts[currentAttempt] = log
    else
      attempts.push(log)
    const published = attempts.map(attempt => ({ ...attempt, persistence: { status: 'pending' as const } }))
    const finished = await executionRepo.finish(row, { ...log, persistence: { status: 'pending' } }, published)
    if (!finished.success)
      return { ...log, status: 'unknown', persistence: { status: 'unconfirmed' }, error: finished.error.message, occurrenceId }
    // 终态已确认，后续日志故障只能留下 pending，不能改写业务结果或重新执行。
    const projected = await repairExecutionLogs(occurrenceId)
    log.persistence = projected.success ? { status: 'persisted' } : { status: 'pending', error: { code: String(projected.error.code), message: projected.error.message } }
    if (!projected.success)
      logger.warn('Execution completed with pending log persistence', { taskId: task.id, occurrenceId, errorCode: projected.error.code })
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

/**
 * 启动本节点扫描器；每轮从 DB 时间选定分钟，租约授权仍由最终 SQL 原子条件决定。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * // 生命周期已绑定任务、执行和日志仓库后才启动扫描。
 * startTimer(1000)
 * stopTimer()
 * ```
 */
export function startTimer(tickInterval: number): void {
  lastTickMinute = -1
  tickTimer = setInterval(tick, tickInterval)
}

/**
 * 停止新领取，已经开始的任务由 drainRunner 处理。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * stopTimer()
 * await drainRunner()
 * ```
 */
export function stopTimer(): void {
  if (tickTimer)
    clearInterval(tickTimer)
  tickTimer = null
}
