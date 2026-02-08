/**
 * =============================================================================
 * @hai/iam - OTP 存储实现
 * =============================================================================
 *
 * 基于 @hai/db 的 OTP 存储实现。
 *
 * @module authn/otp/iam-authn-otp-repository-otp
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type { CrudCountOptions, CrudFieldDefinition, DbError, DbService, TxHandle } from '@hai/db'
import type { IamError } from '../../iam-core-types.js'
import { err, ok } from '@hai/core'
import { BaseCrudRepository } from '@hai/db'
import { IamErrorCode } from '../../iam-config.js'
import { iamM } from '../../iam-i18n.js'

// =============================================================================
// OTP 存储接口与类型
// =============================================================================

/**
 * OTP 记录
 */
export interface OtpRecord {
  /** 标识符（邮箱/手机号） */
  identifier: string
  /** 验证码 */
  code: string
  /** 过期时间 */
  expiresAt: Date
  /** 尝试次数 */
  attempts: number
  /** 创建时间 */
  createdAt: Date
}

/**
 * OTP 存储接口
 */
export interface OtpRepository {
  /**
   * 存储验证码
   */
  saveOtp: (identifier: string, code: string, expiresIn: number, tx?: TxHandle) => Promise<Result<void, IamError>>

  /**
   * 获取验证码
   */
  fetchOtp: (identifier: string, tx?: TxHandle) => Promise<Result<OtpRecord | null, IamError>>

  /**
   * 增加尝试次数
   */
  incrementOtpAttempts: (identifier: string, tx?: TxHandle) => Promise<Result<number, IamError>>

  /**
   * 删除验证码
   */
  removeOtp: (identifier: string, tx?: TxHandle) => Promise<Result<void, IamError>>

  /**
   * 发送邮件验证码
   */
  sendEmail?: (email: string, code: string) => Promise<Result<void, IamError>>

  /**
   * 发送短信验证码
   */
  sendSms?: (phone: string, code: string) => Promise<Result<void, IamError>>
}

// =============================================================================
// OTP 存储实现
// =============================================================================

/**
 * OTP 表名
 */
const TABLE_NAME = 'iam_otp'

const OTP_FIELDS: CrudFieldDefinition[] = [
  {
    fieldName: 'identifier',
    columnName: 'identifier',
    def: { type: 'TEXT' as const, primaryKey: true },
    select: true,
    create: true,
    update: false,
  },
  {
    fieldName: 'code',
    columnName: 'code',
    def: { type: 'TEXT' as const, notNull: true },
    select: true,
    create: true,
    update: true,
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
    fieldName: 'expiresAt',
    columnName: 'expires_at',
    def: { type: 'TIMESTAMP' as const, notNull: true },
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
    update: true,
  },
]

/**
 * 判断 OTP 是否已过期
 *
 * @param expiresAt - 过期时间戳（毫秒）
 * @param now - 当前时间戳（默认 Date.now()）
 * @returns 已过期返回 true
 */
function isExpired(expiresAt: number, now = Date.now()): boolean {
  return now > expiresAt
}

/** OTP 存储单例缓存（通过 db.config 引用比较检测 db 重新初始化） */
let otpRepoInstance: OtpRepository | null = null
let otpRepoDbConfig: unknown = null

/**
 * 创建基于数据库的 OTP 存储实例
 *
 * 单例模式：同一 db 生命周期内重复调用返回缓存实例，
 * db 重新初始化后自动创建新实例。
 *
 * @param db - 数据库服务实例
 * @returns OTP 存储接口实现
 */
export async function createDbOtpRepository(db: DbService): Promise<OtpRepository> {
  if (otpRepoInstance && otpRepoDbConfig === db.config)
    return otpRepoInstance

  const repo = new DbOtpRepository(db)
  await repo.count()
  otpRepoInstance = repo
  otpRepoDbConfig = db.config
  return repo
}

/**
 * 基于数据库的 OTP 存储实现
 *
 * 继承 BaseCrudRepository，提供验证码的存储/查询/删除以及发送能力。
 * 内置过期自动清理：查询时发现过期会自动删除并返回 null。
 */
class DbOtpRepository extends BaseCrudRepository<OtpRecord> implements OtpRepository {
  constructor(db: DbService) {
    super(db, {
      table: TABLE_NAME,
      idColumn: 'identifier',
      idField: 'identifier',
      fields: OTP_FIELDS,
    })
  }

  /**
   * 存储验证码
   *
   * 先尝试更新已有记录，若不存在则创建新记录。
   *
   * @param identifier - 标识符（邮箱/手机号）
   * @param code - 验证码
   * @param expiresIn - 有效期（秒）
   * @param tx - 可选事务句柄
   */
  async saveOtp(identifier: string, code: string, expiresIn: number, tx?: TxHandle): Promise<Result<void, IamError>> {
    const now = Date.now()
    const expiresAt = new Date(now + expiresIn * 1000)
    const payload = {
      code,
      attempts: 0,
      expiresAt,
      createdAt: new Date(now),
    }

    const updateResult = await this.updateById(identifier, payload, tx)
    if (updateResult.success && updateResult.data.changes > 0) {
      return ok(undefined)
    }
    if (!updateResult.success) {
      return err({
        code: IamErrorCode.REPOSITORY_ERROR,
        message: iamM('iam_saveOtpFailed', { params: { message: updateResult.error.message } }),
        cause: updateResult.error,
      })
    }

    const createResult = await this.create({ identifier, ...payload }, tx)
    if (!createResult.success) {
      return err({
        code: IamErrorCode.REPOSITORY_ERROR,
        message: iamM('iam_saveOtpFailed', { params: { message: createResult.error.message } }),
        cause: createResult.error,
      })
    }

    return ok(undefined)
  }

  /**
   * 检查是否存在 OTP 记录
   *
   * @param options - 查询条件
   * @param tx - 可选事务句柄
   * @returns 存在返回 true
   */
  async exists(options?: CrudCountOptions, tx?: TxHandle): Promise<Result<boolean, DbError>> {
    const result = await this.count(options, tx)
    if (!result.success) {
      return result as Result<boolean, DbError>
    }
    return ok(result.data > 0)
  }

  /**
   * 获取验证码
   *
   * 若验证码已过期则自动删除并返回 null。
   *
   * @param identifier - 标识符
   * @param tx - 可选事务句柄
   * @returns OTP 记录，或 null（不存在/已过期）
   */
  async fetchOtp(identifier: string, tx?: TxHandle): Promise<Result<OtpRecord | null, IamError>> {
    const result = await this.findById(identifier, tx)
    if (!result.success) {
      return err({
        code: IamErrorCode.REPOSITORY_ERROR,
        message: iamM('iam_queryOtpFailed', { params: { message: result.error.message } }),
        cause: result.error,
      })
    }
    if (!result.data) {
      return ok(null)
    }
    if (isExpired(result.data.expiresAt.getTime())) {
      await this.removeOtp(identifier, tx)
      return ok(null)
    }
    return ok(result.data)
  }

  /**
   * 增加 OTP 尝试次数
   *
   * @param identifier - 标识符
   * @param tx - 可选事务句柄
   * @returns 更新后的尝试次数，记录不存在时返回 0
   */
  async incrementOtpAttempts(identifier: string, tx?: TxHandle): Promise<Result<number, IamError>> {
    const current = await this.findById(identifier, tx)
    if (!current.success) {
      return err({
        code: IamErrorCode.REPOSITORY_ERROR,
        message: iamM('iam_queryOtpFailed', { params: { message: current.error.message } }),
        cause: current.error,
      })
    }

    if (!current.data) {
      return ok(0)
    }

    const nextAttempts = current.data.attempts + 1
    const updateResult = await this.updateById(identifier, { attempts: nextAttempts }, tx)
    if (!updateResult.success) {
      return err({
        code: IamErrorCode.REPOSITORY_ERROR,
        message: iamM('iam_updateOtpAttemptsFailed', { params: { message: updateResult.error.message } }),
        cause: updateResult.error,
      })
    }

    return ok(nextAttempts)
  }

  /**
   * 删除验证码
   *
   * @param identifier - 标识符
   * @param tx - 可选事务句柄
   */
  async removeOtp(identifier: string, tx?: TxHandle): Promise<Result<void, IamError>> {
    const result = await this.deleteById(identifier, tx)
    if (!result.success) {
      return err({
        code: IamErrorCode.REPOSITORY_ERROR,
        message: iamM('iam_deleteOtpFailed', { params: { message: result.error.message } }),
        cause: result.error,
      })
    }
    return ok(undefined)
  }

  /**
   * 发送邮件验证码（默认空实现，需业务层覆写）
   */
  async sendEmail(_email: string, _code: string): Promise<Result<void, IamError>> {
    return ok(undefined)
  }

  /**
   * 发送短信验证码（默认空实现，需业务层覆写）
   */
  async sendSms(_phone: string, _code: string): Promise<Result<void, IamError>> {
    return ok(undefined)
  }
}
