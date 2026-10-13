/**
 * @h-ai/iam — OTP 认证策略
 *
 * 邮箱/短信 + 验证码的认证方式
 * @module iam-authn-otp-strategy
 */

import type { HaiResult } from '@h-ai/core'
import type { OtpConfig, RegisterConfig } from '../../iam-config.js'
import type { UserRepository } from '../../user/iam-user-repository-user.js'
import type { StoredUser, User } from '../../user/iam-user-types.js'
import type { AuthStrategy, Credentials } from '../iam-authn-types.js'
import type { OtpRepository } from './iam-authn-otp-repository-otp.js'
import { cache } from '@h-ai/cache'
import { core, err, ok } from '@h-ai/core'

import { OtpConfigSchema } from '../../iam-config.js'
import { iamM } from '../../iam-i18n.js'
import { withIamLock } from '../../iam-security.js'
import { HaiIamError } from '../../iam-types.js'
import { toUser } from '../../user/iam-user-utils.js'
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
  onOtpSendEmail?: (email: string, code: string) => Promise<void>
  /** OTP 短信发送回调（由业务层注入） */
  onOtpSendSms?: (phone: string, code: string) => Promise<void>
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
 */
export function createOtpStrategy(config: OtpStrategyConfig): OtpStrategyResult {
  const otpConfig = config.otpConfig
    ? OtpConfigSchema.parse(config.otpConfig)
    : OtpConfigSchema.parse({})
  const maxLoginAttempts = config.maxLoginAttempts ?? 5
  const lockoutDuration = config.lockoutDuration ?? 900
  const registerConfig = config.registerConfig
  const allowAutoRegister = registerConfig?.enabled ?? config.autoRegister ?? false
  const defaultEnabled = registerConfig?.defaultEnabled ?? true

  const strategy: AuthStrategy = {
    type: 'otp',
    name: 'otp-strategy',

    async authenticate(credentials: Credentials): Promise<HaiResult<User>> {
      // 类型检查
      const credentialResult = ensureCredentialType(credentials, 'otp')
      if (!credentialResult.success) {
        return credentialResult as HaiResult<User>
      }

      const identifier = normalizeOtpIdentifier(credentialResult.data.identifier)
      const { code } = credentialResult.data
      if (!isChannelEnabled(identifier))
        return err(HaiIamError.LOGIN_DISABLED, iamM('iam_identifierTypeNotSupported'))

      return withIamLock(`otp:${identifier}`, async () => {
      // 预先加载用户用于账户状态判断
        const userResult = await config.userRepository.findByIdentifier(identifier)
        if (!userResult.success) {
          return userResult as HaiResult<User>
        }

        let storedUser = userResult.data as StoredUser | null

        if (storedUser) {
          if (!storedUser.enabled) {
            return err(HaiIamError.USER_DISABLED, iamM('iam_accountDisabled'))
          }

          if (isAccountLocked(storedUser)) {
            return err(HaiIamError.USER_LOCKED, iamM('iam_accountLocked'))
          }
        }

        // 获取存储的验证码
        const storedOtpResult = await config.otpRepository.fetchOtp(identifier)
        if (!storedOtpResult.success) {
          return storedOtpResult as HaiResult<User>
        }

        const storedOtp = storedOtpResult.data
        if (!storedOtp) {
          return err(HaiIamError.OTP_INVALID, iamM('iam_otpNotExistOrExpired'))
        }

        // 检查尝试次数
        if (storedOtp.attempts >= otpConfig.maxAttempts) {
          const removed = await config.otpRepository.removeOtp(identifier)
          if (!removed.success)
            return removed
          if (storedUser) {
            const failureResult = await recordLoginFailure(config.userRepository, storedUser, { maxLoginAttempts, lockoutDuration })
            if (!failureResult.success)
              return failureResult
          }
          return err(HaiIamError.OTP_INVALID, iamM('iam_otpInvalid'))
        }

        // 验证验证码（时间安全比较，防止时序攻击）
        if (!core.string.constantTimeEqual(storedOtp.code, code)) {
          const attemptResult = await config.otpRepository.incrementOtpAttempts(identifier)
          if (!attemptResult.success)
            return attemptResult
          if (attemptResult.data >= otpConfig.maxAttempts) {
            const removed = await config.otpRepository.removeOtp(identifier)
            if (!removed.success)
              return removed
          }
          if (storedUser) {
            const failureResult = await recordLoginFailure(config.userRepository, storedUser, { maxLoginAttempts, lockoutDuration })
            if (!failureResult.success)
              return failureResult
          }
          return err(HaiIamError.OTP_INVALID, iamM('iam_otpWrong'))
        }

        // 验证成功，删除验证码
        // 在身份共享锁中消费，后续注册/会话失败也不能复用已校验的验证码。
        const removed = await config.otpRepository.removeOtp(identifier)
        if (!removed.success)
          return removed

        // 如果用户不存在且允许自动注册
        if (!storedUser && allowAutoRegister) {
          const type = identifierType(identifier)
          const createResult = await config.userRepository.create({
            username: identifier,
            email: type === 'email' ? identifier : undefined,
            phone: type === 'phone' ? identifier : undefined,
            enabled: defaultEnabled,
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
            return createdResult as HaiResult<User>
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
        if (!storedUser.enabled)
          return err(HaiIamError.USER_DISABLED, iamM('iam_accountDisabled'))
        const resetResult = await resetLoginFailures(config.userRepository, storedUser)
        if (!resetResult.success)
          return resetResult
        logger.info('OTP authentication succeeded', { userId: storedUser.id })

        return ok(toUser(storedUser))
      })
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
    const expiresAt = new Date(Date.now() + otpConfig.expiresIn * 1000)
    const saved = await withIamLock(`otp:${identifier}`, async () => {
      // 发送间隔独立于验证码生命周期，消费/耗尽验证码不能绕过发送限制。
      const cooldownKey = `hai:iam:otp:cooldown:${identifier}`
      const cooldown = await cache.kv.get<number>(cooldownKey)
      if (!cooldown.success)
        return err(HaiIamError.REPOSITORY_ERROR, iamM('iam_securityStateFailed'), cooldown.error)
      if (cooldown.data && cooldown.data > Date.now())
        return err(HaiIamError.OTP_RESEND_TOO_FAST, iamM('iam_otpResendTooFast', { params: { seconds: Math.ceil((cooldown.data - Date.now()) / 1000) } }))
      const storeResult = await config.otpRepository.saveOtp(identifier, code, otpConfig.expiresIn)
      if (!storeResult.success)
        return storeResult
      const limited = await cache.kv.set(cooldownKey, Date.now() + otpConfig.resendInterval * 1000, { ex: otpConfig.resendInterval })
      if (!limited.success)
        return err(HaiIamError.REPOSITORY_ERROR, iamM('iam_securityStateFailed'), limited.error)
      return ok(undefined)
    })
    if (!saved.success)
      return saved

    // 网络发送不占用共享锁；失败后保留发送间隔，避免重试绕过限流。
    const type = identifierType(identifier)
    if (type === 'email' && config.onOtpSendEmail) {
      try {
        await config.onOtpSendEmail(identifier, code)
      }
      catch (error) {
        return err(
          HaiIamError.INTERNAL_ERROR,
          iamM('iam_otpSendFailed'),
          error,
        )
      }
    }
    else if (type === 'phone' && config.onOtpSendSms) {
      try {
        await config.onOtpSendSms(identifier, code)
      }
      catch (error) {
        return err(
          HaiIamError.INTERNAL_ERROR,
          iamM('iam_otpSendFailed'),
          error,
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
