/**
 * =============================================================================
 * Admin Console - 审计日志服务
 * =============================================================================
 */

import { core } from '@hai/core'
import { getDb } from '../database.js'

export interface AuditLog {
  id: string
  user_id: string | null
  action: string
  resource: string
  resource_id: string | null
  details: string | null
  ip_address: string | null
  user_agent: string | null
  created_at: string
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

/**
 * 审计日志服务
 */
export const auditService = {
  /**
   * 记录审计日志
   */
  async log(input: CreateAuditLogInput): Promise<AuditLog> {
    const db = getDb()
    const id = core.id.withPrefix('audit_')

    const insertResult = db.sql.execute(
      `INSERT INTO audit_logs (id, user_id, action, resource, resource_id, details, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.userId ?? null,
        input.action,
        input.resource,
        input.resourceId ?? null,
        input.details ? JSON.stringify(input.details) : null,
        input.ipAddress ?? null,
        input.userAgent ?? null,
      ],
    )
    if (!insertResult.success) {
      throw new Error(`记录审计日志失败: ${insertResult.error.message}`)
    }

    const log = await this.getById(id)
    if (!log) {
      throw new Error('记录审计日志后无法获取日志信息')
    }
    return log
  },

  /**
   * 根据 ID 获取日志
   */
  async getById(id: string): Promise<AuditLog | null> {
    const db = getDb()
    const logsResult = db.sql.query<AuditLog>(`SELECT * FROM audit_logs WHERE id = ?`, [id])
    return logsResult.success && logsResult.data.length ? logsResult.data[0] : null
  },

  /**
   * 获取日志列表（分页）
   */
  async list(options: ListAuditLogsOptions = {}): Promise<{ items: AuditLogWithUser[], total: number }> {
    const db = getDb()
    const { page = 1, pageSize = 20 } = options
    const offset = (page - 1) * pageSize

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

    // 获取总数
    const countResult = db.sql.query<{ count: number }>(`SELECT COUNT(*) as count FROM audit_logs a ${whereClause}`, params)
    const total = countResult.success ? (countResult.data[0]?.count ?? 0) : 0

    // 获取分页数据
    const itemsResult = db.sql.query<AuditLogWithUser>(
      `SELECT a.*, u.username
       FROM audit_logs a
       LEFT JOIN users u ON a.user_id = u.id
       ${whereClause}
       ORDER BY a.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    )

    return { items: itemsResult.success ? itemsResult.data : [], total }
  },

  /**
   * 获取用户最近的活动
   */
  async getUserRecent(userId: string, limit = 10): Promise<AuditLog[]> {
    const db = getDb()
    const result = db.sql.query<AuditLog>(
      `SELECT * FROM audit_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
      [userId, limit],
    )
    return result.success ? result.data : []
  },

  /**
   * 清理旧日志
   */
  async cleanup(olderThanDays = 90): Promise<number> {
    const db = getDb()
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - olderThanDays)

    const result = db.sql.execute(`DELETE FROM audit_logs WHERE created_at < ?`, [cutoff.toISOString()])
    return result.success ? result.data.changes : 0
  },

  /**
   * 获取统计数据
   */
  async getStats(days = 7): Promise<{ action: string, count: number }[]> {
    const db = getDb()
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)

    const result = db.sql.query<{ action: string, count: number }>(
      `SELECT action, COUNT(*) as count
       FROM audit_logs
       WHERE created_at >= ?
       GROUP BY action
       ORDER BY count DESC`,
      [cutoff.toISOString()],
    )
    return result.success ? result.data : []
  },
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
