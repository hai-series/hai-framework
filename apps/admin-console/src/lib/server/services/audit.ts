/**
 * =============================================================================
 * Admin Console - 审计日志服务
 * =============================================================================
 *
 * 基于 @h-ai/db BaseCrudRepository 实现审计日志的持久化与查询。
 * =============================================================================
 */

import type { DbFunctions } from '@h-ai/db'
import { core } from '@h-ai/core'
import { BaseCrudRepository } from '@h-ai/db'

// =============================================================================
// 类型定义
// =============================================================================

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

export interface AuditLogWithUser extends AuditLog {
  username: string | null
}

export interface CreateAuditLogInput {
  userId?: string | null
  action: string
  resource: string
  resourceId?: string | null
  details?: Record<string, unknown> | null
  ipAddress?: string | null
  userAgent?: string | null
}

export interface ListAuditLogsOptions {
  userId?: string
  action?: string
  resource?: string
  startDate?: Date
  endDate?: Date
  page?: number
  pageSize?: number
}

// =============================================================================
// 仓库
// =============================================================================

/**
 * 审计日志仓库
 *
 * 通过 BaseCrudRepository 自动建表、字段映射与类型转换，
 * 仅在需要 JOIN / 聚合时使用自定义 SQL。
 */
class AuditLogRepository extends BaseCrudRepository<AuditLog> {
  constructor(db: DbFunctions) {
    super(db, {
      table: 'audit_logs',
      idColumn: 'id',
      generateId: () => core.id.withPrefix('audit_'),
      fields: [
        { fieldName: 'id', columnName: 'id', def: { type: 'TEXT', primaryKey: true }, select: true, create: true, update: false },
        { fieldName: 'userId', columnName: 'user_id', def: { type: 'TEXT' }, select: true, create: true, update: false },
        { fieldName: 'action', columnName: 'action', def: { type: 'TEXT', notNull: true }, select: true, create: true, update: false },
        { fieldName: 'resource', columnName: 'resource', def: { type: 'TEXT', notNull: true }, select: true, create: true, update: false },
        { fieldName: 'resourceId', columnName: 'resource_id', def: { type: 'TEXT' }, select: true, create: true, update: false },
        { fieldName: 'details', columnName: 'details', def: { type: 'JSON' }, select: true, create: true, update: false },
        { fieldName: 'ipAddress', columnName: 'ip_address', def: { type: 'TEXT' }, select: true, create: true, update: false },
        { fieldName: 'userAgent', columnName: 'user_agent', def: { type: 'TEXT' }, select: true, create: true, update: false },
        { fieldName: 'createdAt', columnName: 'created_at', def: { type: 'TIMESTAMP' }, select: true, create: true, update: false },
      ],
    })
  }

  /**
   * 记录审计日志
   */
  async log(input: CreateAuditLogInput): Promise<AuditLog> {
    const id = core.id.withPrefix('audit_')
    const data: Record<string, unknown> = {
      id,
      userId: input.userId ?? null,
      action: input.action,
      resource: input.resource,
      resourceId: input.resourceId ?? null,
      details: input.details ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    }

    const createResult = await this.create(data)
    if (!createResult.success) {
      throw new Error(createResult.error.message)
    }

    // 所有调用方（audit.*）均不使用返回值，直接构造即可
    return {
      id,
      userId: input.userId ?? null,
      action: input.action,
      resource: input.resource,
      resourceId: input.resourceId ?? null,
      details: input.details ? JSON.stringify(input.details) : null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      createdAt: new Date(),
    }
  }

  /**
   * 获取日志列表（分页，含用户名 JOIN）
   *
   * 使用 DataOperations.queryPage 自动处理 COUNT + LIMIT/OFFSET。
   */
  async list(options: ListAuditLogsOptions = {}): Promise<{ items: AuditLogWithUser[], total: number }> {
    const conditions: string[] = []
    const params: unknown[] = []

    if (options.userId) {
      conditions.push('a.user_id = ?')
      params.push(options.userId)
    }
    if (options.action) {
      conditions.push('a.action = ?')
      params.push(options.action)
    }
    if (options.resource) {
      conditions.push('a.resource = ?')
      params.push(options.resource)
    }
    if (options.startDate) {
      conditions.push('a.created_at >= ?')
      params.push(options.startDate.toISOString())
    }
    if (options.endDate) {
      conditions.push('a.created_at <= ?')
      params.push(options.endDate.toISOString())
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const result = await this.sql().queryPage<AuditLogWithUser>({
      sql: `SELECT a.id, a.user_id AS userId, a.action, a.resource, a.resource_id AS resourceId,
              a.details, a.ip_address AS ipAddress, a.user_agent AS userAgent,
              a.created_at AS createdAt, u.username
       FROM audit_logs a
       LEFT JOIN users u ON a.user_id = u.id
       ${whereClause}
       ORDER BY a.created_at DESC`,
      params,
      pagination: { page: options.page, pageSize: options.pageSize },
      overrides: { defaultPageSize: 20 },
    })

    return result.success
      ? { items: result.data.items, total: result.data.total }
      : { items: [], total: 0 }
  }

  /**
   * 获取用户最近的活动
   */
  async getUserRecent(userId: string, limit = 10): Promise<AuditLog[]> {
    const result = await this.findAll({
      where: 'user_id = ?',
      params: [userId],
      orderBy: 'created_at DESC',
      limit,
    })
    return result.success ? result.data : []
  }

  /**
   * 清理旧日志
   */
  async cleanup(olderThanDays = 90): Promise<number> {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - olderThanDays)

    const result = await this.sql().execute(
      `DELETE FROM audit_logs WHERE created_at < ?`,
      [cutoff.toISOString()],
    )
    return result.success ? result.data.changes : 0
  }

  /**
   * 获取统计数据
   */
  async getStats(days = 7): Promise<{ action: string, count: number }[]> {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)

    const result = await this.sql().query<{ action: string, count: number }>(
      `SELECT action, COUNT(*) as count
       FROM audit_logs
       WHERE created_at >= ?
       GROUP BY action
       ORDER BY count DESC`,
      [cutoff.toISOString()],
    )
    return result.success ? result.data : []
  }
}

// =============================================================================
// 单例与门面
// =============================================================================

let _repo: AuditLogRepository | null = null

/**
 * 初始化审计日志仓库（在 initApp 中调用）
 */
export function initAuditRepository(db: DbFunctions): void {
  _repo = new AuditLogRepository(db)
}

/**
 * 获取审计日志仓库实例
 */
function getRepo(): AuditLogRepository {
  if (!_repo) {
    throw new Error('AuditLogRepository not initialized. Call initAuditRepository(db) first.')
  }
  return _repo
}

/**
 * 审计日志服务（供页面 load 函数使用）
 */
export const auditService = {
  log: (input: CreateAuditLogInput) => getRepo().log(input),
  list: (options?: ListAuditLogsOptions) => getRepo().list(options),
  getUserRecent: (userId: string, limit?: number) => getRepo().getUserRecent(userId, limit),
  cleanup: (olderThanDays?: number) => getRepo().cleanup(olderThanDays),
  getStats: (days?: number) => getRepo().getStats(days),
}

/**
 * 审计日志助手 - 用于快速记录常见操作
 */
export const audit = {
  /** 用户登录 */
  async login(userId: string, ip?: string, ua?: string): Promise<void> {
    await auditService.log({
      userId,
      action: 'login',
      resource: 'auth',
      ipAddress: ip,
      userAgent: ua,
    })
  },

  /** 用户登出 */
  async logout(userId: string, ip?: string, ua?: string): Promise<void> {
    await auditService.log({
      userId,
      action: 'logout',
      resource: 'auth',
      ipAddress: ip,
      userAgent: ua,
    })
  },

  /** 用户注册 */
  async register(userId: string, ip?: string, ua?: string): Promise<void> {
    await auditService.log({
      userId,
      action: 'register',
      resource: 'auth',
      resourceId: userId,
      ipAddress: ip,
      userAgent: ua,
    })
  },

  /** 密码重置请求 */
  async passwordResetRequest(email: string, ip?: string, ua?: string): Promise<void> {
    await auditService.log({
      action: 'password_reset_request',
      resource: 'auth',
      details: { email },
      ipAddress: ip,
      userAgent: ua,
    })
  },

  /** 密码重置完成 */
  async passwordResetComplete(userId: string, ip?: string, ua?: string): Promise<void> {
    await auditService.log({
      userId,
      action: 'password_reset',
      resource: 'auth',
      ipAddress: ip,
      userAgent: ua,
    })
  },

  /** CRUD 操作 */
  async crud(
    userId: string | null,
    action: 'create' | 'read' | 'update' | 'delete',
    resource: string,
    resourceId?: string,
    details?: Record<string, unknown>,
    ip?: string,
    ua?: string,
  ): Promise<void> {
    await auditService.log({
      userId,
      action,
      resource,
      resourceId,
      details,
      ipAddress: ip,
      userAgent: ua,
    })
  },
}
