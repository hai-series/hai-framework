/**
 * =============================================================================
 * @hai/iam - OTP 认证策略
 * =============================================================================
 *
 * 邮箱/短信 + 验证码的认证方式
 *
 * @module authn/otp/iam-authn-otp-strategy
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type { OtpConfig, RegisterConfig } from '../../iam-config.js'
import type { IamError } from '../../iam-core-types.js'
import type { UserRepository } from '../../user/iam-user-repository-user.js'
import type { StoredUser, User } from '../../user/iam-user-types.js'
import type { AuthStrategy, Credentials } from '../iam-authn-types.js'
import type { OtpRepository } from './iam-authn-otp-repository-otp.js'
import { core, err, ok } from '@hai/core'

import { IamErrorCode, OtpConfigSchema } from '../../iam-config.js'
import { iamM } from '../../iam-i18n.js'
import { toUser } from '../../user/iam-user-utils.js'
import {
  ensureCredentialType,
  isAccountLocked,
  recordLoginFailure,
  resetLoginFailures,
} from '../iam-authn-utils.js'

const logger = core.logger.child({ module: 'iam', scope: 'otp-strategy' })

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
  const digits = '0123456789'
  let code = ''
  const randomValues = new Uint8Array(length)
  crypto.getRandomValues(randomValues)
  for (let i = 0; i < length; i++) {
    code += digits[randomValues[i] % 10]
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
  if (/^\+?\d{8,}$/.test(identifier.replace(/[\s-]/g, ''))) {
    return 'phone'
  }
  return 'unknown'
}

/**
 * 创建 OTP 认证策略
 */
export type OtpStrategy = AuthStrategy & {
  challenge: (identifier: string) => Promise<Result<{ expiresAt: Date }, IamError>>
}

/**
 * 创建 OTP 认证策略
 *
 * 支持验证码登录、自动注册新用户、发送频率限制、登录失败锁定等能力。
 *
 * @param config - OTP 策略配置（包含用户存储、OTP 存储、自动注册开关等）
 * @returns OTP 认证策略实例，包含 authenticate 和 challenge 方法
 */
export function createOtpStrategy(config: OtpStrategyConfig): OtpStrategy {
  const otpConfig = config.otpConfig
    ? OtpConfigSchema.parse(config.otpConfig)
    : OtpConfigSchema.parse({})
  const maxLoginAttempts = config.maxLoginAttempts ?? 5
  const lockoutDuration = config.lockoutDuration ?? 900
  const registerConfig = config.registerConfig
  const allowAutoRegister = registerConfig?.enabled ?? config.autoRegister ?? false
  const defaultEnabled = registerConfig?.defaultEnabled ?? true

  /**
   * 构建挑战响应结果
   *
   * @param expiresAt - 验证码过期时间
   * @returns 包含过期时间的结果对象
   */
  function buildChallengeResult(expiresAt: Date): { expiresAt: Date } {
    return { expiresAt }
  }

  return {
    type: 'otp',
    name: 'otp-strategy',

    async authenticate(credentials: Credentials): Promise<Result<User, IamError>> {
      // 类型检查
      const credentialResult = ensureCredentialType(credentials, 'otp')
      if (!credentialResult.success) {
        return credentialResult as Result<User, IamError>
      }

      const { identifier, code } = credentialResult.data

      // 预先加载用户用于账户状态判断
      const userResult = await config.userRepository.findByIdentifier(identifier)
      if (!userResult.success) {
        return userResult as Result<User, IamError>
      }

      let storedUser = userResult.data as StoredUser | null

      if (storedUser) {
        if (!storedUser.enabled) {
          return err({
            code: IamErrorCode.USER_DISABLED,
            message: iamM('iam_accountDisabled'),
          })
        }

        if (isAccountLocked(storedUser)) {
          return err({
            code: IamErrorCode.USER_LOCKED,
            message: iamM('iam_accountLocked'),
          })
        }
      }

      // 获取存储的验证码
      const storedOtpResult = await config.otpRepository.fetchOtp(identifier)
      if (!storedOtpResult.success) {
        return storedOtpResult as Result<User, IamError>
      }

      const storedOtp = storedOtpResult.data
      if (!storedOtp) {
        return err({
          code: IamErrorCode.OTP_INVALID,
          message: iamM('iam_otpNotExistOrExpired'),
        })
      }

      // 检查尝试次数
      if (storedOtp.attempts >= otpConfig.maxAttempts) {
        await config.otpRepository.removeOtp(identifier)
        if (storedUser) {
          await recordLoginFailure(config.userRepository, storedUser, { maxLoginAttempts, lockoutDuration })
        }
        return err({
          code: IamErrorCode.OTP_INVALID,
          message: iamM('iam_otpInvalid'),
        })
      }

      // 验证验证码
      if (storedOtp.code !== code) {
        await config.otpRepository.incrementOtpAttempts(identifier)
        if (storedUser) {
          await recordLoginFailure(config.userRepository, storedUser, { maxLoginAttempts, lockoutDuration })
        }
        return err({
          code: IamErrorCode.OTP_INVALID,
          message: iamM('iam_otpWrong'),
        })
      }

      // 验证成功，删除验证码
      await config.otpRepository.removeOtp(identifier)

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
          return err({
            code: IamErrorCode.REPOSITORY_ERROR,
            message: iamM('iam_createUserFailed', { params: { message: createResult.error.message } }),
            cause: createResult.error,
          })
        }

        const createdResult = await config.userRepository.findByIdentifier(identifier)
        if (!createdResult.success) {
          return createdResult as Result<User, IamError>
        }
        storedUser = createdResult.data
      }

      if (!storedUser) {
        return err({
          code: IamErrorCode.USER_NOT_FOUND,
          message: iamM('iam_userNotExist'),
        })
      }

      // 登录成功，重置失败计数
      await resetLoginFailures(config.userRepository, storedUser)
      logger.info('OTP authentication succeeded', { userId: storedUser.id })

      return ok(toUser(storedUser))
    },

    async challenge(identifier: string): Promise<Result<{ expiresAt: Date }, IamError>> {
      // 发送频率限制
      const existingResult = await config.otpRepository.fetchOtp(identifier)
      if (existingResult.success && existingResult.data) {
        const elapsedSeconds = Math.floor((Date.now() - existingResult.data.createdAt.getTime()) / 1000)
        if (elapsedSeconds < otpConfig.resendInterval) {
          return err({
            code: IamErrorCode.OTP_RESEND_TOO_FAST,
            message: iamM('iam_otpResendTooFast', { params: { seconds: otpConfig.resendInterval - elapsedSeconds } }),
          })
        }
      }

      // 生成验证码
      const code = generateOtpCode(otpConfig.length)
      const expiresAt = new Date(Date.now() + otpConfig.expiresIn * 1000)

      // 存储验证码
      const storeResult = await config.otpRepository.saveOtp(identifier, code, otpConfig.expiresIn)
      if (!storeResult.success) {
        return storeResult as Result<{ expiresAt: Date }, IamError>
      }

      // 发送验证码
      const type = identifierType(identifier)
      if (type === 'email' && config.otpRepository.sendEmail) {
        const sendResult = await config.otpRepository.sendEmail(identifier, code)
        if (!sendResult.success) {
          return sendResult as Result<{ expiresAt: Date }, IamError>
        }
      }
      else if (type === 'phone' && config.otpRepository.sendSms) {
        const sendResult = await config.otpRepository.sendSms(identifier, code)
        if (!sendResult.success) {
          return sendResult as Result<{ expiresAt: Date }, IamError>
        }
      }
      else {
        return err({
          code: IamErrorCode.INTERNAL_ERROR,
          message: iamM('iam_identifierTypeNotSupported'),
        })
      }

      const result = buildChallengeResult(expiresAt)
      logger.debug('OTP challenge sent', { identifier, expiresAt })
      return ok(result)
    },
  }
}
