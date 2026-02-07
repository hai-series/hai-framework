/**
 * =============================================================================
 * @hai/iam - OTP 认证策略
 * =============================================================================
 *
 * 邮箱/短信 + 验证码的认证方式
 *
 * @module iam-strategy-otp
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type { OtpConfig, RegisterConfig } from '../iam-config.js'
import type {
  AuthStrategy,
  Credentials,
  IamError,
  OtpSender,
  OtpStore,
  StoredUser,
  User,
  UserRepository,
} from '../iam-types.js'
import { err, ok } from '@hai/core'

import { IamErrorCode, OtpConfigSchema } from '../iam-config.js'
import { iamM } from '../iam-i18n.js'

/**
 * OTP 认证策略配置
 */
export interface OtpStrategyConfig {
  /** OTP 配置 */
  otpConfig?: OtpConfig
  /** 用户存储 */
  userRepository: UserRepository
  /** OTP 存储 */
  otpStore: OtpStore
  /** OTP 发送器 */
  otpSender: OtpSender
  /** 是否允许自动注册新用户 */
  autoRegister?: boolean
  /** 注册配置（用于自动注册场景） */
  registerConfig?: RegisterConfig
}

/**
 * 生成随机验证码
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
 */
export function createOtpStrategy(config: OtpStrategyConfig): OtpStrategy {
  const otpConfig = config.otpConfig
    ? OtpConfigSchema.parse(config.otpConfig)
    : OtpConfigSchema.parse({})
  const registerConfig = config.registerConfig
  const allowAutoRegister = registerConfig?.enabled ?? config.autoRegister ?? false
  const defaultEnabled = registerConfig?.defaultEnabled ?? true

  /**
   * 将 StoredUser 转换为 User（移除敏感信息）
   */
  function toUser(storedUser: StoredUser): User {
    return {
      id: storedUser.id,
      username: storedUser.username,
      email: storedUser.email,
      phone: storedUser.phone,
      displayName: storedUser.displayName,
      avatarUrl: storedUser.avatarUrl,
      enabled: storedUser.enabled,
      emailVerified: storedUser.emailVerified,
      phoneVerified: storedUser.phoneVerified,
      createdAt: storedUser.createdAt,
      updatedAt: storedUser.updatedAt,
      metadata: storedUser.metadata,
    }
  }

  /**
   * 构建挑战返回值
   */
  function buildChallengeResult(expiresAt: Date): { expiresAt: Date } {
    return { expiresAt }
  }

  return {
    type: 'otp',
    name: 'otp-strategy',

    async authenticate(credentials: Credentials): Promise<Result<User, IamError>> {
      // 类型检查
      if (credentials.type !== 'otp') {
        return err({
          code: IamErrorCode.INVALID_CREDENTIALS,
          message: iamM('iam_credentialTypeMismatch'),
        })
      }

      const { identifier, code } = credentials

      // 获取存储的验证码
      const storedOtpResult = await config.otpStore.get(identifier)
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
        await config.otpStore.delete(identifier)
        return err({
          code: IamErrorCode.OTP_INVALID,
          message: iamM('iam_otpInvalid'),
        })
      }

      // 验证验证码
      if (storedOtp.code !== code) {
        await config.otpStore.incrementAttempts(identifier)
        return err({
          code: IamErrorCode.OTP_INVALID,
          message: iamM('iam_otpWrong'),
        })
      }

      // 验证成功，删除验证码
      await config.otpStore.delete(identifier)

      // 查找用户
      const userResult = await config.userRepository.findByIdentifier(identifier)
      if (!userResult.success) {
        return userResult as Result<User, IamError>
      }

      let storedUser = userResult.data

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
          return createResult as Result<User, IamError>
        }
        storedUser = createResult.data
      }

      if (!storedUser) {
        return err({
          code: IamErrorCode.USER_NOT_FOUND,
          message: iamM('iam_userNotExist'),
        })
      }

      // 检查账户状态
      if (!storedUser.enabled) {
        return err({
          code: IamErrorCode.USER_DISABLED,
          message: iamM('iam_accountDisabled'),
        })
      }

      return ok(toUser(storedUser))
    },

    async challenge(identifier: string): Promise<Result<{ expiresAt: Date }, IamError>> {
      // 发送频率限制
      const existingResult = await config.otpStore.get(identifier)
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
      const storeResult = await config.otpStore.set(identifier, code, otpConfig.expiresIn)
      if (!storeResult.success) {
        return storeResult as Result<{ expiresAt: Date }, IamError>
      }

      // 发送验证码
      const type = identifierType(identifier)
      if (type === 'email' && config.otpSender.sendEmail) {
        const sendResult = await config.otpSender.sendEmail(identifier, code)
        if (!sendResult.success) {
          return sendResult as Result<{ expiresAt: Date }, IamError>
        }
      }
      else if (type === 'phone' && config.otpSender.sendSms) {
        const sendResult = await config.otpSender.sendSms(identifier, code)
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
      return ok(result)
    },
  }
}
