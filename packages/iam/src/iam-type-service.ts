/**
 * =============================================================================
 * @hai/iam - 服务接口类型定义
 * =============================================================================
 *
 * 包含：
 * - IamError（错误类型）
 * - AuthStrategy（认证策略接口）
 * - SessionManager（会话管理器接口）
 * - AuthzManager（授权管理器接口）
 * - AuthOperations / UserOperations（操作接口）
 * - IamService（统一服务接口）
 *
 * @module iam-type-service
 * =============================================================================
 */

import type { CacheService } from '@hai/cache'
import type { Result } from '@hai/core'
import type { DbService } from '@hai/db'
import type {
  AuthStrategyType,
  IamConfig,
  IamConfigInput,
  IamErrorCodeType,
  SessionType,
} from './iam-config.js'
import type { AuthzContext, Permission, Role } from './iam-type-authz.js'
import type {
  AuthResult,
  CreateSessionOptions,
  RefreshResult,
  Session,
  TokenPayload,
} from './iam-type-session.js'
import type {
  Credentials,
  LdapCredentials,
  OAuthCredentials,
  OtpCredentials,
  PasswordCredentials,
  RegisterOptions,
  User,
} from './iam-type-user.js'

// =============================================================================
// 错误类型
// =============================================================================

/**
 * IAM 错误接口
 *
 * 所有 IAM 操作返回的错误都遵循此接口。
 */
export interface IamError {
  /** 错误码（数值，参见 IamErrorCode） */
  code: IamErrorCodeType
  /** 错误消息 */
  message: string
  /** 原始错误（可选） */
  cause?: unknown
}

// =============================================================================
// 认证策略接口
// =============================================================================

/**
 * 认证策略接口
 *
 * 所有认证方式（密码/OTP/LDAP/OAuth）都实现此接口
 */
export interface AuthStrategy {
  /** 策略类型 */
  readonly type: AuthStrategyType
  /** 策略名称 */
  readonly name: string

  /**
   * 执行认证
   */
  authenticate: (credentials: Credentials) => Promise<Result<User, IamError>>

  /**
   * 发起认证挑战（如发送验证码）
   */
  challenge?: (identifier: string) => Promise<Result<{ expiresAt: Date }, IamError>>
}

// =============================================================================
// 会话管理接口
// =============================================================================

/**
 * 会话管理器接口
 */
export interface SessionManager {
  /** 会话类型 */
  readonly type: SessionType

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

// =============================================================================
// 授权管理接口
// =============================================================================

/**
 * 授权管理器接口（RBAC）
 */
export interface AuthzManager {
  /**
   * 检查权限
   */
  checkPermission: (ctx: AuthzContext, permission: string) => Promise<Result<boolean, IamError>>

  /**
   * 检查角色
   * @param ctx 授权上下文（使用 userId 检查）
   * @param role 角色 ID
   */
  hasRole: (ctx: AuthzContext, role: string) => Promise<Result<boolean, IamError>>

  /**
   * 获取用户权限列表
   */
  getUserPermissions: (userId: string) => Promise<Result<Permission[], IamError>>

  /**
   * 获取用户角色列表
   */
  getUserRoles: (userId: string) => Promise<Result<Role[], IamError>>

  /**
   * 分配角色给用户
   */
  assignRole: (userId: string, roleId: string) => Promise<Result<void, IamError>>

  /**
   * 移除用户角色
   */
  removeRole: (userId: string, roleId: string) => Promise<Result<void, IamError>>

  // =========================================================================
  // 角色管理
  // =========================================================================

  /**
   * 创建角色
   */
  createRole: (role: Omit<Role, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Result<Role, IamError>>

  /**
   * 获取角色
   */
  getRole: (roleId: string) => Promise<Result<Role | null, IamError>>

  /**
   * 获取所有角色
   */
  getAllRoles: () => Promise<Result<Role[], IamError>>

  /**
   * 更新角色
   */
  updateRole: (roleId: string, data: Partial<Omit<Role, 'id' | 'createdAt' | 'updatedAt'>>) => Promise<Result<Role, IamError>>

  /**
   * 删除角色
   */
  deleteRole: (roleId: string) => Promise<Result<void, IamError>>

  // =========================================================================
  // 权限管理
  // =========================================================================

  /**
   * 创建权限
   */
  createPermission: (permission: Omit<Permission, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Result<Permission, IamError>>

  /**
   * 获取权限
   */
  getPermission: (permissionId: string) => Promise<Result<Permission | null, IamError>>

  /**
   * 获取所有权限
   */
  getAllPermissions: () => Promise<Result<Permission[], IamError>>

  /**
   * 删除权限
   */
  deletePermission: (permissionId: string) => Promise<Result<void, IamError>>

  /**
   * 为角色分配权限
   */
  assignPermissionToRole: (roleId: string, permissionId: string) => Promise<Result<void, IamError>>

  /**
   * 移除角色权限
   */
  removePermissionFromRole: (roleId: string, permissionId: string) => Promise<Result<void, IamError>>

  /**
   * 获取角色的权限列表
   */
  getRolePermissions: (roleId: string) => Promise<Result<Permission[], IamError>>
}

// =============================================================================
// IAM 服务主接口
// =============================================================================

/**
 * 认证操作接口
 */
export interface AuthOperations {
  /**
   * 登录（使用密码）
   */
  login: (credentials: PasswordCredentials) => Promise<Result<AuthResult, IamError>>

  /**
   * 使用验证码登录
   */
  loginWithOtp: (credentials: OtpCredentials) => Promise<Result<AuthResult, IamError>>

  /**
   * 使用 LDAP 登录
   */
  loginWithLdap: (credentials: LdapCredentials) => Promise<Result<AuthResult, IamError>>

  /**
   * 获取 OAuth 授权 URL
   */
  getOAuthUrl: (providerId: string, returnUrl?: string) => Promise<Result<{ url: string, state: string }, IamError>>

  /**
   * 处理 OAuth 回调
   */
  handleOAuthCallback: (credentials: OAuthCredentials) => Promise<Result<AuthResult, IamError>>

  /**
   * 登出
   */
  logout: (accessToken: string) => Promise<Result<void, IamError>>

  /**
   * 刷新令牌
   */
  refresh: (refreshToken: string) => Promise<Result<RefreshResult, IamError>>

  /**
   * 验证令牌
   */
  verifyToken: (accessToken: string) => Promise<Result<TokenPayload, IamError>>

  /**
   * 发送验证码
   */
  sendOtp: (identifier: string) => Promise<Result<{ expiresAt: Date }, IamError>>
}

/**
 * 用户管理操作接口
 */
export interface UserOperations {
  /**
   * 注册用户
   */
  register: (options: RegisterOptions) => Promise<Result<User, IamError>>

  /**
   * 获取当前用户
   */
  getCurrentUser: (accessToken: string) => Promise<Result<User, IamError>>

  /**
   * 获取用户信息
   */
  getUser: (userId: string) => Promise<Result<User | null, IamError>>

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

/**
 * IAM 服务接口
 *
 * 统一聚合所有 IAM 功能
 */
export interface IamService {
  /** 认证操作 */
  readonly auth: AuthOperations
  /** 用户管理操作 */
  readonly user: UserOperations
  /** 授权管理 */
  readonly authz: AuthzManager
  /** 会话管理 */
  readonly session: SessionManager

  /** 当前配置 */
  readonly config: IamConfig | null
  /** 是否已初始化 */
  readonly isInitialized: boolean

  /**
   * 初始化 IAM 服务
   *
   * @param db - 数据库服务实例（必需）
   * @param cache - 缓存服务实例（必需，用于权限缓存）
   * @param config - IAM 配置（可选）
   */
  init: (db: DbService, cache: CacheService, config?: IamConfigInput) => Promise<Result<void, IamError>>

  /**
   * 关闭
   */
  close: () => Promise<Result<void, IamError>>
}
