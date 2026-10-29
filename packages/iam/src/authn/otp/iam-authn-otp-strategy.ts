/**
 * @h-ai/iam — OTP 认证策略
 *
 * 邮箱/短信 + 验证码的认证方式
 * @module iam-authn-otp-strategy
 */

import type { HaiResult } from '@h-ai/core'
import type { OtpConfig, RegisterConfig } from '../../iam-config.js'
import type { IamNotificationContext } from '../../iam-types.js'
import type { UserRepository } from '../../user/iam-user-repository-user.js'
import type { AuthStrategy, Credentials } from '../iam-authn-types.js'
import type { OtpRepository } from './iam-authn-otp-repository-otp.js'
import { core, err, ok } from '@h-ai/core'

import { OtpConfigSchema } from '../../iam-config.js'
import { iamM } from '../../iam-i18n.js'
import { HaiIamError } from '../../iam-types.js'
import { isUserActive, toUser } from '../../user/iam-user-utils.js'
import {
  ensureCredentialType,
  isAccountLocked,
  recordLoginFailure,
  resetLoginFailures,
} from '../iam-authn-utils.js'
import { normalizeOtpIdentifier } from './iam-authn-otp-repository-otp.js'

const logger = core.logger.child({ module: 'iam', scope: 'otp-strategy' })
const PHONE_IDENTIFIER_REGEX = /^\+?\d{8,}$/
const PHONE_SEPARATOR_REGEX = /[\s-]/g

/**
 * OTP 认证策略配置
 * @internal
 * @example 模块内部上下文
 * ```ts
 * function configure(userRepository: UserRepository, otpRepository: OtpRepository) {
 *   const config: OtpStrategyConfig = { userRepository, otpRepository, autoRegister: false }
 *   return createOtpStrategy(config)
 * }
 * ```
 */
export interface OtpStrategyConfig {
  /** OTP 配置 */
  otpConfig?: OtpConfig
  /** 用户存储 */
  userRepository: UserRepository
  /** OTP 存储 */
  otpRepository: OtpRepository
  /** 是否允许自动注册新用户 */
  autoRegister?: boolean
  /** 注册配置（用于自动注册场景） */
  registerConfig?: RegisterConfig
  /** 最大登录失败次数（默认 5） */
  lockoutEnabled?: boolean
  failureWindow?: number
  maxLoginAttempts?: number
  /** 锁定时间（秒，默认 900 = 15分钟） */
  lockoutDuration?: number
  /**
   * 用户自动注册后的回调
   *
   * 用于分配默认角色等后处理操作。
   *
   * @param userId - 新创建的用户 ID
   */
  onUserAutoRegistered?: (userId: string) => Promise<HaiResult<void>>
  /** OTP 邮件发送回调（由业务层注入） */
  onOtpSendEmail?: (email: string, code: string, context: IamNotificationContext) => Promise<void>
  /** OTP 短信发送回调（由业务层注入） */
  onOtpSendSms?: (phone: string, code: string, context: IamNotificationContext) => Promise<void>
}

/**
 * 生成随机数字验证码
 *
 * 使用 `crypto.getRandomValues` 生成加密安全的随机数字串。
 *
 * @param length - 验证码长度
 * @returns 纯数字验证码字符串
 */
function generateOtpCode(length: number): string {
  let code = ''
  // 使用拒绝采样消除模偏（256 % 10 = 6，前 250 个值均匀映射到 0-9）
  const threshold = 250
  while (code.length < length) {
    const randomValues = new Uint8Array(length - code.length)
    crypto.getRandomValues(randomValues)
    for (const byte of randomValues) {
      if (byte < threshold && code.length < length) {
        code += String(byte % 10)
      }
    }
  }
  return code
}

/**
 * 判断标识符类型
 *
 * 通过简单规则推断标识符是邮箱、手机号还是未知类型。
 *
 * @param identifier - 用户标识符（邮箱/手机号）
 * @returns 标识符类型：'email' | 'phone' | 'unknown'
 */
function identifierType(identifier: string): 'email' | 'phone' | 'unknown' {
  // 简单邮箱检测
  if (identifier.includes('@')) {
    return 'email'
  }
  // 简单手机号检测（以数字开头，长度大于 8）
  if (PHONE_IDENTIFIER_REGEX.test(identifier.replace(PHONE_SEPARATOR_REGEX, ''))) {
    return 'phone'
  }
  return 'unknown'
}

/**
 * OTP 策略工厂返回值
 * @internal
 * @example 模块内部上下文
 * ```ts
 * async function challenge(strategy: OtpStrategyResult) {
 *   const issued = await strategy.challenge('alice@example.com')
 *   if (!issued.success)
 *     return issued
 *   return issued.data.expiresAt
 * }
 * ```
 */
export interface OtpStrategyResult {
  /** 认证策略（用于通用登录流程） */
  strategy: AuthStrategy
  /** 发起认证挑战（发送验证码） */
  challenge: (identifier: string) => Promise<HaiResult<{ expiresAt: Date }>>
}

/**
 * 创建 OTP 认证策略
 *
 * 支持验证码登录、自动注册新用户、发送频率限制、登录失败锁定等能力。
 *
 * @param config - OTP 策略配置（包含用户存储、OTP 存储、自动注册开关等）
 * @returns OTP 策略结果，包含认证策略和 challenge 方法
 * @internal
 * @example 模块内部上下文
 * ```ts
 * function authenticate(config: OtpStrategyConfig) {
 *   const strategy = createOtpStrategy(config)
 *   return strategy.strategy.authenticate({ type: 'otp', identifier: 'alice@example.com', code: '123456' })
 * }
 * ```
 */
export function createOtpStrategy(config: OtpStrategyConfig): OtpStrategyResult {
  const otpConfig = config.otpConfig
    ? OtpConfigSchema.parse(config.otpConfig)
    : OtpConfigSchema.parse({})
  const maxLoginAttempts = config.maxLoginAttempts ?? 5
  const lockoutDuration = config.lockoutDuration ?? 900
  const failurePolicy = { maxLoginAttempts, lockoutDuration, lockoutEnabled: config.lockoutEnabled ?? true, failureWindow: config.failureWindow ?? 86400 }
  const registerConfig = config.registerConfig
  const allowAutoRegister = registerConfig?.enabled ?? config.autoRegister ?? false
  const defaultAccountStatus = registerConfig?.defaultAccountStatus ?? 'active'

  const strategy: AuthStrategy = {
    type: 'otp',
    name: 'otp-strategy',

    async authenticate(credentials: Credentials) {
      // 类型检查
      const credentialResult = ensureCredentialType(credentials, 'otp')
      if (!credentialResult.success) {
        return credentialResult
      }

      const identifier = normalizeOtpIdentifier(credentialResult.data.identifier)
      const { code } = credentialResult.data
      if (!isChannelEnabled(identifier))
        return err(HaiIamError.LOGIN_DISABLED, iamM('iam_identifierTypeNotSupported'))

      // 预先加载用户用于账户状态判断
      const userResult = await config.userRepository.findByIdentifier(identifier)
      if (!userResult.success) {
        return userResult
      }

      let storedUser = userResult.data

      if (storedUser) {
        if (!isUserActive(storedUser)) {
          return err(HaiIamError.ACCOUNT_UNAVAILABLE, iamM('iam_accountUnavailable'))
        }

        if (isAccountLocked(storedUser, failurePolicy)) {
          return err(HaiIamError.USER_LOCKED, iamM('iam_accountLocked'))
        }
      }

      // 单 key CAS 验证并消费；旧读/重放不能删除新验证码。
      const consumed = await config.otpRepository.consumeOtp(identifier, code, otpConfig.maxAttempts)
      if (!consumed.success) {
        if (storedUser && consumed.error.code === HaiIamError.OTP_INVALID.code) {
          const failed = await recordLoginFailure(config.userRepository, storedUser, failurePolicy)
          if (!failed.success)
            return failed
        }
        return consumed
      }

      // 如果用户不存在且允许自动注册
      if (!storedUser && allowAutoRegister) {
        const type = identifierType(identifier)
        const createResult = await config.userRepository.create({
          username: identifier,
          email: type === 'email' ? identifier : undefined,
          phone: type === 'phone' ? identifier : undefined,
          accountStatus: defaultAccountStatus,
          emailVerified: type === 'email',
          phoneVerified: type === 'phone',
        })
        if (!createResult.success) {
          return err(
            HaiIamError.REPOSITORY_ERROR,
            iamM('iam_createUserFailed', { params: { message: createResult.error.message } }),
            createResult.error,
          )
        }

        const createdResult = await config.userRepository.findByIdentifier(identifier)
        if (!createdResult.success) {
          return createdResult
        }
        storedUser = createdResult.data

        // 自动注册后回调（分配默认角色等）
        if (storedUser && config.onUserAutoRegistered) {
          try {
            const assigned = await config.onUserAutoRegistered(storedUser.id)
            if (!assigned.success) {
              await config.userRepository.deleteById(storedUser.id)
              return assigned
            }
          }
          catch (callbackError) {
            logger.warn('onUserAutoRegistered callback failed', { userId: storedUser.id, error: callbackError })
          }
        }
      }

      if (!storedUser) {
        return err(HaiIamError.USER_NOT_FOUND, iamM('iam_userNotExist'))
      }

      // 登录成功，重置失败计数
      if (!isUserActive(storedUser))
        return err(HaiIamError.ACCOUNT_UNAVAILABLE, iamM('iam_accountUnavailable'))
      const resetResult = await resetLoginFailures(config.userRepository, storedUser, failurePolicy)
      if (!resetResult.success)
        return resetResult
      logger.debug('OTP authentication succeeded', { userId: storedUser.id })

      return ok({ ...toUser(storedUser), credentialVersion: storedUser.credentialVersion ?? '' })
    },
  }

  // ─── challenge ───

  function isChannelEnabled(identifier: string): boolean {
    const type = identifierType(identifier)
    return (type === 'email' && otpConfig.email && !!config.onOtpSendEmail)
      || (type === 'phone' && otpConfig.sms && !!config.onOtpSendSms)
  }

  async function challenge(identifier: string): Promise<HaiResult<{ expiresAt: Date }>> {
    identifier = normalizeOtpIdentifier(identifier)
    if (!isChannelEnabled(identifier))
      return err(HaiIamError.LOGIN_DISABLED, iamM('iam_identifierTypeNotSupported'))
    const code = generateOtpCode(otpConfig.length)
    const saved = await config.otpRepository.issueOtp({ identifier, code, expiresIn: otpConfig.expiresIn, resendInterval: otpConfig.resendInterval })
    if (!saved.success)
      return saved
    const context = saved.data
    const expiresAt = context.expiresAt

    // 发布成功后最多调用一次通知；接收端按稳定幂等键去重，异常表示投递结果未知。
    const type = identifierType(identifier)
    if (type === 'email' && config.onOtpSendEmail) {
      try {
        await config.onOtpSendEmail(identifier, code, context)
      }
      catch {
        return err(
          HaiIamError.INTERNAL_ERROR,
          iamM('iam_notificationDeliveryUnknown'),
        )
      }
    }
    else if (type === 'phone' && config.onOtpSendSms) {
      try {
        await config.onOtpSendSms(identifier, code, context)
      }
      catch {
        return err(
          HaiIamError.INTERNAL_ERROR,
          iamM('iam_notificationDeliveryUnknown'),
        )
      }
    }
    else {
      return err(
        HaiIamError.INTERNAL_ERROR,
        iamM('iam_identifierTypeNotSupported'),
      )
    }

    const result = { expiresAt }
    logger.debug('OTP challenge sent', { identifier, expiresAt })
    return ok(result)
  }

  return { strategy, challenge }
}
