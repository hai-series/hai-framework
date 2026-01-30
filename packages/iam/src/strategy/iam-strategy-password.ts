/**
 * =============================================================================
 * @hai/iam - 密码认证策略
 * =============================================================================
 *
 * 用户名/邮箱 + 密码的认证方式
 *
 * @module iam-strategy-password
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type {
  AuthStrategy,
  Credentials,
  IamError,
  PasswordConfig,
  StoredUser,
  User,
  UserRepository,
} from '../iam-types.js'
import { err, ok } from '@hai/core'

import { IamErrorCode, PasswordConfigSchema } from '../iam-config.js'

/**
 * 密码认证策略配置
 */
export interface PasswordStrategyConfig {
  /** 密码策略 */
  passwordConfig?: PasswordConfig
  /** 用户存储 */
  userRepository: UserRepository
  /** 密码哈希函数 */
  hashPassword: (password: string) => Result<string, IamError>
  /** 密码验证函数 */
  verifyPassword: (password: string, hash: string) => Result<boolean, IamError>
  /** 最大登录失败次数（默认 5） */
  maxLoginAttempts?: number
  /** 锁定时间（秒，默认 900 = 15分钟） */
  lockoutDuration?: number
}

/**
 * 创建密码认证策略
 */
export function createPasswordStrategy(config: PasswordStrategyConfig): AuthStrategy {
  const passwordConfig = config.passwordConfig
    ? PasswordConfigSchema.parse(config.passwordConfig)
    : PasswordConfigSchema.parse({})

  const maxLoginAttempts = config.maxLoginAttempts ?? 5
  const lockoutDuration = config.lockoutDuration ?? 900

  /**
   * 验证密码强度
   */
  function validatePasswordStrength(password: string): Result<void, IamError> {
    if (password.length < passwordConfig.minLength) {
      return err({
        code: IamErrorCode.PASSWORD_POLICY_VIOLATION,
        message: `密码长度至少为 ${passwordConfig.minLength} 个字符`,
      })
    }

    if (password.length > passwordConfig.maxLength) {
      return err({
        code: IamErrorCode.PASSWORD_POLICY_VIOLATION,
        message: `密码长度不能超过 ${passwordConfig.maxLength} 个字符`,
      })
    }

    if (passwordConfig.requireUppercase && !/[A-Z]/.test(password)) {
      return err({
        code: IamErrorCode.PASSWORD_POLICY_VIOLATION,
        message: '密码必须包含大写字母',
      })
    }

    if (passwordConfig.requireLowercase && !/[a-z]/.test(password)) {
      return err({
        code: IamErrorCode.PASSWORD_POLICY_VIOLATION,
        message: '密码必须包含小写字母',
      })
    }

    if (passwordConfig.requireNumber && !/\d/.test(password)) {
      return err({
        code: IamErrorCode.PASSWORD_POLICY_VIOLATION,
        message: '密码必须包含数字',
      })
    }

    if (passwordConfig.requireSpecialChar && !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
      return err({
        code: IamErrorCode.PASSWORD_POLICY_VIOLATION,
        message: '密码必须包含特殊字符',
      })
    }

    return ok(undefined)
  }

  /**
   * 检查账户是否被锁定
   */
  function isAccountLocked(user: StoredUser): boolean {
    if (!user.lockedUntil) {
      return false
    }
    return new Date() < user.lockedUntil
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

  const strategy: AuthStrategy = {
    type: 'password',
    name: 'password-strategy',

    async authenticate(credentials: Credentials): Promise<Result<User, IamError>> {
      // 类型检查
      if (credentials.type !== 'password') {
        return err({
          code: IamErrorCode.INVALID_CREDENTIALS,
          message: '凭证类型不匹配',
        })
      }

      const { identifier, password } = credentials

      // 查找用户
      const userResult = await config.userRepository.findByIdentifier(identifier)
      if (!userResult.success) {
        return userResult
      }

      const storedUser = userResult.data
      if (!storedUser) {
        return err({
          code: IamErrorCode.USER_NOT_FOUND,
          message: '用户不存在',
        })
      }

      // 检查账户状态
      if (!storedUser.enabled) {
        return err({
          code: IamErrorCode.USER_DISABLED,
          message: '账户已禁用',
        })
      }

      // 检查账户锁定
      if (isAccountLocked(storedUser)) {
        return err({
          code: IamErrorCode.USER_LOCKED,
          message: '账户已锁定，请稍后重试',
        })
      }

      // 验证密码
      if (!storedUser.passwordHash) {
        return err({
          code: IamErrorCode.INVALID_CREDENTIALS,
          message: '账户未设置密码',
        })
      }

      const verifyResult = config.verifyPassword(password, storedUser.passwordHash)
      if (!verifyResult.success) {
        return verifyResult as Result<User, IamError>
      }

      if (!verifyResult.data) {
        // 记录登录失败
        const failedCount = (storedUser.loginFailedCount || 0) + 1
        const updateData: Partial<StoredUser> = {
          loginFailedCount: failedCount,
          lastLoginFailedAt: new Date(),
        }

        // 达到最大失败次数，锁定账户
        if (failedCount >= maxLoginAttempts) {
          updateData.lockedUntil = new Date(Date.now() + lockoutDuration * 1000)
        }

        await config.userRepository.update(storedUser.id, updateData)

        return err({
          code: IamErrorCode.INVALID_CREDENTIALS,
          message: '密码错误',
        })
      }

      // 检查密码是否过期
      if (isPasswordExpired(storedUser)) {
        return err({
          code: IamErrorCode.PASSWORD_EXPIRED,
          message: '密码已过期，请修改密码',
        })
      }

      // 登录成功，重置失败计数
      if (storedUser.loginFailedCount && storedUser.loginFailedCount > 0) {
        await config.userRepository.update(storedUser.id, {
          loginFailedCount: 0,
          lastLoginFailedAt: undefined,
          lockedUntil: undefined,
        })
      }

      return ok(toUser(storedUser))
    },
  }

  // 添加密码验证方法到策略上
  ;(strategy as PasswordStrategy).validatePassword = validatePasswordStrength
  ;(strategy as PasswordStrategy).hashPassword = config.hashPassword
  ;(strategy as PasswordStrategy).passwordConfig = passwordConfig

  return strategy
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
