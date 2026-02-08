/**
 * =============================================================================
 * @hai/iam - 认证类型定义
 * =============================================================================
 *
 * 包含：
 * - 凭证类型（Credentials）
 * - 认证策略接口（AuthStrategy）
 * - 认证操作接口（AuthOperations）
 *
 * @module authn/iam-authn-types
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type { AuthStrategyType } from '../iam-config.js'
import type { IamError } from '../iam-core-types.js'
import type { AuthResult, Session } from '../session/iam-session-types.js'
import type { User } from '../user/iam-user-types.js'

// =============================================================================
// 凭证类型
// =============================================================================

/**
 * 用户凭证（用于密码登录）
 */
export interface PasswordCredentials {
  /** 用户名/邮箱/手机号 */
  identifier: string
  /** 密码 */
  password: string
  /** 记住我 */
  rememberMe?: boolean
}

/**
 * OTP 凭证（用于验证码登录）
 */
export interface OtpCredentials {
  /** 邮箱/手机号 */
  identifier: string
  /** 验证码 */
  code: string
}

/**
 * LDAP 凭证
 */
export interface LdapCredentials {
  /** 用户名 */
  username: string
  /** 密码 */
  password: string
}

/**
 * 统一凭证类型
 */
export type Credentials
  = | { type: 'password' } & PasswordCredentials
    | { type: 'otp' } & OtpCredentials
    | { type: 'ldap' } & LdapCredentials

// =============================================================================
// 认证策略接口
// =============================================================================

/**
 * 认证策略接口
 *
 * 所有认证方式（密码/OTP/LDAP）都实现此接口
 */
export interface AuthStrategy {
  /** 策略类型 */
  readonly type: AuthStrategyType
  /** 策略名称 */
  readonly name: string

  /**
   * 执行认证
   */
  authenticate: (credentials: Credentials) => Promise<Result<User, IamError>>

  /**
   * 发起认证挑战（如发送验证码）
   */
  challenge?: (identifier: string) => Promise<Result<{ expiresAt: Date }, IamError>>
}

// =============================================================================
// 认证操作接口
// =============================================================================

/**
 * 认证操作接口
 */
export interface AuthOperations {
  /**
   * 登录（使用密码）
   */
  login: (credentials: PasswordCredentials) => Promise<Result<AuthResult, IamError>>

  /**
   * 使用验证码登录
   */
  loginWithOtp: (credentials: OtpCredentials) => Promise<Result<AuthResult, IamError>>

  /**
   * 使用 LDAP 登录
   */
  loginWithLdap: (credentials: LdapCredentials) => Promise<Result<AuthResult, IamError>>

  /**
   * 登出
   */
  logout: (accessToken: string) => Promise<Result<void, IamError>>

  /**
   * 验证令牌
   */
  verifyToken: (accessToken: string) => Promise<Result<Session, IamError>>

  /**
   * 发送验证码
   */
  sendOtp: (identifier: string) => Promise<Result<{ expiresAt: Date }, IamError>>
}
