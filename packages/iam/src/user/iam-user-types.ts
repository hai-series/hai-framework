/**
 * @h-ai/iam — 用户相关类型定义
 *
 * 包含： - 用户基础类型（User、StoredUser） - 注册选项（RegisterOptions） - 协议展示类型（AgreementDisplay） - 用户操作接口（UserOperations）
 * @module iam-user-types
 */

import type { HaiResult, PaginatedResult, PaginationOptionsInput } from '@h-ai/core'
import type { Role } from '../authz/iam-authz-types.js'

// ─── 用户查询选项 ───

/**
 * 用户列表允许的服务端排序字段。
 * @example
 * ```ts
 * import type { UserSortField } from '@h-ai/iam'
 * const value: UserSortField = 'username'
 * ```
 */
export type UserSortField = 'username' | 'email' | 'displayName' | 'enabled' | 'createdAt'

/**
 * 用户列表排序方向。
 * @example
 * ```ts
 * import type { UserSortDirection } from '@h-ai/iam'
 * const value: UserSortDirection = 'asc'
 * ```
 */
export type UserSortDirection = 'asc' | 'desc'

/**
 * 用户列表查询选项
 * @example
 * ```ts
 * import type { ListUsersOptions } from '@h-ai/iam'
 * const value: ListUsersOptions = { page: 1, pageSize: 20, enabled: true, roleCode: 'user', include: ['roles'] }
 * ```
 */
export interface ListUsersOptions extends PaginationOptionsInput {
  /** 角色 code 精确筛选，在数据库分页前执行。 */
  roleCode?: string
  /** 搜索关键字（模糊匹配用户名、邮箱、手机号、显示名称） */
  search?: string
  /** 按启用状态过滤，不传则返回全部 */
  enabled?: boolean
  /** 服务端排序字段；未指定时保持按创建时间倒序的历史行为。 */
  sortBy?: UserSortField
  /** 服务端排序方向；仅在指定 sortBy 时生效，默认 desc。 */
  sortDirection?: UserSortDirection
  /** 包含关联数据（如 'roles' 表示同时返回用户角色列表） */
  include?: ('roles')[]
}

// ─── 用户类型 ───

/**
 * 用户基础信息
 * @example
 * ```ts
 * import type { User } from '@h-ai/iam'
 * const value: User = { id: 'user-1', username: 'alice', enabled: true, createdAt: new Date(), updatedAt: new Date() }
 * ```
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
  /** 用户角色列表（仅在 include: ['roles'] 时返回） */
  roles?: Role[]
}

// ─── 协议展示类型 ───

/**
 * 用户协议/隐私协议展示配置
 * @example
 * ```ts
 * import type { AgreementDisplay } from '@h-ai/iam'
 * const value: AgreementDisplay = { userAgreementUrl: 'https://app.example.com/terms', showOnRegister: true, showOnLogin: false }
 * ```
 */
export interface AgreementDisplay {
  /** 用户协议 Markdown 正文，显示优先于 URL。 */
  userAgreementMarkdown?: string
  /** 隐私协议 Markdown 正文，显示优先于 URL。 */
  privacyPolicyMarkdown?: string
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
 * @example
 * ```ts
 * import type { StoredUser } from '@h-ai/iam'
 * // 服务端存储类型；不得直接序列化给浏览器。
 * function credentialVersion(row: StoredUser): string {
 *   return row.credentialVersion ?? ''
 * }
 * ```
 */
export interface StoredUser extends User {
  /** 密码凭据代际；密码提交时原子推进，旧会话及迟到认证不得复用。 */
  credentialVersion?: string
  /** 密码重置操作的独立代际；发布/尝试推进，不影响现有登录。 */
  resetVersion?: string
  /** 当前重置令牌的 SM3 摘要，仅内部存储。 */
  resetHash?: string
  /** 重置令牌的 Unix 毫秒过期时间，由数据库时钟核验。 */
  resetExpiresAt?: number
  /** 当前重置令牌已使用的尝试次数。 */
  resetAttempts?: number
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

// ─── 注册类型 ───

/**
 * 用户注册选项
 * @example
 * ```ts
 * import type { RegisterOptions } from '@h-ai/iam'
 * const value: RegisterOptions = { username: 'alice', email: 'alice@example.com', password: 'ExampleOnly123!' }
 * ```
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
 * @example
 * ```ts
 * import { iam, type RegisterResult } from '@h-ai/iam'
 * const result = await iam.user.register({ username: 'alice', password: 'ExampleOnly123!' })
 * if (result.success) {
 *   const registered: RegisterResult = result.data
 *   registered.user.id
 * }
 * ```
 */
export interface RegisterResult {
  /** 用户信息 */
  user: User
  /** 协议展示信息（可选） */
  agreements?: AgreementDisplay
}

// ─── 当前用户更新类型 ───

/**
 * 当前登录用户可自行修改的字段白名单
 *
 * 仅允许修改个人资料相关字段，禁止修改安全字段（enabled、emailVerified、roles 等）。
 * @example
 * ```ts
 * import type { UpdateCurrentUserInput } from '@h-ai/iam'
 * const value: UpdateCurrentUserInput = { displayName: 'Alice', avatarUrl: 'https://app.example.com/avatar/alice.png' }
 * ```
 */
export interface UpdateCurrentUserInput {
  /** 用户名 */
  username?: string
  /** 邮箱 */
  email?: string
  /** 显示名称 */
  displayName?: string
  /** 头像 URL */
  avatarUrl?: string
  /** 手机号 */
  phone?: string
  /** 扩展属性 */
  metadata?: Record<string, unknown>
}

// ─── 用户操作接口 ───

/**
 * 用户子功能接口
 * @example
 * ```ts
 * import { iam, type UserOperations } from '@h-ai/iam'
 * // 应用已完成 RelDB、Cache、Crypto 和 IAM 初始化。
 * const operations: UserOperations = iam.user
 * const result = await operations.listUsers({ page: 1, pageSize: 20, include: ['roles'] })
 * if (!result.success) {
 *   result.error.code // 调用方将失败交给统一错误边界。
 * }
 * else {
 *   result.data
 * }
 * ```
 */
export interface UserOperations {
  /** 批量查询最多 1000 个用户 ID，去重并保持输入顺序，忽略不存在的 ID；可批量包含角色。 */
  getUsers: (userIds: readonly string[], options?: { include?: ('roles')[] }) => Promise<HaiResult<User[]>>
  /** 管理端创建账户，不受自助注册开关限制；调用端必须执行管理员授权。 */
  createUser: (options: RegisterOptions) => Promise<HaiResult<RegisterResult>>
  /**
   * 注册用户
   *
   * 校验注册开关、密码强度、用户名/邮箱唯一性后，
   * 在事务中创建用户并分配默认角色。
   *
   * @param options - 注册选项（用户名、密码、邮箱等）
   * @returns 成功返回用户信息及可选的协议展示；失败返回对应错误码
   */
  register: (options: RegisterOptions) => Promise<HaiResult<RegisterResult>>

  /**
   * 获取当前用户
   *
   * 通过访问令牌验证会话后查询用户信息。
   *
   * @param accessToken - 访问令牌
   * @returns 成功返回用户信息；令牌无效/过期返回错误
   */
  getCurrentUser: (accessToken: string) => Promise<HaiResult<User>>

  /**
   * 更新当前登录用户信息（通过 accessToken 识别用户）
   *
   * 仅允许修改白名单字段（username、email、displayName、avatarUrl、phone、metadata），
   * 禁止修改安全字段（enabled、emailVerified 等）。修改 username/email 时自动校验唯一性。
   *
   * @param accessToken - 访问令牌
   * @param data - 要更新的字段（仅白名单字段）
   * @returns 成功返回更新后的用户信息
   */
  updateCurrentUser: (accessToken: string, data: UpdateCurrentUserInput) => Promise<HaiResult<User>>

  /**
   * 获取用户信息
   *
   * @param userId - 用户 ID
   * @param options - 查询选项（可选 include: ['roles'] 同时返回角色列表）
   * @param options.include - 指定需要额外展开的关联字段；传入 ['roles'] 时同时返回角色列表
   * @returns 成功返回用户信息或 null（用户不存在时）
   */
  getUser: (userId: string, options?: { include?: ('roles')[] }) => Promise<HaiResult<User | null>>

  /**
   * 获取用户列表（分页 + 搜索 + 过滤）
   *
   * @param options - 查询选项（页码、每页数量、搜索关键字、启用状态过滤）
   * @returns 成功返回分页用户列表
   */
  listUsers: (options?: ListUsersOptions) => Promise<HaiResult<PaginatedResult<User>>>

  /**
   * 更新用户信息
   *
   * 空更新（无有效字段）时直接返回当前用户信息。
   *
   * @param userId - 用户 ID
   * @param data - 要更新的字段（displayName、email 等）
   * @returns 成功返回更新后的用户信息；用户不存在返回 USER_NOT_FOUND
   */
  updateUser: (userId: string, data: Partial<User>) => Promise<HaiResult<User>>

  /**
   * 删除用户
   *
   * 同时清理用户的角色关联数据。
   *
   * @param userId - 用户 ID
   * @returns 成功返回 ok；用户不存在返回 USER_NOT_FOUND
   */
  deleteUser: (userId: string) => Promise<HaiResult<void>>

  /**
   * 管理员重置用户密码
   *
   * 无需旧密码，直接设置新密码（仅限管理员操作）。
   *
   * @param userId - 用户 ID
   * @param newPassword - 新密码
   * @returns 成功返回 ok；用户不存在返回 USER_NOT_FOUND，密码不合规返回 PASSWORD_POLICY_VIOLATION
   */
  adminResetPassword: (userId: string, newPassword: string) => Promise<HaiResult<void>>

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
  changePassword: (userId: string, oldPassword: string, newPassword: string) => Promise<HaiResult<void>>

  /**
   * 当前登录用户修改密码
   *
   * 通过访问令牌识别用户 → 验证旧密码 → 校验新密码强度 → 哈希并更新 → 清除该用户所有会话。
   *
   * @param accessToken - 当前用户的访问令牌
   * @param oldPassword - 旧密码
   * @param newPassword - 新密码
   * @returns 成功返回 ok；旧密码错误返回 INVALID_CREDENTIALS，新密码不合规返回 PASSWORD_POLICY_VIOLATION
   */
  changeCurrentUserPassword: (
    accessToken: string,
    oldPassword: string,
    newPassword: string,
  ) => Promise<HaiResult<void>>

  /**
   * 请求密码重置
   *
   * 查找用户 → 条件发布重置令牌（用户数据库行、SM3 摘要及 resetVersion）→ 通知业务层。
   * 即使用户不存在也返回 ok（防止用户枚举攻击）。
   *
   * @param identifier - 用户标识（邮箱）
   * @returns 用户不存在返回 ok；发布冲突、存储故障或投递未知返回失败，通知不自动重发。
   * @example
   * ```ts
   * import { iam } from '@h-ai/iam'
   * const requested = await iam.user.requestPasswordReset('alice@example.com')
   * if (!requested.success)
   *   requested.error.code // 投递未知不能当作成功或由调用端擅自重发通知。
   * ```
   */
  requestPasswordReset: (identifier: string) => Promise<HaiResult<void>>

  /**
   * 确认密码重置
   *
   * 条件计次并取得代际 → 验证密码策略 → 最终 SQL 同时校验代际/有效期/状态并改密、消费令牌。
   * 凭据代际已在数据库推进，后续缓存清理失败也不能重新授权旧会话。
   *
   * @param token - 重置令牌（明文，由 requestPasswordReset 生成并由业务层发送给用户）
   * @param newPassword - 新密码
   * @returns 成功返回 ok；令牌无效/过期返回 RESET_TOKEN_INVALID，尝试超限返回 RESET_TOKEN_MAX_ATTEMPTS
   * @example
   * ```ts
   * import { iam } from '@h-ai/iam'
   * const result = await iam.user.confirmPasswordReset('token-from-recovery-link', 'ExampleOnly123!')
   * if (!result.success)
   *   result.error.code
   * ```
   */
  confirmPasswordReset: (token: string, newPassword: string) => Promise<HaiResult<void>>

  /**
   * 验证密码强度（同步方法）
   *
   * 根据密码策略校验长度、大小写、数字、特殊字符等要求。
   *
   * @param password - 待校验的密码
   * @returns 通过返回 ok；不合规返回 PASSWORD_POLICY_VIOLATION
   */
  validatePassword: (password: string) => HaiResult<void>
}
