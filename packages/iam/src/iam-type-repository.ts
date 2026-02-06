/**
 * =============================================================================
 * @hai/iam - 存储接口类型定义
 * =============================================================================
 *
 * 统一定义所有 Repository 接口，用于数据持久化。
 *
 * 包含：
 * - UserRepository（用户存储）
 * - RoleRepository（角色存储）
 * - PermissionRepository（权限存储）
 * - RolePermissionRepository（角色-权限关联存储）
 * - UserRoleRepository（用户-角色关联存储）
 * - SessionRepository（会话存储）
 * - OAuthAccountRepository（OAuth 账户存储）
 * - OtpRepository（OTP 验证码存储）
 *
 * @module iam-type-repository
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type { Permission, Role } from './iam-type-authz.js'
import type { OAuthAccount, OAuthState } from './iam-type-oauth.js'
import type { IamError } from './iam-type-service.js'
import type { Session } from './iam-type-session.js'
import type { StoredUser } from './iam-type-user.js'

// =============================================================================
// 用户存储接口
// =============================================================================

/**
 * 用户存储接口
 */
export interface UserRepository {
  /**
   * 创建用户
   */
  create: (user: Omit<StoredUser, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Result<StoredUser, IamError>>

  /**
   * 根据 ID 获取用户
   */
  findById: (id: string) => Promise<Result<StoredUser | null, IamError>>

  /**
   * 根据用户名获取用户
   */
  findByUsername: (username: string) => Promise<Result<StoredUser | null, IamError>>

  /**
   * 根据邮箱获取用户
   */
  findByEmail: (email: string) => Promise<Result<StoredUser | null, IamError>>

  /**
   * 根据手机号获取用户
   */
  findByPhone: (phone: string) => Promise<Result<StoredUser | null, IamError>>

  /**
   * 根据标识符获取用户（用户名/邮箱/手机号）
   */
  findByIdentifier: (identifier: string) => Promise<Result<StoredUser | null, IamError>>

  /**
   * 获取所有用户列表
   */
  findAll: () => Promise<Result<StoredUser[], IamError>>

  /**
   * 更新用户
   */
  update: (id: string, data: Partial<StoredUser>) => Promise<Result<StoredUser, IamError>>

  /**
   * 删除用户
   */
  delete: (id: string) => Promise<Result<void, IamError>>

  /**
   * 检查用户名是否存在
   */
  existsByUsername: (username: string) => Promise<Result<boolean, IamError>>

  /**
   * 检查邮箱是否存在
   */
  existsByEmail: (email: string) => Promise<Result<boolean, IamError>>
}

// =============================================================================
// 角色存储接口
// =============================================================================

/**
 * 角色存储接口
 */
export interface RoleRepository {
  /**
   * 创建角色
   */
  create: (role: Omit<Role, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Result<Role, IamError>>

  /**
   * 根据 ID 获取角色
   */
  findById: (id: string) => Promise<Result<Role | null, IamError>>

  /**
   * 根据代码获取角色
   */
  findByCode: (code: string) => Promise<Result<Role | null, IamError>>

  /**
   * 获取所有角色
   */
  findAll: () => Promise<Result<Role[], IamError>>

  /**
   * 更新角色
   */
  update: (id: string, data: Partial<Omit<Role, 'id' | 'createdAt' | 'updatedAt'>>) => Promise<Result<Role, IamError>>

  /**
   * 删除角色
   */
  delete: (id: string) => Promise<Result<void, IamError>>

  /**
   * 检查角色是否存在
   */
  exists: (id: string) => Promise<Result<boolean, IamError>>
}

// =============================================================================
// 权限存储接口
// =============================================================================

/**
 * 权限存储接口
 */
export interface PermissionRepository {
  /**
   * 创建权限
   */
  create: (permission: Omit<Permission, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Result<Permission, IamError>>

  /**
   * 根据 ID 获取权限
   */
  findById: (id: string) => Promise<Result<Permission | null, IamError>>

  /**
   * 根据代码获取权限
   */
  findByCode: (code: string) => Promise<Result<Permission | null, IamError>>

  /**
   * 获取所有权限
   */
  findAll: () => Promise<Result<Permission[], IamError>>

  /**
   * 删除权限
   */
  delete: (id: string) => Promise<Result<void, IamError>>
}

// =============================================================================
// 角色-权限关联存储接口
// =============================================================================

/**
 * 角色-权限关联存储接口
 */
export interface RolePermissionRepository {
  /**
   * 分配权限给角色
   */
  assign: (roleId: string, permissionId: string) => Promise<Result<void, IamError>>

  /**
   * 移除角色权限
   */
  remove: (roleId: string, permissionId: string) => Promise<Result<void, IamError>>

  /**
   * 获取角色的所有权限 ID
   */
  getPermissionIds: (roleId: string) => Promise<Result<string[], IamError>>

  /**
   * 获取角色的所有权限
   */
  getPermissions: (roleId: string) => Promise<Result<Permission[], IamError>>

  /**
   * 检查角色是否有某权限
   */
  hasPermission: (roleId: string, permissionCode: string) => Promise<Result<boolean, IamError>>
}

// =============================================================================
// 用户-角色关联存储接口
// =============================================================================

/**
 * 用户-角色关联存储接口
 */
export interface UserRoleRepository {
  /**
   * 分配角色给用户
   */
  assign: (userId: string, roleId: string) => Promise<Result<void, IamError>>

  /**
   * 移除用户角色
   */
  remove: (userId: string, roleId: string) => Promise<Result<void, IamError>>

  /**
   * 获取用户的所有角色 ID
   */
  getRoleIds: (userId: string) => Promise<Result<string[], IamError>>

  /**
   * 获取用户的所有角色
   */
  getRoles: (userId: string) => Promise<Result<Role[], IamError>>

  /**
   * 检查用户是否有某角色
   */
  hasRole: (userId: string, roleCode: string) => Promise<Result<boolean, IamError>>
}

// =============================================================================
// 会话存储接口
// =============================================================================

/**
 * 会话存储接口
 */
export interface SessionRepository {
  /**
   * 创建会话
   */
  create: (session: Omit<Session, 'id' | 'createdAt'>) => Promise<Result<Session, IamError>>

  /**
   * 根据 ID 获取会话
   */
  findById: (id: string) => Promise<Result<Session | null, IamError>>

  /**
   * 根据访问令牌获取会话
   */
  findByAccessToken: (accessToken: string) => Promise<Result<Session | null, IamError>>

  /**
   * 根据刷新令牌获取会话
   */
  findByRefreshToken: (refreshToken: string) => Promise<Result<Session | null, IamError>>

  /**
   * 获取用户的所有会话
   */
  findByUserId: (userId: string) => Promise<Result<Session[], IamError>>

  /**
   * 更新会话
   */
  update: (id: string, data: Partial<Session>) => Promise<Result<void, IamError>>

  /**
   * 删除会话
   */
  delete: (id: string) => Promise<Result<void, IamError>>

  /**
   * 删除用户的所有会话
   */
  deleteByUserId: (userId: string) => Promise<Result<number, IamError>>

  /**
   * 清理过期会话
   */
  deleteExpired: () => Promise<Result<number, IamError>>
}

// =============================================================================
// OAuth 账户存储接口
// =============================================================================

/**
 * OAuth 账户存储接口
 */
export interface OAuthAccountRepository {
  /**
   * 创建 OAuth 账户关联
   */
  create: (account: Omit<OAuthAccount, 'createdAt' | 'updatedAt'>) => Promise<Result<OAuthAccount, IamError>>

  /**
   * 根据提供商和提供商用户 ID 获取账户
   */
  findByProvider: (providerId: string, providerUserId: string) => Promise<Result<OAuthAccount | null, IamError>>

  /**
   * 获取用户的所有 OAuth 账户
   */
  findByUserId: (userId: string) => Promise<Result<OAuthAccount[], IamError>>

  /**
   * 更新 OAuth 账户
   */
  update: (userId: string, providerId: string, data: Partial<OAuthAccount>) => Promise<Result<void, IamError>>

  /**
   * 删除 OAuth 账户关联
   */
  delete: (userId: string, providerId: string) => Promise<Result<void, IamError>>
}

// =============================================================================
// OTP 验证码存储接口
// =============================================================================

/**
 * OTP 记录
 */
export interface OtpRecord {
  /** 标识符（邮箱/手机号） */
  identifier: string
  /** 验证码 */
  code: string
  /** 过期时间 */
  expiresAt: Date
  /** 尝试次数 */
  attempts: number
  /** 创建时间 */
  createdAt: Date
}

/**
 * OTP 存储接口
 */
export interface OtpStore {
  /**
   * 存储验证码
   */
  set: (identifier: string, code: string, expiresIn: number) => Promise<Result<void, IamError>>

  /**
   * 获取验证码
   */
  get: (identifier: string) => Promise<Result<{ code: string, attempts: number, createdAt: Date } | null, IamError>>

  /**
   * 增加尝试次数
   */
  incrementAttempts: (identifier: string) => Promise<Result<number, IamError>>

  /**
   * 删除验证码
   */
  delete: (identifier: string) => Promise<Result<void, IamError>>
}

/**
 * OTP 发送接口
 */
export interface OtpSender {
  /**
   * 发送邮件验证码
   */
  sendEmail?: (email: string, code: string) => Promise<Result<void, IamError>>

  /**
   * 发送短信验证码
   */
  sendSms?: (phone: string, code: string) => Promise<Result<void, IamError>>
}

// =============================================================================
// OAuth 状态存储接口
// =============================================================================

/**
 * OAuth 状态存储接口
 */
export interface OAuthStateStore {
  /**
   * 存储状态
   */
  set: (state: string, data: OAuthState) => Promise<Result<void, IamError>>

  /**
   * 获取状态
   */
  get: (state: string) => Promise<Result<OAuthState | null, IamError>>

  /**
   * 删除状态
   */
  delete: (state: string) => Promise<Result<void, IamError>>
}
