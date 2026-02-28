/**
 * =============================================================================
 * @h-ai/audit - 审计日志仓库
 * =============================================================================
 *
 * 基于 @h-ai/db BaseCrudRepository 实现审计日志的持久化与查询。
 *
 * @module audit-repository
 * =============================================================================
 */

import type { Result } from '@h-ai/core'
import type { DbFunctions } from '@h-ai/db'
import type { AuditError, AuditLog, AuditLogWithUser, AuditStatItem, ListAuditLogsOptions } from './audit-types.js'

import { core, err, ok } from '@h-ai/core'
import { BaseCrudRepository } from '@h-ai/db'

import { AuditErrorCode } from './audit-config.js'
import { auditM } from './audit-i18n.js'

const logger = core.logger.child({ module: 'audit', scope: 'repository' })

// =============================================================================
// 仓库配置
// =============================================================================

/** 审计日志仓库配置 */
export interface AuditRepositoryConfig {
  /** 审计日志表名 */
  tableName: string
  /** 用户表名 */
  userTable: string
  /** 用户表主键列名 */
  userIdColumn: string
  /** 用户表用户名列名 */
  userNameColumn: string
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
export class AuditLogRepository extends BaseCrudRepository<AuditLog> {
  private readonly repoConfig: AuditRepositoryConfig
  private readonly isSqlite: boolean

  constructor(db: DbFunctions, config: AuditRepositoryConfig) {
    super(db, {
      table: config.tableName,
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
    this.repoConfig = config
    this.isSqlite = db.config?.type === 'sqlite'
  }

  /**
   * 将 Date 转为适合当前数据库类型的 SQL 参数
   *
   * SQLite 存储 TIMESTAMP 为毫秒时间戳，其他数据库使用 ISO 字符串。
   */
  private toDateParam(date: Date): number | string {
    return this.isSqlite ? date.getTime() : date.toISOString()
  }

  /**
   * 记录审计日志
   */
  async log(input: {
    userId?: string | null
    action: string
    resource: string
    resourceId?: string | null
    details?: Record<string, unknown> | null
    ipAddress?: string | null
    userAgent?: string | null
  }): Promise<Result<AuditLog, AuditError>> {
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

    try {
      const createResult = await this.create(data)
      if (!createResult.success) {
        logger.error('Failed to record audit log', { action: input.action, error: createResult.error.message })
        return err({
          code: AuditErrorCode.LOG_FAILED,
          message: auditM('audit_logFailed', { params: { error: createResult.error.message } }),
          cause: createResult.error,
        })
      }

      const auditLog: AuditLog = {
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

      logger.debug('Audit log recorded', { id, action: input.action, resource: input.resource })
      return ok(auditLog)
    }
    catch (error) {
      logger.error('Failed to record audit log', { action: input.action, error })
      return err({
        code: AuditErrorCode.LOG_FAILED,
        message: auditM('audit_logFailed', { params: { error: error instanceof Error ? error.message : String(error) } }),
        cause: error,
      })
    }
  }

  /**
   * 获取日志列表（分页，含用户名 JOIN）
   */
  async listWithUser(options: ListAuditLogsOptions = {}): Promise<Result<{ items: AuditLogWithUser[], total: number }, AuditError>> {
    const conditions: string[] = []
    const params: unknown[] = []
    const { userTable, userIdColumn, userNameColumn, tableName } = this.repoConfig

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
      params.push(this.toDateParam(options.startDate))
    }
    if (options.endDate) {
      conditions.push('a.created_at <= ?')
      params.push(this.toDateParam(options.endDate))
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    try {
      const result = await this.sql().queryPage<AuditLogWithUser>({
        sql: `SELECT a.id, a.user_id AS userId, a.action, a.resource, a.resource_id AS resourceId,
                a.details, a.ip_address AS ipAddress, a.user_agent AS userAgent,
                a.created_at AS createdAt, u.${userNameColumn} AS username
         FROM ${tableName} a
         LEFT JOIN ${userTable} u ON a.user_id = u.${userIdColumn}
         ${whereClause}
         ORDER BY a.created_at DESC`,
        params,
        pagination: { page: options.page, pageSize: options.pageSize },
        overrides: { defaultPageSize: 20 },
      })

      if (!result.success) {
        logger.error('Failed to query audit logs', { error: result.error.message })
        return err({
          code: AuditErrorCode.QUERY_FAILED,
          message: auditM('audit_queryFailed', { params: { error: result.error.message } }),
          cause: result.error,
        })
      }

      return ok({ items: result.data.items, total: result.data.total })
    }
    catch (error) {
      logger.error('Failed to query audit logs', { error })
      return err({
        code: AuditErrorCode.QUERY_FAILED,
        message: auditM('audit_queryFailed', { params: { error: error instanceof Error ? error.message : String(error) } }),
        cause: error,
      })
    }
  }

  /**
   * 获取用户最近的活动
   */
  async getUserRecent(userId: string, limit = 10): Promise<Result<AuditLog[], AuditError>> {
    try {
      const result = await this.findAll({
        where: 'user_id = ?',
        params: [userId],
        orderBy: 'created_at DESC',
        limit,
      })

      if (!result.success) {
        return err({
          code: AuditErrorCode.QUERY_FAILED,
          message: auditM('audit_queryFailed', { params: { error: result.error.message } }),
          cause: result.error,
        })
      }

      return ok(result.data)
    }
    catch (error) {
      return err({
        code: AuditErrorCode.QUERY_FAILED,
        message: auditM('audit_queryFailed', { params: { error: error instanceof Error ? error.message : String(error) } }),
        cause: error,
      })
    }
  }

  /**
   * 清理旧日志
   */
  async cleanupOld(olderThanDays = 90): Promise<Result<number, AuditError>> {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - olderThanDays)

    try {
      const result = await this.sql().execute(
        `DELETE FROM ${this.repoConfig.tableName} WHERE created_at < ?`,
        [this.toDateParam(cutoff)],
      )

      if (!result.success) {
        logger.error('Failed to cleanup audit logs', { error: result.error.message })
        return err({
          code: AuditErrorCode.CLEANUP_FAILED,
          message: auditM('audit_cleanupFailed', { params: { error: result.error.message } }),
          cause: result.error,
        })
      }

      const deleted = result.data.changes
      logger.info('Audit logs cleaned up', { olderThanDays, deleted })
      return ok(deleted)
    }
    catch (error) {
      logger.error('Failed to cleanup audit logs', { error })
      return err({
        code: AuditErrorCode.CLEANUP_FAILED,
        message: auditM('audit_cleanupFailed', { params: { error: error instanceof Error ? error.message : String(error) } }),
        cause: error,
      })
    }
  }

  /**
   * 获取统计数据
   */
  async getStats(days = 7): Promise<Result<AuditStatItem[], AuditError>> {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)

    try {
      const result = await this.sql().query<AuditStatItem>(
        `SELECT action, COUNT(*) as count
         FROM ${this.repoConfig.tableName}
         WHERE created_at >= ?
         GROUP BY action
         ORDER BY count DESC`,
        [this.toDateParam(cutoff)],
      )

      if (!result.success) {
        logger.error('Failed to query audit statistics', { error: result.error.message })
        return err({
          code: AuditErrorCode.STATS_FAILED,
          message: auditM('audit_statsFailed', { params: { error: result.error.message } }),
          cause: result.error,
        })
      }

      return ok(result.data)
    }
    catch (error) {
      logger.error('Failed to query audit statistics', { error })
      return err({
        code: AuditErrorCode.STATS_FAILED,
        message: auditM('audit_statsFailed', { params: { error: error instanceof Error ? error.message : String(error) } }),
        cause: error,
      })
    }
  }
}
