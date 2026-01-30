/**
 * =============================================================================
 * @hai/iam - OAuth 相关类型定义
 * =============================================================================
 *
 * 包含：
 * - OAuth 状态（OAuthState）
 * - OAuth 令牌（OAuthTokens）
 * - OAuth 用户信息（OAuthUserInfo）
 * - OAuth 账户关联（OAuthAccount）
 *
 * @module iam-type-oauth
 * =============================================================================
 */

// =============================================================================
// OAuth 类型
// =============================================================================

/**
 * OAuth 状态
 */
export interface OAuthState {
  /** 状态值 */
  state: string
  /** 代码验证器（PKCE） */
  codeVerifier?: string
  /** 原始 URL */
  returnUrl?: string
  /** 过期时间 */
  expiresAt: Date
}

/**
 * OAuth 令牌
 */
export interface OAuthTokens {
  /** 访问令牌 */
  accessToken: string
  /** 刷新令牌 */
  refreshToken?: string
  /** ID 令牌 */
  idToken?: string
  /** 令牌类型 */
  tokenType: string
  /** 过期时间（秒） */
  expiresIn: number
  /** 作用域 */
  scope?: string
}

/**
 * OAuth 用户信息
 */
export interface OAuthUserInfo {
  /** 提供商用户 ID */
  providerId: string
  /** 邮箱 */
  email?: string
  /** 用户名 */
  username?: string
  /** 显示名称 */
  displayName?: string
  /** 头像 URL */
  avatarUrl?: string
  /** 原始数据 */
  raw: Record<string, unknown>
}

/**
 * OAuth 账户关联
 */
export interface OAuthAccount {
  /** 用户 ID */
  userId: string
  /** 提供商 ID */
  providerId: string
  /** 提供商用户 ID */
  providerUserId: string
  /** 访问令牌 */
  accessToken?: string
  /** 刷新令牌 */
  refreshToken?: string
  /** 令牌过期时间 */
  tokenExpiresAt?: Date
  /** 创建时间 */
  createdAt: Date
  /** 更新时间 */
  updatedAt: Date
}
