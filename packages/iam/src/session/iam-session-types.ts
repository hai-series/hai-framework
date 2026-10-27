/**
 * @h-ai/iam — 会话相关类型定义
 *
 * 包含： - 认证结果（AuthResult） - 会话类型（Session） - 会话子功能接口（SessionOperations）
 * @module iam-session-types
 */

import type { HaiResult } from '@h-ai/core'
import type { AgreementDisplay, User } from '../user/iam-user-types.js'

// ─── 令牌类型 ───

/**
 * 认证令牌对（登录成功返回）
 *
 * 所有端（Web SSR / H5 SPA / Capacitor App / 未来小程序）
 * 使用完全相同的 Bearer Token 认证流程。
 * @example
 * ```ts
 * import { iam, type TokenPair } from '@h-ai/iam'
 * const login = await iam.auth.login({ identifier: 'alice', password: 'ExampleOnly123!' })
 * if (login.success) {
 *   const tokens: TokenPair = login.data.tokens
 *   const authorization = `${tokens.tokenType} ${tokens.accessToken}` // 仅用于受保护请求。
 * }
 * ```
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
 * @example
 * ```ts
 * import { iam, type AuthResult } from '@h-ai/iam'
 * const login = await iam.auth.login({ identifier: 'alice', password: 'ExampleOnly123!' })
 * if (login.success) {
 *   const authenticated: AuthResult = login.data
 *   authenticated.user.displayName
 * }
 * ```
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
 * @example
 * ```ts
 * import { iam, type Session } from '@h-ai/iam'
 * const verified = await iam.auth.verifyToken('token-from-authorization-header')
 * if (verified.success) {
 *   const session: Session = verified.data
 *   session.permissions.includes('report:read')
 * }
 * ```
 */
export interface Session {
  /** 登录时固定的终端分组；旧记录未设置时归为 web，刷新不能切换分组。 */
  terminalType?: 'web' | 'app' | 'desktop' | 'api'
  /** 会话内容版本；显式更新产生新版本，内部滑动续期保留版本。 */
  version: string
  /** 认证快照绑定的持久凭据代；改密后的旧会话即使缓存清理失败也拒绝。 */
  credentialVersion: string
  /** API Key 派生会话绑定的 key ID；普通用户登录时省略。 */
  apiKeyId?: string
  /** 当前 key scopes；get/verify/refresh 每次重新验证持久化 key 并收敛权限。 */
  apiKeyScopes?: string[]
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
  /** 首次签发时间；刷新保留，用于绝对期限。旧记录未设置时以 createdAt 为准。 */
  startedAt?: Date
  /** 最后活动时间；启用闲置策略时，自动 refresh 不延长此值。 */
  lastActiveAt: Date
  /** 过期时间 */
  expiresAt: Date
  /** 本会话 access 的签发/滑动有效期，单位秒；创建时固化，刷新沿用该值。 */
  maxAge: number
  /** 扩展数据（内部保留 _tokenPair 供 logout 时吊销 refreshToken） */
  data?: SessionData
}

/**
 * 会话扩展数据
 *
 * 支持开放的 Record 扩展，同时约束内部保留字段 _tokenPair。
 * @example
 * ```ts
 * import type { SessionData } from '@h-ai/iam'
 * const value: SessionData = { theme: 'dark', locale: 'zh-CN' }
 * ```
 */
export type SessionData = Record<string, unknown> & {
  /** 令牌对（内部保留字段，由 session.create 写入，logout 时读取） */
  _tokenPair?: TokenPair
}

/**
 * 创建会话选项
 * @example
 * ```ts
 * import type { CreateSessionOptions } from '@h-ai/iam'
 * const value: CreateSessionOptions = { userId: 'user-1', source: 'server', maxAge: 3600 }
 * ```
 */
export interface CreateSessionOptions {
  /** 可信宿主提供的终端分组；会话签发后不可通过 update/refresh 改变。 */
  terminalType?: 'web' | 'app' | 'desktop' | 'api'
  /** 策略已验证的凭据代；创建前须与当前数据库核对，省略时仅供可信服务端按当前用户签发。 */
  expectedCredentialVersion?: string
  /** 服务端已验证的 API Key 绑定；不得来自未验证客户端输入。 */
  apiKeyId?: string
  apiKeyScopes?: string[]
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
 * @example
 * ```ts
 * import { iam, type SessionOperations } from '@h-ai/iam'
 * // 应用已完成 RelDB、Cache、Crypto 和 IAM 初始化。
 * const operations: SessionOperations = iam.session
 * const result = await operations.get('token-from-authorization-header')
 * if (!result.success) {
 *   result.error.code // 调用方将失败交给统一错误边界。
 * }
 * else {
 *   result.data
 * }
 * ```
 */
export interface SessionOperations {
  /**
   * 创建会话
   *
   * 单设备模式在同一次原子提交内替换用户已有会话；提交失败保留旧会话。
   *
   * @param options - 会话创建选项（用户 ID、角色、来源等）
   * @returns 成功返回完整的 Session 对象（含生成的访问令牌和过期时间）
   */
  create: (options: CreateSessionOptions) => Promise<HaiResult<Session>>

  /**
   * 获取会话
   *
   * 查询缓存中的会话数据。API Key 会话先重新校验持久化 key 与 scopes；滑动窗口模式下自动续期。
   * access 到期返回 null；记录保留到 refresh 到期或撤销，允许独立刷新。
   *
   * @param accessToken - 访问令牌
   * @returns 成功返回会话对象或 null（会话不存在/已过期）
   */
  get: (accessToken: string) => Promise<HaiResult<Session | null>>

  /**
   * 验证访问令牌
   *
   * 等同于 get 但在会话不存在时返回错误而非 null；API Key 撤销/禁用/过期立即拒绝。
   *
   * @param accessToken - 访问令牌
   * @returns 成功返回会话；会话无效返回 SESSION_INVALID
   */
  verifyToken: (accessToken: string) => Promise<HaiResult<Session>>

  /**
   * 更新会话
   *
   * 合并允许的资料/授权/时间字段（data 浅合并）；未传 lastActiveAt 时使用提交时刻。
   * expiresAt/lastActiveAt 必须是有效日期；不允许修改主体、令牌、固有 maxAge 和版本。
   *
   * @param accessToken - 访问令牌
   * @param data - 要更新的字段（roles、username、source、data 等）
   * @param expectedVersion - 读取到的 Session.version；过期版本失败，不能覆盖较新的修改
   * @returns 成功返回 ok；不存在返回 SESSION_NOT_FOUND，版本变化返回 CONFLICT
   * @example
   * ```ts
   * import { iam } from '@h-ai/iam'
   * // 已完成身份与更新权限校验的服务端上下文。
   * const token = 'token-from-authorization-header'
   * const found = await iam.session.get(token)
   * if (found.success && found.data) {
   *   const updated = await iam.session.update(token, { data: { theme: 'dark' } }, found.data.version)
   *   if (!updated.success)
   *     updated.error.code // 版本冲突后重新读取，不能无条件覆盖。
   * }
   * ```
   */
  update: (accessToken: string, data: Partial<Session>, expectedVersion: string) => Promise<HaiResult<void>>

  /**
   * 删除会话
   *
   * 同时清除用户令牌映射关系。
   *
   * @param accessToken - 访问令牌
   * @returns 已撤销或令牌不存在时返回 ok；共享存储读取或提交失败时返回错误
   */
  delete: (accessToken: string) => Promise<HaiResult<void>>

  /**
   * 删除用户所有会话
   *
   * 原子删除用户分区内所有会话与 refresh 凭据。
   *
   * @param userId - 用户 ID
   * @returns 成功返回实际删除的会话数量
   */
  deleteByUserId: (userId: string) => Promise<HaiResult<number>>

  /**
   * 通过 refreshToken 换取新的 TokenPair
   *
   * 验证 refreshToken 有效性，签发新的 accessToken + refreshToken，
   * 旧 refreshToken 自动失效（Rotation 策略）；access 过期不阻止仍有效的 refresh。
   *
   * @param refreshToken - 刷新令牌
   * @returns 成功返回新的 TokenPair；失败返回 TOKEN_REFRESH_FAILED / TOKEN_EXPIRED
   */
  refresh: (refreshToken: string) => Promise<HaiResult<TokenPair>>

  /**
   * 吊销 refreshToken（登出时调用）
   *
   * @param refreshToken - 刷新令牌
   * @returns 成功返回 ok；令牌不存在时静默成功
   */
  revokeRefresh: (refreshToken: string) => Promise<HaiResult<void>>

  /**
   * 批量更新用户所有活跃会话的 roles / permissions 字段
   *
   * 遍历用户缓存中的所有 session token，合并更新指定字段，
   * 同时清理已失效的会话令牌。用于角色/权限变更后的会话同步。
   *
   * @param userId - 用户 ID
   * @param updates - 要更新的字段（roles / permissions）
   * @returns 成功返回 ok
   */
  patchUserSessions: (userId: string, updates: SessionFieldUpdates) => Promise<HaiResult<void>>
}

/**
 * 会话字段更新（仅限 roles / permissions）
 *
 * 用于角色/权限变更后的会话同步。
 * @example
 * ```ts
 * import type { SessionFieldUpdates } from '@h-ai/iam'
 * const value: SessionFieldUpdates = { roles: ['user'], permissions: ['report:read'] }
 * ```
 */
export interface SessionFieldUpdates {
  /** 角色 code 列表 */
  roles?: string[]
  /** 权限 code 列表 */
  permissions?: string[]
}
