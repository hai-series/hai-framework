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
   */
  register: (options: RegisterOptions) => Promise<Result<RegisterResult, IamError>>

  /**
   * 获取当前用户
   */
  getCurrentUser: (accessToken: string) => Promise<Result<User, IamError>>

  /**
   * 获取用户信息
   */
  getUser: (userId: string) => Promise<Result<User | null, IamError>>

  /**
   * 获取所有用户列表
   */
  listUsers: (options?: PaginationOptionsInput) => Promise<Result<PaginatedResult<User>, IamError>>

  /**
   * 更新用户信息
   */
  updateUser: (userId: string, data: Partial<User>) => Promise<Result<User, IamError>>

  /**
   * 修改密码
   */
  changePassword: (userId: string, oldPassword: string, newPassword: string) => Promise<Result<void, IamError>>

  /**
   * 重置密码（发送重置链接）
   */
  requestPasswordReset: (identifier: string) => Promise<Result<void, IamError>>

  /**
   * 确认重置密码
   */
  confirmPasswordReset: (token: string, newPassword: string) => Promise<Result<void, IamError>>

  /**
   * 验证密码强度
   */
  validatePassword: (password: string) => Result<void, IamError>
}
