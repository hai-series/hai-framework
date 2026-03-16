/**
 * @h-ai/scheduler — 配置 Schema
 *
 * 本文件定义定时任务模块的配置结构，使用 Zod 进行运行时校验。
 * @module scheduler-config
 */

import { z } from 'zod'

// ─── 错误码常量 ───

/**
 * 定时任务模块错误码常量
 *
 * 数值范围 11000–11999，按类别分段：
 * - 初始化: 11010–11019
 * - 业务操作: 11020+
 *
 * @example
 * ```ts
 * import { SchedulerErrorCode } from '@h-ai/scheduler'
 *
 * if (!result.success && result.error.code === SchedulerErrorCode.TASK_NOT_FOUND) {
 *   // 处理：任务未找到
 * }
 * ```
 */
export const SchedulerErrorCode = {
  // ── 初始化 11010–11019 ──
  /** 模块未初始化（调用 init 前使用了其他 API） */
  NOT_INITIALIZED: 11010,
  /** 初始化失败（配置校验或日志表创建异常） */
  INIT_FAILED: 11011,
  /** 配置校验失败（Zod Schema 校验不通过） */
  CONFIG_ERROR: 11012,

  // ── 业务操作 11020+ ──
  /** 任务未找到（taskId 不在注册表中） */
  TASK_NOT_FOUND: 11020,
  /** 任务已存在（重复注册同一 taskId） */
  TASK_ALREADY_EXISTS: 11021,
  /** 无效的 cron 表达式（croner 解析失败） */
  INVALID_CRON: 11022,
  /** 任务执行失败（通用，含无效配置等） */
  EXECUTION_FAILED: 11023,
  /** JS 处理函数执行失败（handler 抛出异常） */
  JS_EXECUTION_FAILED: 11024,
  /** API 调用失败（网络错误或非 2xx 响应） */
  API_EXECUTION_FAILED: 11025,
  /** 数据库操作失败（日志写入或查询异常） */
  DB_SAVE_FAILED: 11026,
  /** 调度器已在运行（重复调用 start） */
  ALREADY_RUNNING: 11027,
  /** 调度器未运行（未启动时调用 stop） */
  NOT_RUNNING: 11028,
  /** 获取分布式锁失败（其他节点已获锁） */
  LOCK_ACQUIRE_FAILED: 11029,
} as const

/** 定时任务错误码类型 */
export type SchedulerErrorCodeType = typeof SchedulerErrorCode[keyof typeof SchedulerErrorCode]

/** 定时任务错误码 → HTTP 状态码映射 */
export const SchedulerErrorHttpStatus: Record<number, number> = {
  [SchedulerErrorCode.NOT_INITIALIZED]: 500,
  [SchedulerErrorCode.INIT_FAILED]: 500,
  [SchedulerErrorCode.CONFIG_ERROR]: 500,
  [SchedulerErrorCode.TASK_NOT_FOUND]: 404,
  [SchedulerErrorCode.TASK_ALREADY_EXISTS]: 409,
  [SchedulerErrorCode.INVALID_CRON]: 400,
  [SchedulerErrorCode.EXECUTION_FAILED]: 500,
  [SchedulerErrorCode.JS_EXECUTION_FAILED]: 500,
  [SchedulerErrorCode.API_EXECUTION_FAILED]: 502,
  [SchedulerErrorCode.DB_SAVE_FAILED]: 500,
  [SchedulerErrorCode.ALREADY_RUNNING]: 409,
  [SchedulerErrorCode.NOT_RUNNING]: 400,
  [SchedulerErrorCode.LOCK_ACQUIRE_FAILED]: 409,
}

// ─── 配置 Schema ───

/**
 * 调度器配置 Zod Schema
 *
 * 所有字段均可选，提供合理默认值。
 *
 * @example
 * ```ts
 * const config = SchedulerConfigSchema.parse({
 *   enableDb: true,
 *   tickInterval: 1000,
 * })
 * ```
 */
export const SchedulerConfigSchema = z.object({
  /** 是否启用数据库记录（默认 true，需要 @h-ai/reldb 已初始化） */
  enableDb: z.boolean().default(true),
  /** 调度检查间隔，单位毫秒（默认 1000，即每秒检查一次） */
  tickInterval: z.number().int().min(100).default(1000),
  /** 分布式锁过期时间，单位毫秒（默认 300000，即 5 分钟） */
  lockExpireMs: z.number().int().min(10000).default(300000),
  /** 节点标识（默认自动生成 UUID，多节点部署时建议设置固定标识以便审计） */
  nodeId: z.string().min(1).optional(),
})

/** 调度器配置类型 */
export type SchedulerConfig = z.infer<typeof SchedulerConfigSchema>

/** 调度器配置输入类型 */
export type SchedulerConfigInput = z.input<typeof SchedulerConfigSchema>
