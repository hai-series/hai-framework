/**
 * =============================================================================
 * @hai/iam - 会话相关类型定义
 * =============================================================================
 *
 * 包含：
 * - 会话类型（Session）
 * - 令牌类型（TokenPayload）
 * - 认证结果（AuthResult、RefreshResult）
 * - 会话映射存储接口（SessionMappingRepository）
 * - 会话管理接口（SessionManager）
 *
 * @module session/iam-session-types
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type { IamError } from '../iam-core-types.js'
import type { AgreementDisplay, User } from '../user/iam-user-types.js'

// =============================================================================
// 认证结果类型
// =============================================================================

/**
 * 认证结果
 */
export interface AuthResult {
  /** 用户信息 */
  user: User
  /** 访问令牌 */
  accessToken: string
  /** 刷新令牌 */
  refreshToken?: string
  /** 访问令牌过期时间 */
  accessTokenExpiresAt: Date
  /** 刷新令牌过期时间 */
  refreshTokenExpiresAt?: Date
  /** 是否需要 MFA */
  mfaRequired?: boolean
  /** MFA 令牌（需要 MFA 时使用） */
  mfaToken?: string
  /** 协议展示信息（可选） */
  agreements?: AgreementDisplay
}

/**
 * 令牌刷新结果
 */
export interface RefreshResult {
  /** 新的访问令牌 */
  accessToken: string
  /** 新的刷新令牌 */
  refreshToken?: string
  /** 访问令牌过期时间 */
  accessTokenExpiresAt: Date
  /** 刷新令牌过期时间 */
  refreshTokenExpiresAt?: Date
}

/**
 * 令牌载荷（JWT payload）
 */
export interface TokenPayload {
  /** 主题（用户 ID） */
  sub: string
  /** 用户名 */
  username?: string
  /** 会话 ID */
  sid?: string
  /** 签发时间 */
  iat: number
  /** 过期时间 */
  exp: number
  /** 发行者 */
  iss?: string
  /** 受众 */
  aud?: string
  /** 令牌类型 */
  type?: 'access' | 'refresh'
}

// =============================================================================
// 会话类型
// =============================================================================

/**
 * 会话数据
 */
export interface Session {
  /** 会话 ID */
  id: string
  /** 用户 ID */
  userId: string
  /** 访问令牌 */
  accessToken: string
  /** 刷新令牌 */
  refreshToken?: string
  /** 用户代理 */
  userAgent?: string
  /** IP 地址 */
  ipAddress?: string
  /** 创建时间 */
  createdAt: Date
  /** 最后活动时间 */
  lastActiveAt: Date
  /** 过期时间 */
  expiresAt: Date
  /** 扩展数据 */
  data?: Record<string, unknown>
}

/**
 * 创建会话选项
 */
export interface CreateSessionOptions {
  /** 用户 ID */
  userId: string
  /** 用户名 */
  username?: string
  /** 用户代理 */
  userAgent?: string
  /** IP 地址 */
  ipAddress?: string
  /** 过期时间（秒） */
  maxAge?: number
  /** 扩展数据 */
  data?: Record<string, unknown>
}

// =============================================================================
// 会话映射存储接口
// =============================================================================

/**
 * 会话映射存储接口
 */
export interface SessionMappingRepository {
  /**
   * 存储会话
   */
  set: (sessionId: string, session: Session, ttl: number) => Promise<Result<void, IamError>>

  /**
   * 获取会话
   */
  get: (sessionId: string) => Promise<Result<Session | null, IamError>>

  /**
   * 通过令牌获取会话 ID
   */
  getSessionIdByToken: (token: string) => Promise<Result<string | null, IamError>>

  /**
   * 存储令牌到会话 ID 的映射
   */
  setTokenMapping: (token: string, sessionId: string, ttl: number) => Promise<Result<void, IamError>>

  /**
   * 删除令牌映射
   */
  deleteTokenMapping: (token: string) => Promise<Result<void, IamError>>

  /**
   * 删除会话
   */
  delete: (sessionId: string) => Promise<Result<void, IamError>>

  /**
   * 获取用户的所有会话 ID
   */
  getUserSessionIds: (userId: string) => Promise<Result<string[], IamError>>

  /**
   * 添加用户会话映射
   */
  addUserSession: (userId: string, sessionId: string) => Promise<Result<void, IamError>>

  /**
   * 移除用户会话映射
   */
  removeUserSession: (userId: string, sessionId: string) => Promise<Result<void, IamError>>
}

// =============================================================================
// 会话管理接口
// =============================================================================

/**
 * 会话管理器接口
 */
export interface SessionManager {
  /** 会话类型 */
  readonly type: 'jwt' | 'stateful'

  /**
   * 创建会话
   */
  create: (options: CreateSessionOptions) => Promise<Result<Session, IamError>>

  /**
   * 获取会话
   */
  get: (sessionId: string) => Promise<Result<Session | null, IamError>>

  /**
   * 通过访问令牌获取会话
   */
  getByToken: (accessToken: string) => Promise<Result<Session | null, IamError>>

  /**
   * 验证访问令牌
   */
  verifyToken: (accessToken: string) => Promise<Result<TokenPayload, IamError>>

  /**
   * 刷新会话
   */
  refresh: (refreshToken: string) => Promise<Result<RefreshResult, IamError>>

  /**
   * 更新会话
   */
  update: (sessionId: string, data: Partial<Session>) => Promise<Result<void, IamError>>

  /**
   * 删除会话
   */
  delete: (sessionId: string) => Promise<Result<void, IamError>>

  /**
   * 删除用户所有会话
   */
  deleteByUserId: (userId: string) => Promise<Result<number, IamError>>

  /**
   * 清理过期会话
   */
  cleanup: () => Promise<Result<number, IamError>>
}
