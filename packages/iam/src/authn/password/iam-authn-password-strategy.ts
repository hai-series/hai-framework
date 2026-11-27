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
import { core } from '@h-ai/core'
import { crypto as haiCrypto } from '@h-ai/crypto'

import { PasswordConfigSchema } from '../../iam-config.js'
import { iamM } from '../../iam-i18n.js'
import { HaiIamError } from '../../iam-types.js'
import { checkPasswordState, isUserActive, toUser } from '../../user/iam-user-utils.js'
import { checkAccountLock, ensureCredentialType, mapPasswordWorkError, recordLoginFailure, rejectMissingPasswordCredentials, resetLoginFailures } from '../iam-authn-utils.js'

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
 * async function hashNewPassword(strategy: PasswordStrategyResult, password: string) {
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
  /** 按当前会话已经确定的用户 ID 验证密码。 */
  authenticateUser: (userId: string, password: string) => Promise<HaiResult<AuthenticatedUser>>
  /** 验证密码强度 */
  validatePassword: (password: string) => HaiResult<void>
  /** 密码哈希 */
  hashPassword: (password: string) => Promise<HaiResult<string>>
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
  const failurePolicy = {
    maxLoginAttempts,
    lockoutDuration,
    lockoutEnabled: config.lockoutEnabled ?? true,
    failureWindow: config.failureWindow ?? 86400,
  }
  /**
   * 验证密码强度
   */
  function validatePasswordStrength(password: string): HaiResult<void> {
    if (password.length < passwordConfig.minLength) {
      return core.err(
        HaiIamError.PASSWORD_POLICY_VIOLATION,
        iamM('iam_passwordMinLength', {
          params: { minLength: passwordConfig.minLength },
        }),
      )
    }

    if (password.length > passwordConfig.maxLength) {
      return core.err(
        HaiIamError.PASSWORD_POLICY_VIOLATION,
        iamM('iam_passwordMaxLength', {
          params: { maxLength: passwordConfig.maxLength },
        }),
      )
    }

    if (passwordConfig.requireUppercase && !PASSWORD_UPPERCASE_REGEX.test(password)) {
      return core.err(
        HaiIamError.PASSWORD_POLICY_VIOLATION,
        iamM('iam_passwordNeedUppercase'),
      )
    }

    if (passwordConfig.requireLowercase && !PASSWORD_LOWERCASE_REGEX.test(password)) {
      return core.err(
        HaiIamError.PASSWORD_POLICY_VIOLATION,
        iamM('iam_passwordNeedLowercase'),
      )
    }

    if (passwordConfig.requireNumber && !PASSWORD_DIGIT_REGEX.test(password)) {
      return core.err(
        HaiIamError.PASSWORD_POLICY_VIOLATION,
        iamM('iam_passwordNeedNumber'),
      )
    }

    if (passwordConfig.requireSpecialChar && !PASSWORD_SPECIAL_CHAR_REGEX.test(password)) {
      return core.err(
        HaiIamError.PASSWORD_POLICY_VIOLATION,
        iamM('iam_passwordNeedSpecialChar'),
      )
    }

    const classes = [
      PASSWORD_UPPERCASE_REGEX,
      PASSWORD_LOWERCASE_REGEX,
      PASSWORD_DIGIT_REGEX,
      PASSWORD_SPECIAL_CHAR_REGEX,
    ].filter(pattern => pattern.test(password)).length
    if (classes < passwordConfig.minCharacterClasses) {
      return core.err(HaiIamError.PASSWORD_POLICY_VIOLATION, iamM('iam_passwordCharacterClasses', {
        params: { count: passwordConfig.minCharacterClasses },
      }))
    }

    return core.ok(undefined)
  }

  /**
   * 验证用户密码
   */
  async function verifyUserPassword(user: StoredUser, password: string): Promise<HaiResult<void>> {
    if (!user.passwordHash)
      return rejectMissingPasswordCredentials()
    const verifyResult = await haiCrypto.password.verifyAsync(password, user.passwordHash)
    if (!verifyResult.success) {
      return mapPasswordWorkError(verifyResult.error)
    }

    if (!verifyResult.data) {
      const failureResult = await recordLoginFailure(user, failurePolicy)
      if (!failureResult.success)
        return failureResult
      logger.warn('Password verification failed', { userId: user.id })
      return core.err(HaiIamError.INVALID_CREDENTIALS, iamM('iam_passwordWrong'))
    }

    return core.ok(undefined)
  }

  /** 登录和再认证共用同一份凭据快照及失败锁定规则。 */
  async function authenticateStoredUser(storedUser: StoredUser | null, password: string): Promise<HaiResult<AuthenticatedUser>> {
    if (!storedUser)
      return rejectMissingPasswordCredentials()

    // 受限账号或共享锁定状态不可用时，不继续鉴别密码。
    if (!isUserActive(storedUser))
      return core.err(HaiIamError.ACCOUNT_UNAVAILABLE, iamM('iam_accountUnavailable'))
    const lock = await checkAccountLock(storedUser, failurePolicy)
    if (!lock.success)
      return lock
    const verified = await verifyUserPassword(storedUser, password)
    if (!verified.success)
      return verified
    const passwordState = checkPasswordState(storedUser, passwordConfig)
    if (!passwordState.success)
      return passwordState
    const reset = await resetLoginFailures(config.userRepository, storedUser, failurePolicy)
    if (!reset.success)
      return reset

    logger.debug('Password authentication succeeded', { userId: storedUser.id })
    return core.ok({
      ...toUser(storedUser),
      credentialVersion: storedUser.credentialVersion ?? '',
    })
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

      const userResult = await config.userRepository.findByIdentifier(identifier)
      if (!userResult.success)
        return userResult
      return authenticateStoredUser(userResult.data, password)
    },
  }

  async function hashPassword(password: string): Promise<HaiResult<string>> {
    const hashResult = await haiCrypto.password.hashAsync(password)
    if (!hashResult.success) {
      return mapPasswordWorkError(hashResult.error)
    }
    return core.ok(hashResult.data)
  }

  return {
    strategy,
    async authenticateUser(userId, password) {
      const user = await config.userRepository.findById(userId)
      return user.success
        ? authenticateStoredUser(user.data, password)
        : user
    },
    validatePassword: validatePasswordStrength,
    hashPassword,
    passwordConfig,
  }
}
