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
 * 判断是否过期
 */
function isExpired(expiresAt: number, now = Date.now()): boolean {
  return now > expiresAt
}

/**
 * 创建数据库 OTP 存储
 */
let otpRepositorySingleton: DbOtpRepository | null = null

export async function createDbOtpRepository(db: DbService): Promise<OtpRepository> {
  if (otpRepositorySingleton) {
    return otpRepositorySingleton
  }
  otpRepositorySingleton = new DbOtpRepository(db)
  return otpRepositorySingleton
}

class DbOtpRepository extends BaseCrudRepository<OtpRecord> implements OtpRepository {
  constructor(db: DbService) {
    super(db, {
      table: TABLE_NAME,
      idColumn: 'identifier',
      idField: 'identifier',
      fields: OTP_FIELDS,
    })
  }

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

  async exists(options?: CrudCountOptions, tx?: TxHandle): Promise<Result<boolean, DbError>> {
    const result = await this.count(options, tx)
    if (!result.success) {
      return result as Result<boolean, DbError>
    }
    return ok(result.data > 0)
  }

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

  async sendEmail(_email: string, _code: string): Promise<Result<void, IamError>> {
    return ok(undefined)
  }

  async sendSms(_phone: string, _code: string): Promise<Result<void, IamError>> {
    return ok(undefined)
  }
}
