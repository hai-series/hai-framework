/**
 * @h-ai/iam — 会话相关类型定义
 *
 * 包含： - 认证结果（AuthResult） - 会话类型（Session） - 会话子功能接口（IamSessionFunctions）
 * @module iam-session-types
 */

import type { Result } from '@h-ai/core'
import type { IamError } from '../iam-types.js'
import type { AgreementDisplay, User } from '../user/iam-user-types.js'

// ─── 令牌类型 ───

/**
 * 认证令牌对（登录成功返回）
 *
 * 所有端（Web SSR / H5 SPA / Capacitor App / 未来小程序）
 * 使用完全相同的 Bearer Token 认证流程。
 */
export interface TokenPair {
  /** 访问令牌（短期，用于 API 认证） */
  accessToken: string
  /** 刷新令牌（长期，用于换取新 accessToken） */
  refreshToken: string
  /** accessToken 过期时间（秒） */
  expiresIn: number
  /** 令牌类型，固定为 'Bearer' */
  tokenType: 'Bearer'
}

// ─── 认证结果类型 ───

/**
 * 认证结果
 *
 * 登录/注册成功后返回，包含用户信息、令牌、角色权限等。
 * `roles` / `permissions` 来源于会话创建时写入的 RBAC 数据，
 * 调用方无需再通过 `verifyToken` 获取。
 */
export interface AuthResult {
  /** 用户信息 */
  user: User
  /** 令牌对（替代原来的单个 accessToken） */
  tokens: TokenPair
  /** 角色 code 列表（登录时从 RBAC 写入） */
  roles: string[]
  /** 权限 code 列表（登录时从 RBAC 写入） */
  permissions: string[]
  /** 协议展示信息（可选） */
  agreements?: AgreementDisplay
}

// ─── 会话类型 ───

/**
 * 会话数据
 */
export interface Session {
  /** 用户 ID */
  userId: string
  /** 用户名 */
  username?: string
  /** 显示名称 */
  displayName?: string
  /** 头像 URL */
  avatarUrl?: string
  /** 角色 code 列表（登录时写入，用于会话解析） */
  roles: string[]
  /** 权限 code 列表（登录时写入，用于会话解析） */
  permissions: string[]
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
  /** 扩展数据（内部保留 _tokenPair 供 logout 时吊销 refreshToken） */
  data?: SessionData
}

/**
 * 会话扩展数据
 *
 * 支持开放的 Record 扩展，同时约束内部保留字段 _tokenPair。
 */
export type SessionData = Record<string, unknown> & {
  /** 令牌对（内部保留字段，由 session.create 写入，logout 时读取） */
  _tokenPair?: TokenPair
}

/**
 * 创建会话选项
 */
export interface CreateSessionOptions {
  /** 用户 ID */
  userId: string
  /** 用户名 */
  username?: string
  /** 显示名称 */
  displayName?: string
  /** 头像 URL */
  avatarUrl?: string
  /** 角色 code 列表 */
  roles?: string[]
  /** 权限 code 列表 */
  permissions?: string[]
  /** 来源（如 pc/android/ios） */
  source?: string
  /** 过期时间（秒） */
  maxAge?: number
  /** 扩展数据 */
  data?: SessionData
}

// ─── 会话管理接口 ───

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

  /**
   * 通过 refreshToken 换取新的 TokenPair
   *
   * 验证 refreshToken 有效性，签发新的 accessToken + refreshToken，
   * 旧 refreshToken 自动失效（Rotation 策略）。
   *
   * @param refreshToken - 刷新令牌
   * @returns 成功返回新的 TokenPair；失败返回 TOKEN_REFRESH_FAILED / TOKEN_EXPIRED
   */
  refresh: (refreshToken: string) => Promise<Result<TokenPair, IamError>>

  /**
   * 吊销 refreshToken（登出时调用）
   *
   * @param refreshToken - 刷新令牌
   * @returns 成功返回 ok；令牌不存在时静默成功
   */
  revokeRefresh: (refreshToken: string) => Promise<Result<void, IamError>>
}
