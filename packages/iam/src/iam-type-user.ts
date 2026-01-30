/**
 * =============================================================================
 * @hai/iam - 用户相关类型定义
 * =============================================================================
 *
 * 包含：
 * - 用户基础类型（User、StoredUser）
 * - 凭证类型（Credentials）
 * - 注册选项（RegisterOptions）
 *
 * @module iam-type-user
 * =============================================================================
 */

// =============================================================================
// 用户类型
// =============================================================================

/**
 * 用户基础信息
 */
export interface User {
  /** 用户 ID */
  id: string
  /** 用户名 */
  username: string
  /** 邮箱 */
  email?: string
  /** 手机号 */
  phone?: string
  /** 显示名称 */
  displayName?: string
  /** 头像 URL */
  avatarUrl?: string
  /** 是否启用 */
  enabled: boolean
  /** 是否邮箱验证 */
  emailVerified?: boolean
  /** 是否手机验证 */
  phoneVerified?: boolean
  /** 创建时间 */
  createdAt: Date
  /** 更新时间 */
  updatedAt: Date
  /** 扩展属性 */
  metadata?: Record<string, unknown>
}

/**
 * 内部存储用户（包含密码哈希等敏感信息）
 */
export interface StoredUser extends User {
  /** 密码哈希 */
  passwordHash?: string
  /** 密码更新时间 */
  passwordUpdatedAt?: Date
  /** 登录失败次数 */
  loginFailedCount?: number
  /** 最后登录失败时间 */
  lastLoginFailedAt?: Date
  /** 锁定截止时间 */
  lockedUntil?: Date
}

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
 * OAuth 凭证（回调处理）
 */
export interface OAuthCredentials {
  /** OAuth 提供商 ID */
  providerId: string
  /** 授权码 */
  code: string
  /** 状态令牌 */
  state: string
}

/**
 * 统一凭证类型
 */
export type Credentials
  = | { type: 'password' } & PasswordCredentials
    | { type: 'otp' } & OtpCredentials
    | { type: 'ldap' } & LdapCredentials
    | { type: 'oauth' } & OAuthCredentials

/**
 * 用户注册选项
 */
export interface RegisterOptions {
  /** 用户名 */
  username: string
  /** 邮箱 */
  email?: string
  /** 手机号 */
  phone?: string
  /** 密码 */
  password: string
  /** 显示名称 */
  displayName?: string
  /** 扩展属性 */
  metadata?: Record<string, unknown>
}
