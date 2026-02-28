/**
 * =============================================================================
 * @h-ai/audit - 错误码与配置
 * =============================================================================
 *
 * 定义审计模块的错误码常量与初始化配置类型。
 *
 * @module audit-config
 * =============================================================================
 */

import type { DbFunctions } from '@h-ai/db'

// =============================================================================
// 错误码常量
// =============================================================================

/**
 * 审计模块错误码（数值范围 10000-10999）
 *
 * @example
 * ```ts
 * import { AuditErrorCode } from '@h-ai/audit'
 *
 * if (result.error?.code === AuditErrorCode.NOT_INITIALIZED) {
 *   // 处理错误：审计模块尚未初始化
 * }
 * ```
 */
export const AuditErrorCode = {
  /** 记录失败 */
  LOG_FAILED: 10000,
  /** 查询失败 */
  QUERY_FAILED: 10001,
  /** 清理失败 */
  CLEANUP_FAILED: 10002,
  /** 统计失败 */
  STATS_FAILED: 10003,
  /** 模块未初始化 */
  NOT_INITIALIZED: 10010,
  /** 配置错误 */
  CONFIG_ERROR: 10012,
} as const

/** 审计模块错误码类型 */
export type AuditErrorCodeType = (typeof AuditErrorCode)[keyof typeof AuditErrorCode]

// =============================================================================
// 初始化配置
// =============================================================================

/**
 * 审计模块初始化配置
 *
 * @example
 * ```ts
 * await audit.init({ db })
 * ```
 */
export interface AuditInitConfig {
  /** 数据库服务实例（已初始化的 @h-ai/db） */
  db: DbFunctions
  /** 审计日志表名（默认 'audit_logs'） */
  tableName?: string
  /** 用户表名，用于 list 查询时 JOIN 获取用户名（默认 'users'） */
  userTable?: string
  /** 用户表主键列名（默认 'id'） */
  userIdColumn?: string
  /** 用户表用户名列名（默认 'username'） */
  userNameColumn?: string
}
