/**
 * @h-ai/scheduler — 类型定义
 *
 * 本文件定义定时任务模块的核心接口和类型。
 * @module scheduler-types
 */

import type { ErrorInfo, HaiResult, PaginatedResult, PaginationOptionsInput } from '@h-ai/core'
import type { SchedulerConfig, SchedulerConfigInput } from './scheduler-config.js'
import { core } from '@h-ai/core'

// ─── 错误定义（照 @h-ai/core 范式） ───

const SchedulerErrorInfo = {
  NOT_INITIALIZED: '010:500',
  INIT_FAILED: '011:500',
  CONFIG_ERROR: '012:500',
  TASK_NOT_FOUND: '020:404',
  TASK_ALREADY_EXISTS: '021:409',
  INVALID_CRON: '022:400',
  EXECUTION_FAILED: '023:500',
  JS_EXECUTION_FAILED: '024:500',
  API_EXECUTION_FAILED: '025:502',
  DB_SAVE_FAILED: '026:500',
  ALREADY_RUNNING: '027:409',
  NOT_RUNNING: '028:400',
  LOCK_ACQUIRE_FAILED: '029:409',
  JS_COMPILE_FAILED: '030:500',
  HOOK_EXECUTION_FAILED: '031:500',
} as const satisfies ErrorInfo

export const HaiSchedulerError = core.error.buildHaiErrorsDef('scheduler', SchedulerErrorInfo)

// ─── 任务定义 ───

/** 任务参数字典（键值对） */
export type TaskParams = Record<string, unknown>

/** 任务触发类型 */
export type TaskTriggerType = 'scheduled' | 'manual'

/** 任务处理器类型 */
export type TaskHandlerKind = 'api' | 'js'

/** 失败重试策略 */
export interface TaskRetryPolicy {
  /** 最大尝试次数（包含首次执行，最小 1） */
  maxAttempts: number
  /** 每次重试前的退避时间（毫秒）；按顺序对应第 2、3... 次尝试 */
  backoffMs?: number[]
}

/** 任务执行目标类型 */
export type TaskExecutionTargetType = TaskHandlerKind | 'hook'

/**
 * API 任务配置
 */
export interface ApiTaskConfig {
  /** 处理器类型 */
  kind: 'api'
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
 * JS 任务配置
 *
 * `code` 为 JS 函数字符串，例如：
 * `(context) => ({ taskId: context.task.id, params: context.params })`
 */
export interface JsTaskConfig {
  /** 处理器类型 */
  kind: 'js'
  /** JS 函数字符串 */
  code: string
  /** 软超时时间，单位毫秒 */
  timeout?: number
}

/** 统一任务处理器配置 */
export type TaskHandlerConfig = ApiTaskConfig | JsTaskConfig

/**
 * 任务定义
 *
 * @example
 * ```ts
 * const jsTask: TaskDefinition = {
 *   id: 'cleanup',
 *   name: '清理过期数据',
 *   cron: '0 2 * * *',
 *   params: { channel: 'nightly' },
 *   handler: {
 *     kind: 'js',
 *     code: '(context) => ({ taskId: context.task.id, params: context.params })',
 *   },
 * }
 *
 * const apiTask: TaskDefinition = {
 *   id: 'health-check',
 *   name: '健康检查',
 *   cron: '&#42;/5 * * * *',
 *   handler: {
 *     kind: 'api',
 *     url: 'https://api.example.com/health',
 *     method: 'GET',
 *   },
 * }
 * ```
 */
export interface TaskDefinition {
  /** 任务唯一标识 */
  id: string
  /** 任务名称 */
  name: string
  /** 任务描述 */
  description?: string
  /** cron 表达式（标准 5 字段：分 时 日 月 周） */
  cron: string
  /** 是否启用（默认 true） */
  enabled?: boolean
  /** 是否在执行后自动删除（默认 false） */
  deleteAfterRun?: boolean
  /** 失败重试策略 */
  retry?: TaskRetryPolicy
  /** 通用参数 */
  params?: TaskParams
  /** 任务处理器；为空时可由全局事件回调统一处理 */
  handler?: TaskHandlerConfig
}

// ─── 触发与执行上下文 ───

/**
 * 任务触发信息
 */
export interface TaskTriggerInfo {
  /** 触发类型 */
  type: TaskTriggerType
  /** 触发来源；定时触发时通常为 null，手工触发时可指定渠道 */
  source: string | null
}

/**
 * 任务执行上下文
 */
export interface SchedulerTaskContext {
  /** 当前任务 */
  task: TaskDefinition
  /** 任务 ID */
  taskId: string
  /** 当前参数快照 */
  params: TaskParams
  /** 触发信息 */
  trigger: TaskTriggerInfo
}

/** 编译后的 JS 任务函数 */
export type JsTaskHandler = (context: SchedulerTaskContext) => unknown | Promise<unknown>

// ─── 生命周期回调 ───

/** 任务开始事件 */
export interface SchedulerTaskStartEvent {
  /** 当前任务 */
  task: TaskDefinition
  /** 触发信息 */
  trigger: TaskTriggerInfo
  /** 开始时间（Unix 时间戳，毫秒） */
  startedAt: number
}

/** 任务执行事件 */
export interface SchedulerTaskExecuteEvent extends SchedulerTaskStartEvent {
  /** 执行上下文 */
  context: SchedulerTaskContext
}

/** 任务中断事件 */
export interface SchedulerTaskInterruptedEvent extends SchedulerTaskStartEvent {
  /** 中断时间（Unix 时间戳，毫秒） */
  interruptedAt: number
  /** 中断原因 */
  reason: string
}

/** 任务结束事件 */
export interface SchedulerTaskFinishEvent extends SchedulerTaskStartEvent {
  /** 结束时间（Unix 时间戳，毫秒） */
  finishedAt: number
  /** 执行日志 */
  log: TaskExecutionLog
}

/**
 * 全局任务生命周期回调
 *
 * - `onTaskExecute` 可用于统一处理无内置 handler 的任务
 * - `onTaskStart` / `onTaskInterrupted` / `onTaskFinish` 用于观测生命周期
 */
export interface SchedulerTaskHooks {
  /** 任务开始前触发 */
  onTaskStart?: (event: SchedulerTaskStartEvent) => void | Promise<void>
  /** 当任务无内置 handler 时，可在此统一执行 */
  onTaskExecute?: (event: SchedulerTaskExecuteEvent) => unknown | Promise<unknown>
  /** 任务被中断时触发 */
  onTaskInterrupted?: (event: SchedulerTaskInterruptedEvent) => void | Promise<void>
  /** 任务结束时触发 */
  onTaskFinish?: (event: SchedulerTaskFinishEvent) => void | Promise<void>
}

// ─── 执行日志 ───

/** 执行状态 */
export type ExecutionStatus = 'success' | 'failed' | 'interrupted'

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
  /** 执行目标类型 */
  taskType: TaskExecutionTargetType
  /** 触发类型 */
  triggerType: TaskTriggerType
  /** 触发来源 */
  triggerSource: string | null
  /** 执行状态 */
  status: ExecutionStatus
  /** 执行结果（JSON 字符串） */
  result: string | null
  /** 错误或中断信息 */
  error: string | null
  /** 开始时间（Unix 时间戳，毫秒） */
  startedAt: number
  /** 结束时间（Unix 时间戳，毫秒） */
  finishedAt: number
  /** 执行耗时（毫秒） */
  duration: number
}

// ─── 日志查询 ───

/**
 * 执行日志查询选项
 */
export interface LogQueryOptions {
  /** 按任务 ID 过滤 */
  taskId?: string
  /** 按状态过滤 */
  status?: ExecutionStatus
  /** 按触发类型过滤 */
  triggerType?: TaskTriggerType
  /** 按触发来源过滤 */
  triggerSource?: string
  /** 仅查询开始时间 >= startedAfter 的日志（Unix 时间戳毫秒） */
  startedAfter?: number
  /** 仅查询开始时间 <= startedBefore 的日志（Unix 时间戳毫秒） */
  startedBefore?: number
  /** 分页参数（page 从 1 开始，pageSize 默认 20） */
  pagination?: PaginationOptionsInput
}

/** 日志清理策略 */
export interface SchedulerLogCleanupPolicy {
  /** 最多保留日志条数 */
  maxLogs?: number
  /** 最多保留天数 */
  retentionDays?: number
}

// ─── 任务更新 ───

/**
 * 任务更新输入
 *
 * 可更新的字段包括：名称、cron 表达式、启用状态、参数、处理器。
 * 任务 ID 不可更新。
 */
export interface TaskUpdateInput {
  /** 任务名称 */
  name?: string
  /** 任务描述 */
  description?: string
  /** cron 表达式 */
  cron?: string
  /** 是否启用 */
  enabled?: boolean
  /** 是否在执行后自动删除 */
  deleteAfterRun?: boolean
  /** 失败重试策略；传 null 表示清空重试策略 */
  retry?: TaskRetryPolicy | null
  /** 通用参数 */
  params?: TaskParams
  /** 任务处理器；传 null 表示清空内置处理器 */
  handler?: TaskHandlerConfig | null
}

/** 手工触发输入 */
export interface TriggerTaskInput {
  /** 手工触发来源（例如 admin-console / api / cli） */
  source?: string
}

// ─── 初始化输入 ───

/**
 * 调度器初始化输入
 *
 * 包含调度器配置、可选的预定义任务列表，以及可选的全局生命周期回调。
 */
export interface SchedulerInitInput extends SchedulerConfigInput {
  /** 预定义任务列表（从配置中加载，初始化时自动注册） */
  tasks?: TaskDefinition[]
  /** 全局任务生命周期回调 */
  hooks?: SchedulerTaskHooks
}

// ─── 调度器接口 ───

/**
 * 调度器函数接口
 */
export interface SchedulerFunctions {
  /** 初始化调度器 */
  init: (config?: SchedulerInitInput) => Promise<HaiResult<void>>

  /** 注册任务 */
  register: (task: TaskDefinition) => Promise<HaiResult<void>>

  /** 注销任务 */
  unregister: (taskId: string) => Promise<HaiResult<void>>

  /** 更新任务 */
  updateTask: (taskId: string, updates: TaskUpdateInput) => Promise<HaiResult<void>>

  /** 启动调度 */
  start: () => HaiResult<void>

  /** 停止调度 */
  stop: () => HaiResult<void>

  /** 手动触发任务 */
  trigger: (taskId: string, options?: TriggerTaskInput) => Promise<HaiResult<TaskExecutionLog>>

  /** 查询执行日志 */
  getLogs: (options?: LogQueryOptions) => Promise<HaiResult<PaginatedResult<TaskExecutionLog>>>

  /** 设置全局任务生命周期回调 */
  setHooks: (hooks: SchedulerTaskHooks) => HaiResult<void>

  /** 清空全局任务生命周期回调 */
  clearHooks: () => HaiResult<void>

  /** 获取已注册任务列表 */
  readonly tasks: ReadonlyMap<string, TaskDefinition>

  /** 当前配置 */
  readonly config: SchedulerConfig | null

  /** 当前生命周期回调 */
  readonly hooks: Readonly<SchedulerTaskHooks>

  /** 是否已初始化 */
  readonly isInitialized: boolean

  /** 调度器是否正在运行 */
  readonly isRunning: boolean

  /** 关闭调度器 */
  close: () => Promise<void>
}
