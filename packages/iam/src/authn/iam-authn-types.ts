/**
 * =============================================================================
 * @hai/iam - 认证类型定义
 * =============================================================================
 *
 * 包含：
 * - 凭证类型（Credentials）
 * - 认证策略接口（AuthStrategy）
 * - 认证操作接口（IamAuthnFunctions）
 *
 * @module authn/iam-authn-types
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type { AuthStrategyType } from '../iam-config.js'
import type { IamError } from '../iam-types.js'
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
   *
   * @param credentials - 统一凭证（包含 type 字段标识认证方式）
   * @returns 认证成功返回用户信息；失败返回对应错误码（INVALID_CREDENTIALS / USER_LOCKED 等）
   */
  authenticate: (credentials: Credentials) => Promise<Result<User, IamError>>

  /**
   * 发起认证挑战（如发送验证码）
   *
   * @param identifier - 用户标识（邮箱/手机号）
   * @returns 成功返回验证码过期时间；频率限制返回 OTP_RESEND_TOO_FAST
   */
  challenge?: (identifier: string) => Promise<Result<{ expiresAt: Date }, IamError>>
}

// =============================================================================
// 认证操作接口
// =============================================================================

/**
 * 认证子功能接口
 */
export interface IamAuthnFunctions {
  /**
   * 登录（使用密码）
   *
   * 检查登录方式启用 → 密码策略认证 → 创建会话 → 返回令牌。
   *
   * @param credentials - 密码凭证（identifier + password）
   * @returns 成功返回 AuthResult（用户信息、令牌、协议展示）；失败返回错误
   */
  login: (credentials: PasswordCredentials) => Promise<Result<AuthResult, IamError>>

  /**
   * 使用验证码登录
   *
   * @param credentials - OTP 凭证（identifier + code）
   * @returns 成功返回 AuthResult；验证码无效/过期返回 OTP_INVALID
   */
  loginWithOtp: (credentials: OtpCredentials) => Promise<Result<AuthResult, IamError>>

  /**
   * 使用 LDAP 登录
   *
   * @param credentials - LDAP 凭证（username + password）
   * @returns 成功返回 AuthResult（自动同步本地用户）；失败返回错误
   */
  loginWithLdap: (credentials: LdapCredentials) => Promise<Result<AuthResult, IamError>>

  /**
   * 登出
   *
   * 删除会话数据和用户令牌映射。令牌无效时静默成功。
   *
   * @param accessToken - 访问令牌
   * @returns 始终返回 ok
   */
  logout: (accessToken: string) => Promise<Result<void, IamError>>

  /**
   * 验证令牌
   *
   * 查询会话并校验有效性，滑动窗口模式下自动续期。
   *
   * @param accessToken - 访问令牌
   * @returns 成功返回会话信息；令牌无效/过期返回 SESSION_INVALID
   */
  verifyToken: (accessToken: string) => Promise<Result<Session, IamError>>

  /**
   * 发送验证码
   *
   * @param identifier - 用户标识（邮箱/手机号）
   * @returns 成功返回验证码过期时间；频率限制返回 OTP_RESEND_TOO_FAST
   */
  sendOtp: (identifier: string) => Promise<Result<{ expiresAt: Date }, IamError>>
}
