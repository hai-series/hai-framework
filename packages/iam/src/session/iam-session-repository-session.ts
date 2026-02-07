/**
 * =============================================================================
 * @hai/iam - 会话存储实现
 * =============================================================================
 *
 * 基于 @hai/db 的会话存储实现。
 *
 * @module session/iam-session-repository-session
 * =============================================================================
 */

import type { PaginatedResult, PaginationOptionsInput, Result } from '@hai/core'
import type { CrudCountOptions, CrudFieldDefinition, CrudRepository, DbError, DbService, TxHandle } from '@hai/db'
import type { IamError } from '../iam-core-types.js'
import type { Session } from './iam-session-types.js'
import { err, ok } from '@hai/core'
import { BaseCrudRepository } from '@hai/db'
import { IamErrorCode } from '../iam-config.js'
import { iamM } from '../iam-i18n.js'

// =============================================================================
// 会话存储接口
// =============================================================================

/**
 * 会话存储接口
 */
export interface SessionRepository extends CrudRepository<Session> {
  /**
   * 根据访问令牌获取会话
   */
  findByAccessToken: (accessToken: string, tx?: TxHandle) => Promise<Result<Session | null, IamError>>

  /**
   * 根据刷新令牌获取会话
   */
  findByRefreshToken: (refreshToken: string, tx?: TxHandle) => Promise<Result<Session | null, IamError>>

  /**
   * 获取用户的所有会话
   */
  findByUserId: (userId: string, options?: PaginationOptionsInput, tx?: TxHandle) => Promise<Result<PaginatedResult<Session>, IamError>>

  /**
   * 删除用户的所有会话
   */
  deleteByUserId: (userId: string, tx?: TxHandle) => Promise<Result<number, IamError>>

  /**
   * 清理过期会话
   */
  deleteExpired: (tx?: TxHandle) => Promise<Result<number, IamError>>
}

// =============================================================================
// 会话存储实现
// =============================================================================

/**
 * 会话表名
 */
const TABLE_NAME = 'iam_sessions'

const SESSION_FIELDS: CrudFieldDefinition[] = [
  {
    fieldName: 'id',
    columnName: 'id',
    def: { type: 'TEXT' as const, primaryKey: true },
    select: true,
    create: true,
    update: false,
  },
  {
    fieldName: 'userId',
    columnName: 'user_id',
    def: { type: 'TEXT' as const, notNull: true },
    select: true,
    create: true,
    update: false,
  },
  {
    fieldName: 'accessToken',
    columnName: 'access_token',
    def: { type: 'TEXT' as const, notNull: true },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'refreshToken',
    columnName: 'refresh_token',
    def: { type: 'TEXT' as const },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'userAgent',
    columnName: 'user_agent',
    def: { type: 'TEXT' as const },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'ipAddress',
    columnName: 'ip_address',
    def: { type: 'TEXT' as const },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'data',
    columnName: 'data',
    def: { type: 'JSON' as const },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'createdAt',
    columnName: 'created_at',
    def: { type: 'TIMESTAMP' as const, notNull: true },
    select: true,
    create: true,
    update: false,
  },
  {
    fieldName: 'lastActiveAt',
    columnName: 'last_active_at',
    def: { type: 'TIMESTAMP' as const, notNull: true },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'expiresAt',
    columnName: 'expires_at',
    def: { type: 'TIMESTAMP' as const, notNull: true },
    select: true,
    create: true,
    update: true,
  },
]

let sessionRepositorySingleton: SessionRepository | null = null

export async function createDbSessionRepository(db: DbService): Promise<SessionRepository> {
  if (sessionRepositorySingleton) {
    return sessionRepositorySingleton
  }
  sessionRepositorySingleton = new DbSessionRepository(db)
  return sessionRepositorySingleton
}

class DbSessionRepository extends BaseCrudRepository<Session> implements SessionRepository {
  protected declare readonly db: DbService

  protected sql(tx?: TxHandle) {
    return tx ?? this.db.sql
  }

  constructor(db: DbService) {
    super(db, {
      table: TABLE_NAME,
      fields: SESSION_FIELDS,
    })
  }

  async findByAccessToken(accessToken: string, tx?: TxHandle): Promise<Result<Session | null, IamError>> {
    return this.findOneBy('access_token = ?', [accessToken], tx)
  }

  async findByRefreshToken(refreshToken: string, tx?: TxHandle): Promise<Result<Session | null, IamError>> {
    return this.findOneBy('refresh_token = ?', [refreshToken], tx)
  }

  async findByUserId(
    userId: string,
    options?: PaginationOptionsInput,
    tx?: TxHandle,
  ): Promise<Result<PaginatedResult<Session>, IamError>> {
    const result = await this.findPage({
      where: 'user_id = ?',
      params: [userId],
      orderBy: 'created_at DESC',
      pagination: options,
    }, tx)
    if (!result.success) {
      return this.buildQueryError(result.error, result.error)
    }
    return ok(result.data)
  }

  async deleteByUserId(userId: string, tx?: TxHandle): Promise<Result<number, IamError>> {
    const result = await this.sql(tx).execute(
      `DELETE FROM ${TABLE_NAME} WHERE user_id = ?`,
      [userId],
    )

    if (!result.success) {
      return err({
        code: IamErrorCode.REPOSITORY_ERROR,
        message: iamM('iam_deleteSessionFailed', { params: { message: result.error.message } }),
        cause: result.error,
      })
    }

    return ok(result.data.changes)
  }

  async deleteExpired(tx?: TxHandle): Promise<Result<number, IamError>> {
    const now = Date.now()
    const result = await this.sql(tx).execute(
      `DELETE FROM ${TABLE_NAME} WHERE expires_at < ?`,
      [now],
    )

    if (!result.success) {
      return err({
        code: IamErrorCode.REPOSITORY_ERROR,
        message: iamM('iam_cleanupSessionFailed', { params: { message: result.error.message } }),
        cause: result.error,
      })
    }

    return ok(result.data.changes)
  }

  private buildQueryError(error: { message: string }, cause: unknown): Result<never, IamError> {
    return err({
      code: IamErrorCode.REPOSITORY_ERROR,
      message: iamM('iam_querySessionFailed', { params: { message: error.message } }),
      cause,
    })
  }

  private async findOneBy(where: string, params: unknown[], tx?: TxHandle): Promise<Result<Session | null, IamError>> {
    const result = await this.findAll({ where, params, limit: 1 }, tx)
    if (!result.success) {
      return this.buildQueryError(result.error, result.error)
    }
    return ok(result.data[0] ?? null)
  }

  async exists(options?: CrudCountOptions, tx?: TxHandle): Promise<Result<boolean, DbError>> {
    const result = await this.count(options, tx)
    if (!result.success) {
      return result as Result<boolean, DbError>
    }
    return ok(result.data > 0)
  }
}
