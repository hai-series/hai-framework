/**
 * =============================================================================
 * @hai/iam - 用户相关类型定义
 * =============================================================================
 *
 * 包含：
 * - 用户基础类型（User、StoredUser）
 * - 注册选项（RegisterOptions）
 * - 协议展示类型（AgreementDisplay）
 * - 用户操作接口（IamUserFunctions）
 *
 * @module user/iam-user-types
 * =============================================================================
 */

import type { PaginatedResult, PaginationOptionsInput, Result } from '@hai/core'
import type { IamError } from '../iam-types.js'

// =============================================================================
// 用户查询选项
// =============================================================================

/**
 * 用户列表查询选项
 */
export interface ListUsersOptions extends PaginationOptionsInput {
  /** 搜索关键字（模糊匹配用户名、邮箱、手机号、显示名称） */
  search?: string
  /** 按启用状态过滤，不传则返回全部 */
  enabled?: boolean
}

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

// =============================================================================
// 协议展示类型
// =============================================================================

/**
 * 用户协议/隐私协议展示配置
 */
export interface AgreementDisplay {
  /** 用户协议 URL */
  userAgreementUrl?: string
  /** 隐私协议 URL */
  privacyPolicyUrl?: string
  /** 注册时展示协议 */
  showOnRegister: boolean
  /** 登录时展示协议 */
  showOnLogin: boolean
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
// 注册类型
// =============================================================================

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

/**
 * 注册结果
 */
export interface RegisterResult {
  /** 用户信息 */
  user: User
  /** 协议展示信息（可选） */
  agreements?: AgreementDisplay
}

// =============================================================================
// 用户操作接口
// =============================================================================

/**
 * 用户子功能接口
 */
export interface IamUserFunctions {
  /**
   * 注册用户
   *
   * 校验注册开关、密码强度、用户名/邮箱唯一性后，
   * 在事务中创建用户并分配默认角色。
   *
   * @param options - 注册选项（用户名、密码、邮箱等）
   * @returns 成功返回用户信息及可选的协议展示；失败返回对应错误码
   */
  register: (options: RegisterOptions) => Promise<Result<RegisterResult, IamError>>

  /**
   * 获取当前用户
   *
   * 通过访问令牌验证会话后查询用户信息。
   *
   * @param accessToken - 访问令牌
   * @returns 成功返回用户信息；令牌无效/过期返回错误
   */
  getCurrentUser: (accessToken: string) => Promise<Result<User, IamError>>

  /**
   * 更新当前登录用户信息（通过 accessToken 识别用户）
   *
   * @param accessToken - 访问令牌
   * @param data - 要更新的字段
   * @returns 成功返回更新后的用户信息
   */
  updateCurrentUser: (accessToken: string, data: Partial<User>) => Promise<Result<User, IamError>>

  /**
   * 获取用户信息
   *
   * @param userId - 用户 ID
   * @returns 成功返回用户信息或 null（用户不存在时）
   */
  getUser: (userId: string) => Promise<Result<User | null, IamError>>

  /**
   * 获取用户列表（分页 + 搜索 + 过滤）
   *
   * @param options - 查询选项（页码、每页数量、搜索关键字、启用状态过滤）
   * @returns 成功返回分页用户列表
   */
  listUsers: (options?: ListUsersOptions) => Promise<Result<PaginatedResult<User>, IamError>>

  /**
   * 更新用户信息
   *
   * 空更新（无有效字段）时直接返回当前用户信息。
   *
   * @param userId - 用户 ID
   * @param data - 要更新的字段（displayName、email 等）
   * @returns 成功返回更新后的用户信息；用户不存在返回 USER_NOT_FOUND
   */
  updateUser: (userId: string, data: Partial<User>) => Promise<Result<User, IamError>>

  /**
   * 删除用户
   *
   * 同时清理用户的角色关联数据。
   *
   * @param userId - 用户 ID
   * @returns 成功返回 ok；用户不存在返回 USER_NOT_FOUND
   */
  deleteUser: (userId: string) => Promise<Result<void, IamError>>

  /**
   * 管理员重置用户密码
   *
   * 无需旧密码，直接设置新密码（仅限管理员操作）。
   *
   * @param userId - 用户 ID
   * @param newPassword - 新密码
   * @returns 成功返回 ok；用户不存在返回 USER_NOT_FOUND，密码不合规返回 PASSWORD_POLICY_VIOLATION
   */
  adminResetPassword: (userId: string, newPassword: string) => Promise<Result<void, IamError>>

  /**
   * 修改密码
   *
   * 验证旧密码 → 校验新密码强度 → 哈希并更新。
   *
   * @param userId - 用户 ID
   * @param oldPassword - 旧密码
   * @param newPassword - 新密码
   * @returns 成功返回 ok；旧密码错误返回 INVALID_CREDENTIALS，新密码不合规返回 PASSWORD_POLICY_VIOLATION
   */
  changePassword: (userId: string, oldPassword: string, newPassword: string) => Promise<Result<void, IamError>>

  changeCurrentUserPassword: (
    accessToken: string,
    oldPassword: string,
    newPassword: string,
  ) => Promise<Result<void, IamError>>

  /**
   * 重置密码（发送重置链接）
   *
   * @param identifier - 用户标识（邮箱/手机号）
   * @returns 成功返回 ok（目前为占位实现）
   */
  requestPasswordReset: (identifier: string) => Promise<Result<void, IamError>>

  /**
   * 确认重置密码
   *
   * @param token - 重置令牌
   * @param newPassword - 新密码
   * @returns 目前返回 INTERNAL_ERROR（未实现）
   */
  confirmPasswordReset: (token: string, newPassword: string) => Promise<Result<void, IamError>>

  /**
   * 验证密码强度（同步方法）
   *
   * 根据密码策略校验长度、大小写、数字、特殊字符等要求。
   *
   * @param password - 待校验的密码
   * @returns 通过返回 ok；不合规返回 PASSWORD_POLICY_VIOLATION
   */
  validatePassword: (password: string) => Result<void, IamError>
}
