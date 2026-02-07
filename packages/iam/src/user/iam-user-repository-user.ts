/**
 * =============================================================================
 * @hai/iam - 用户存储实现
 * =============================================================================
 *
 * 基于 @hai/db 的用户存储实现。
 *
 * @module user/iam-user-repository-user
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type { CrudCountOptions, CrudFieldDefinition, CrudRepository, DbError, DbService, TxHandle } from '@hai/db'
import type { IamError } from '../iam-core-types.js'
import type { StoredUser } from './iam-user-types.js'
import { err, ok } from '@hai/core'
import { BaseCrudRepository } from '@hai/db'
import { IamErrorCode } from '../iam-config.js'
import { iamM } from '../iam-i18n.js'

// =============================================================================
// 用户存储接口
// =============================================================================

/**
 * 用户存储接口
 */
export interface UserRepository extends CrudRepository<StoredUser> {
  /**
   * 根据用户名获取用户
   */
  findByUsername: (username: string, tx?: TxHandle) => Promise<Result<StoredUser | null, IamError>>

  /**
   * 根据邮箱获取用户
   */
  findByEmail: (email: string, tx?: TxHandle) => Promise<Result<StoredUser | null, IamError>>

  /**
   * 根据手机号获取用户
   */
  findByPhone: (phone: string, tx?: TxHandle) => Promise<Result<StoredUser | null, IamError>>

  /**
   * 根据标识符获取用户（用户名/邮箱/手机号）
   */
  findByIdentifier: (identifier: string, tx?: TxHandle) => Promise<Result<StoredUser | null, IamError>>

  /**
   * 检查用户名是否存在
   */
  existsByUsername: (username: string, tx?: TxHandle) => Promise<Result<boolean, IamError>>

  /**
   * 检查邮箱是否存在
   */
  existsByEmail: (email: string, tx?: TxHandle) => Promise<Result<boolean, IamError>>

}

// =============================================================================
// 用户存储实现
// =============================================================================

/**
 * 用户表名
 */
const TABLE_NAME = 'iam_users'

/**
 * 用户字段定义
 */
const USER_FIELDS: CrudFieldDefinition[] = [
  {
    fieldName: 'id',
    columnName: 'id',
    def: { type: 'TEXT' as const, primaryKey: true },
    select: true,
    create: true,
    update: false,
  },
  {
    fieldName: 'username',
    columnName: 'username',
    def: { type: 'TEXT' as const, notNull: true, unique: true },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'email',
    columnName: 'email',
    def: { type: 'TEXT' as const },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'phone',
    columnName: 'phone',
    def: { type: 'TEXT' as const },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'displayName',
    columnName: 'display_name',
    def: { type: 'TEXT' as const },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'avatarUrl',
    columnName: 'avatar_url',
    def: { type: 'TEXT' as const },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'enabled',
    columnName: 'enabled',
    def: { type: 'BOOLEAN' as const, notNull: true, defaultValue: 1 },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'emailVerified',
    columnName: 'email_verified',
    def: { type: 'BOOLEAN' as const, defaultValue: 0 },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'phoneVerified',
    columnName: 'phone_verified',
    def: { type: 'BOOLEAN' as const, defaultValue: 0 },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'passwordHash',
    columnName: 'password_hash',
    def: { type: 'TEXT' as const },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'passwordUpdatedAt',
    columnName: 'password_updated_at',
    def: { type: 'TIMESTAMP' as const },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'loginFailedCount',
    columnName: 'login_failed_count',
    def: { type: 'INTEGER' as const, defaultValue: 0 },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'lastLoginFailedAt',
    columnName: 'last_login_failed_at',
    def: { type: 'TIMESTAMP' as const },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'lockedUntil',
    columnName: 'locked_until',
    def: { type: 'TIMESTAMP' as const },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'metadata',
    columnName: 'metadata',
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
    fieldName: 'updatedAt',
    columnName: 'updated_at',
    def: { type: 'TIMESTAMP' as const, notNull: true },
    select: true,
    create: true,
    update: false,
  },
]

/**
 * 创建数据库用户存储
 */
let userRepositorySingleton: DbUserRepository | null = null

export async function createDbUserRepository(db: DbService): Promise<UserRepository> {
  if (userRepositorySingleton) {
    return userRepositorySingleton
  }
  userRepositorySingleton = new DbUserRepository(db)
  return userRepositorySingleton
}

class DbUserRepository extends BaseCrudRepository<StoredUser> implements UserRepository {
  constructor(db: DbService) {
    super(db, {
      table: TABLE_NAME,
      fields: USER_FIELDS,
    })
  }

  async findByUsername(username: string, tx?: TxHandle): Promise<Result<StoredUser | null, IamError>> {
    return this.findOneBy('username = ?', [username], tx)
  }

  async findByEmail(email: string, tx?: TxHandle): Promise<Result<StoredUser | null, IamError>> {
    return this.findOneBy('email = ?', [email], tx)
  }

  async findByPhone(phone: string, tx?: TxHandle): Promise<Result<StoredUser | null, IamError>> {
    return this.findOneBy('phone = ?', [phone], tx)
  }

  async findByIdentifier(identifier: string, tx?: TxHandle): Promise<Result<StoredUser | null, IamError>> {
    return this.findOneBy('username = ? OR email = ? OR phone = ?', [identifier, identifier, identifier], tx)
  }

  async existsByUsername(username: string, tx?: TxHandle): Promise<Result<boolean, IamError>> {
    return this.existsBy('username = ?', [username], tx)
  }

  async existsByEmail(email: string, tx?: TxHandle): Promise<Result<boolean, IamError>> {
    return this.existsBy('email = ?', [email], tx)
  }

  private buildQueryError(error: { message: string }, cause: unknown): Result<never, IamError> {
    return err({
      code: IamErrorCode.REPOSITORY_ERROR,
      message: iamM('iam_queryUserFailed', { params: { message: error.message } }),
      cause,
    })
  }

  private async existsBy(where: string, params: unknown[], tx?: TxHandle): Promise<Result<boolean, IamError>> {
    const result = await this.exists({ where, params }, tx)
    if (!result.success) {
      return this.buildQueryError(result.error, result.error)
    }
    return ok(result.data)
  }

  private async findOneBy(where: string, params: unknown[], tx?: TxHandle): Promise<Result<StoredUser | null, IamError>> {
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
