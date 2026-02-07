/**
 * =============================================================================
 * @hai/iam - 会话映射存储实现
 * =============================================================================
 *
 * 基于 @hai/db 的会话映射存储实现，用于有状态会话管理器。
 *
 * @module iam-repository-session-mapping
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type { DbService } from '@hai/db'
import type { IamError, Session, SessionMappingRepository } from '../iam-types.js'
import { err, ok } from '@hai/core'
import { IamErrorCode } from '../iam-config.js'
import { iamM } from '../iam-i18n.js'

// =============================================================================
// 会话存储表
// =============================================================================

const SESSION_TABLE = 'iam_session_store'
const SESSION_SCHEMA = {
  session_id: { type: 'TEXT' as const, primaryKey: true },
  session_data: { type: 'JSON' as const, notNull: true },
  expires_at: { type: 'TIMESTAMP' as const, notNull: true },
  created_at: { type: 'TIMESTAMP' as const, notNull: true },
}

// =============================================================================
// 令牌映射表
// =============================================================================

const TOKEN_MAPPING_TABLE = 'iam_token_mappings'
const TOKEN_MAPPING_SCHEMA = {
  token: { type: 'TEXT' as const, primaryKey: true },
  session_id: { type: 'TEXT' as const, notNull: true },
  expires_at: { type: 'TIMESTAMP' as const, notNull: true },
  created_at: { type: 'TIMESTAMP' as const, notNull: true },
}

// =============================================================================
// 用户会话映射表
// =============================================================================

const USER_SESSION_TABLE = 'iam_user_sessions'
const USER_SESSION_SCHEMA = {
  id: { type: 'TEXT' as const, primaryKey: true },
  user_id: { type: 'TEXT' as const, notNull: true },
  session_id: { type: 'TEXT' as const, notNull: true },
  created_at: { type: 'TIMESTAMP' as const, notNull: true },
}

// =============================================================================
// 数据库行类型
// =============================================================================

interface SessionRow {
  session_id: string
  session_data: string
  expires_at: number
  created_at: number
}

interface TokenMappingRow {
  token: string
  session_id: string
  expires_at: number
  created_at: number
}

interface UserSessionRow {
  id: string
  user_id: string
  session_id: string
  created_at: number
}

/**
 * 判断是否过期
 */
function isExpired(expiresAt: number, now = Date.now()): boolean {
  return now > expiresAt
}

/**
 * 恢复会话 Date 字段
 */
function restoreSessionDates(session: Session): Session {
  return {
    ...session,
    createdAt: new Date(session.createdAt),
    lastActiveAt: new Date(session.lastActiveAt),
    expiresAt: new Date(session.expiresAt),
  }
}

/**
 * 解析会话数据
 */
function parseSessionData(raw: string): Result<Session, IamError> {
  try {
    const parsed = JSON.parse(raw) as Session
    return ok(restoreSessionDates(parsed))
  }
  catch {
    return err({
      code: IamErrorCode.REPOSITORY_ERROR,
      message: iamM('iam_parseSessionDataFailed'),
    })
  }
}

/**
 * 解析会话行
 */
function parseSessionRow(row: SessionRow): Result<Session, IamError> {
  return parseSessionData(row.session_data)
}

/**
 * 获取用户会话 ID
 */
function getUserSessionId(row: UserSessionRow): string {
  return row.session_id
}

/**
 * 创建数据库会话映射存储（用于有状态会话管理器）
 */
export async function createDbSessionMappingRepository(db: DbService): Promise<SessionMappingRepository> {
  // 确保表存在
  async function ensureTables(): Promise<Result<void, IamError>> {
    // 创建会话表
    const sessionResult = await db.ddl.createTable(SESSION_TABLE, SESSION_SCHEMA, true)
    if (!sessionResult.success) {
      return err({
        code: IamErrorCode.REPOSITORY_ERROR,
        message: iamM('iam_createSessionStoreTableFailed', { params: { message: sessionResult.error.message } }),
        cause: sessionResult.error,
      })
    }

    // 创建令牌映射表
    const tokenResult = await db.ddl.createTable(TOKEN_MAPPING_TABLE, TOKEN_MAPPING_SCHEMA, true)
    if (!tokenResult.success) {
      return err({
        code: IamErrorCode.REPOSITORY_ERROR,
        message: iamM('iam_createTokenMappingTableFailed', { params: { message: tokenResult.error.message } }),
        cause: tokenResult.error,
      })
    }

    // 创建用户会话表
    const userSessionResult = await db.ddl.createTable(USER_SESSION_TABLE, USER_SESSION_SCHEMA, true)
    if (!userSessionResult.success) {
      return err({
        code: IamErrorCode.REPOSITORY_ERROR,
        message: iamM('iam_createUserSessionTableFailed', { params: { message: userSessionResult.error.message } }),
        cause: userSessionResult.error,
      })
    }

    const indexResults = await Promise.all([
      db.ddl.createIndex(TOKEN_MAPPING_TABLE, 'idx_token_mapping_session', { columns: ['session_id'] }),
      db.ddl.createIndex(USER_SESSION_TABLE, 'idx_user_session_user', { columns: ['user_id'] }),
      db.ddl.createIndex(USER_SESSION_TABLE, 'idx_user_session_session', { columns: ['session_id'] }),
      db.ddl.createIndex(USER_SESSION_TABLE, 'idx_user_session_unique', {
        columns: ['user_id', 'session_id'],
        unique: true,
      }),
    ])
    for (const indexResult of indexResults) {
      if (!indexResult.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_createSessionStoreIndexFailed', { params: { message: indexResult.error.message } }),
          cause: indexResult.error,
        })
      }
    }

    return ok(undefined)
  }

  const initResult = await ensureTables()
  if (!initResult.success) {
    throw new Error(initResult.error.message)
  }

  async function deleteTokenMappingInternal(token: string): Promise<Result<void, IamError>> {
    const result = await db.sql.execute(
      `DELETE FROM ${TOKEN_MAPPING_TABLE} WHERE token = ?`,
      [token],
    )

    if (!result.success) {
      return err({
        code: IamErrorCode.REPOSITORY_ERROR,
        message: iamM('iam_deleteTokenMappingFailed', { params: { message: result.error.message } }),
        cause: result.error,
      })
    }

    return ok(undefined)
  }

  async function deleteSessionInternal(sessionId: string): Promise<Result<void, IamError>> {
    const sessionResult = await db.sql.execute(
      `DELETE FROM ${SESSION_TABLE} WHERE session_id = ?`,
      [sessionId],
    )

    if (!sessionResult.success) {
      return err({
        code: IamErrorCode.REPOSITORY_ERROR,
        message: iamM('iam_deleteSessionFailed', { params: { message: sessionResult.error.message } }),
        cause: sessionResult.error,
      })
    }

    const tokenResult = await db.sql.execute(
      `DELETE FROM ${TOKEN_MAPPING_TABLE} WHERE session_id = ?`,
      [sessionId],
    )

    if (!tokenResult.success) {
      return err({
        code: IamErrorCode.REPOSITORY_ERROR,
        message: iamM('iam_deleteTokenMappingFailed', { params: { message: tokenResult.error.message } }),
        cause: tokenResult.error,
      })
    }

    const userSessionResult = await db.sql.execute(
      `DELETE FROM ${USER_SESSION_TABLE} WHERE session_id = ?`,
      [sessionId],
    )

    if (!userSessionResult.success) {
      return err({
        code: IamErrorCode.REPOSITORY_ERROR,
        message: iamM('iam_deleteUserSessionMappingFailed', { params: { message: userSessionResult.error.message } }),
        cause: userSessionResult.error,
      })
    }

    return ok(undefined)
  }

  return {
    async set(sessionId, session, ttl): Promise<Result<void, IamError>> {
      const now = Date.now()
      const expiresAt = now + ttl * 1000

      const result = await db.sql.execute(
        `INSERT OR REPLACE INTO ${SESSION_TABLE} (session_id, session_data, expires_at, created_at)
         VALUES (?, ?, ?, ?)`,
        [sessionId, JSON.stringify(session), expiresAt, now],
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_saveSessionFailed', { params: { message: result.error.message } }),
          cause: result.error,
        })
      }

      return ok(undefined)
    },

    async get(sessionId): Promise<Result<Session | null, IamError>> {
      const result = await db.sql.query<SessionRow>(
        `SELECT * FROM ${SESSION_TABLE} WHERE session_id = ?`,
        [sessionId],
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_querySessionFailed', { params: { message: result.error.message } }),
          cause: result.error,
        })
      }

      if (result.data.length === 0) {
        return ok(null)
      }

      const row = result.data[0]
      if (isExpired(row.expires_at)) {
        await deleteSessionInternal(sessionId)
        return ok(null)
      }

      const parseResult = parseSessionRow(row)
      if (!parseResult.success) {
        return parseResult
      }

      return ok(parseResult.data)
    },

    async getSessionIdByToken(token): Promise<Result<string | null, IamError>> {
      const result = await db.sql.query<TokenMappingRow>(
        `SELECT * FROM ${TOKEN_MAPPING_TABLE} WHERE token = ?`,
        [token],
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_queryTokenMappingFailed', { params: { message: result.error.message } }),
          cause: result.error,
        })
      }

      if (result.data.length === 0) {
        return ok(null)
      }

      const row = result.data[0]
      if (isExpired(row.expires_at)) {
        await deleteTokenMappingInternal(token)
        return ok(null)
      }

      return ok(row.session_id)
    },

    async setTokenMapping(token, sessionId, ttl): Promise<Result<void, IamError>> {
      const now = Date.now()
      const expiresAt = now + ttl * 1000

      const result = await db.sql.execute(
        `INSERT OR REPLACE INTO ${TOKEN_MAPPING_TABLE} (token, session_id, expires_at, created_at)
         VALUES (?, ?, ?, ?)`,
        [token, sessionId, expiresAt, now],
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_saveTokenMappingFailed', { params: { message: result.error.message } }),
          cause: result.error,
        })
      }

      return ok(undefined)
    },

    async deleteTokenMapping(token): Promise<Result<void, IamError>> {
      return deleteTokenMappingInternal(token)
    },

    async delete(sessionId): Promise<Result<void, IamError>> {
      return deleteSessionInternal(sessionId)
    },

    async getUserSessionIds(userId): Promise<Result<string[], IamError>> {
      const result = await db.sql.query<UserSessionRow>(
        `SELECT session_id FROM ${USER_SESSION_TABLE} WHERE user_id = ?`,
        [userId],
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_queryUserSessionFailed', { params: { message: result.error.message } }),
          cause: result.error,
        })
      }

      return ok(result.data.map(getUserSessionId))
    },

    async addUserSession(userId, sessionId): Promise<Result<void, IamError>> {
      const id = crypto.randomUUID()
      const now = Date.now()

      const result = await db.sql.execute(
        `INSERT OR IGNORE INTO ${USER_SESSION_TABLE} (id, user_id, session_id, created_at)
         VALUES (?, ?, ?, ?)`,
        [id, userId, sessionId, now],
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_addUserSessionMappingFailed', { params: { message: result.error.message } }),
          cause: result.error,
        })
      }

      return ok(undefined)
    },

    async removeUserSession(userId, sessionId): Promise<Result<void, IamError>> {
      const result = await db.sql.execute(
        `DELETE FROM ${USER_SESSION_TABLE} WHERE user_id = ? AND session_id = ?`,
        [userId, sessionId],
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_deleteUserSessionMappingFailed', { params: { message: result.error.message } }),
          cause: result.error,
        })
      }

      return ok(undefined)
    },
  }
}
