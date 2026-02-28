/**
 * =============================================================================
 * @h-ai/scheduler - 任务执行器
 * =============================================================================
 *
 * 负责执行两种类型的任务：
 * - JS 函数任务：执行用户提供的 JS 处理函数
 * - API 任务：发起 HTTP 请求
 *
 * @module scheduler-executor
 * =============================================================================
 */

import type { Result } from '@h-ai/core'
import type { ApiTaskConfig, JsTaskHandler, SchedulerError, TaskExecutionLog } from './scheduler-types.js'

import { core, err, ok } from '@h-ai/core'

import { SchedulerErrorCode } from './scheduler-config.js'
import { schedulerM } from './scheduler-i18n.js'

const logger = core.logger.child({ module: 'scheduler', scope: 'executor' })

// =============================================================================
// JS 任务执行
// =============================================================================

/**
 * 执行 JS 函数任务
 *
 * @param taskId - 任务 ID
 * @param handler - JS 处理函数
 * @returns 执行结果（JSON 序列化后的返回值）
 */
export async function executeJsTask(
  taskId: string,
  handler: JsTaskHandler,
): Promise<Result<string | null, SchedulerError>> {
  try {
    const result = await handler(taskId)
    const serialized = result !== undefined ? JSON.stringify(result) : null
    return ok(serialized)
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error('JS task execution failed', { taskId, error: message })
    return err({
      code: SchedulerErrorCode.JS_EXECUTION_FAILED,
      message: schedulerM('scheduler_jsExecutionFailed', { params: { error: message } }),
      cause: error,
    })
  }
}

// =============================================================================
// API 任务执行
// =============================================================================

/** 默认 API 超时时间（30 秒） */
const DEFAULT_API_TIMEOUT = 30000

/**
 * 执行 API 调用任务
 *
 * @param taskId - 任务 ID
 * @param config - API 调用配置
 * @returns 执行结果（响应体 JSON 字符串）
 */
export async function executeApiTask(
  taskId: string,
  config: ApiTaskConfig,
): Promise<Result<string | null, SchedulerError>> {
  const { url, method = 'GET', headers, body, timeout = DEFAULT_API_TIMEOUT } = config

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)

    const fetchOptions: RequestInit = {
      method,
      headers: {
        ...headers,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      signal: controller.signal,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }

    const response = await fetch(url, fetchOptions)
    clearTimeout(timer)

    const responseText = await response.text()

    if (!response.ok) {
      logger.error('API task returned non-OK status', { taskId, status: response.status, url })
      return err({
        code: SchedulerErrorCode.API_EXECUTION_FAILED,
        message: schedulerM('scheduler_apiExecutionFailed', {
          params: { error: `HTTP ${response.status}: ${responseText.slice(0, 200)}` },
        }),
      })
    }

    return ok(responseText || null)
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error('API task execution failed', { taskId, error: message, url })
    return err({
      code: SchedulerErrorCode.API_EXECUTION_FAILED,
      message: schedulerM('scheduler_apiExecutionFailed', { params: { error: message } }),
      cause: error,
    })
  }
}

// =============================================================================
// 统一执行入口
// =============================================================================

/**
 * 执行任务并生成执行日志
 */
export async function executeTask(
  task: { id: string, name: string, type: 'js' | 'api', handler?: JsTaskHandler, api?: ApiTaskConfig },
): Promise<TaskExecutionLog> {
  const startedAt = Date.now()

  let execResult: Result<string | null, SchedulerError>

  if (task.type === 'js' && task.handler) {
    execResult = await executeJsTask(task.id, task.handler)
  }
  else if (task.type === 'api' && task.api) {
    execResult = await executeApiTask(task.id, task.api)
  }
  else {
    execResult = err({
      code: SchedulerErrorCode.EXECUTION_FAILED,
      message: schedulerM('scheduler_executionFailed', { params: { error: 'Invalid task configuration' } }),
    })
  }

  const finishedAt = Date.now()

  return {
    id: 0, // 由数据库自增赋值
    taskId: task.id,
    taskName: task.name,
    taskType: task.type,
    status: execResult.success ? 'success' : 'failed',
    result: execResult.success ? execResult.data : null,
    error: execResult.success ? null : execResult.error.message,
    startedAt,
    finishedAt,
    duration: finishedAt - startedAt,
  }
}
