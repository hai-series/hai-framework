/**
 * =============================================================================
 * @hai/iam - OAuth 存储实现
 * =============================================================================
 *
 * 基于 @hai/db 的 OAuth 状态和账户存储实现。
 *
 * @module iam-repository-oauth
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type { DbService } from '@hai/db'
import type { IamError, OAuthAccount, OAuthAccountRepository, OAuthState, OAuthStateStore } from '../iam-types.js'
import { err, ok } from '@hai/core'
import { IamErrorCode } from '../iam-config.js'

// =============================================================================
// OAuth 状态存储
// =============================================================================

const STATE_TABLE = 'iam_oauth_states'
const STATE_SCHEMA = {
  state: { type: 'TEXT' as const, primaryKey: true },
  code_verifier: { type: 'TEXT' as const },
  return_url: { type: 'TEXT' as const },
  expires_at: { type: 'TIMESTAMP' as const, notNull: true },
  created_at: { type: 'TIMESTAMP' as const, notNull: true },
}

interface StateRow {
  state: string
  code_verifier: string | null
  return_url: string | null
  expires_at: number
  created_at: number
}

/**
 * 创建数据库 OAuth 状态存储
 */
export async function createDbOAuthStateStore(db: DbService): Promise<OAuthStateStore> {
  async function ensureTable(): Promise<Result<void, IamError>> {
    const result = await db.ddl.createTable(STATE_TABLE, STATE_SCHEMA, true)
    if (!result.success) {
      return err({
        code: IamErrorCode.REPOSITORY_ERROR,
        message: `创建 OAuth 状态表失败: ${result.error.message}`,
        cause: result.error,
      })
    }
    return ok(undefined)
  }

  const initResult = await ensureTable()
  if (!initResult.success) {
    throw new Error(initResult.error.message)
  }

  return {
    async set(state, data): Promise<Result<void, IamError>> {
      const now = Date.now()
      const result = await db.sql.execute(
        `INSERT OR REPLACE INTO ${STATE_TABLE} 
         (state, code_verifier, return_url, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [
          state,
          data.codeVerifier ?? null,
          data.returnUrl ?? null,
          data.expiresAt.getTime(),
          now,
        ],
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: `保存 OAuth 状态失败: ${result.error.message}`,
          cause: result.error,
        })
      }

      return ok(undefined)
    },

    async get(state): Promise<Result<OAuthState | null, IamError>> {
      const result = await db.sql.query<StateRow>(
        `SELECT * FROM ${STATE_TABLE} WHERE state = ?`,
        [state],
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: `查询 OAuth 状态失败: ${result.error.message}`,
          cause: result.error,
        })
      }

      if (result.data.length === 0) {
        return ok(null)
      }

      const row = result.data[0]
      const expiresAt = new Date(row.expires_at)

      // 检查是否已过期
      if (new Date() > expiresAt) {
        await this.delete(state)
        return ok(null)
      }

      return ok({
        state: row.state,
        codeVerifier: row.code_verifier ?? undefined,
        returnUrl: row.return_url ?? undefined,
        expiresAt,
      })
    },

    async delete(state): Promise<Result<void, IamError>> {
      const result = await db.sql.execute(
        `DELETE FROM ${STATE_TABLE} WHERE state = ?`,
        [state],
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: `删除 OAuth 状态失败: ${result.error.message}`,
          cause: result.error,
        })
      }

      return ok(undefined)
    },
  }
}

// =============================================================================
// OAuth 账户存储
// =============================================================================

const ACCOUNT_TABLE = 'iam_oauth_accounts'
const ACCOUNT_SCHEMA = {
  user_id: { type: 'TEXT' as const, notNull: true },
  provider_id: { type: 'TEXT' as const, notNull: true },
  provider_user_id: { type: 'TEXT' as const, notNull: true },
  access_token: { type: 'TEXT' as const },
  refresh_token: { type: 'TEXT' as const },
  token_expires_at: { type: 'TIMESTAMP' as const },
  created_at: { type: 'TIMESTAMP' as const, notNull: true },
  updated_at: { type: 'TIMESTAMP' as const, notNull: true },
}

interface AccountRow {
  user_id: string
  provider_id: string
  provider_user_id: string
  access_token: string | null
  refresh_token: string | null
  token_expires_at: number | null
  created_at: number
  updated_at: number
}

function rowToAccount(row: AccountRow): OAuthAccount {
  return {
    userId: row.user_id,
    providerId: row.provider_id,
    providerUserId: row.provider_user_id,
    accessToken: row.access_token ?? undefined,
    refreshToken: row.refresh_token ?? undefined,
    tokenExpiresAt: row.token_expires_at ? new Date(row.token_expires_at) : undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

/**
 * 创建数据库 OAuth 账户存储
 */
export async function createDbOAuthAccountRepository(db: DbService): Promise<OAuthAccountRepository> {
  async function ensureTable(): Promise<Result<void, IamError>> {
    const result = await db.ddl.createTable(ACCOUNT_TABLE, ACCOUNT_SCHEMA, true)
    if (!result.success) {
      return err({
        code: IamErrorCode.REPOSITORY_ERROR,
        message: `创建 OAuth 账户表失败: ${result.error.message}`,
        cause: result.error,
      })
    }

    const indexResults = await Promise.all([
      db.ddl.createIndex(ACCOUNT_TABLE, 'idx_oauth_account_user', { columns: ['user_id'] }),
      db.ddl.createIndex(ACCOUNT_TABLE, 'idx_oauth_account_provider', {
        columns: ['provider_id', 'provider_user_id'],
        unique: true,
      }),
    ])
    for (const indexResult of indexResults) {
      if (!indexResult.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: `创建 OAuth 账户索引失败: ${indexResult.error.message}`,
          cause: indexResult.error,
        })
      }
    }

    return ok(undefined)
  }

  const initResult = await ensureTable()
  if (!initResult.success) {
    throw new Error(initResult.error.message)
  }

  return {
    async create(account): Promise<Result<OAuthAccount, IamError>> {
      const now = Date.now()

      const result = await db.sql.execute(
        `INSERT INTO ${ACCOUNT_TABLE} 
         (user_id, provider_id, provider_user_id, access_token, refresh_token, token_expires_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          account.userId,
          account.providerId,
          account.providerUserId,
          account.accessToken ?? null,
          account.refreshToken ?? null,
          account.tokenExpiresAt?.getTime() ?? null,
          now,
          now,
        ],
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: `创建 OAuth 账户失败: ${result.error.message}`,
          cause: result.error,
        })
      }

      return ok({
        ...account,
        createdAt: new Date(now),
        updatedAt: new Date(now),
      })
    },

    async findByProvider(providerId, providerUserId): Promise<Result<OAuthAccount | null, IamError>> {
      const result = await db.sql.query<AccountRow>(
        `SELECT * FROM ${ACCOUNT_TABLE} WHERE provider_id = ? AND provider_user_id = ?`,
        [providerId, providerUserId],
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: `查询 OAuth 账户失败: ${result.error.message}`,
          cause: result.error,
        })
      }

      if (result.data.length === 0) {
        return ok(null)
      }

      return ok(rowToAccount(result.data[0]))
    },

    async findByUserId(userId): Promise<Result<OAuthAccount[], IamError>> {
      const result = await db.sql.query<AccountRow>(
        `SELECT * FROM ${ACCOUNT_TABLE} WHERE user_id = ?`,
        [userId],
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: `查询 OAuth 账户失败: ${result.error.message}`,
          cause: result.error,
        })
      }

      return ok(result.data.map(rowToAccount))
    },

    async update(userId, providerId, data): Promise<Result<void, IamError>> {
      const setClauses: string[] = []
      const values: unknown[] = []

      if (data.accessToken !== undefined) {
        setClauses.push('access_token = ?')
        values.push(data.accessToken ?? null)
      }
      if (data.refreshToken !== undefined) {
        setClauses.push('refresh_token = ?')
        values.push(data.refreshToken ?? null)
      }
      if (data.tokenExpiresAt !== undefined) {
        setClauses.push('token_expires_at = ?')
        values.push(data.tokenExpiresAt?.getTime() ?? null)
      }

      if (setClauses.length === 0) {
        return ok(undefined)
      }

      setClauses.push('updated_at = ?')
      values.push(Date.now())
      values.push(userId)
      values.push(providerId)

      const result = await db.sql.execute(
        `UPDATE ${ACCOUNT_TABLE} SET ${setClauses.join(', ')} WHERE user_id = ? AND provider_id = ?`,
        values,
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: `更新 OAuth 账户失败: ${result.error.message}`,
          cause: result.error,
        })
      }

      return ok(undefined)
    },

    async delete(userId, providerId): Promise<Result<void, IamError>> {
      const result = await db.sql.execute(
        `DELETE FROM ${ACCOUNT_TABLE} WHERE user_id = ? AND provider_id = ?`,
        [userId, providerId],
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: `删除 OAuth 账户失败: ${result.error.message}`,
          cause: result.error,
        })
      }

      return ok(undefined)
    },
  }
}
