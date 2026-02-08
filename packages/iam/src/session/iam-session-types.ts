/**
 * =============================================================================
 * @hai/iam - 会话相关类型定义
 * =============================================================================
 *
 * 包含：
 * - 会话类型（Session）
 * - 认证结果（AuthResult）
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
  /** 访问令牌过期时间 */
  accessTokenExpiresAt: Date
  /** 协议展示信息（可选） */
  agreements?: AgreementDisplay
}

// =============================================================================
// 会话类型
// =============================================================================

/**
 * 会话数据
 */
export interface Session {
  /** 用户 ID */
  userId: string
  /** 用户名 */
  username?: string
  /** 角色 ID 列表 */
  roles: string[]
  /** 来源（如 pc/android/ios） */
  source?: string
  /** 访问令牌 */
  accessToken: string
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
  /** 角色 ID 列表 */
  roles: string[]
  /** 来源（如 pc/android/ios） */
  source?: string
  /** 过期时间（秒） */
  maxAge?: number
  /** 扩展数据 */
  data?: Record<string, unknown>
}

// =============================================================================
// 会话管理接口
// =============================================================================

/**
 * 会话管理器接口
 */
export interface SessionManager {
  /**
   * 创建会话
   */
  create: (options: CreateSessionOptions) => Promise<Result<Session, IamError>>

  /**
   * 获取会话
   */
  get: (accessToken: string) => Promise<Result<Session | null, IamError>>

  /**
   * 验证访问令牌
   */
  verifyToken: (accessToken: string) => Promise<Result<Session, IamError>>

  /**
   * 更新会话
   */
  update: (accessToken: string, data: Partial<Session>) => Promise<Result<void, IamError>>

  /**
   * 删除会话
   */
  delete: (accessToken: string) => Promise<Result<void, IamError>>

  /**
   * 删除用户所有会话
   */
  deleteByUserId: (userId: string) => Promise<Result<number, IamError>>
}
