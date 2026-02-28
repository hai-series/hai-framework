/**
 * =============================================================================
 * @h-ai/scheduler - 类型定义
 * =============================================================================
 *
 * 本文件定义定时任务模块的核心接口和类型。
 *
 * 包含：
 * - 错误类型（SchedulerError）
 * - 任务定义（TaskDefinition、ApiTaskConfig）
 * - 执行日志（TaskExecutionLog）
 * - 调度器接口（SchedulerFunctions）
 *
 * @module scheduler-types
 * =============================================================================
 */

import type { Result } from '@h-ai/core'
import type { SchedulerConfig, SchedulerConfigInput, SchedulerErrorCodeType } from './scheduler-config.js'

// =============================================================================
// 错误类型
// =============================================================================

/**
 * 定时任务错误接口
 */
export interface SchedulerError {
  /** 错误码 */
  code: SchedulerErrorCodeType
  /** 错误消息 */
  message: string
  /** 原始错误 */
  cause?: unknown
}

// =============================================================================
// 任务定义
// =============================================================================

/**
 * API 任务配置
 *
 * @example
 * ```ts
 * const apiConfig: ApiTaskConfig = {
 *   url: 'https://api.example.com/webhook',
 *   method: 'POST',
 *   headers: { 'Authorization': 'Bearer token' },
 *   body: { event: 'scheduled' },
 * }
 * ```
 */
export interface ApiTaskConfig {
  /** 请求 URL */
  url: string
  /** HTTP 方法（默认 GET） */
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  /** 请求头 */
  headers?: Record<string, string>
  /** 请求体（POST/PUT/PATCH 时使用） */
  body?: unknown
  /** 超时时间，单位毫秒（默认 30000） */
  timeout?: number
}

/**
 * JS 任务处理函数
 *
 * 接收任务 ID 作为参数，返回任意结果。
 */
export type JsTaskHandler = (taskId: string) => unknown | Promise<unknown>

/**
 * 任务定义
 *
 * @example
 * ```ts
 * // JS 函数任务
 * const jsTask: TaskDefinition = {
 *   id: 'cleanup',
 *   name: '清理过期数据',
 *   cron: '0 2 * * *',  // 每天凌晨 2 点
 *   type: 'js',
 *   handler: async () => { await cleanupExpiredData() },
 * }
 *
 * // API 调用任务
 * const apiTask: TaskDefinition = {
 *   id: 'health-check',
 *   name: '健康检查',
 *   cron: '&#42;/5 * * * *',  // 每 5 分钟
 *   type: 'api',
 *   api: { url: 'https://api.example.com/health', method: 'GET' },
 * }
 * ```
 */
export type TaskDefinition = TaskDefinitionJs | TaskDefinitionApi

/** JS 类型任务定义 */
export interface TaskDefinitionJs {
  /** 任务唯一标识 */
  id: string
  /** 任务名称 */
  name: string
  /** cron 表达式（标准 5 字段：分 时 日 月 周） */
  cron: string
  /** 任务类型 */
  type: 'js'
  /** JS 处理函数 */
  handler: JsTaskHandler
  /** 是否启用（默认 true） */
  enabled?: boolean
}

/** API 类型任务定义 */
export interface TaskDefinitionApi {
  /** 任务唯一标识 */
  id: string
  /** 任务名称 */
  name: string
  /** cron 表达式（标准 5 字段：分 时 日 月 周） */
  cron: string
  /** 任务类型 */
  type: 'api'
  /** API 调用配置 */
  api: ApiTaskConfig
  /** 是否启用（默认 true） */
  enabled?: boolean
}

// =============================================================================
// 执行日志
// =============================================================================

/** 执行状态：`'success'` 表示成功，`'failed'` 表示失败 */
export type ExecutionStatus = 'success' | 'failed'

/**
 * 任务执行日志
 */
export interface TaskExecutionLog {
  /** 日志 ID */
  id: number
  /** 任务 ID */
  taskId: string
  /** 任务名称 */
  taskName: string
  /** 任务类型 */
  taskType: 'js' | 'api'
  /** 执行状态 */
  status: ExecutionStatus
  /** 执行结果（JSON 字符串） */
  result: string | null
  /** 错误信息 */
  error: string | null
  /** 开始时间（Unix 时间戳，毫秒） */
  startedAt: number
  /** 结束时间（Unix 时间戳，毫秒） */
  finishedAt: number
  /** 执行耗时（毫秒） */
  duration: number
}

// =============================================================================
// 日志查询
// =============================================================================

/**
 * 执行日志查询选项
 */
export interface LogQueryOptions {
  /** 按任务 ID 过滤 */
  taskId?: string
  /** 按状态过滤 */
  status?: ExecutionStatus
  /** 最大返回条数（默认 50） */
  limit?: number
  /** 偏移量（默认 0） */
  offset?: number
}

// =============================================================================
// 任务更新
// =============================================================================

/**
 * 任务更新输入
 *
 * 可更新的字段包括：名称、cron 表达式、启用状态、API 配置。
 * 任务 ID 和类型不可更新。
 */
export interface TaskUpdateInput {
  /** 任务名称 */
  name?: string
  /** cron 表达式 */
  cron?: string
  /** 是否启用 */
  enabled?: boolean
  /** API 调用配置（仅 API 类型任务可更新） */
  api?: ApiTaskConfig
}

// =============================================================================
// 调度器接口
// =============================================================================

/**
 * 调度器函数接口
 *
 * @example
 * ```ts
 * import { scheduler } from '@h-ai/scheduler'
 *
 * // 初始化
 * await scheduler.init({ enableDb: true })
 *
 * // 注册任务
 * scheduler.register({
 *   id: 'cleanup',
 *   name: '清理过期数据',
 *   cron: '0 2 * * *',
 *   type: 'js',
 *   handler: async () => { ... },
 * })
 *
 * // 启动调度器
 * scheduler.start()
 *
 * // 手动触发任务
 * await scheduler.trigger('cleanup')
 *
 * // 查询执行日志
 * const logs = await scheduler.getLogs({ taskId: 'cleanup', limit: 10 })
 *
 * // 停止并关闭
 * scheduler.stop()
 * await scheduler.close()
 * ```
 */
export interface SchedulerFunctions {
  /** 初始化调度器 */
  init: (config?: SchedulerConfigInput) => Promise<Result<void, SchedulerError>>

  /**
   * 注册任务
   *
   * 若启用 DB 且任务类型为 API，任务定义将持久化到数据库。
   * JS 任务因 handler 不可序列化，不会持久化。
   */
  register: (task: TaskDefinition) => Promise<Result<void, SchedulerError>>

  /**
   * 注销任务
   *
   * 若启用 DB，同时从数据库中删除持久化的任务定义。
   */
  unregister: (taskId: string) => Promise<Result<void, SchedulerError>>

  /**
   * 更新任务
   *
   * 更新已注册任务的配置（cron、name、enabled、api 等）。
   * 若启用 DB 且任务类型为 API，更新后的任务定义将同步到数据库。
   */
  updateTask: (taskId: string, updates: TaskUpdateInput) => Promise<Result<void, SchedulerError>>

  /** 启动调度 */
  start: () => Result<void, SchedulerError>

  /** 停止调度 */
  stop: () => Result<void, SchedulerError>

  /** 手动触发任务 */
  trigger: (taskId: string) => Promise<Result<TaskExecutionLog, SchedulerError>>

  /** 查询执行日志（需启用 DB） */
  getLogs: (options?: LogQueryOptions) => Promise<Result<TaskExecutionLog[], SchedulerError>>

  /** 获取已注册任务列表 */
  readonly tasks: ReadonlyMap<string, TaskDefinition>

  /** 当前配置 */
  readonly config: SchedulerConfig | null

  /** 是否已初始化 */
  readonly isInitialized: boolean

  /** 调度器是否正在运行 */
  readonly isRunning: boolean

  /** 关闭调度器 */
  close: () => Promise<void>
}
