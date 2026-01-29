/**
 * =============================================================================
 * @hai/iam - HAI Provider: Ident (身份认证)
 * =============================================================================
 * HAI 默认身份认证提供者实现
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type {
  IAMConfig,
  IAMError,
  IdentProvider,
  LoginResult,
  PasswordPolicy,
  RegisterOptions,
  UserCredentials,
  UserInfo,
} from '../../iam-types.js'
import { err, ok } from '@hai/core'
import { createHaiPasswordProvider } from '@hai/crypto'

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36)
}

/**
 * 生成 JWT 令牌（简化版）
 */
function generateToken(payload: Record<string, unknown>, secret: string, expiresIn: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const exp = Math.floor(Date.now() / 1000) + expiresIn
  const body = Buffer.from(JSON.stringify({ ...payload, exp, iat: Math.floor(Date.now() / 1000) })).toString('base64url')
  const signature = Buffer.from(`${header}.${body}.${secret}`).toString('base64url').substring(0, 43)
  return `${header}.${body}.${signature}`
}

/**
 * 内部用户存储类型
 */
interface StoredUser {
  id: string
  username: string
  email?: string
  phone?: string
  displayName?: string
  avatarUrl?: string
  enabled: boolean
  emailVerified: boolean
  phoneVerified: boolean
  passwordHash: string
  createdAt: Date
  updatedAt: Date
  metadata?: Record<string, unknown>
}

/**
 * HAI 身份认证提供者实现
 */
class HaiIdentProvider implements IdentProvider {
  readonly name = 'hai-ident'

  private config: IAMConfig
  private users: Map<string, StoredUser> = new Map()
  private usernameIndex: Map<string, string> = new Map()
  private emailIndex: Map<string, string> = new Map()
  private passwordProvider = createHaiPasswordProvider()

  private passwordPolicy: PasswordPolicy = {
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumber: true,
    requireSpecialChar: false,
  }

  constructor(config: IAMConfig) {
    this.config = config
    if (config.passwordPolicy) {
      this.passwordPolicy = { ...this.passwordPolicy, ...config.passwordPolicy }
    }
  }

  async login(credentials: UserCredentials): Promise<Result<LoginResult, IAMError>> {
    try {
      const userId = this.usernameIndex.get(credentials.identifier)
        || this.emailIndex.get(credentials.identifier)

      if (!userId) {
        return err({ type: 'USER_NOT_FOUND', message: 'User not found' })
      }

      const user = this.users.get(userId)
      if (!user) {
        return err({ type: 'USER_NOT_FOUND', message: 'User not found' })
      }

      if (!user.enabled) {
        return err({ type: 'USER_DISABLED', message: 'User account is disabled' })
      }

      const verifyResult = this.passwordProvider.verify(credentials.password, user.passwordHash)
      if (!verifyResult.success || !verifyResult.data) {
        return err({ type: 'INVALID_CREDENTIALS', message: 'Invalid password' })
      }

      const jwtConfig = this.config.jwt || { secret: 'default-secret', accessTokenExpiry: 3600, refreshTokenExpiry: 86400 * 7 }
      const accessToken = generateToken({ sub: user.id, username: user.username }, jwtConfig.secret, jwtConfig.accessTokenExpiry)
      const refreshToken = generateToken({ sub: user.id, type: 'refresh' }, jwtConfig.secret, jwtConfig.refreshTokenExpiry)

      const userInfo: UserInfo = {
        id: user.id,
        username: user.username,
        email: user.email,
        phone: user.phone,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        enabled: user.enabled,
        emailVerified: user.emailVerified,
        phoneVerified: user.phoneVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        metadata: user.metadata,
      }

      return ok({
        user: userInfo,
        accessToken,
        refreshToken,
        expiresAt: new Date(Date.now() + jwtConfig.accessTokenExpiry * 1000),
      })
    }
    catch (error) {
      return err({ type: 'INTERNAL_ERROR', message: 'Login failed', cause: error })
    }
  }

  async logout(_accessToken: string): Promise<Result<void, IAMError>> {
    return ok(undefined)
  }

  async register(options: RegisterOptions): Promise<Result<UserInfo, IAMError>> {
    try {
      if (this.usernameIndex.has(options.username)) {
        return err({ type: 'USER_ALREADY_EXISTS', message: 'Username already exists' })
      }

      if (options.email && this.emailIndex.has(options.email)) {
        return err({ type: 'USER_ALREADY_EXISTS', message: 'Email already exists' })
      }

      const passwordValidation = this.validatePassword(options.password)
      if (!passwordValidation.success) {
        return passwordValidation as Result<UserInfo, IAMError>
      }

      const hashResult = this.passwordProvider.hash(options.password)
      if (!hashResult.success) {
        return err({ type: 'INTERNAL_ERROR', message: 'Failed to hash password' })
      }

      const now = new Date()
      const userId = generateId()

      const storedUser: StoredUser = {
        id: userId,
        username: options.username,
        email: options.email,
        phone: options.phone,
        displayName: options.displayName,
        enabled: true,
        emailVerified: false,
        phoneVerified: false,
        passwordHash: hashResult.data,
        createdAt: now,
        updatedAt: now,
        metadata: options.metadata,
      }

      this.users.set(userId, storedUser)
      this.usernameIndex.set(options.username, userId)
      if (options.email) {
        this.emailIndex.set(options.email, userId)
      }

      return ok({
        id: storedUser.id,
        username: storedUser.username,
        email: storedUser.email,
        phone: storedUser.phone,
        displayName: storedUser.displayName,
        enabled: storedUser.enabled,
        emailVerified: storedUser.emailVerified,
        phoneVerified: storedUser.phoneVerified,
        createdAt: storedUser.createdAt,
        updatedAt: storedUser.updatedAt,
        metadata: storedUser.metadata,
      })
    }
    catch (error) {
      return err({ type: 'INTERNAL_ERROR', message: 'Registration failed', cause: error })
    }
  }

  async verifyPassword(userId: string, password: string): Promise<Result<boolean, IAMError>> {
    try {
      const user = this.users.get(userId)
      if (!user) {
        return err({ type: 'USER_NOT_FOUND', message: 'User not found' })
      }

      const verifyResult = this.passwordProvider.verify(password, user.passwordHash)
      return ok(verifyResult.success && verifyResult.data === true)
    }
    catch (error) {
      return err({ type: 'INTERNAL_ERROR', message: 'Password verification failed', cause: error })
    }
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<Result<void, IAMError>> {
    try {
      const user = this.users.get(userId)
      if (!user) {
        return err({ type: 'USER_NOT_FOUND', message: 'User not found' })
      }

      const verifyResult = this.passwordProvider.verify(oldPassword, user.passwordHash)
      if (!verifyResult.success || !verifyResult.data) {
        return err({ type: 'INVALID_CREDENTIALS', message: 'Old password is incorrect' })
      }

      const passwordValidation = this.validatePassword(newPassword)
      if (!passwordValidation.success) {
        return passwordValidation as Result<void, IAMError>
      }

      const hashResult = this.passwordProvider.hash(newPassword)
      if (!hashResult.success) {
        return err({ type: 'INTERNAL_ERROR', message: 'Failed to hash password' })
      }

      user.passwordHash = hashResult.data
      user.updatedAt = new Date()

      return ok(undefined)
    }
    catch (error) {
      return err({ type: 'INTERNAL_ERROR', message: 'Password change failed', cause: error })
    }
  }

  async resetPassword(_identifier: string): Promise<Result<void, IAMError>> {
    return ok(undefined)
  }

  async confirmResetPassword(_token: string, _newPassword: string): Promise<Result<void, IAMError>> {
    return err({ type: 'TOKEN_INVALID', message: 'Reset token is invalid or expired' })
  }

  getPasswordPolicy(): PasswordPolicy {
    return { ...this.passwordPolicy }
  }

  validatePassword(password: string): Result<void, IAMError> {
    const policy = this.passwordPolicy

    if (password.length < policy.minLength) {
      return err({ type: 'PASSWORD_POLICY_VIOLATION', message: `Password must be at least ${policy.minLength} characters` })
    }

    if (policy.requireUppercase && !/[A-Z]/.test(password)) {
      return err({ type: 'PASSWORD_POLICY_VIOLATION', message: 'Password must contain at least one uppercase letter' })
    }

    if (policy.requireLowercase && !/[a-z]/.test(password)) {
      return err({ type: 'PASSWORD_POLICY_VIOLATION', message: 'Password must contain at least one lowercase letter' })
    }

    if (policy.requireNumber && !/\d/.test(password)) {
      return err({ type: 'PASSWORD_POLICY_VIOLATION', message: 'Password must contain at least one number' })
    }

    if (policy.requireSpecialChar && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      return err({ type: 'PASSWORD_POLICY_VIOLATION', message: 'Password must contain at least one special character' })
    }

    return ok(undefined)
  }
}

export function createHaiIdentProvider(config: IAMConfig): IdentProvider {
  return new HaiIdentProvider(config)
}
