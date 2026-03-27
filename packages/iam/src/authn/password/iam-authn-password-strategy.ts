/**
 * @h-ai/iam — 密码认证策略
 *
 * 用户名/邮箱 + 密码的认证方式
 * @module iam-authn-password-strategy
 */

import type { HaiResult } from '@h-ai/core'
import type { PasswordConfig } from '../../iam-config.js'
import type { UserRepository } from '../../user/iam-user-repository-user.js'
import type { StoredUser, User } from '../../user/iam-user-types.js'
import type { AuthStrategy, Credentials } from '../iam-authn-types.js'
import { core, err, ok } from '@h-ai/core'
import { crypto as haiCrypto } from '@h-ai/crypto'

import { PasswordConfigSchema } from '../../iam-config.js'
import { iamM } from '../../iam-i18n.js'
import { HaiIamError } from '../../iam-types.js'
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

/**
 * 密码策略工厂返回值
 */
export interface PasswordStrategyResult {
  /** 认证策略（用于通用登录流程） */
  strategy: AuthStrategy
  /** 验证密码强度 */
  validatePassword: (password: string) => HaiResult<void>
  /** 密码哈希 */
  hashPassword: (password: string) => HaiResult<string>
  /** 密码策略配置 */
  passwordConfig: PasswordConfig
}

const logger = core.logger.child({ module: 'iam', scope: 'password-strategy' })

/**
 * 创建密码认证策略
 */
export function createPasswordStrategy(config: PasswordStrategyConfig): PasswordStrategyResult {
  const passwordConfig = config.passwordConfig
    ? PasswordConfigSchema.parse(config.passwordConfig)
    : PasswordConfigSchema.parse({})

  const maxLoginAttempts = config.maxLoginAttempts ?? 5
  const lockoutDuration = config.lockoutDuration ?? 900
  const passwordOps = haiCrypto.password

  function mapPasswordError(message: string): HaiResult<never> {
    return err(
      HaiIamError.INTERNAL_ERROR,
      message,
    )
  }

  /**
   * 验证密码强度
   */
  function validatePasswordStrength(password: string): HaiResult<void> {
    if (password.length < passwordConfig.minLength) {
      return err(
        HaiIamError.PASSWORD_POLICY_VIOLATION,
        iamM('iam_passwordMinLength', { params: { minLength: passwordConfig.minLength } }),
      )
    }

    if (password.length > passwordConfig.maxLength) {
      return err(
        HaiIamError.PASSWORD_POLICY_VIOLATION,
        iamM('iam_passwordMaxLength', { params: { maxLength: passwordConfig.maxLength } }),
      )
    }

    if (passwordConfig.requireUppercase && !/[A-Z]/.test(password)) {
      return err(
        HaiIamError.PASSWORD_POLICY_VIOLATION,
        iamM('iam_passwordNeedUppercase'),
      )
    }

    if (passwordConfig.requireLowercase && !/[a-z]/.test(password)) {
      return err(
        HaiIamError.PASSWORD_POLICY_VIOLATION,
        iamM('iam_passwordNeedLowercase'),
      )
    }

    if (passwordConfig.requireNumber && !/\d/.test(password)) {
      return err(
        HaiIamError.PASSWORD_POLICY_VIOLATION,
        iamM('iam_passwordNeedNumber'),
      )
    }

    if (passwordConfig.requireSpecialChar && !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
      return err(
        HaiIamError.PASSWORD_POLICY_VIOLATION,
        iamM('iam_passwordNeedSpecialChar'),
      )
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
  function checkAccountStatus(user: StoredUser): HaiResult<void> {
    if (!user.enabled) {
      return err(HaiIamError.USER_DISABLED, iamM('iam_accountDisabled'))
    }
    if (isAccountLocked(user)) {
      return err(HaiIamError.USER_LOCKED, iamM('iam_accountLocked'))
    }
    return ok(undefined)
  }

  /**
   * 验证用户密码
   */
  async function verifyUserPassword(user: StoredUser, password: string): Promise<HaiResult<void>> {
    if (!user.passwordHash) {
      return err(HaiIamError.INVALID_CREDENTIALS, iamM('iam_accountNoPassword'))
    }
    const verifyResult = passwordOps.verify(password, user.passwordHash)
    if (!verifyResult.success) {
      return mapPasswordError(verifyResult.error.message)
    }

    if (!verifyResult.data) {
      await recordLoginFailure(config.userRepository, user, { maxLoginAttempts, lockoutDuration })
      logger.warn('Password verification failed', { userId: user.id })
      return err(HaiIamError.INVALID_CREDENTIALS, iamM('iam_passwordWrong'))
    }

    return ok(undefined)
  }

  const strategy: AuthStrategy = {
    type: 'password',
    name: 'password-strategy',

    async authenticate(credentials: Credentials): Promise<HaiResult<User>> {
      const credentialResult = ensureCredentialType(credentials, 'password')
      if (!credentialResult.success) {
        return credentialResult as HaiResult<User>
      }

      const { identifier, password } = credentialResult.data

      // 查找用户
      const userResult = await config.userRepository.findByIdentifier(identifier)
      if (!userResult.success)
        return userResult

      const storedUser = userResult.data
      if (!storedUser) {
        // 防止用户枚举：执行伪哈希验证以消除时序差异，统一返回 INVALID_CREDENTIALS
        await passwordOps.hash('dummy-password-to-prevent-timing-leak')
        return err(HaiIamError.INVALID_CREDENTIALS, iamM('iam_passwordWrong'))
      }

      // 校验账户状态
      const statusResult = checkAccountStatus(storedUser)
      if (!statusResult.success)
        return statusResult as HaiResult<User>

      // 验证密码
      const pwResult = await verifyUserPassword(storedUser, password)
      if (!pwResult.success)
        return pwResult as HaiResult<User>

      // 检查密码是否过期
      if (isPasswordExpired(storedUser)) {
        return err(HaiIamError.PASSWORD_EXPIRED, iamM('iam_passwordExpired'))
      }

      // 登录成功，重置失败计数
      await resetLoginFailures(config.userRepository, storedUser)
      logger.info('Password authentication succeeded', { userId: storedUser.id })

      return ok(toUser(storedUser))
    },
  }

  function hashPassword(password: string): HaiResult<string> {
    const hashResult = passwordOps.hash(password)
    if (!hashResult.success) {
      return mapPasswordError(hashResult.error.message)
    }
    return ok(hashResult.data)
  }

  return {
    strategy,
    validatePassword: validatePasswordStrength,
    hashPassword,
    passwordConfig,
  }
}
