/**
 * @h-ai/audit — 审计日志仓库
 *
 * 基于 @h-ai/reldb BaseReldbCrudRepository 实现审计日志的持久化与查询。 仅在需要 JOIN / 聚合时使用自定义 SQL，其余 CRUD 操作由基类处理。
 * @module audit-repository
 */

import type { HaiResult, PaginatedResult } from '@h-ai/core'
import type { DmlWithTxOperations } from '@h-ai/reldb'
import type { AuditActorSnapshot, AuditLog, AuditLogWithUser, AuditOutcomeCounts, AuditStatItem, CreateAuditLogInput, ListAuditLogsOptions } from './audit-types.js'
import { core } from '@h-ai/core'
import { BaseReldbCrudRepository, reldb } from '@h-ai/reldb'
import { auditClockSql, readAuditTime } from './audit-database-time.js'
import { auditM } from './audit-i18n.js'
import { readAuditActorUsername, readStoredAuditActor } from './audit-log-functions.js'
import { HaiAuditError } from './audit-types.js'

const logger = core.logger.child({ module: 'audit', scope: 'repository' })

// ─── 仓库配置 ───

/** 审计日志表名（固定值） */
const AUDIT_TABLE = 'hai_audit_logs'
const DAY_MS = 86_400_000
const mysqlAuditCollation = 'utf8mb4_0900_bin'
const mysqlTextColumns = [
  ['id', 255, ' NOT NULL PRIMARY KEY'],
  ['user_id', 256, ''],
  ['action', 256, ' NOT NULL'],
  ['resource', 256, ' NOT NULL'],
  ['resource_id', 256, ''],
  ['ip_address', 256, ''],
  ['user_agent', 4096, ''],
  ['category', 255, ' NOT NULL'],
  ['outcome', 255, ' NOT NULL'],
  ['severity', 255, ' NOT NULL'],
  ['request_id', 256, ''],
  ['trace_id', 256, ''],
  ['scope_id', 256, ''],
] as const

/**
 * 底层驱动可能以数值或字符串返回 Unix 毫秒，JSON 也在审计边界统一。
 * @example 模块内部上下文
 * ```ts
 * const row: AuditReadRow = { id: 'audit_example', userId: null, action: 'login', resource: 'auth', resourceId: null, details: { source: 'web' }, ipAddress: null, userAgent: null, createdAt: Date.now(), category: 'system', outcome: 'success', severity: 'info' }
 * const record = normalizeAuditLog(row)
 * ```
 */
type AuditReadRow = Omit<AuditLog, 'details' | 'createdAt' | 'actorSnapshot'> & {
  details: unknown
  actorSnapshot?: unknown
  createdAt: string | number | bigint
}

function isAuditOutcome(outcome: unknown): outcome is AuditLog['outcome'] {
  return outcome === 'success' || outcome === 'failure' || outcome === 'denied'
}

/** 保持公开审计契约：Date、JSON 字符串和显式 null。 */
function normalizeAuditLog(row: AuditReadRow): AuditLog {
  if ((row.category !== 'system' && row.category !== 'business')
    || !isAuditOutcome(row.outcome)
    || (row.severity !== 'info' && row.severity !== 'warning' && row.severity !== 'error' && row.severity !== 'critical')) {
    throw new Error(auditM('audit_invalidStoredClassification'))
  }
  const epoch = typeof row.createdAt === 'string' && !/^\d+$/.test(row.createdAt)
    ? Number.NaN
    : Number(row.createdAt ?? Number.NaN)
  const createdAt = new Date(epoch)
  if (!Number.isSafeInteger(epoch) || epoch < 0 || !Number.isFinite(createdAt.getTime()))
    throw new Error('Invalid stored audit event time')
  const userId = row.userId ?? null
  return {
    ...row,
    actorSnapshot: readStoredAuditActor(row.actorSnapshot, userId, row.id),
    userId,
    resourceId: row.resourceId ?? null,
    details: row.details == null
      ? null
      : typeof row.details === 'string'
        ? row.details
        : JSON.stringify(row.details) ?? null,
    ipAddress: row.ipAddress ?? null,
    userAgent: row.userAgent ?? null,
    createdAt,
  }
}

/**
 * 审计仓储内部的用户表关联映射；由已校验的初始化配置构造。
 * @example 模块内部上下文
 * ```ts
 * const config: AuditRepositoryConfig = { userTable: 'app_users', userIdColumn: 'id', userNameColumn: 'username', minimumRetentionDays: 90 }
 * const userTable = config.userTable
 * ```
 */
interface AuditRepositoryConfig {
  /** 用户表名 */
  userTable: string
  /** 用户表主键列名 */
  userIdColumn: string
  /** 用户表用户名列名 */
  userNameColumn: string
  /** 本次初始化的最低保留天数；关闭保护时为 0。 */
  minimumRetentionDays: number
}

/**
 * 用户映射的原始返回。PostgreSQL 可选映射失败携带 SQLSTATE，不破坏事务。
 * @example 模块内部上下文
 * ```ts
 * const mapped: ActorLookupRow = { username: 'operator', sql_state: null }
 * const username = readAuditActorUsername(mapped.username)
 * ```
 */
interface ActorLookupRow {
  username: unknown
  sql_state?: string | null
}

// ─── 仓库 ───

/**
 * 审计日志仓库
 *
 * 通过 BaseReldbCrudRepository 自动建表、字段映射与类型转换，
 * 仅在需要 JOIN / 聚合时使用自定义 SQL。
 *
 * @remarks 此类仅供 audit-main.ts 内部使用，不通过 index.ts 对外导出。
 * @example 模块内部上下文
 * ```ts
 * // 共享 reldb 已初始化，连接生命周期由创建者管理。
 * const repository = new AuditLogRepository({ userTable: 'app_users', userIdColumn: 'id', userNameColumn: 'username', minimumRetentionDays: 0 })
 * const ready = await repository.ready()
 * if (ready.success) {
 *   const stats = await repository.getStats(7)
 *   if (stats.success) stats.data.map(item => item.count)
 * }
 * ```
 */
export class AuditLogRepository extends BaseReldbCrudRepository<AuditReadRow> {
  private readonly repoConfig: AuditRepositoryConfig
  private readonly mysqlTable?: Promise<HaiResult<void>>
  private readonly readiness: Promise<HaiResult<void>>

  /**
   * @param config - 仓库配置（用户表映射）
   */
  constructor(config: AuditRepositoryConfig) {
    const mysql = reldb.config?.type === 'mysql'
    super(reldb, {
      table: AUDIT_TABLE,
      idColumn: 'id',
      generateId: () => core.id.withPrefix('audit_'),
      createTableIfNotExists: !mysql,
      fields: [
        {
          fieldName: 'id',
          columnName: 'id',
          def: { type: 'TEXT', primaryKey: true },
          select: true,
          create: true,
          update: false,
        },
        {
          fieldName: 'userId',
          columnName: 'user_id',
          def: { type: 'TEXT' },
          select: true,
          create: true,
          update: false,
        },
        {
          fieldName: 'action',
          columnName: 'action',
          def: { type: 'TEXT', notNull: true },
          select: true,
          create: true,
          update: false,
        },
        {
          fieldName: 'resource',
          columnName: 'resource',
          def: { type: 'TEXT', notNull: true },
          select: true,
          create: true,
          update: false,
        },
        {
          fieldName: 'resourceId',
          columnName: 'resource_id',
          def: { type: 'TEXT' },
          select: true,
          create: true,
          update: false,
        },
        {
          fieldName: 'details',
          columnName: 'details',
          def: { type: 'JSON' },
          select: true,
          create: true,
          update: false,
        },
        {
          fieldName: 'ipAddress',
          columnName: 'ip_address',
          def: { type: 'TEXT' },
          select: true,
          create: true,
          update: false,
        },
        {
          fieldName: 'userAgent',
          columnName: 'user_agent',
          def: { type: 'TEXT' },
          select: true,
          create: true,
          update: false,
        },
        {
          fieldName: 'category',
          columnName: 'category',
          def: { type: 'TEXT', notNull: true },
          select: true,
          create: true,
          update: false,
        },
        {
          fieldName: 'outcome',
          columnName: 'outcome',
          def: { type: 'TEXT', notNull: true },
          select: true,
          create: true,
          update: false,
        },
        {
          fieldName: 'severity',
          columnName: 'severity',
          def: { type: 'TEXT', notNull: true },
          select: true,
          create: true,
          update: false,
        },
        {
          fieldName: 'requestId',
          columnName: 'request_id',
          def: { type: 'TEXT' },
          select: true,
          create: true,
          update: false,
        },
        {
          fieldName: 'traceId',
          columnName: 'trace_id',
          def: { type: 'TEXT' },
          select: true,
          create: true,
          update: false,
        },
        {
          fieldName: 'scopeId',
          columnName: 'scope_id',
          def: { type: 'TEXT' },
          select: true,
          create: true,
          update: false,
        },
        {
          fieldName: 'actorSnapshot',
          columnName: 'actor_snapshot',
          def: { type: 'JSON' },
          select: true,
          create: true,
          update: false,
        },
        {
          fieldName: 'createdAt',
          columnName: 'created_at',
          def: { type: 'BIGINT', notNull: true },
          select: true,
          create: true,
          update: false,
        },
      ],
    })
    this.repoConfig = config
    if (mysql) {
      const text = mysqlTextColumns.map(([column, width, constraints]) => `${column} VARCHAR(${width})${constraints}`).join(', ')
      this.mysqlTable = this.db.ddl.raw(`CREATE TABLE IF NOT EXISTS ${AUDIT_TABLE} (
        ${text}, details JSON, actor_snapshot JSON, created_at BIGINT NOT NULL
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE ${mysqlAuditCollation}`)
    }
    this.readiness = this.validateSchema()
  }

  protected override async ensureReady(): Promise<HaiResult<void>> {
    const mysql = await this.mysqlTable
    return mysql ?? super.ensureReady()
  }

  /**
   * 等待基类完成建表及字段校验；init和自定义SQL共享此屏障，失败不发布仓库。
   * @returns 建表结果，失败由调用方映射到对应审计错误
   * @example const ready = await repository.ready(); if (!ready.success) return ready
   */
  ready(): Promise<HaiResult<void>> {
    return this.readiness
  }

  private async validateSchema(): Promise<HaiResult<void>> {
    const schema = await this.ensureSchema()
    if (!schema.success)
      return schema
    if (this.db.config?.type === 'sqlite') {
      const columns = await this.db.sql.query<{ name: string, type: string, notnull: number }>(`PRAGMA table_info(${AUDIT_TABLE})`)
      if (!columns.success)
        return columns
      const createdAt = columns.data.find(({ name }) => name === 'created_at')
      return createdAt?.type.toUpperCase() === 'INTEGER' && createdAt.notnull === 1
        ? core.ok(undefined)
        : core.err(HaiAuditError.CONFIG_ERROR, auditM('audit_timestampPrecisionRequired'))
    }
    const schemaName = this.mysqlTable ? 'DATABASE()' : 'current_schema()'
    const columns = await this.db.sql.query<{ name: string, kind: string, nullable: string, width: number | string | null, collation: string | null }>(
      `SELECT column_name AS name, data_type AS kind, is_nullable AS nullable, character_maximum_length AS width,
         collation_name AS collation FROM information_schema.columns WHERE table_schema=${schemaName} AND table_name=?`,
      [AUDIT_TABLE],
    )
    if (!columns.success)
      return columns
    const createdAt = columns.data.find(({ name }) => name === 'created_at')
    if (createdAt?.kind !== 'bigint' || createdAt.nullable !== 'NO')
      return core.err(HaiAuditError.CONFIG_ERROR, auditM('audit_timestampPrecisionRequired'))
    if (this.mysqlTable) {
      const correctText = mysqlTextColumns.every(([name, width]) => {
        const column = columns.data.find(candidate => candidate.name === name)
        return column?.kind === 'varchar' && Number(column.width) === width && column.collation === mysqlAuditCollation
      })
      if (!correctText)
        return core.err(HaiAuditError.CONFIG_ERROR, auditM('audit_mysqlLogSchemaInvalid'))
    }
    return core.ok(undefined)
  }

  /** 身份映射可选；名称读失败仍写入明确缺少名称的身份，并留下可观察诊断。 */
  async captureActor(userId: string, tx?: DmlWithTxOperations): Promise<HaiResult<AuditActorSnapshot>> {
    const type = this.db.config?.type
    const quote = type === 'mysql'
      ? '`'
      : '"'
    const identifier = (name: string) => `${quote}${name}${quote}`
    const { userTable, userIdColumn, userNameColumn } = this.repoConfig
    // PostgreSQL 用同一连接上的数据库函数隔离可选查询失败，避免中止调用方的事务。
    const sql = this.sql(tx)
    const result = type === 'postgresql'
      ? await sql.get<ActorLookupRow>('SELECT username, sql_state FROM hai_audit_lookup_actor(?, ?, ?, ?)', [
          userTable,
          userIdColumn,
          userNameColumn,
          userId,
        ])
      : await sql.get<ActorLookupRow>(`SELECT ${identifier(userNameColumn)} AS username FROM ${identifier(userTable)} WHERE ${identifier(userIdColumn)}=?`, [userId])
    if (!result.success) {
      if (type === 'postgresql' && tx)
        return result
      logger.warn('Audit actor name unavailable', { errorCode: result.error.code, traceId: result.error.traceId })
      return core.ok({ id: userId })
    }
    if (result.data?.sql_state) {
      logger.warn('Audit actor name unavailable', { sqlState: result.data.sql_state, traceId: core.context.get().traceId })
      return core.ok({ id: userId })
    }
    const value = result.data?.username
    const username = readAuditActorUsername(value)
    if (value != null && value !== '' && !username)
      logger.warn('Audit actor name does not match snapshot contract', { traceId: core.context.get().traceId })
    return core.ok(username
      ? { id: userId, username }
      : { id: userId })
  }

  private filters(options: ListAuditLogsOptions): { conditions: string[], params: unknown[] } {
    const conditions: string[] = []
    const params: unknown[] = []
    for (const [field, column] of [
      ['userId', 'user_id'],
      ['action', 'action'],
      ['resource', 'resource'],
      ['category', 'category'],
      ['outcome', 'outcome'],
      ['severity', 'severity'],
      ['scopeId', 'scope_id'],
      ['requestId', 'request_id'],
      ['traceId', 'trace_id'],
    ] as const) {
      if (options[field] !== undefined) {
        conditions.push(`a.${column} = ?`)
        params.push(options[field])
      }
    }
    if (options.startDate) {
      conditions.push('a.created_at >= ?')
      params.push(options.startDate.getTime())
    }
    if (options.endDate) {
      conditions.push('a.created_at <= ?')
      params.push(options.endDate.getTime())
    }
    return { conditions, params }
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
  async log(input: CreateAuditLogInput & Pick<AuditLog, 'category' | 'outcome' | 'severity'>, tx?: DmlWithTxOperations): Promise<HaiResult<AuditLog>> {
    logger.trace('Recording audit log', { action: input.action, resource: input.resource })

    const id = core.id.withPrefix('audit_')
    const time = await readAuditTime(this.sql(tx))
    if (!time.success)
      return time
    const now = time.data
    const context = {
      category: input.category,
      outcome: input.outcome,
      severity: input.severity,
      requestId: input.requestId ?? null,
      traceId: input.traceId ?? null,
      scopeId: input.scopeId ?? null,
      actorSnapshot: input.actorSnapshot ?? null,
    }
    const data: Record<string, unknown> = {
      ...context,
      id,
      userId: input.userId ?? null,
      action: input.action,
      resource: input.resource,
      resourceId: input.resourceId ?? null,
      details: input.details ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      createdAt: now.getTime(),
    }

    try {
      const createResult = await this.create(data, tx)
      if (!createResult.success) {
        logger.error('Failed to record audit log', { action: input.action, errorCode: createResult.error.code, traceId: createResult.error.traceId })
        return core.err(
          HaiAuditError.LOG_FAILED,
          auditM('audit_logFailed', {
            params: { error: createResult.error.message },
          }),
          createResult.error,
        )
      }

      const auditLog: AuditLog = {
        ...context,
        id,
        userId: input.userId ?? null,
        action: input.action,
        resource: input.resource,
        resourceId: input.resourceId ?? null,
        details: input.details
          ? JSON.stringify(input.details)
          : null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        createdAt: now,
      }

      logger.trace('Audit log recorded', { id, action: input.action, resource: input.resource })
      return core.ok(auditLog)
    }
    catch (error) {
      logger.error('Failed to record audit log', { action: input.action, error })
      return core.err(
        HaiAuditError.LOG_FAILED,
        auditM('audit_logFailed', {
          params: {
            error: error instanceof Error
              ? error.message
              : String(error),
          },
        }),
        error,
      )
    }
  }

  /**
   * 分页查询日志列表，用户名来自事件时的身份快照。
   *
   * @param options - 过滤条件与分页参数
   * @returns 成功时返回 PaginatedResult（items/total/page/pageSize）；失败时返回 QUERY_FAILED
   */
  async listWithUser(options: ListAuditLogsOptions = {}): Promise<HaiResult<PaginatedResult<AuditLogWithUser>>> {
    const ready = await this.ready()
    if (!ready.success)
      return ready
    logger.debug('Querying audit logs', { userId: options.userId, action: options.action, resource: options.resource })

    const { conditions, params } = this.filters(options)
    // 别名加引号防止 PostgreSQL 折叠大小写。
    const quote = this.db.config?.type === 'mysql'
      ? '`'
      : '"'
    const identifier = (name: string) => `${quote}${name.replaceAll(quote, quote + quote)}${quote}`

    const sortColumns = {
      createdAt: 'created_at',
      action: 'action',
      resource: 'resource',
      category: 'category',
      outcome: 'outcome',
      severity: 'severity',
    }
    const sortBy = options.sortBy ?? 'createdAt'
    const direction = options.sortDirection ?? 'desc'
    if (!Object.hasOwn(sortColumns, sortBy) || !['asc', 'desc'].includes(direction)) {
      return core.err(HaiAuditError.QUERY_FAILED, auditM('audit_invalidInput', {
        params: {
          field: 'sort',
          reason: auditM('audit_sortInvalid'),
        },
      }))
    }
    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : ''

    try {
      const result = await this.sql().queryPage<AuditReadRow>({
        sql: `SELECT a.id, a.user_id AS ${identifier('userId')}, a.action, a.resource, a.resource_id AS ${identifier('resourceId')},
                a.details, a.ip_address AS ${identifier('ipAddress')}, a.user_agent AS ${identifier('userAgent')},
                a.created_at AS ${identifier('createdAt')}, a.category, a.outcome, a.severity,
                a.request_id AS ${identifier('requestId')}, a.trace_id AS ${identifier('traceId')}, a.scope_id AS ${identifier('scopeId')}, a.actor_snapshot AS ${identifier('actorSnapshot')}
         FROM ${AUDIT_TABLE} a
         ${whereClause}
         ORDER BY a.${sortColumns[sortBy]} ${direction.toUpperCase()}, a.id ${direction.toUpperCase()}`,
        params,
        pagination: { page: options.page, pageSize: options.pageSize },
        overrides: { defaultPageSize: 20 },
      })

      if (!result.success) {
        logger.error('Failed to query audit logs', { errorCode: result.error.code, traceId: result.error.traceId })
        return core.err(
          HaiAuditError.QUERY_FAILED,
          auditM('audit_queryFailed', {
            params: { error: result.error.message },
          }),
          result.error,
        )
      }

      return core.ok({
        ...result.data,
        items: result.data.items.map((row) => {
          const record = normalizeAuditLog(row)
          return { ...record, username: record.actorSnapshot?.username ?? null }
        }),
      })
    }
    catch (error) {
      logger.error('Failed to query audit logs', { error })
      return core.err(
        HaiAuditError.QUERY_FAILED,
        auditM('audit_queryFailed', {
          params: {
            error: error instanceof Error
              ? error.message
              : String(error),
          },
        }),
        error,
      )
    }
  }

  /** 归档使用主键游标有界扫描，不关联当前用户名称或改写历史身份。 */
  async archivePage(options: { afterId?: string, from?: Date, cutoff: Date, limit: number }): Promise<HaiResult<AuditLog[]>> {
    const ready = await this.ready()
    if (!ready.success)
      return ready
    const quote = this.db.config?.type === 'mysql'
      ? '`'
      : '"'
    const fields = [
      ['id', 'id'],
      ['user_id', 'userId'],
      ['action', 'action'],
      ['resource', 'resource'],
      ['resource_id', 'resourceId'],
      ['details', 'details'],
      ['ip_address', 'ipAddress'],
      ['user_agent', 'userAgent'],
      ['created_at', 'createdAt'],
      ['category', 'category'],
      ['outcome', 'outcome'],
      ['severity', 'severity'],
      ['request_id', 'requestId'],
      ['trace_id', 'traceId'],
      ['scope_id', 'scopeId'],
      ['actor_snapshot', 'actorSnapshot'],
    ].map(([column, alias]) => `${column} AS ${quote}${alias}${quote}`).join(', ')
    const conditions = ['created_at <= ?']
    const params: unknown[] = [
      options.cutoff.getTime(),
    ]
    if (options.from) {
      conditions.push('created_at >= ?')
      params.push(options.from.getTime())
    }
    if (options.afterId) {
      conditions.push('id > ?')
      params.push(options.afterId)
    }
    params.push(options.limit)
    const result = await this.sql().query<AuditReadRow>(`SELECT ${fields} FROM ${AUDIT_TABLE} WHERE ${conditions.join(' AND ')} ORDER BY id ASC LIMIT ?`, params)
    if (!result.success)
      return result
    try {
      return core.ok(result.data.map(normalizeAuditLog))
    }
    catch (error) {
      return core.err(HaiAuditError.BACKUP_FAILED, auditM('audit_backupFailed'), error)
    }
  }

  /**
   * 获取指定用户的最近活动
   *
   * @param userId - 用户 ID
   * @param limit - 最大返回条数，默认 10
   * @returns 成功时返回 AuditLog 数组（按时间倒序）；失败时返回 QUERY_FAILED
   */
  async getUserRecent(userId: string, limit = 10): Promise<HaiResult<AuditLog[]>> {
    logger.debug('Getting user recent activity', { userId, limit })

    try {
      const result = await this.findAll({
        where: 'user_id = ?',
        params: [userId],
        orderBy: 'created_at DESC, id DESC',
        limit,
      })

      if (!result.success) {
        return core.err(
          HaiAuditError.QUERY_FAILED,
          auditM('audit_queryFailed', {
            params: { error: result.error.message },
          }),
          result.error,
        )
      }

      return core.ok(result.data.map(normalizeAuditLog))
    }
    catch (error) {
      return core.err(
        HaiAuditError.QUERY_FAILED,
        auditM('audit_queryFailed', {
          params: {
            error: error instanceof Error
              ? error.message
              : String(error),
          },
        }),
        error,
      )
    }
  }

  /**
   * 清理指定天数之前的旧日志
   *
   * @param olderThanDays - 保留天数，默认 90；清理此天数之前的日志
   * @returns 成功时返回删除的记录数；失败时返回 CLEANUP_FAILED
   */
  async cleanupOld(olderThanDays = 90): Promise<HaiResult<number>> {
    const ready = await this.ready()
    if (!ready.success)
      return ready
    const days = Math.max(olderThanDays, this.repoConfig.minimumRetentionDays)
    logger.debug('Cleaning up old audit logs', { olderThanDays: days })

    try {
      const result = await this.sql().execute(
        `DELETE FROM ${AUDIT_TABLE} WHERE created_at < (SELECT ${auditClockSql()}) - ?`,
        [
          Math.min(days * DAY_MS, Number.MAX_SAFE_INTEGER),
        ],
      )

      if (!result.success) {
        logger.error('Failed to cleanup audit logs', { errorCode: result.error.code, traceId: result.error.traceId })
        return core.err(
          HaiAuditError.CLEANUP_FAILED,
          auditM('audit_cleanupFailed', {
            params: { error: result.error.message },
          }),
          result.error,
        )
      }

      const deleted = result.data.changes
      if (deleted > 0)
        logger.info('Audit logs cleaned up', { olderThanDays: days, deleted })
      else
        logger.trace('Audit cleanup found no expired records', { olderThanDays: days, deleted })
      return core.ok(deleted)
    }
    catch (error) {
      logger.error('Failed to cleanup audit logs', { error })
      return core.err(
        HaiAuditError.CLEANUP_FAILED,
        auditM('audit_cleanupFailed', {
          params: {
            error: error instanceof Error
              ? error.message
              : String(error),
          },
        }),
        error,
      )
    }
  }

  /** 使用与列表相同的筛选条件，从一条 SQL 读取各结果和总数。 */
  async countByOutcome(options: ListAuditLogsOptions = {}): Promise<HaiResult<AuditOutcomeCounts>> {
    const ready = await this.ready()
    if (!ready.success)
      return ready
    const { conditions, params } = this.filters(options)
    const where = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : ''
    const grouped = await this.sql().query<{ outcome: string | null, count: number | string | bigint }>(
      `SELECT a.outcome, COUNT(*) AS count FROM ${AUDIT_TABLE} a ${where} GROUP BY a.outcome`,
      params,
    )
    if (!grouped.success) {
      logger.error('Failed to query audit outcome counts', { errorCode: grouped.error.code, traceId: grouped.error.traceId })
      return core.err(HaiAuditError.STATS_FAILED, auditM('audit_statsFailed', {
        params: { error: grouped.error.message },
      }), grouped.error)
    }
    const counts: AuditOutcomeCounts = {
      total: 0,
      success: 0,
      failure: 0,
      denied: 0,
    }
    for (const { outcome, count: rawCount } of grouped.data) {
      const count = Number(rawCount)
      if (!Number.isSafeInteger(count) || count < 0 || !Number.isSafeInteger(counts.total + count))
        return core.err(HaiAuditError.STATS_FAILED, auditM('audit_invalidStatCount'))
      if (!isAuditOutcome(outcome))
        return core.err(HaiAuditError.STATS_FAILED, auditM('audit_invalidStoredClassification'))
      counts[outcome] += count
      counts.total += count
    }
    return core.ok(counts)
  }

  /**
   * 获取指定天数内的操作统计（按 action 分组计数）
   *
   * @param days - 统计天数，默认 7
   * @returns 成功时返回 AuditStatItem 数组（按 count 倒序）；失败时返回 STATS_FAILED
   */
  async getStats(days = 7, filters?: Pick<ListAuditLogsOptions, 'category' | 'outcome' | 'severity' | 'scopeId' | 'userId' | 'resource'>): Promise<HaiResult<AuditStatItem[]>> {
    const ready = await this.ready()
    if (!ready.success)
      return ready
    logger.debug('Getting audit statistics', { days })

    const { conditions, params } = this.filters(filters ?? {})
    const clock = auditClockSql()
    conditions.push(`a.created_at >= (SELECT ${clock}) - ?`)
    params.push(Math.min(days * DAY_MS, Number.MAX_SAFE_INTEGER))

    try {
      const result = await this.sql().query<{ action: string, count: number | string | bigint }>(
        `SELECT action, COUNT(*) as count
         FROM ${AUDIT_TABLE} a
         WHERE ${conditions.join(' AND ')}
         GROUP BY action
         ORDER BY count DESC`,
        params,
      )

      if (!result.success) {
        logger.error('Failed to query audit statistics', { errorCode: result.error.code, traceId: result.error.traceId })
        return core.err(
          HaiAuditError.STATS_FAILED,
          auditM('audit_statsFailed', {
            params: { error: result.error.message },
          }),
          result.error,
        )
      }

      const statistics = result.data.map(item => ({
        action: item.action,
        count: Number(item.count),
      }))
      if (statistics.some(item => !Number.isSafeInteger(item.count) || item.count < 0))
        return core.err(HaiAuditError.STATS_FAILED, auditM('audit_invalidStatCount'))
      return core.ok(statistics)
    }
    catch (error) {
      logger.error('Failed to query audit statistics', { error })
      return core.err(
        HaiAuditError.STATS_FAILED,
        auditM('audit_statsFailed', {
          params: {
            error: error instanceof Error
              ? error.message
              : String(error),
          },
        }),
        error,
      )
    }
  }
}
