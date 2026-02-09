/**
 * =============================================================================
 * @hai/iam - 密码认证策略
 * =============================================================================
 *
 * 用户名/邮箱 + 密码的认证方式
 *
 * @module authn/password/iam-authn-password-strategy
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type { PasswordConfig } from '../../iam-config.js'
import type { IamError } from '../../iam-core-types.js'
import type { UserRepository } from '../../user/iam-user-repository-user.js'
import type { StoredUser, User } from '../../user/iam-user-types.js'
import type { AuthStrategy, Credentials } from '../iam-authn-types.js'
import { core, err, ok } from '@hai/core'
import { crypto as haiCrypto } from '@hai/crypto'

import { IamErrorCode, PasswordConfigSchema } from '../../iam-config.js'
import { iamM } from '../../iam-i18n.js'
import { toUser } from '../../user/iam-user-utils.js'
import { ensureCredentialType, isAccountLocked, recordLoginFailure, resetLoginFailures } from '../iam-authn-utils.js'

/**
 * 密码认证策略配置
 */
export interface PasswordStrategyConfig {
  /** 密码策略 */
  passwordConfig?: PasswordConfig
  /** 用户存储 */
  userRepository: UserRepository
  /** 最大登录失败次数（默认 5） */
  maxLoginAttempts?: number
  /** 锁定时间（秒，默认 900 = 15分钟） */
  lockoutDuration?: number
}

const logger = core.logger.child({ module: 'iam', scope: 'password-strategy' })

/**
 * 创建密码认证策略
 */
export function createPasswordStrategy(config: PasswordStrategyConfig): PasswordStrategy {
  const passwordConfig = config.passwordConfig
    ? PasswordConfigSchema.parse(config.passwordConfig)
    : PasswordConfigSchema.parse({})

  const maxLoginAttempts = config.maxLoginAttempts ?? 5
  const lockoutDuration = config.lockoutDuration ?? 900
  const passwordOps = haiCrypto.password

  function mapPasswordError(message: string): Result<never, IamError> {
    return err({
      code: IamErrorCode.INTERNAL_ERROR,
      message,
    })
  }

  /**
   * 验证密码强度
   */
  function validatePasswordStrength(password: string): Result<void, IamError> {
    if (password.length < passwordConfig.minLength) {
      return err({
        code: IamErrorCode.PASSWORD_POLICY_VIOLATION,
        message: iamM('iam_passwordMinLength', { params: { minLength: passwordConfig.minLength } }),
      })
    }

    if (password.length > passwordConfig.maxLength) {
      return err({
        code: IamErrorCode.PASSWORD_POLICY_VIOLATION,
        message: iamM('iam_passwordMaxLength', { params: { maxLength: passwordConfig.maxLength } }),
      })
    }

    if (passwordConfig.requireUppercase && !/[A-Z]/.test(password)) {
      return err({
        code: IamErrorCode.PASSWORD_POLICY_VIOLATION,
        message: iamM('iam_passwordNeedUppercase'),
      })
    }

    if (passwordConfig.requireLowercase && !/[a-z]/.test(password)) {
      return err({
        code: IamErrorCode.PASSWORD_POLICY_VIOLATION,
        message: iamM('iam_passwordNeedLowercase'),
      })
    }

    if (passwordConfig.requireNumber && !/\d/.test(password)) {
      return err({
        code: IamErrorCode.PASSWORD_POLICY_VIOLATION,
        message: iamM('iam_passwordNeedNumber'),
      })
    }

    if (passwordConfig.requireSpecialChar && !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
      return err({
        code: IamErrorCode.PASSWORD_POLICY_VIOLATION,
        message: iamM('iam_passwordNeedSpecialChar'),
      })
    }

    return ok(undefined)
  }

  /**
   * 检查密码是否过期
   */
  function isPasswordExpired(user: StoredUser): boolean {
    if (passwordConfig.expirationDays <= 0 || !user.passwordUpdatedAt) {
      return false
    }
    const expirationDate = new Date(user.passwordUpdatedAt)
    expirationDate.setDate(expirationDate.getDate() + passwordConfig.expirationDays)
    return new Date() > expirationDate
  }

  /**
   * 校验账户状态（启用、锁定）
   */
  function checkAccountStatus(user: StoredUser): Result<void, IamError> {
    if (!user.enabled) {
      return err({ code: IamErrorCode.USER_DISABLED, message: iamM('iam_accountDisabled') })
    }
    if (isAccountLocked(user)) {
      return err({ code: IamErrorCode.USER_LOCKED, message: iamM('iam_accountLocked') })
    }
    return ok(undefined)
  }

  /**
   * 验证用户密码
   */
  async function verifyUserPassword(user: StoredUser, password: string): Promise<Result<void, IamError>> {
    if (!user.passwordHash) {
      return err({ code: IamErrorCode.INVALID_CREDENTIALS, message: iamM('iam_accountNoPassword') })
    }

    const verifyResult = passwordOps.verify(password, user.passwordHash)
    if (!verifyResult.success) {
      return mapPasswordError(verifyResult.error.message)
    }

    if (!verifyResult.data) {
      await recordLoginFailure(config.userRepository, user, { maxLoginAttempts, lockoutDuration })
      logger.warn('Password verification failed', { userId: user.id })
      return err({ code: IamErrorCode.INVALID_CREDENTIALS, message: iamM('iam_passwordWrong') })
    }

    return ok(undefined)
  }

  return {
    type: 'password',
    name: 'password-strategy',

    async authenticate(credentials: Credentials): Promise<Result<User, IamError>> {
      const credentialResult = ensureCredentialType(credentials, 'password')
      if (!credentialResult.success) {
        return credentialResult as Result<User, IamError>
      }

      const { identifier, password } = credentialResult.data

      // 查找用户
      const userResult = await config.userRepository.findByIdentifier(identifier)
      if (!userResult.success)
        return userResult

      const storedUser = userResult.data
      if (!storedUser) {
        return err({ code: IamErrorCode.USER_NOT_FOUND, message: iamM('iam_userNotExist') })
      }

      // 校验账户状态
      const statusResult = checkAccountStatus(storedUser)
      if (!statusResult.success)
        return statusResult as Result<User, IamError>

      // 验证密码
      const pwResult = await verifyUserPassword(storedUser, password)
      if (!pwResult.success)
        return pwResult as Result<User, IamError>

      // 检查密码是否过期
      if (isPasswordExpired(storedUser)) {
        return err({ code: IamErrorCode.PASSWORD_EXPIRED, message: iamM('iam_passwordExpired') })
      }

      // 登录成功，重置失败计数
      await resetLoginFailures(config.userRepository, storedUser)
      logger.info('Password authentication succeeded', { userId: storedUser.id })

      return ok(toUser(storedUser))
    },

    validatePassword: validatePasswordStrength,

    hashPassword(password: string): Result<string, IamError> {
      const hashResult = passwordOps.hash(password)
      if (!hashResult.success) {
        return mapPasswordError(hashResult.error.message)
      }
      return ok(hashResult.data)
    },

    passwordConfig,
  }
}

/**
 * 扩展的密码策略接口（包含额外方法）
 */
export interface PasswordStrategy extends AuthStrategy {
  /** 验证密码强度 */
  validatePassword: (password: string) => Result<void, IamError>
  /** 密码哈希 */
  hashPassword: (password: string) => Result<string, IamError>
  /** 密码策略 */
  passwordConfig: PasswordConfig
}
