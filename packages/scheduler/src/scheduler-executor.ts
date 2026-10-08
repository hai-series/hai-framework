/**
 * @h-ai/scheduler — 任务执行器
 *
 * 负责执行统一任务模型中的 API / JS / Hook 三类执行路径，并生成执行日志。
 * @module scheduler-executor
 */

import type { HaiResult } from '@h-ai/core'
import type { SchedulerLogRepository } from './repositories/index.js'
import type { ExecutionStatus, SchedulerLogCleanupPolicy, SchedulerTaskContext, SchedulerTaskExecuteEvent, SchedulerTaskFinishEvent, SchedulerTaskHooks, SchedulerTaskInterruptedEvent, SchedulerTaskStartEvent, TaskDefinition, TaskExecutionLog, TaskExecutionTargetType, TaskTriggerInfo } from './scheduler-types.js'

import { core, err, ok } from '@h-ai/core'

import { waitWithSignal } from './scheduler-cancellation.js'
import { schedulerM } from './scheduler-i18n.js'
import { compileJsTaskHandler } from './scheduler-js-compiler.js'
import { HaiSchedulerError } from './scheduler-types.js'

const logger = core.logger.child({ module: 'scheduler', scope: 'executor' })

let currentLogRepo: SchedulerLogRepository | null = null
let currentCleanupPolicy: SchedulerLogCleanupPolicy = {}

export function setLogRepository(repo: SchedulerLogRepository | null, cleanupPolicy: SchedulerLogCleanupPolicy = {}): void {
  currentLogRepo = repo
  currentCleanupPolicy = { ...cleanupPolicy }
}

function sanitizeUrl(url: string): string {
  try {
    const parsedUrl = new URL(url)
    if (parsedUrl.password)
      parsedUrl.password = '***'
    if (parsedUrl.username)
      parsedUrl.username = '***'
    return parsedUrl.toString()
  }
  catch {
    return '(invalid url)'
  }
}

function resolveTaskType(task: TaskDefinition, hooks: Readonly<SchedulerTaskHooks>): TaskExecutionTargetType {
  if (task.handler)
    return task.handler.kind

  if (hooks.onTaskExecute)
    return 'hook'

  return 'hook'
}

function createTaskContext(task: TaskDefinition, trigger: TaskTriggerInfo, occurrenceId?: string): SchedulerTaskContext {
  return {
    ...(occurrenceId ? { occurrenceId } : {}),
    task,
    taskId: task.id,
    params: task.params ?? {},
    trigger,
  }
}

async function notifyTaskStart(hooks: Readonly<SchedulerTaskHooks>, event: SchedulerTaskStartEvent): Promise<void> {
  if (!hooks.onTaskStart)
    return

  try {
    await waitWithSignal(() => hooks.onTaskStart!(event), event.signal)
  }
  catch (error) {
    logger.warn('Task start hook failed', { taskId: event.task.id, error })
  }
}

async function notifyTaskInterrupted(hooks: Readonly<SchedulerTaskHooks>, event: SchedulerTaskInterruptedEvent): Promise<void> {
  if (!hooks.onTaskInterrupted)
    return

  try {
    await waitWithSignal(() => hooks.onTaskInterrupted!(event), event.signal)
  }
  catch (error) {
    logger.warn('Task interrupted hook failed', { taskId: event.task.id, error })
  }
}

async function notifyTaskFinish(hooks: Readonly<SchedulerTaskHooks>, event: SchedulerTaskFinishEvent): Promise<void> {
  if (!hooks.onTaskFinish)
    return

  try {
    await waitWithSignal(() => hooks.onTaskFinish!(event), event.signal)
  }
  catch (error) {
    logger.warn('Task finish hook failed', { taskId: event.task.id, error })
  }
}

async function saveExecutionLog(
  task: TaskDefinition,
  trigger: TaskTriggerInfo,
  taskType: TaskExecutionTargetType,
  status: ExecutionStatus,
  startedAt: number,
  finishedAt: number,
  result: string | null,
  error: string | null,
): Promise<TaskExecutionLog> {
  const log: TaskExecutionLog = {
    id: 0,
    taskId: task.id,
    taskName: task.name,
    taskType,
    triggerType: trigger.type,
    triggerSource: trigger.source,
    status,
    result,
    error,
    startedAt,
    finishedAt,
    duration: finishedAt - startedAt,
  }

  if (!currentLogRepo)
    return log

  await currentLogRepo.saveLog(log)

  const cleanupResult = await currentLogRepo.cleanupLogs(currentCleanupPolicy)
  if (!cleanupResult.success) {
    logger.warn('Failed to cleanup execution logs', {
      taskId: task.id,
      error: cleanupResult.error.message,
      maxLogs: currentCleanupPolicy.maxLogs,
      retentionDays: currentCleanupPolicy.retentionDays,
    })
  }

  return log
}

export async function saveInterruptedTaskLog(
  task: TaskDefinition,
  trigger: TaskTriggerInfo,
  reason: string,
  taskType: TaskExecutionTargetType,
  startedAt: number,
  finishedAt: number,
): Promise<TaskExecutionLog> {
  return saveExecutionLog(task, trigger, taskType, 'interrupted', startedAt, finishedAt, null, reason)
}

export async function interruptTask(
  task: TaskDefinition,
  trigger: TaskTriggerInfo,
  reason: string,
  hooks: Readonly<SchedulerTaskHooks>,
  signal: AbortSignal = new AbortController().signal,
): Promise<TaskExecutionLog> {
  const startedAt = Date.now()
  const taskType = resolveTaskType(task, hooks)

  await notifyTaskStart(hooks, { task, trigger, startedAt, signal })

  const finishedAt = Date.now()
  const interruptedLog = await saveInterruptedTaskLog(task, trigger, reason, taskType, startedAt, finishedAt)

  await notifyTaskInterrupted(hooks, {
    task,
    trigger,
    startedAt,
    interruptedAt: finishedAt,
    signal,
    reason,
  })

  return interruptedLog
}

export async function executeJsTask(
  task: TaskDefinition,
  context: SchedulerTaskContext,
  signal: AbortSignal = new AbortController().signal,
): Promise<HaiResult<string | null>> {
  const handler = task.handler
  if (!handler || handler.kind !== 'js') {
    return err(
      HaiSchedulerError.EXECUTION_FAILED,
      schedulerM('scheduler_invalidHandlerConfig', { params: { taskId: task.id } }),
    )
  }

  const compileResult = compileJsTaskHandler(handler)
  if (!compileResult.success)
    return compileResult

  try {
    const result = await compileResult.data(context, signal)
    return ok(result !== undefined ? JSON.stringify(result) : null)
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error('JS task execution failed', { taskId: task.id, error: message })
    return err(
      HaiSchedulerError.JS_EXECUTION_FAILED,
      schedulerM('scheduler_jsExecutionFailed', { params: { error: message } }),
      error,
    )
  }
}

export async function executeApiTask(
  task: TaskDefinition,
  context: SchedulerTaskContext,
  signal: AbortSignal = new AbortController().signal,
): Promise<HaiResult<string | null>> {
  const handler = task.handler
  if (!handler || handler.kind !== 'api') {
    return err(
      HaiSchedulerError.EXECUTION_FAILED,
      schedulerM('scheduler_invalidHandlerConfig', { params: { taskId: task.id } }),
    )
  }

  const { url, method = 'GET', headers, body, timeout = 30000, maxResponseBytes = 1024 * 1024 } = handler
  if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes <= 0)
    return err(HaiSchedulerError.CONFIG_ERROR, schedulerM('scheduler_invalidHandlerConfig', { params: { taskId: task.id } }))
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      method,
      headers: {
        ...headers,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      signal: AbortSignal.any([signal, controller.signal]),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })

    // 超时覆盖响应体读取；按实际字节累计，避免信任 Content-Length。
    let receivedBytes = 0
    let responseText = ''
    const reader = response.body?.getReader()
    if (reader) {
      const decoder = new TextDecoder()
      try {
        while (true) {
          const chunk = await reader.read()
          if (chunk.done)
            break
          receivedBytes += chunk.value.byteLength
          if (receivedBytes > maxResponseBytes) {
            controller.abort()
            return err(HaiSchedulerError.API_EXECUTION_FAILED, schedulerM('scheduler_apiResponseTooLarge', { params: { maxResponseBytes } }))
          }
          responseText += decoder.decode(chunk.value, { stream: true })
        }
        responseText += decoder.decode()
      }
      finally {
        reader.releaseLock()
      }
    }

    if (!response.ok) {
      logger.error('API task returned non-OK status', {
        taskId: context.taskId,
        status: response.status,
        url: sanitizeUrl(url),
      })
      return err(
        HaiSchedulerError.API_EXECUTION_FAILED,
        schedulerM('scheduler_apiExecutionFailed', {
          params: { error: `HTTP ${response.status}: ${responseText.slice(0, 200)}` },
        }),
      )
    }

    return ok(responseText || null)
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error('API task execution failed', { taskId: context.taskId, error: message, url: sanitizeUrl(url) })
    return err(
      HaiSchedulerError.API_EXECUTION_FAILED,
      schedulerM('scheduler_apiExecutionFailed', { params: { error: message } }),
      error,
    )
  }
  finally {
    clearTimeout(timer)
  }
}

async function executeHookTask(
  task: TaskDefinition,
  context: SchedulerTaskContext,
  hooks: Readonly<SchedulerTaskHooks>,
  startedAt: number,
  signal: AbortSignal,
): Promise<HaiResult<string | null>> {
  if (!hooks.onTaskExecute) {
    return err(
      HaiSchedulerError.EXECUTION_FAILED,
      schedulerM('scheduler_taskHandlerMissing', { params: { taskId: task.id } }),
    )
  }

  const executeEvent: SchedulerTaskExecuteEvent = {
    task,
    trigger: context.trigger,
    startedAt,
    context,
    signal,
  }

  try {
    const result = await waitWithSignal(() => hooks.onTaskExecute!(executeEvent), signal)
    return ok(result !== undefined ? JSON.stringify(result) : null)
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error('Task execute hook failed', { taskId: task.id, error: message })
    return err(
      HaiSchedulerError.HOOK_EXECUTION_FAILED,
      schedulerM('scheduler_hookExecutionFailed', { params: { error: message } }),
      error,
    )
  }
}

export async function executeTask(
  task: TaskDefinition,
  trigger: TaskTriggerInfo,
  hooks: Readonly<SchedulerTaskHooks>,
  signal: AbortSignal = new AbortController().signal,
  occurrenceId?: string,
): Promise<TaskExecutionLog> {
  const startedAt = Date.now()
  const taskType = resolveTaskType(task, hooks)
  const context = createTaskContext(task, trigger, occurrenceId)

  await notifyTaskStart(hooks, { task, trigger, startedAt, signal })

  let executionResult: HaiResult<string | null>
  let shouldNotifyInterrupted = false
  if (signal.aborted) {
    executionResult = err(HaiSchedulerError.EXECUTION_FAILED, schedulerM('scheduler_closing'))
    shouldNotifyInterrupted = true
  }
  else if (!task.handler) {
    executionResult = await executeHookTask(task, context, hooks, startedAt, signal)
    // 业务失败需要重试；只有宿主明确跳过或取消才属于 interrupted。
    shouldNotifyInterrupted = !hooks.onTaskExecute || (!executionResult.success && executionResult.error.cause instanceof Error && executionResult.error.cause.name === 'SchedulerTaskSkippedError')
  }
  else if (task.handler.kind === 'api') {
    executionResult = await executeApiTask(task, context, signal)
  }
  else {
    executionResult = await executeJsTask(task, context, signal)
  }

  shouldNotifyInterrupted ||= signal.aborted
  const finishedAt = Date.now()
  const status: ExecutionStatus = executionResult.success
    ? 'success'
    : (shouldNotifyInterrupted ? 'interrupted' : 'failed')
  const log = await saveExecutionLog(
    task,
    trigger,
    taskType,
    status,
    startedAt,
    finishedAt,
    executionResult.success ? executionResult.data : null,
    executionResult.success ? null : executionResult.error.message,
  )

  if (!executionResult.success && shouldNotifyInterrupted) {
    await notifyTaskInterrupted(hooks, {
      task,
      trigger,
      startedAt,
      interruptedAt: finishedAt,
      signal,
      reason: executionResult.error.message,
    })
  }

  if (status !== 'interrupted')
    await notifyTaskFinish(hooks, { task, trigger, startedAt, finishedAt, log, signal })

  return log
}
