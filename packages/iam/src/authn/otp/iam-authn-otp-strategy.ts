/**
 * @h-ai/iam — OTP 认证策略
 *
 * 邮箱/短信 + 验证码的认证方式
 * @module iam-authn-otp-strategy
 */

import type { HaiResult } from '@h-ai/core'
import type { DmlWithTxOperations } from '@h-ai/reldb'
import type { OtpConfig, RegisterConfig } from '../../iam-config.js'
import type { IamNotificationContext } from '../../iam-types.js'
import type { UserRepository } from '../../user/iam-user-repository-user.js'
import type { StoredUser } from '../../user/iam-user-types.js'
import type { AuthStrategy, Credentials } from '../iam-authn-types.js'
import type { OtpRepository, OtpSubject } from './iam-authn-otp-repository-otp.js'
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'

import { OtpConfigSchema } from '../../iam-config.js'
import { iamM } from '../../iam-i18n.js'
import { HaiIamError } from '../../iam-types.js'
import { isUserActive, normalizeIamContact, toUser } from '../../user/iam-user-utils.js'
import {
  checkAccountLock,
  ensureCredentialType,
  recordLoginFailure,
  resetLoginFailures,
} from '../iam-authn-utils.js'

const logger = core.logger.child({ module: 'iam', scope: 'otp-strategy' })
const PHONE_IDENTIFIER_REGEX = /^\+?\d{8,}$/

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
  /** 自动注册前读取默认角色，避免事务中使用独立连接。 */
  getRegistrationRole?: () => Promise<HaiResult<string | null>>
  /** 默认角色与新账号使用同一事务提交。 */
  assignRegistrationRole?: (userId: string, roleId: string, tx: DmlWithTxOperations) => Promise<HaiResult<void>>
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
 * @returns 邮件或短信渠道；未知标识符返回 undefined。
 */
function identifierType(identifier: string): 'email' | 'phone' | undefined {
  if (identifier.includes('@'))
    return 'email'
  if (PHONE_IDENTIFIER_REGEX.test(normalizeIamContact('phone', identifier)))
    return 'phone'
  return undefined
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
  const failurePolicy = {
    maxLoginAttempts,
    lockoutDuration,
    lockoutEnabled: config.lockoutEnabled ?? true,
    failureWindow: config.failureWindow ?? 86400,
  }
  const registerConfig = config.registerConfig
  const allowAutoRegister = registerConfig?.enabled ?? config.autoRegister ?? false
  const defaultAccountStatus = registerConfig?.defaultAccountStatus ?? 'active'

  /** 仅在当前联系方式仍指向同一凭据代际时，消费已有账号的挑战。 */
  function otpSubject(user: StoredUser | null): OtpSubject {
    return user
      ? { userId: user.id, credentialVersion: user.credentialVersion ?? '' }
      : null
  }

  /** 注册挑战只能创建自己的账号与默认角色，不能接管发码后出现的账号。 */
  async function provision(channel: 'email' | 'phone', identifier: string): Promise<HaiResult<StoredUser>> {
    const role = await config.getRegistrationRole?.()
    if (role && !role.success)
      return role

    return reldb.tx.wrapResult(async (tx) => {
      const created = await config.userRepository.create({
        username: identifier,
        [channel]: identifier,
        accountStatus: defaultAccountStatus,
        emailVerified: channel === 'email',
        phoneVerified: channel === 'phone',
      }, tx)
      if (!created.success)
        return created

      const found = await config.userRepository.findByOtpContact(channel, identifier, tx)
      if (!found.success)
        return found
      const user = found.data
      if (!user || user.username !== identifier)
        return core.err(HaiIamError.OTP_INVALID, iamM('iam_otpNotExistOrExpired'))

      if (role?.data && config.assignRegistrationRole) {
        const assigned = await config.assignRegistrationRole(user.id, role.data, tx)
        if (!assigned.success)
          return assigned
      }
      return core.ok(user)
    })
  }

  const strategy: AuthStrategy = {
    type: 'otp',
    name: 'otp-strategy',

    async authenticate(credentials: Credentials) {
      // 类型检查
      const credentialResult = ensureCredentialType(credentials, 'otp')
      if (!credentialResult.success) {
        return credentialResult
      }

      const { identifier: submitted, code, expectedUserId } = credentialResult.data
      const channel = identifierType(submitted)
      if (!channel || !isChannelEnabled(channel))
        return core.err(HaiIamError.LOGIN_DISABLED, iamM('iam_identifierTypeNotSupported'))
      const identifier = normalizeIamContact(channel, submitted)

      const userResult = await config.userRepository.findByOtpContact(channel, identifier)
      if (!userResult.success) {
        return userResult
      }

      let storedUser = userResult.data
      if (expectedUserId && storedUser?.id !== expectedUserId)
        return core.err(HaiIamError.INVALID_CREDENTIALS, iamM('iam_passwordWrong'))

      if (storedUser) {
        if (!isUserActive(storedUser)) {
          return core.err(HaiIamError.ACCOUNT_UNAVAILABLE, iamM('iam_accountUnavailable'))
        }

        const lock = await checkAccountLock(storedUser, failurePolicy)
        if (!lock.success)
          return lock
      }

      // 单 key CAS 验证并消费；旧读/重放不能删除新验证码。
      const consumed = await config.otpRepository.consumeOtp({
        identifier,
        code,
        maxAttempts: otpConfig.maxAttempts,
        subject: otpSubject(storedUser),
      })
      if (!consumed.success)
        return consumed
      if (!consumed.data) {
        if (storedUser) {
          const failed = await recordLoginFailure(storedUser, failurePolicy)
          if (!failed.success)
            return failed
        }
        return core.err(HaiIamError.OTP_INVALID, iamM('iam_otpWrong'))
      }

      // 如果用户不存在且允许自动注册
      if (!storedUser && allowAutoRegister) {
        const created = await provision(channel, identifier)
        if (!created.success)
          return created
        storedUser = created.data
      }

      if (!storedUser) {
        return core.err(HaiIamError.USER_NOT_FOUND, iamM('iam_userNotExist'))
      }

      // 登录成功，重置失败计数
      if (!isUserActive(storedUser))
        return core.err(HaiIamError.ACCOUNT_UNAVAILABLE, iamM('iam_accountUnavailable'))
      const resetResult = await resetLoginFailures(config.userRepository, storedUser, failurePolicy)
      if (!resetResult.success)
        return resetResult
      logger.debug('OTP authentication succeeded', { userId: storedUser.id })

      return core.ok({
        ...toUser(storedUser),
        credentialVersion: storedUser.credentialVersion ?? '',
      })
    },
  }

  // ─── challenge ───

  function isChannelEnabled(channel: 'email' | 'phone'): boolean {
    return channel === 'email'
      ? otpConfig.email && !!config.onOtpSendEmail
      : otpConfig.sms && !!config.onOtpSendSms
  }

  async function challenge(submitted: string): Promise<HaiResult<{ expiresAt: Date }>> {
    const channel = identifierType(submitted)
    if (!channel || !isChannelEnabled(channel))
      return core.err(HaiIamError.LOGIN_DISABLED, iamM('iam_identifierTypeNotSupported'))
    const identifier = normalizeIamContact(channel, submitted)
    const user = await config.userRepository.findByOtpContact(channel, identifier)
    if (!user.success)
      return user

    const code = generateOtpCode(otpConfig.length)
    const saved = await config.otpRepository.issueOtp({
      identifier,
      code,
      subject: otpSubject(user.data),
      expiresIn: otpConfig.expiresIn,
      resendInterval: otpConfig.resendInterval,
    })
    if (!saved.success)
      return saved
    const context = saved.data
    const expiresAt = context.expiresAt

    // 发布成功后最多调用一次通知；接收端按稳定幂等键去重，异常表示投递结果未知。
    if (channel === 'email' && config.onOtpSendEmail) {
      try {
        await config.onOtpSendEmail(identifier, code, context)
      }
      catch {
        return core.err(
          HaiIamError.INTERNAL_ERROR,
          iamM('iam_notificationDeliveryUnknown'),
        )
      }
    }
    else if (channel === 'phone' && config.onOtpSendSms) {
      try {
        await config.onOtpSendSms(identifier, code, context)
      }
      catch {
        return core.err(
          HaiIamError.INTERNAL_ERROR,
          iamM('iam_notificationDeliveryUnknown'),
        )
      }
    }
    else {
      return core.err(
        HaiIamError.INTERNAL_ERROR,
        iamM('iam_identifierTypeNotSupported'),
      )
    }

    const result = { expiresAt }
    logger.debug('OTP challenge sent', { channel, expiresAt })
    return core.ok(result)
  }

  return { strategy, challenge }
}
