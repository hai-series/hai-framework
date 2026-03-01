/**
 * @h-ai/iam — 公共类型定义
 *
 * 包含：
 * - 错误类型（IamError）
 * - 函数接口（IamFunctions）
 * - 初始化配置（IamConfigInput）
 * - 客户端操作（IamClientOperations）
 * - 子功能类型 re-export
 * @module iam-types
 */

import type { CacheFunctions } from '@h-ai/cache'
import type { Result } from '@h-ai/core'
import type { DbFunctions } from '@h-ai/db'

import type { IamAuthnFunctions } from './authn/iam-authn-types.js'
import type { LdapClientFactory } from './authn/ldap/iam-authn-ldap-strategy.js'
import type { IamAuthzFunctions } from './authz/iam-authz-types.js'
import type { IamClient, IamClientConfig } from './client/iam-client.js'
import type { IamConfig, IamConfigSettingsInput, IamErrorCodeType } from './iam-config.js'
import type { IamSessionFunctions } from './session/iam-session-types.js'
import type { IamUserFunctions, User } from './user/iam-user-types.js'

// ─── 错误类型 ───

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

// ─── 初始化配置 ───

/**
 * IAM 初始化配置
 *
 * 包含 Zod 校验的设置字段和运行时依赖。
 * 传入 `iam.init()` 的唯一参数。
 */
export interface IamConfigInput extends IamConfigSettingsInput {
  /** 数据库服务（必需） */
  db: DbFunctions
  /** 缓存服务（必需） */
  cache: CacheFunctions
  /** LDAP 客户端工厂（启用 LDAP 登录时必填） */
  ldapClientFactory?: LdapClientFactory
  /** LDAP 用户同步开关（默认 true） */
  ldapSyncUser?: boolean
  /**
   * 密码重置令牌回调（可选）
   *
   * 当用户请求密码重置时，框架生成令牌后通过此回调通知业务层，
   * 业务层负责将令牌通过邮件/短信等渠道发送给用户。
   * 若未提供此回调，requestPasswordReset 将仅记录日志不发送通知。
   *
   * @param user - 请求重置的用户信息
   * @param token - 重置令牌（明文，需发送给用户）
   * @param expiresAt - 令牌过期时间
   */
  onPasswordResetRequest?: (user: User, token: string, expiresAt: Date) => Promise<void>

  /**
   * OTP 邮件验证码发送回调（可选）
   *
   * 当用户请求 OTP 验证码时，框架生成验证码后通过此回调通知业务层，
   * 业务层负责将验证码通过邮件发送给用户。
   * 若未提供此回调，sendOtp 将返回"发送方式未配置"错误。
   *
   * @param email - 目标邮箱
   * @param code - 验证码
   */
  onOtpSendEmail?: (email: string, code: string) => Promise<void>

  /**
   * OTP 短信验证码发送回调（可选）
   *
   * 当用户请求 OTP 验证码时，框架生成验证码后通过此回调通知业务层，
   * 业务层负责将验证码通过短信发送给用户。
   * 若未提供此回调，sendOtp 将返回"发送方式未配置"错误。
   *
   * @param phone - 目标手机号
   * @param code - 验证码
   */
  onOtpSendSms?: (phone: string, code: string) => Promise<void>
}

// ─── 客户端操作 ───

/**
 * IAM 客户端操作接口
 *
 * 通过 `iam.client` 访问，提供前端客户端的创建能力。
 */
export interface IamClientOperations {
  /** 创建 IAM 客户端实例 */
  create: (config: IamClientConfig) => IamClient
}

// ─── 函数接口 ───

/**
 * IAM 函数接口
 *
 * 统一聚合所有 IAM 功能。
 */
export interface IamFunctions {
  /**
   * 初始化 IAM 服务
   *
   * 幂等操作：已初始化时直接返回成功。
   * 内部按依赖顺序创建 session → authz → authn → user 子功能，
   * 并可选执行种子数据初始化。
   *
   * @param config - IAM 初始化配置（包含数据库、缓存、可选 LDAP 工厂等）
   * @returns 成功返回 `ok(undefined)`；失败返回含错误码的 `err`
   *
   * @example
   * ```ts
   * const result = await iam.init({ db, cache })
   * if (!result.success) {
   *   console.error(result.error.message)
   * }
   * ```
   */
  init: (config: IamConfigInput) => Promise<Result<void, IamError>>

  /**
   * 关闭 IAM 服务
   *
   * 释放所有内部子功能引用，将模块恢复到未初始化状态。
   * 关闭后访问 `iam.auth` 等属性将返回未初始化错误。
   */
  close: () => Promise<void>

  /** 当前配置（未初始化时为 null） */
  readonly config: IamConfig | null
  /** 是否已初始化 */
  readonly isInitialized: boolean
  /** 认证操作（登录、登出、令牌验证等） */
  readonly auth: IamAuthnFunctions
  /** 用户管理（注册、查询、更新、密码管理等） */
  readonly user: IamUserFunctions
  /** 授权管理（角色/权限 CRUD、用户角色分配、权限检查） */
  readonly authz: IamAuthzFunctions
  /** 会话管理（创建、查询、验证、删除会话） */
  readonly session: IamSessionFunctions
  /** 前端客户端操作（无状态，无需 init 即可使用） */
  readonly client: IamClientOperations
}

// ─── 子功能类型 re-export ───

export type { AuthStrategy, Credentials, IamAuthnFunctions, LdapCredentials, OtpCredentials, PasswordCredentials } from './authn/iam-authn-types.js'
export type { IamAuthzFunctions, Permission, PermissionQueryOptions, PermissionType, Role, RolePermission, UserRole } from './authz/iam-authz-types.js'
export type { AuthResult, CreateSessionOptions, IamSessionFunctions, Session } from './session/iam-session-types.js'
export type { AgreementDisplay, IamUserFunctions, ListUsersOptions, RegisterOptions, RegisterResult, StoredUser, UpdateCurrentUserInput, User } from './user/iam-user-types.js'
