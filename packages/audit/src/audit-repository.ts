/**
 * =============================================================================
 * @h-ai/audit - 审计日志仓库
 * =============================================================================
 *
 * 基于 @h-ai/db BaseCrudRepository 实现审计日志的持久化与查询。
 * 仅在需要 JOIN / 聚合时使用自定义 SQL，其余 CRUD 操作由基类处理。
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

// ─── 仓库配置 ───

/**
 * 审计日志仓库配置（内部使用）
 *
 * 由 audit-main.ts 在 init() 时构造并传入。
 */
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

// ─── 仓库 ───

/**
 * 审计日志仓库
 *
 * 通过 BaseCrudRepository 自动建表、字段映射与类型转换，
 * 仅在需要 JOIN / 聚合时使用自定义 SQL。
 *
 * @remarks 此类仅供 audit-main.ts 内部使用，不通过 index.ts 对外导出。
 */
export class AuditLogRepository extends BaseCrudRepository<AuditLog> {
  private readonly repoConfig: AuditRepositoryConfig
  private readonly isSqlite: boolean

  /**
   * @param db - 已初始化的数据库服务实例
   * @param config - 仓库配置（表名与用户表映射）
   */
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
   *
   * @param date - 要转换的日期
   * @returns SQLite 返回毫秒时间戳（number），其他返回 ISO 字符串
   */
  private toDateParam(date: Date): number | string {
    return this.isSqlite ? date.getTime() : date.toISOString()
  }

  /**
   * 记录一条审计日志
   *
   * @param input - 日志内容
   * @param input.userId - 操作用户 ID（系统操作可省略）
   * @param input.action - 操作类型（如 login / create）
   * @param input.resource - 资源类型（如 auth / users）
   * @param input.resourceId - 资源 ID（可选）
   * @param input.details - 操作详情对象（可选）
   * @param input.ipAddress - 客户端 IP（可选）
   * @param input.userAgent - 客户端 User-Agent（可选）
   * @returns 成功时返回创建的 AuditLog；失败时返回 LOG_FAILED
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
    logger.debug('Recording audit log', { action: input.action, resource: input.resource })

    const id = core.id.withPrefix('audit_')
    const now = new Date()
    const data: Record<string, unknown> = {
      id,
      userId: input.userId ?? null,
      action: input.action,
      resource: input.resource,
      resourceId: input.resourceId ?? null,
      details: input.details ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      createdAt: now,
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
        createdAt: now,
      }

      logger.info('Audit log recorded', { id, action: input.action, resource: input.resource })
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
   * 分页查询日志列表（含用户名 LEFT JOIN）
   *
   * @param options - 过滤条件与分页参数
   * @returns 成功时返回 { items, total }；失败时返回 QUERY_FAILED
   */
  async listWithUser(options: ListAuditLogsOptions = {}): Promise<Result<{ items: AuditLogWithUser[], total: number }, AuditError>> {
    logger.debug('Querying audit logs', { userId: options.userId, action: options.action, resource: options.resource })

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
   * 获取指定用户的最近活动
   *
   * @param userId - 用户 ID
   * @param limit - 最大返回条数，默认 10
   * @returns 成功时返回 AuditLog 数组（按时间倒序）；失败时返回 QUERY_FAILED
   */
  async getUserRecent(userId: string, limit = 10): Promise<Result<AuditLog[], AuditError>> {
    logger.debug('Getting user recent activity', { userId, limit })

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
   * 清理指定天数之前的旧日志
   *
   * @param olderThanDays - 保留天数，默认 90；清理此天数之前的日志
   * @returns 成功时返回删除的记录数；失败时返回 CLEANUP_FAILED
   */
  async cleanupOld(olderThanDays = 90): Promise<Result<number, AuditError>> {
    logger.debug('Cleaning up old audit logs', { olderThanDays })

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
   * 获取指定天数内的操作统计（按 action 分组计数）
   *
   * @param days - 统计天数，默认 7
   * @returns 成功时返回 AuditStatItem 数组（按 count 倒序）；失败时返回 STATS_FAILED
   */
  async getStats(days = 7): Promise<Result<AuditStatItem[], AuditError>> {
    logger.debug('Getting audit statistics', { days })

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
