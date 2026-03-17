/**
 * @h-ai/audit — 错误码与配置
 *
 * 定义审计模块的错误码常量与初始化配置类型。
 * @module audit-config
 */

import { z } from 'zod'

// ─── 错误码 ───

/**
 * 审计模块错误码（数值范围 10000–10999）
 *
 * - 通用操作错误：10000–10009（LOG_FAILED / QUERY_FAILED / CLEANUP_FAILED / STATS_FAILED）
 * - 初始化相关错误：10010–10019（NOT_INITIALIZED / CONFIG_ERROR）
 *
 * @example
 * ```ts
 * import { audit, AuditErrorCode } from '@h-ai/audit'
 *
 * const result = await audit.log({ action: 'login', resource: 'auth' })
 * if (!result.success && result.error.code === AuditErrorCode.NOT_INITIALIZED) {
 *   // 审计模块尚未初始化
 * }
 * ```
 */
export const AuditErrorCode = {
  /** 审计日志记录失败（写入数据库出错） */
  LOG_FAILED: 10000,
  /** 审计日志查询失败（SQL 查询出错） */
  QUERY_FAILED: 10001,
  /** 审计日志清理失败（DELETE 操作出错） */
  CLEANUP_FAILED: 10002,
  /** 审计统计查询失败（聚合查询出错） */
  STATS_FAILED: 10003,
  /** 初始化正在进行中，不可并发调用 */
  INIT_IN_PROGRESS: 10004,
  /** 模块未初始化，需先调用 audit.init() */
  NOT_INITIALIZED: 10010,
  /** 初始化配置错误（如标识符非法） */
  CONFIG_ERROR: 10012,
} as const

/**
 * 审计模块错误码联合类型
 *
 * 取 {@link AuditErrorCode} 所有值的联合。
 */
export type AuditErrorCodeType = (typeof AuditErrorCode)[keyof typeof AuditErrorCode]

/** 审计错误码 → HTTP 状态码映射 */
export const AuditErrorHttpStatus: Record<number, number> = {
  [AuditErrorCode.LOG_FAILED]: 500,
  [AuditErrorCode.QUERY_FAILED]: 500,
  [AuditErrorCode.CLEANUP_FAILED]: 500,
  [AuditErrorCode.STATS_FAILED]: 500,
  [AuditErrorCode.INIT_IN_PROGRESS]: 409,
  [AuditErrorCode.NOT_INITIALIZED]: 500,
  [AuditErrorCode.CONFIG_ERROR]: 500,
}

// ─── 初始化配置 ───

/**
 * 审计模块初始化配置 Schema（Zod）
 *
 * 所有字段均有默认值，可直接调用 `audit.init()` 无需传参。
 *
 * @example
 * ```ts
 * import { audit } from '@h-ai/audit'
 * import { reldb } from '@h-ai/reldb'
 *
 * await audit.init()
 *
 * // 自定义用户表映射
 * await audit.init({
 *   userTable: 'sys_users',
 *   userIdColumn: 'user_id',
 *   userNameColumn: 'name',
 * })
 * ```
 */
export const AuditInitConfigSchema = z.object({
  /** 用户表名，用于 list 查询时 LEFT JOIN 获取用户名 */
  userTable: z.string().default('hai_iam_users'),
  /** 用户表主键列名，用于 JOIN 条件 */
  userIdColumn: z.string().default('id'),
  /** 用户表用户名列名，用于 SELECT 输出 */
  userNameColumn: z.string().default('username'),
})

/** 审计模块初始化配置（解析后） */
export type AuditInitConfig = z.output<typeof AuditInitConfigSchema>

/** 审计模块初始化配置（传入参数） */
export type AuditInitConfigInput = z.input<typeof AuditInitConfigSchema>
