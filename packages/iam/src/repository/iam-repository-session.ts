/**
 * =============================================================================
 * @hai/iam - 会话存储实现
 * =============================================================================
 *
 * 基于 @hai/db 的会话存储实现。
 *
 * @module iam-repository-session
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type { DbService } from '@hai/db'
import type { IamError, Session, SessionRepository } from '../iam-types.js'
import { err, ok } from '@hai/core'
import { IamErrorCode } from '../iam-config.js'

/**
 * 会话表名
 */
const TABLE_NAME = 'iam_sessions'

/**
 * 会话表结构
 */
const TABLE_SCHEMA = {
  id: { type: 'TEXT' as const, primaryKey: true },
  user_id: { type: 'TEXT' as const, notNull: true },
  access_token: { type: 'TEXT' as const, notNull: true },
  refresh_token: { type: 'TEXT' as const },
  user_agent: { type: 'TEXT' as const },
  ip_address: { type: 'TEXT' as const },
  data: { type: 'JSON' as const },
  created_at: { type: 'TIMESTAMP' as const, notNull: true },
  last_active_at: { type: 'TIMESTAMP' as const, notNull: true },
  expires_at: { type: 'TIMESTAMP' as const, notNull: true },
}

/**
 * 数据库行类型
 */
interface SessionRow {
  id: string
  user_id: string
  access_token: string
  refresh_token: string | null
  user_agent: string | null
  ip_address: string | null
  data: string | null
  created_at: number
  last_active_at: number
  expires_at: number
}

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return crypto.randomUUID()
}

/**
 * 将数据库行转换为 Session
 */
function rowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    userId: row.user_id,
    accessToken: row.access_token,
    refreshToken: row.refresh_token ?? undefined,
    userAgent: row.user_agent ?? undefined,
    ipAddress: row.ip_address ?? undefined,
    data: row.data ? JSON.parse(row.data) : undefined,
    createdAt: new Date(row.created_at),
    lastActiveAt: new Date(row.last_active_at),
    expiresAt: new Date(row.expires_at),
  }
}

/**
 * 创建数据库会话存储
 */
export function createDbSessionRepository(db: DbService): SessionRepository {
  // 确保表存在
  function ensureTable(): Result<void, IamError> {
    const result = db.ddl.createTable(TABLE_NAME, TABLE_SCHEMA, true)
    if (!result.success) {
      return err({
        code: IamErrorCode.REPOSITORY_ERROR,
        message: `创建会话表失败: ${result.error.message}`,
        cause: result.error,
      })
    }

    // 创建索引
    db.ddl.createIndex(TABLE_NAME, 'idx_session_user_id', { columns: ['user_id'] })
    db.ddl.createIndex(TABLE_NAME, 'idx_session_access_token', { columns: ['access_token'], unique: true })
    db.ddl.createIndex(TABLE_NAME, 'idx_session_refresh_token', { columns: ['refresh_token'] })
    db.ddl.createIndex(TABLE_NAME, 'idx_session_expires_at', { columns: ['expires_at'] })

    return ok(undefined)
  }

  // 初始化表
  const initResult = ensureTable()
  if (!initResult.success) {
    throw new Error(initResult.error.message)
  }

  return {
    async create(session): Promise<Result<Session, IamError>> {
      const id = generateId()
      const now = Date.now()

      const result = db.sql.execute(
        `INSERT INTO ${TABLE_NAME} (
          id, user_id, access_token, refresh_token,
          user_agent, ip_address, data,
          created_at, last_active_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          session.userId,
          session.accessToken,
          session.refreshToken ?? null,
          session.userAgent ?? null,
          session.ipAddress ?? null,
          session.data ? JSON.stringify(session.data) : null,
          now,
          session.lastActiveAt.getTime(),
          session.expiresAt.getTime(),
        ],
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: `创建会话失败: ${result.error.message}`,
          cause: result.error,
        })
      }

      return ok({
        id,
        userId: session.userId,
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        userAgent: session.userAgent,
        ipAddress: session.ipAddress,
        data: session.data,
        createdAt: new Date(now),
        lastActiveAt: session.lastActiveAt,
        expiresAt: session.expiresAt,
      })
    },

    async findById(id): Promise<Result<Session | null, IamError>> {
      const result = db.sql.query<SessionRow>(
        `SELECT * FROM ${TABLE_NAME} WHERE id = ?`,
        [id],
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: `查询会话失败: ${result.error.message}`,
          cause: result.error,
        })
      }

      if (result.data.length === 0) {
        return ok(null)
      }

      return ok(rowToSession(result.data[0]))
    },

    async findByAccessToken(accessToken): Promise<Result<Session | null, IamError>> {
      const result = db.sql.query<SessionRow>(
        `SELECT * FROM ${TABLE_NAME} WHERE access_token = ?`,
        [accessToken],
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: `查询会话失败: ${result.error.message}`,
          cause: result.error,
        })
      }

      if (result.data.length === 0) {
        return ok(null)
      }

      return ok(rowToSession(result.data[0]))
    },

    async findByRefreshToken(refreshToken): Promise<Result<Session | null, IamError>> {
      const result = db.sql.query<SessionRow>(
        `SELECT * FROM ${TABLE_NAME} WHERE refresh_token = ?`,
        [refreshToken],
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: `查询会话失败: ${result.error.message}`,
          cause: result.error,
        })
      }

      if (result.data.length === 0) {
        return ok(null)
      }

      return ok(rowToSession(result.data[0]))
    },

    async findByUserId(userId): Promise<Result<Session[], IamError>> {
      const result = db.sql.query<SessionRow>(
        `SELECT * FROM ${TABLE_NAME} WHERE user_id = ?`,
        [userId],
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: `查询会话失败: ${result.error.message}`,
          cause: result.error,
        })
      }

      return ok(result.data.map(rowToSession))
    },

    async update(id, data): Promise<Result<void, IamError>> {
      const setClauses: string[] = []
      const values: unknown[] = []

      if (data.accessToken !== undefined) {
        setClauses.push('access_token = ?')
        values.push(data.accessToken)
      }
      if (data.refreshToken !== undefined) {
        setClauses.push('refresh_token = ?')
        values.push(data.refreshToken ?? null)
      }
      if (data.lastActiveAt !== undefined) {
        setClauses.push('last_active_at = ?')
        values.push(data.lastActiveAt.getTime())
      }
      if (data.expiresAt !== undefined) {
        setClauses.push('expires_at = ?')
        values.push(data.expiresAt.getTime())
      }
      if (data.data !== undefined) {
        setClauses.push('data = ?')
        values.push(data.data ? JSON.stringify(data.data) : null)
      }

      if (setClauses.length === 0) {
        return ok(undefined)
      }

      values.push(id)

      const result = db.sql.execute(
        `UPDATE ${TABLE_NAME} SET ${setClauses.join(', ')} WHERE id = ?`,
        values,
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: `更新会话失败: ${result.error.message}`,
          cause: result.error,
        })
      }

      return ok(undefined)
    },

    async delete(id): Promise<Result<void, IamError>> {
      const result = db.sql.execute(
        `DELETE FROM ${TABLE_NAME} WHERE id = ?`,
        [id],
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: `删除会话失败: ${result.error.message}`,
          cause: result.error,
        })
      }

      return ok(undefined)
    },

    async deleteByUserId(userId): Promise<Result<number, IamError>> {
      const result = db.sql.execute(
        `DELETE FROM ${TABLE_NAME} WHERE user_id = ?`,
        [userId],
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: `删除会话失败: ${result.error.message}`,
          cause: result.error,
        })
      }

      return ok(result.data.changes)
    },

    async deleteExpired(): Promise<Result<number, IamError>> {
      const now = Date.now()
      const result = db.sql.execute(
        `DELETE FROM ${TABLE_NAME} WHERE expires_at < ?`,
        [now],
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: `清理会话失败: ${result.error.message}`,
          cause: result.error,
        })
      }

      return ok(result.data.changes)
    },
  }
}
