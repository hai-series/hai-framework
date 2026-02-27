/**
 * =============================================================================
 * @h-ai/iam - 会话相关类型定义
 * =============================================================================
 *
 * 包含：
 * - 认证结果（AuthResult）
 * - 会话类型（Session）
 * - 会话子功能接口（IamSessionFunctions）
 *
 * @module session/iam-session-types
 * =============================================================================
 */

import type { Result } from '@h-ai/core'
import type { IamError } from '../iam-types.js'
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
 * 会话子功能接口
 */
export interface IamSessionFunctions {
  /**
   * 创建会话
   *
   * 单设备模式下会先清除用户已有的所有会话。
   *
   * @param options - 会话创建选项（用户 ID、角色、来源等）
   * @returns 成功返回完整的 Session 对象（含生成的访问令牌和过期时间）
   */
  create: (options: CreateSessionOptions) => Promise<Result<Session, IamError>>

  /**
   * 获取会话
   *
   * 查询缓存中的会话数据。滑动窗口模式下自动续期。
   * 已过期的会话会自动删除并返回 null。
   *
   * @param accessToken - 访问令牌
   * @returns 成功返回会话对象或 null（会话不存在/已过期）
   */
  get: (accessToken: string) => Promise<Result<Session | null, IamError>>

  /**
   * 验证访问令牌
   *
   * 等同于 get 但在会话不存在时返回错误而非 null。
   *
   * @param accessToken - 访问令牌
   * @returns 成功返回会话；会话无效返回 SESSION_INVALID
   */
  verifyToken: (accessToken: string) => Promise<Result<Session, IamError>>

  /**
   * 更新会话
   *
   * 合并 patch 到现有会话（data 字段浅合并）并更新 lastActiveAt。
   *
   * @param accessToken - 访问令牌
   * @param data - 要更新的字段（roles、username、source、data 等）
   * @returns 成功返回 ok；会话不存在返回 SESSION_NOT_FOUND
   */
  update: (accessToken: string, data: Partial<Session>) => Promise<Result<void, IamError>>

  /**
   * 删除会话
   *
   * 同时清除用户令牌映射关系。
   *
   * @param accessToken - 访问令牌
   * @returns 始终返回 ok（令牌不存在时静默成功）
   */
  delete: (accessToken: string) => Promise<Result<void, IamError>>

  /**
   * 删除用户所有会话
   *
   * 遍历用户的所有令牌并逐一删除。
   *
   * @param userId - 用户 ID
   * @returns 成功返回实际删除的会话数量
   */
  deleteByUserId: (userId: string) => Promise<Result<number, IamError>>
}
