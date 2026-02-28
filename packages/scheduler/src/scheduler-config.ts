/**
 * =============================================================================
 * @h-ai/scheduler - 配置 Schema
 * =============================================================================
 *
 * 本文件定义定时任务模块的配置结构，使用 Zod 进行运行时校验。
 *
 * 包含：
 * - 错误码常量（10000-10999 范围）
 * - 调度器配置 Schema
 *
 * @module scheduler-config
 * =============================================================================
 */

import { z } from 'zod'

// =============================================================================
// 错误码常量
// =============================================================================

/**
 * 定时任务错误码（数值范围 10000-10999）
 *
 * @example
 * ```ts
 * import { SchedulerErrorCode } from '@h-ai/scheduler'
 *
 * if (result.error?.code === SchedulerErrorCode.TASK_NOT_FOUND) {
 *     // 处理错误：任务未找到
 * }
 * ```
 */
export const SchedulerErrorCode = {
  /** 模块未初始化 */
  NOT_INITIALIZED: 10000,
  /** 初始化失败 */
  INIT_FAILED: 10001,
  /** 任务未找到 */
  TASK_NOT_FOUND: 10002,
  /** 任务已存在 */
  TASK_ALREADY_EXISTS: 10003,
  /** 无效的 cron 表达式 */
  INVALID_CRON: 10004,
  /** 任务执行失败 */
  EXECUTION_FAILED: 10005,
  /** JS 执行失败 */
  JS_EXECUTION_FAILED: 10006,
  /** API 调用失败 */
  API_EXECUTION_FAILED: 10007,
  /** 数据库保存失败 */
  DB_SAVE_FAILED: 10008,
  /** 调度器已在运行 */
  ALREADY_RUNNING: 10009,
  /** 调度器未运行 */
  NOT_RUNNING: 10010,
} as const

/** 定时任务错误码类型 */
export type SchedulerErrorCodeType = typeof SchedulerErrorCode[keyof typeof SchedulerErrorCode]

// =============================================================================
// 配置 Schema
// =============================================================================

/**
 * 调度器配置 Schema
 *
 * @example
 * ```ts
 * const config = SchedulerConfigSchema.parse({
 *   enableDb: true,
 *   tableName: 'scheduler_logs',
 *   tickInterval: 1000,
 * })
 * ```
 */
export const SchedulerConfigSchema = z.object({
  /** 是否启用数据库记录（默认 true，需要 @h-ai/db 已初始化） */
  enableDb: z.boolean().default(true),
  /** 执行日志表名（默认 'scheduler_logs'） */
  tableName: z.string().default('scheduler_logs'),
  /** 调度检查间隔，单位毫秒（默认 1000，即每秒检查一次） */
  tickInterval: z.number().int().min(100).default(1000),
})

/** 调度器配置类型 */
export type SchedulerConfig = z.infer<typeof SchedulerConfigSchema>

/** 调度器配置输入类型 */
export type SchedulerConfigInput = z.input<typeof SchedulerConfigSchema>
