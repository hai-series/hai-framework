/**
 * =============================================================================
 * @hai/iam - 会话存储实现（用于有状态会话管理器）
 * =============================================================================
 *
 * 基于 @hai/db 的 SessionStore 实现，用于 stateful session。
 * 注意：这与 SessionRepository 不同，SessionStore 是用于令牌映射和会话存储的接口。
 *
 * @module iam-repository-session-store
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type { DbService } from '@hai/db'
import type { IamError, Session } from '../iam-types.js'
import type { SessionStore } from '../session/iam-session-stateful.js'
import { err, ok } from '@hai/core'
import { IamErrorCode } from '../iam-config.js'

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
 * 创建数据库会话存储（用于有状态会话管理器）
 */
export function createDbSessionStore(db: DbService): SessionStore {
  // 确保表存在
  function ensureTables(): Result<void, IamError> {
    // 创建会话表
    const sessionResult = db.ddl.createTable(SESSION_TABLE, SESSION_SCHEMA, true)
    if (!sessionResult.success) {
      return err({
        code: IamErrorCode.REPOSITORY_ERROR,
        message: `创建会话存储表失败: ${sessionResult.error.message}`,
        cause: sessionResult.error,
      })
    }

    // 创建令牌映射表
    const tokenResult = db.ddl.createTable(TOKEN_MAPPING_TABLE, TOKEN_MAPPING_SCHEMA, true)
    if (!tokenResult.success) {
      return err({
        code: IamErrorCode.REPOSITORY_ERROR,
        message: `创建令牌映射表失败: ${tokenResult.error.message}`,
        cause: tokenResult.error,
      })
    }

    // 创建用户会话表
    const userSessionResult = db.ddl.createTable(USER_SESSION_TABLE, USER_SESSION_SCHEMA, true)
    if (!userSessionResult.success) {
      return err({
        code: IamErrorCode.REPOSITORY_ERROR,
        message: `创建用户会话表失败: ${userSessionResult.error.message}`,
        cause: userSessionResult.error,
      })
    }

    // 创建索引
    db.ddl.createIndex(TOKEN_MAPPING_TABLE, 'idx_token_mapping_session', { columns: ['session_id'] })
    db.ddl.createIndex(USER_SESSION_TABLE, 'idx_user_session_user', { columns: ['user_id'] })
    db.ddl.createIndex(USER_SESSION_TABLE, 'idx_user_session_session', { columns: ['session_id'] })
    db.ddl.createIndex(USER_SESSION_TABLE, 'idx_user_session_unique', {
      columns: ['user_id', 'session_id'],
      unique: true,
    })

    return ok(undefined)
  }

  const initResult = ensureTables()
  if (!initResult.success) {
    throw new Error(initResult.error.message)
  }

  return {
    async set(sessionId, session, ttl): Promise<Result<void, IamError>> {
      const now = Date.now()
      const expiresAt = now + ttl * 1000 // ttl 是秒数

      const result = db.sql.execute(
        `INSERT OR REPLACE INTO ${SESSION_TABLE} (session_id, session_data, expires_at, created_at)
         VALUES (?, ?, ?, ?)`,
        [sessionId, JSON.stringify(session), expiresAt, now],
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: `保存会话失败: ${result.error.message}`,
          cause: result.error,
        })
      }

      return ok(undefined)
    },

    async get(sessionId): Promise<Result<Session | null, IamError>> {
      const result = db.sql.query<SessionRow>(
        `SELECT * FROM ${SESSION_TABLE} WHERE session_id = ?`,
        [sessionId],
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

      const row = result.data[0]

      // 检查是否已过期
      if (Date.now() > row.expires_at) {
        await this.delete(sessionId)
        return ok(null)
      }

      try {
        const session = JSON.parse(row.session_data) as Session
        // 恢复 Date 对象
        session.createdAt = new Date(session.createdAt)
        session.lastActiveAt = new Date(session.lastActiveAt)
        session.expiresAt = new Date(session.expiresAt)
        return ok(session)
      }
      catch {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: '解析会话数据失败',
        })
      }
    },

    async getSessionIdByToken(token): Promise<Result<string | null, IamError>> {
      const result = db.sql.query<TokenMappingRow>(
        `SELECT * FROM ${TOKEN_MAPPING_TABLE} WHERE token = ?`,
        [token],
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: `查询令牌映射失败: ${result.error.message}`,
          cause: result.error,
        })
      }

      if (result.data.length === 0) {
        return ok(null)
      }

      const row = result.data[0]

      // 检查是否已过期
      if (Date.now() > row.expires_at) {
        await this.deleteTokenMapping(token)
        return ok(null)
      }

      return ok(row.session_id)
    },

    async setTokenMapping(token, sessionId, ttl): Promise<Result<void, IamError>> {
      const now = Date.now()
      const expiresAt = now + ttl * 1000

      const result = db.sql.execute(
        `INSERT OR REPLACE INTO ${TOKEN_MAPPING_TABLE} (token, session_id, expires_at, created_at)
         VALUES (?, ?, ?, ?)`,
        [token, sessionId, expiresAt, now],
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: `保存令牌映射失败: ${result.error.message}`,
          cause: result.error,
        })
      }

      return ok(undefined)
    },

    async deleteTokenMapping(token): Promise<Result<void, IamError>> {
      const result = db.sql.execute(
        `DELETE FROM ${TOKEN_MAPPING_TABLE} WHERE token = ?`,
        [token],
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: `删除令牌映射失败: ${result.error.message}`,
          cause: result.error,
        })
      }

      return ok(undefined)
    },

    async delete(sessionId): Promise<Result<void, IamError>> {
      // 删除会话
      const sessionResult = db.sql.execute(
        `DELETE FROM ${SESSION_TABLE} WHERE session_id = ?`,
        [sessionId],
      )

      if (!sessionResult.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: `删除会话失败: ${sessionResult.error.message}`,
          cause: sessionResult.error,
        })
      }

      // 删除相关令牌映射
      db.sql.execute(
        `DELETE FROM ${TOKEN_MAPPING_TABLE} WHERE session_id = ?`,
        [sessionId],
      )

      // 删除用户会话映射
      db.sql.execute(
        `DELETE FROM ${USER_SESSION_TABLE} WHERE session_id = ?`,
        [sessionId],
      )

      return ok(undefined)
    },

    async getUserSessionIds(userId): Promise<Result<string[], IamError>> {
      const result = db.sql.query<UserSessionRow>(
        `SELECT session_id FROM ${USER_SESSION_TABLE} WHERE user_id = ?`,
        [userId],
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: `查询用户会话失败: ${result.error.message}`,
          cause: result.error,
        })
      }

      return ok(result.data.map(row => row.session_id))
    },

    async addUserSession(userId, sessionId): Promise<Result<void, IamError>> {
      const id = crypto.randomUUID()
      const now = Date.now()

      const result = db.sql.execute(
        `INSERT OR IGNORE INTO ${USER_SESSION_TABLE} (id, user_id, session_id, created_at)
         VALUES (?, ?, ?, ?)`,
        [id, userId, sessionId, now],
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: `添加用户会话映射失败: ${result.error.message}`,
          cause: result.error,
        })
      }

      return ok(undefined)
    },

    async removeUserSession(userId, sessionId): Promise<Result<void, IamError>> {
      const result = db.sql.execute(
        `DELETE FROM ${USER_SESSION_TABLE} WHERE user_id = ? AND session_id = ?`,
        [userId, sessionId],
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: `删除用户会话映射失败: ${result.error.message}`,
          cause: result.error,
        })
      }

      return ok(undefined)
    },
  }
}
