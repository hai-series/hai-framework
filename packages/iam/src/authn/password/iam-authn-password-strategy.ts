/**
 * @h-ai/iam — 密码认证策略
 *
 * 用户名/邮箱 + 密码的认证方式
 * @module iam-authn-password-strategy
 */

import type { HaiResult } from '@h-ai/core'
import type { PasswordConfig } from '../../iam-config.js'
import type { UserRepository } from '../../user/iam-user-repository-user.js'
import type { StoredUser } from '../../user/iam-user-types.js'
import type { AuthenticatedUser, AuthStrategy, Credentials } from '../iam-authn-types.js'
import { core, err, ok } from '@h-ai/core'
import { crypto as haiCrypto } from '@h-ai/crypto'

import { PasswordConfigSchema } from '../../iam-config.js'
import { iamM } from '../../iam-i18n.js'
import { HaiIamError } from '../../iam-types.js'
import { checkPasswordState, isUserActive, toUser } from '../../user/iam-user-utils.js'
import { ensureCredentialType, isAccountLocked, recordLoginFailure, resetLoginFailures } from '../iam-authn-utils.js'

/**
 * 密码认证策略配置
 * @internal
 * @example 模块内部上下文
 * ```ts
 * function configure(userRepository: UserRepository) {
 *   const config: PasswordStrategyConfig = { userRepository, maxLoginAttempts: 5, lockoutDuration: 900 }
 *   return createPasswordStrategy(config)
 * }
 * ```
 */
export interface PasswordStrategyConfig {
  /** 密码策略 */
  passwordConfig?: PasswordConfig
  /** 用户存储 */
  userRepository: UserRepository
  /** 最大登录失败次数（默认 5） */
  lockoutEnabled?: boolean
  failureWindow?: number
  maxLoginAttempts?: number
  /** 锁定时间（秒，默认 900 = 15分钟） */
  lockoutDuration?: number
}

/**
 * 密码策略工厂返回值
 * @internal
 * @example 模块内部上下文
 * ```ts
 * function hashNewPassword(strategy: PasswordStrategyResult, password: string) {
 *   const valid = strategy.validatePassword(password)
 *   if (!valid.success)
 *     return valid
 *   return strategy.hashPassword(password)
 * }
 * ```
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
const PASSWORD_UPPERCASE_REGEX = /[A-Z]/
const PASSWORD_LOWERCASE_REGEX = /[a-z]/
const PASSWORD_DIGIT_REGEX = /\d/
const PASSWORD_SPECIAL_CHAR_REGEX = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/

/**
 * 创建密码认证策略
 * @param config - 已校验的配置及可信运行时依赖。
 * @returns 密码认证策略、强度校验、哈希操作与已解析策略；校验和哈希失败均以 HaiResult 表达。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * function authenticate(config: PasswordStrategyConfig, credentials: Credentials) {
 *   const strategy = createPasswordStrategy(config)
 *   return strategy.strategy.authenticate(credentials)
 * }
 * ```
 */
export function createPasswordStrategy(config: PasswordStrategyConfig): PasswordStrategyResult {
  const passwordConfig = config.passwordConfig
    ? PasswordConfigSchema.parse(config.passwordConfig)
    : PasswordConfigSchema.parse({})

  const maxLoginAttempts = config.maxLoginAttempts ?? 5
  const lockoutDuration = config.lockoutDuration ?? 900
  const failurePolicy = { maxLoginAttempts, lockoutDuration, lockoutEnabled: config.lockoutEnabled ?? true, failureWindow: config.failureWindow ?? 86400 }
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

    if (passwordConfig.requireUppercase && !PASSWORD_UPPERCASE_REGEX.test(password)) {
      return err(
        HaiIamError.PASSWORD_POLICY_VIOLATION,
        iamM('iam_passwordNeedUppercase'),
      )
    }

    if (passwordConfig.requireLowercase && !PASSWORD_LOWERCASE_REGEX.test(password)) {
      return err(
        HaiIamError.PASSWORD_POLICY_VIOLATION,
        iamM('iam_passwordNeedLowercase'),
      )
    }

    if (passwordConfig.requireNumber && !PASSWORD_DIGIT_REGEX.test(password)) {
      return err(
        HaiIamError.PASSWORD_POLICY_VIOLATION,
        iamM('iam_passwordNeedNumber'),
      )
    }

    if (passwordConfig.requireSpecialChar && !PASSWORD_SPECIAL_CHAR_REGEX.test(password)) {
      return err(
        HaiIamError.PASSWORD_POLICY_VIOLATION,
        iamM('iam_passwordNeedSpecialChar'),
      )
    }

    const classes = [PASSWORD_UPPERCASE_REGEX, PASSWORD_LOWERCASE_REGEX, PASSWORD_DIGIT_REGEX, PASSWORD_SPECIAL_CHAR_REGEX].filter(pattern => pattern.test(password)).length
    if (classes < passwordConfig.minCharacterClasses)
      return err(HaiIamError.PASSWORD_POLICY_VIOLATION, iamM('iam_passwordCharacterClasses', { params: { count: passwordConfig.minCharacterClasses } }))

    return ok(undefined)
  }

  /**
   * 校验账户状态（启用、锁定）
   */
  function checkAccountStatus(user: StoredUser): HaiResult<void> {
    if (!isUserActive(user)) {
      return err(HaiIamError.USER_DISABLED, iamM('iam_accountDisabled'))
    }
    if (isAccountLocked(user, failurePolicy)) {
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
      const failureResult = await recordLoginFailure(config.userRepository, user, failurePolicy)
      if (!failureResult.success)
        return failureResult
      logger.warn('Password verification failed', { userId: user.id })
      return err(HaiIamError.INVALID_CREDENTIALS, iamM('iam_passwordWrong'))
    }

    return ok(undefined)
  }

  const strategy: AuthStrategy = {
    type: 'password',
    name: 'password-strategy',

    async authenticate(credentials: Credentials): Promise<HaiResult<AuthenticatedUser>> {
      const credentialResult = ensureCredentialType(credentials, 'password')
      if (!credentialResult.success) {
        return credentialResult as HaiResult<AuthenticatedUser>
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
        return statusResult as HaiResult<AuthenticatedUser>

      // 验证密码
      const pwResult = await verifyUserPassword(storedUser, password)
      if (!pwResult.success)
        return pwResult as HaiResult<AuthenticatedUser>

      // 检查密码是否过期
      const passwordState = checkPasswordState(storedUser, passwordConfig)
      if (!passwordState.success)
        return passwordState

      // 登录成功，重置失败计数
      const resetResult = await resetLoginFailures(config.userRepository, storedUser, failurePolicy)
      if (!resetResult.success)
        return resetResult
      logger.info('Password authentication succeeded', { userId: storedUser.id })

      return ok({ ...toUser(storedUser), credentialVersion: storedUser.credentialVersion ?? '' })
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
