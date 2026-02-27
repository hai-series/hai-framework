/**
 * =============================================================================
 * @h-ai/iam - 密码重置令牌存储实现
 * =============================================================================
 *
 * 基于 @h-ai/db 的密码重置令牌存储，支持令牌的创建、查询、
 * 过期清理和使用标记等操作。
 *
 * @module user/iam-user-repository-reset-token
 * =============================================================================
 */

import type { Result } from '@h-ai/core'
import type { CrudFieldDefinition, DbFunctions, TxHandle } from '@h-ai/db'
import type { IamError } from '../iam-types.js'
import { ok } from '@h-ai/core'
import { crypto as haiCrypto } from '@h-ai/crypto'
import { BaseCrudRepository } from '@h-ai/db'
import { IamErrorCode } from '../iam-config.js'
import { iamM } from '../iam-i18n.js'

// =============================================================================
// 密码重置令牌类型
// =============================================================================

/**
 * 密码重置令牌记录
 */
export interface ResetTokenRecord {
  /** 令牌 ID（主键） */
  id: string
  /** 用户 ID */
  userId: string
  /** 重置令牌（SHA-256 哈希值，不存储明文） */
  token: string
  /** 过期时间 */
  expiresAt: Date
  /** 验证尝试次数 */
  attempts: number
  /** 是否已使用 */
  used: boolean
  /** 创建时间 */
  createdAt: Date
}

/**
 * 对令牌进行 SHA-256 哈希
 *
 * 数据库中只存储令牌的哈希值，不存储明文。
 * 查询时也先哈希再匹配。
 *
 * @param token - 明文令牌
 * @returns 十六进制 SHA-256 哈希值
 */
export function hashResetToken(token: string): string {
  const result = haiCrypto.hash.hash(token)
  if (!result.success) {
    throw new Error(`Failed to hash reset token: ${result.error.message}`)
  }
  return result.data
}

/**
 * 密码重置令牌存储接口
 */
export interface ResetTokenRepository {
  /**
   * 保存重置令牌
   *
   * @param record - 令牌记录（不含 attempts / used / createdAt，自动填充）
   */
  saveToken: (record: Pick<ResetTokenRecord, 'id' | 'userId' | 'token' | 'expiresAt'>, tx?: TxHandle) => Promise<Result<void, IamError>>

  /**
   * 根据令牌值查找有效记录（未过期、未使用）
   *
   * 自动删除已过期的记录。
   *
   * @param token - 令牌值（明文）
   * @returns 令牌记录，或 null
   */
  findByToken: (token: string, tx?: TxHandle) => Promise<Result<ResetTokenRecord | null, IamError>>

  /**
   * 增加验证尝试次数
   *
   * @param id - 令牌 ID
   * @returns 更新后的尝试次数
   */
  incrementAttempts: (id: string, tx?: TxHandle) => Promise<Result<number, IamError>>

  /**
   * 标记令牌为已使用
   *
   * @param id - 令牌 ID
   */
  markUsed: (id: string, tx?: TxHandle) => Promise<Result<void, IamError>>

  /**
   * 删除用户的所有重置令牌
   *
   * @param userId - 用户 ID
   */
  removeByUserId: (userId: string, tx?: TxHandle) => Promise<Result<void, IamError>>
}

// =============================================================================
// 密码重置令牌存储实现
// =============================================================================

const TABLE_NAME = 'iam_password_reset_tokens'

const RESET_TOKEN_FIELDS: CrudFieldDefinition[] = [
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
    fieldName: 'token',
    columnName: 'token',
    def: { type: 'TEXT' as const, notNull: true },
    select: true,
    create: true,
    update: false,
  },
  {
    fieldName: 'expiresAt',
    columnName: 'expires_at',
    def: { type: 'TIMESTAMP' as const, notNull: true },
    select: true,
    create: true,
    update: false,
  },
  {
    fieldName: 'attempts',
    columnName: 'attempts',
    def: { type: 'INTEGER' as const, notNull: true, defaultValue: 0 },
    select: true,
    create: true,
    update: true,
  },
  {
    fieldName: 'used',
    columnName: 'used',
    def: { type: 'BOOLEAN' as const, notNull: true, defaultValue: false },
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
]

/**
 * 判断令牌是否已过期
 */
function isExpired(expiresAt: number, now = Date.now()): boolean {
  return now > expiresAt
}

/** 令牌存储单例缓存 */
let resetTokenRepoInstance: ResetTokenRepository | null = null
let resetTokenRepoDbConfig: unknown = null

/**
 * 重置令牌存储单例
 *
 * 在 iam.close() 时调用，释放对旧 db 实例的引用。
 */
export function resetResetTokenRepoSingleton(): void {
  resetTokenRepoInstance = null
  resetTokenRepoDbConfig = null
}

/**
 * 创建基于数据库的密码重置令牌存储实例
 *
 * 单例模式：同一 db 生命周期内重复调用返回缓存实例。
 *
 * @param db - 数据库服务实例
 * @returns 密码重置令牌存储接口实现
 */
export async function createDbResetTokenRepository(db: DbFunctions): Promise<ResetTokenRepository> {
  if (resetTokenRepoInstance && resetTokenRepoDbConfig === db.config)
    return resetTokenRepoInstance

  const repo = new DbResetTokenRepository(db)
  await repo.count()
  resetTokenRepoInstance = repo
  resetTokenRepoDbConfig = db.config
  return repo
}

/**
 * 基于数据库的密码重置令牌存储实现
 *
 * 继承 BaseCrudRepository，提供令牌的存储/查询/删除能力。
 * 内置过期自动清理：查询时发现过期会自动删除并返回 null。
 */
class DbResetTokenRepository extends BaseCrudRepository<ResetTokenRecord> implements ResetTokenRepository {
  constructor(db: DbFunctions) {
    super(db, {
      table: TABLE_NAME,
      idColumn: 'id',
      idField: 'id',
      fields: RESET_TOKEN_FIELDS,
    })
  }

  /**
   * 保存重置令牌（存储时自动哈希令牌值）
   */
  async saveToken(
    record: Pick<ResetTokenRecord, 'id' | 'userId' | 'token' | 'expiresAt'>,
    tx?: TxHandle,
  ): Promise<Result<void, IamError>> {
    const now = Date.now()
    const createResult = await this.create(
      {
        ...record,
        token: hashResetToken(record.token),
        attempts: 0,
        used: false,
        createdAt: new Date(now),
      },
      tx,
    )
    if (!createResult.success) {
      return { success: false, error: {
        code: IamErrorCode.REPOSITORY_ERROR,
        message: iamM('iam_saveResetTokenFailed', { params: { message: createResult.error.message } }),
        cause: createResult.error,
      } }
    }
    return ok(undefined)
  }

  /**
   * 根据令牌值查找有效记录
   *
   * 查询时先对明文令牌做 SHA-256 哈希，再与数据库中的哈希值匹配。
   * 自动删除已过期的记录。
   */
  async findByToken(token: string, tx?: TxHandle): Promise<Result<ResetTokenRecord | null, IamError>> {
    const tokenHash = hashResetToken(token)
    const result = await this.findAll(
      { where: 'token = ?', params: [tokenHash], limit: 1 },
      tx,
    )
    if (!result.success) {
      return { success: false, error: {
        code: IamErrorCode.REPOSITORY_ERROR,
        message: iamM('iam_queryResetTokenFailed', { params: { message: result.error.message } }),
        cause: result.error,
      } }
    }
    if (result.data.length === 0) {
      return ok(null)
    }

    const record = result.data[0]

    // 过期自动清理
    if (isExpired(record.expiresAt.getTime())) {
      await this.deleteById(record.id, tx)
      return ok(null)
    }

    // 已使用的令牌视为无效
    if (record.used) {
      return ok(null)
    }

    return ok(record)
  }

  /**
   * 增加验证尝试次数
   */
  async incrementAttempts(id: string, tx?: TxHandle): Promise<Result<number, IamError>> {
    const current = await this.findById(id, tx)
    if (!current.success) {
      return { success: false, error: {
        code: IamErrorCode.REPOSITORY_ERROR,
        message: iamM('iam_queryResetTokenFailed', { params: { message: current.error.message } }),
        cause: current.error,
      } }
    }
    if (!current.data) {
      return ok(0)
    }

    const nextAttempts = current.data.attempts + 1
    const updateResult = await this.updateById(id, { attempts: nextAttempts }, tx)
    if (!updateResult.success) {
      return { success: false, error: {
        code: IamErrorCode.REPOSITORY_ERROR,
        message: iamM('iam_updateResetTokenFailed', { params: { message: updateResult.error.message } }),
        cause: updateResult.error,
      } }
    }
    return ok(nextAttempts)
  }

  /**
   * 标记令牌为已使用
   */
  async markUsed(id: string, tx?: TxHandle): Promise<Result<void, IamError>> {
    const updateResult = await this.updateById(id, { used: true }, tx)
    if (!updateResult.success) {
      return { success: false, error: {
        code: IamErrorCode.REPOSITORY_ERROR,
        message: iamM('iam_updateResetTokenFailed', { params: { message: updateResult.error.message } }),
        cause: updateResult.error,
      } }
    }
    return ok(undefined)
  }

  /**
   * 删除用户的所有重置令牌
   */
  async removeByUserId(userId: string, tx?: TxHandle): Promise<Result<void, IamError>> {
    const executor = tx ?? this.db.sql
    const result = await executor.execute(
      `DELETE FROM ${TABLE_NAME} WHERE user_id = ?`,
      [userId],
    )
    if (!result.success) {
      return { success: false, error: {
        code: IamErrorCode.REPOSITORY_ERROR,
        message: iamM('iam_deleteResetTokenFailed', { params: { message: result.error.message } }),
        cause: result.error,
      } }
    }
    return ok(undefined)
  }
}
