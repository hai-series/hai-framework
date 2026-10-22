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
  /** 最大尝试次数（含首次及崩溃恢复，范围 1–100，默认 1）。 */
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
  /** 请求及完整响应体读取的总超时，单位毫秒（默认 30000） */
  timeout?: number
  /** 响应体实际接收字节上限，必须为正安全整数（默认 1048576，即 1 MiB） */
  maxResponseBytes?: number
}

/**
 * JS 任务配置
 *
 * ⚠️ 安全警示：`code` 仅允许受信任的服务端代码（例如仓库内常量或受控部署配置）。
 * 当前实现通过 Node.js `vm` 便捷执行，不构成安全沙箱；禁止直接接收用户、租户或后台自由输入的 JS 字符串。
 * 多租户或可配置任务优先使用 `kind: 'api'` 或 `hooks.onTaskExecute`。
 *
 * `code` 为 JS 函数字符串，例如：
 * `(context) => ({ taskId: context.task.id, params: context.params })`
 */
export interface JsTaskConfig {
  /** 处理器类型 */
  kind: 'js'
  /** JS 函数字符串（仅允许受信任的服务端代码，不是安全沙箱） */
  code: string
  /** 独立线程执行期限，单位毫秒（默认 30000，含线程启动）；超时终止线程后才允许重试 */
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
  /** IANA 时区，用于解释 cron 墙上时间；省略时使用运行环境默认时区 */
  timezone?: string
  /** 是否启用（默认 true） */
  enabled?: boolean
  /** 是否在执行后自动删除（默认 false） */
  deleteAfterRun?: boolean
  /** 失败重试策略 */
  retry?: TaskRetryPolicy
  /** 全部副作用按 context.occurrenceId 原子持久去重时才为 true；默认 false，未知结果禁止自动重跑。 */
  idempotent?: boolean
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
  /** 一次调度发生的稳定标识；所有重试共享，供宿主构造业务幂等键。 */
  occurrenceId?: string
  /** 当前领取独有的凭据，用于宿主条件提交；续租失败后不能继续产生副作用。 */
  executionToken?: string
  /** 数据库执行序号；与 attempt 组成接收端可比较的 fencing 版本。 */
  sequence?: number
  /** 同一 occurrence 中持久化的尝试次数。 */
  attempt?: number
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
export type JsTaskHandler = (context: SchedulerTaskContext, signal?: AbortSignal) => unknown | Promise<unknown>

// ─── 生命周期回调 ───

/** 任务开始事件 */
export interface SchedulerTaskStartEvent {
  /** 已领取执行的持久身份，观测回调也可据此标记或幂等处理；竞争中断时不存在。 */
  context?: SchedulerTaskContext
  /** 关闭调度器时取消；回调必须停止后续副作用并释放资源 */
  signal: AbortSignal
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
export type ExecutionStatus = 'success' | 'failed' | 'interrupted' | 'unknown'

/**
 * 任务执行日志
 */
export interface TaskExecutionLog {
  /** 持久执行回执；相同定时 occurrence 或手动幂等键共用。 */
  occurrenceId?: string
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
  /** 全部副作用的持久去重能力声明。 */
  idempotent?: boolean
  /** 任务名称 */
  name?: string
  /** 任务描述 */
  description?: string
  /** cron 表达式 */
  cron?: string
  /** IANA 时区；传 null 表示清空任务时区 */
  timezone?: string | null
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
  /** 稳定业务触发键（1–128 字符）；同任务重复使用会命中同一持久执行。 */
  idempotencyKey?: string
}

/**
 * 可信运维可见的执行状态；unknown 继续占用任务串行槽。
 * @example const state: SchedulerExecutionState = 'unknown'
 */
export type SchedulerExecutionState = 'claimed' | 'running' | ExecutionStatus | 'discarded'

/**
 * 不包含代码、参数、URL 或 owner 凭据的共享执行记录。
 * @example const result = await scheduler.execution.get(occurrenceId)
 */
export interface SchedulerExecutionEntry {
  /** 稳定执行回执。 */
  occurrenceId: string
  /** 任务标识。 */
  taskId: string
  /** 共享状态。 */
  status: SchedulerExecutionState
  /** 数据库序号，配合 attempt 用于外部 fencing。 */
  sequence: number
  /** 已开始的尝试次数。 */
  attemptCount: number
  /** 最近状态版本（Unix 毫秒），用于人工裁定条件。 */
  updatedAt: number
}

/**
 * 可信服务端的执行查询与人工核对入口。
 * @example const unknown = await scheduler.execution.listUnknown({ limit: 50 })
 */
export interface SchedulerExecutionOperations {
  /** 按回执查询安全元数据。@example await scheduler.execution.get(occurrenceId) */
  get: (occurrenceId: string) => Promise<HaiResult<SchedulerExecutionEntry | null>>
  /** 有界查询待核对的 unknown；每页 1–100 条。@example await scheduler.execution.listUnknown({ limit: 50, offset: 0 }) */
  listUnknown: (options?: { limit?: number, offset?: number }) => Promise<HaiResult<SchedulerExecutionEntry[]>>
  /** 先终止旧 runner 并核对外部结果，再条件裁定；不能重新排队。@example await scheduler.execution.resolveUnknown(id, { status: 'discarded', expectedUpdatedAt: entry.updatedAt }) */
  resolveUnknown: (occurrenceId: string, resolution: { status: 'success' | 'discarded', expectedUpdatedAt: number }) => Promise<HaiResult<void>>
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
  /** 共享执行状态、未知结果查询与可信人工裁定。 */
  readonly execution: SchedulerExecutionOperations
  /** 刷新共享数据库中的任务定义，用于跨实例配置读取。 */
  refreshTasks: () => Promise<HaiResult<void>>
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
