/**
 * =============================================================================
 * @hai/iam - 用户存储实现
 * =============================================================================
 *
 * 基于 @hai/db 的用户存储实现。
 *
 * @module iam-repository-user
 * =============================================================================
 */

import type { PaginatedResult, PaginationOptionsInput, Result } from '@hai/core'
import type { DbService } from '@hai/db'
import type { IamError, StoredUser, UserRepository } from '../iam-types.js'
import { err, ok } from '@hai/core'
import { IamErrorCode } from '../iam-config.js'
import { iamM } from '../iam-i18n.js'

/**
 * 用户表名
 */
const TABLE_NAME = 'iam_users'

/**
 * 用户表结构
 */
const TABLE_SCHEMA = {
  id: { type: 'TEXT' as const, primaryKey: true },
  username: { type: 'TEXT' as const, notNull: true, unique: true },
  email: { type: 'TEXT' as const, unique: true },
  phone: { type: 'TEXT' as const, unique: true },
  display_name: { type: 'TEXT' as const },
  avatar_url: { type: 'TEXT' as const },
  enabled: { type: 'BOOLEAN' as const, notNull: true, defaultValue: 1 },
  email_verified: { type: 'BOOLEAN' as const, defaultValue: 0 },
  phone_verified: { type: 'BOOLEAN' as const, defaultValue: 0 },
  password_hash: { type: 'TEXT' as const },
  password_updated_at: { type: 'TIMESTAMP' as const },
  login_failed_count: { type: 'INTEGER' as const, defaultValue: 0 },
  last_login_failed_at: { type: 'TIMESTAMP' as const },
  locked_until: { type: 'TIMESTAMP' as const },
  metadata: { type: 'JSON' as const },
  created_at: { type: 'TIMESTAMP' as const, notNull: true },
  updated_at: { type: 'TIMESTAMP' as const, notNull: true },
}

/**
 * 数据库行类型
 */
interface UserRow {
  id: string
  username: string
  email: string | null
  phone: string | null
  display_name: string | null
  avatar_url: string | null
  enabled: number
  email_verified: number
  phone_verified: number
  password_hash: string | null
  password_updated_at: number | null
  login_failed_count: number
  last_login_failed_at: number | null
  locked_until: number | null
  metadata: string | null
  created_at: number
  updated_at: number
}

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return crypto.randomUUID()
}

/**
 * 将数据库行转换为 StoredUser
 */
function rowToUser(row: UserRow): StoredUser {
  return {
    id: row.id,
    username: row.username,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    displayName: row.display_name ?? undefined,
    avatarUrl: row.avatar_url ?? undefined,
    enabled: Boolean(row.enabled),
    emailVerified: Boolean(row.email_verified),
    phoneVerified: Boolean(row.phone_verified),
    passwordHash: row.password_hash ?? undefined,
    passwordUpdatedAt: row.password_updated_at ? new Date(row.password_updated_at) : undefined,
    loginFailedCount: row.login_failed_count,
    lastLoginFailedAt: row.last_login_failed_at ? new Date(row.last_login_failed_at) : undefined,
    lockedUntil: row.locked_until ? new Date(row.locked_until) : undefined,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

/**
 * 创建数据库用户存储
 */
export async function createDbUserRepository(db: DbService): Promise<UserRepository> {
  // 确保表存在
  async function ensureTable(): Promise<Result<void, IamError>> {
    const result = await db.ddl.createTable(TABLE_NAME, TABLE_SCHEMA, true)
    if (!result.success) {
      return err({
        code: IamErrorCode.REPOSITORY_ERROR,
        message: iamM('iam_createUserTableFailed', { params: { message: result.error.message } }),
        cause: result.error,
      })
    }
    return ok(undefined)
  }

  // 初始化表
  const initResult = await ensureTable()
  if (!initResult.success) {
    throw new Error(initResult.error.message)
  }

  async function findByIdInternal(id: string): Promise<Result<StoredUser | null, IamError>> {
    const result = await db.sql.query<UserRow>(
      `SELECT * FROM ${TABLE_NAME} WHERE id = ?`,
      [id],
    )

    if (!result.success) {
      return err({
        code: IamErrorCode.REPOSITORY_ERROR,
        message: iamM('iam_queryUserFailed', { params: { message: result.error.message } }),
        cause: result.error,
      })
    }

    if (result.data.length === 0) {
      return ok(null)
    }

    return ok(rowToUser(result.data[0]))
  }

  return {
    async create(user): Promise<Result<StoredUser, IamError>> {
      const id = generateId()
      const now = Date.now()

      const result = await db.sql.execute(
        `INSERT INTO ${TABLE_NAME} (
          id, username, email, phone, display_name, avatar_url,
          enabled, email_verified, phone_verified,
          password_hash, password_updated_at,
          login_failed_count, last_login_failed_at, locked_until,
          metadata, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          user.username,
          user.email ?? null,
          user.phone ?? null,
          user.displayName ?? null,
          user.avatarUrl ?? null,
          user.enabled ? 1 : 0,
          user.emailVerified ? 1 : 0,
          user.phoneVerified ? 1 : 0,
          user.passwordHash ?? null,
          user.passwordUpdatedAt?.getTime() ?? null,
          user.loginFailedCount ?? 0,
          user.lastLoginFailedAt?.getTime() ?? null,
          user.lockedUntil?.getTime() ?? null,
          user.metadata ? JSON.stringify(user.metadata) : null,
          now,
          now,
        ],
      )

      if (!result.success) {
        // 检查是否是唯一约束冲突
        const errorMsg = result.error.message.toLowerCase()
        if (errorMsg.includes('unique') || errorMsg.includes('duplicate')) {
          return err({
            code: IamErrorCode.USER_ALREADY_EXISTS,
            message: iamM('iam_userAlreadyExist'),
            cause: result.error,
          })
        }
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_createUserFailed', { params: { message: result.error.message } }),
          cause: result.error,
        })
      }

      return ok({
        ...user,
        id,
        createdAt: new Date(now),
        updatedAt: new Date(now),
      } as StoredUser)
    },

    findById: findByIdInternal,

    async findByUsername(username): Promise<Result<StoredUser | null, IamError>> {
      const result = await db.sql.query<UserRow>(
        `SELECT * FROM ${TABLE_NAME} WHERE username = ?`,
        [username],
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_queryUserFailed', { params: { message: result.error.message } }),
          cause: result.error,
        })
      }

      if (result.data.length === 0) {
        return ok(null)
      }

      return ok(rowToUser(result.data[0]))
    },

    async findByEmail(email): Promise<Result<StoredUser | null, IamError>> {
      const result = await db.sql.query<UserRow>(
        `SELECT * FROM ${TABLE_NAME} WHERE email = ?`,
        [email],
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_queryUserFailed', { params: { message: result.error.message } }),
          cause: result.error,
        })
      }

      if (result.data.length === 0) {
        return ok(null)
      }

      return ok(rowToUser(result.data[0]))
    },

    async findByPhone(phone): Promise<Result<StoredUser | null, IamError>> {
      const result = await db.sql.query<UserRow>(
        `SELECT * FROM ${TABLE_NAME} WHERE phone = ?`,
        [phone],
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_queryUserFailed', { params: { message: result.error.message } }),
          cause: result.error,
        })
      }

      if (result.data.length === 0) {
        return ok(null)
      }

      return ok(rowToUser(result.data[0]))
    },

    async findByIdentifier(identifier): Promise<Result<StoredUser | null, IamError>> {
      const result = await db.sql.query<UserRow>(
        `SELECT * FROM ${TABLE_NAME} WHERE username = ? OR email = ? OR phone = ?`,
        [identifier, identifier, identifier],
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_queryUserFailed', { params: { message: result.error.message } }),
          cause: result.error,
        })
      }

      if (result.data.length === 0) {
        return ok(null)
      }

      return ok(rowToUser(result.data[0]))
    },

    async findAll(options?: PaginationOptionsInput): Promise<Result<PaginatedResult<StoredUser>, IamError>> {
      const result = await db.sql.queryPage<UserRow>({
        sql: `SELECT * FROM ${TABLE_NAME} ORDER BY created_at DESC`,
        pagination: options,
      })

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_queryUserListFailed', { params: { message: result.error.message } }),
          cause: result.error,
        })
      }

      return ok({
        items: result.data.items.map(rowToUser),
        total: result.data.total,
        page: result.data.page,
        pageSize: result.data.pageSize,
      })
    },

    async update(id, data): Promise<Result<StoredUser, IamError>> {
      const setClauses: string[] = []
      const values: unknown[] = []

      if (data.username !== undefined) {
        setClauses.push('username = ?')
        values.push(data.username)
      }
      if (data.email !== undefined) {
        setClauses.push('email = ?')
        values.push(data.email ?? null)
      }
      if (data.phone !== undefined) {
        setClauses.push('phone = ?')
        values.push(data.phone ?? null)
      }
      if (data.displayName !== undefined) {
        setClauses.push('display_name = ?')
        values.push(data.displayName ?? null)
      }
      if (data.avatarUrl !== undefined) {
        setClauses.push('avatar_url = ?')
        values.push(data.avatarUrl ?? null)
      }
      if (data.enabled !== undefined) {
        setClauses.push('enabled = ?')
        values.push(data.enabled ? 1 : 0)
      }
      if (data.emailVerified !== undefined) {
        setClauses.push('email_verified = ?')
        values.push(data.emailVerified ? 1 : 0)
      }
      if (data.phoneVerified !== undefined) {
        setClauses.push('phone_verified = ?')
        values.push(data.phoneVerified ? 1 : 0)
      }
      if (data.passwordHash !== undefined) {
        setClauses.push('password_hash = ?')
        values.push(data.passwordHash ?? null)
      }
      if (data.passwordUpdatedAt !== undefined) {
        setClauses.push('password_updated_at = ?')
        values.push(data.passwordUpdatedAt?.getTime() ?? null)
      }
      if (data.loginFailedCount !== undefined) {
        setClauses.push('login_failed_count = ?')
        values.push(data.loginFailedCount)
      }
      if (data.lastLoginFailedAt !== undefined) {
        setClauses.push('last_login_failed_at = ?')
        values.push(data.lastLoginFailedAt?.getTime() ?? null)
      }
      if (data.lockedUntil !== undefined) {
        setClauses.push('locked_until = ?')
        values.push(data.lockedUntil?.getTime() ?? null)
      }
      if (data.metadata !== undefined) {
        setClauses.push('metadata = ?')
        values.push(data.metadata ? JSON.stringify(data.metadata) : null)
      }

      if (setClauses.length === 0) {
        // 没有更新字段，直接返回当前数据
        const current = await findByIdInternal(id)
        if (!current.success)
          return current
        if (!current.data) {
          return err({
            code: IamErrorCode.USER_NOT_FOUND,
            message: iamM('iam_userNotExist'),
          })
        }
        return ok(current.data)
      }

      const now = Date.now()
      setClauses.push('updated_at = ?')
      values.push(now)
      values.push(id)

      const result = await db.sql.execute(
        `UPDATE ${TABLE_NAME} SET ${setClauses.join(', ')} WHERE id = ?`,
        values,
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_updateUserFailed', { params: { message: result.error.message } }),
          cause: result.error,
        })
      }

      if (result.data.changes === 0) {
        return err({
          code: IamErrorCode.USER_NOT_FOUND,
          message: iamM('iam_userNotExist'),
        })
      }

      const findResult = await findByIdInternal(id)
      if (!findResult.success)
        return findResult
      if (!findResult.data) {
        return err({
          code: IamErrorCode.USER_NOT_FOUND,
          message: iamM('iam_userNotExist'),
        })
      }

      return ok(findResult.data)
    },

    async delete(id): Promise<Result<void, IamError>> {
      const result = await db.sql.execute(
        `DELETE FROM ${TABLE_NAME} WHERE id = ?`,
        [id],
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_deleteUserFailed', { params: { message: result.error.message } }),
          cause: result.error,
        })
      }

      return ok(undefined)
    },

    async existsByUsername(username): Promise<Result<boolean, IamError>> {
      const result = await db.sql.query<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM ${TABLE_NAME} WHERE username = ?`,
        [username],
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_queryUserFailed', { params: { message: result.error.message } }),
          cause: result.error,
        })
      }

      return ok(result.data[0].cnt > 0)
    },

    async existsByEmail(email): Promise<Result<boolean, IamError>> {
      const result = await db.sql.query<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM ${TABLE_NAME} WHERE email = ?`,
        [email],
      )

      if (!result.success) {
        return err({
          code: IamErrorCode.REPOSITORY_ERROR,
          message: iamM('iam_queryUserFailed', { params: { message: result.error.message } }),
          cause: result.error,
        })
      }

      return ok(result.data[0].cnt > 0)
    },
  }
}
