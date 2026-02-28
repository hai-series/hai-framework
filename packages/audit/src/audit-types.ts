/**
 * =============================================================================
 * @h-ai/audit - 公共类型定义
 * =============================================================================
 *
 * 审计模块对外类型：错误接口、实体类型、操作接口、函数接口。
 *
 * @module audit-types
 * =============================================================================
 */

import type { Result } from '@h-ai/core'
import type { AuditErrorCodeType, AuditInitConfig } from './audit-config.js'

// =============================================================================
// 错误类型
// =============================================================================

/** 审计模块错误 */
export interface AuditError {
  code: AuditErrorCodeType
  message: string
  cause?: unknown
}

// =============================================================================
// 实体类型
// =============================================================================

/** 审计日志记录 */
export interface AuditLog {
  id: string
  userId: string | null
  action: string
  resource: string
  resourceId: string | null
  details: string | null
  ipAddress: string | null
  userAgent: string | null
  createdAt: Date
}

/** 审计日志记录（含用户名） */
export interface AuditLogWithUser extends AuditLog {
  username: string | null
}

/** 创建审计日志输入 */
export interface CreateAuditLogInput {
  userId?: string | null
  action: string
  resource: string
  resourceId?: string | null
  details?: Record<string, unknown> | null
  ipAddress?: string | null
  userAgent?: string | null
}

/** 审计日志列表查询选项 */
export interface ListAuditLogsOptions {
  userId?: string
  action?: string
  resource?: string
  startDate?: Date
  endDate?: Date
  page?: number
  pageSize?: number
}

/** 审计统计结果 */
export interface AuditStatItem {
  action: string
  count: number
}

// =============================================================================
// 便捷操作接口
// =============================================================================

/** 审计便捷记录器 */
export interface AuditHelper {
  /** 用户登录 */
  login: (userId: string, ip?: string, ua?: string) => Promise<Result<void, AuditError>>
  /** 用户登出 */
  logout: (userId: string, ip?: string, ua?: string) => Promise<Result<void, AuditError>>
  /** 用户注册 */
  register: (userId: string, ip?: string, ua?: string) => Promise<Result<void, AuditError>>
  /** 密码重置请求 */
  passwordResetRequest: (email: string, ip?: string, ua?: string) => Promise<Result<void, AuditError>>
  /** 密码重置完成 */
  passwordResetComplete: (userId: string, ip?: string, ua?: string) => Promise<Result<void, AuditError>>
  /** CRUD 操作 */
  crud: (
    userId: string | null,
    action: 'create' | 'read' | 'update' | 'delete',
    resource: string,
    resourceId?: string,
    details?: Record<string, unknown>,
    ip?: string,
    ua?: string,
  ) => Promise<Result<void, AuditError>>
}

// =============================================================================
// 函数接口
// =============================================================================

/** 审计模块函数接口 */
export interface AuditFunctions {
  /** 初始化审计模块 */
  init: (config: AuditInitConfig) => Promise<Result<void, AuditError>>
  /** 关闭审计模块 */
  close: () => Promise<void>
  /** 当前初始化状态 */
  readonly isInitialized: boolean
  /** 记录审计日志 */
  log: (input: CreateAuditLogInput) => Promise<Result<AuditLog, AuditError>>
  /** 查询审计日志列表（含用户名 JOIN） */
  list: (options?: ListAuditLogsOptions) => Promise<Result<{ items: AuditLogWithUser[], total: number }, AuditError>>
  /** 获取用户最近活动 */
  getUserRecent: (userId: string, limit?: number) => Promise<Result<AuditLog[], AuditError>>
  /** 清理旧日志 */
  cleanup: (olderThanDays?: number) => Promise<Result<number, AuditError>>
  /** 获取统计数据 */
  getStats: (days?: number) => Promise<Result<AuditStatItem[], AuditError>>
  /** 便捷记录器 */
  readonly helper: AuditHelper
}
