/**
 * @h-ai/iam — 公共类型定义
 *
 * 包含：
 * - 错误类型（IamError）
 * - 函数接口（IamFunctions）
 * - 初始化配置（IamConfigInput）
 * - 子功能类型 re-export
 * @module iam-types
 */

import type { ErrorInfo, HaiResult } from '@h-ai/core'

import type { ApiKeyOperations } from './authn/apikey/iam-authn-apikey-types.js'
import type { AuthnOperations } from './authn/iam-authn-types.js'
import type { LdapClientFactory } from './authn/ldap/iam-authn-ldap-strategy.js'
import type { AuthzOperations } from './authz/iam-authz-types.js'
import type { IamConfig, IamConfigSettingsInput } from './iam-config.js'
import type { SessionOperations } from './session/iam-session-types.js'
import type { User, UserOperations } from './user/iam-user-types.js'
import { core } from '@h-ai/core'

// ─── 错误定义（照 @h-ai/core 范式） ───

const IamErrorInfo = {
  AUTH_FAILED: '001:401',
  INVALID_CREDENTIALS: '002:401',
  USER_NOT_FOUND: '003:404',
  USER_DISABLED: '004:403',
  USER_LOCKED: '005:403',
  USER_ALREADY_EXISTS: '006:409',
  PASSWORD_EXPIRED: '007:401',
  PASSWORD_POLICY_VIOLATION: '008:400',
  OTP_INVALID: '009:400',
  OTP_EXPIRED: '010:400',
  OTP_RESEND_TOO_FAST: '011:429',
  LOGIN_DISABLED: '012:400',
  REGISTER_DISABLED: '013:403',
  STRATEGY_NOT_SUPPORTED: '014:400',
  APIKEY_INVALID: '015:401',
  APIKEY_EXPIRED: '016:401',
  APIKEY_DISABLED: '017:403',
  APIKEY_NOT_FOUND: '018:404',
  RESET_TOKEN_INVALID: '019:400',
  RESET_TOKEN_EXPIRED: '020:400',
  RESET_TOKEN_MAX_ATTEMPTS: '021:429',

  SESSION_NOT_FOUND: '101:401',
  SESSION_EXPIRED: '102:401',
  SESSION_INVALID: '103:401',
  SESSION_CREATE_FAILED: '104:500',
  TOKEN_EXPIRED: '105:401',
  TOKEN_INVALID: '106:401',
  TOKEN_REFRESH_FAILED: '107:401',

  PERMISSION_DENIED: '201:403',
  ROLE_NOT_FOUND: '202:404',
  PERMISSION_NOT_FOUND: '203:404',
  ROLE_ALREADY_EXISTS: '204:409',
  PERMISSION_ALREADY_EXISTS: '205:409',

  LDAP_CONNECTION_FAILED: '301:500',
  LDAP_BIND_FAILED: '302:401',
  LDAP_SEARCH_FAILED: '303:500',

  REPOSITORY_ERROR: '401:500',
  NOT_FOUND: '402:404',
  CONFLICT: '403:409',

  FORBIDDEN: '501:403',
  INVALID_ARGUMENT: '502:400',

  CONFIG_ERROR: '901:500',
  NOT_INITIALIZED: '910:500',
  INTERNAL_ERROR: '999:500',
} as const satisfies ErrorInfo

export const HaiIamError = core.error.buildHaiErrorsDef('iam', IamErrorInfo)

// ─── 初始化配置 ───

/**
 * IAM 初始化配置
 *
 * 包含 Zod 校验的设置字段和运行时依赖。
 * 传入 `iam.init()` 的唯一参数。
 */
export interface IamConfigInput extends IamConfigSettingsInput {
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
   * @param config - IAM 初始化配置（可选 session/password/LDAP 等策略配置）
   * @returns 成功返回 `ok(undefined)`；失败返回含错误码的 `err`
   *
   * @example
   * ```ts
   * const result = await iam.init({ session: { maxAge: 86400 } })
   * if (!result.success) {
   *   console.error(result.error.message)
   * }
   * ```
   */
  init: (config: IamConfigInput) => Promise<HaiResult<void>>

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
  /** 注册功能是否启用（未初始化或未配置时默认启用） */
  readonly isRegisterEnabled: boolean
  /** 认证操作（登录、登出、令牌验证等） */
  readonly auth: AuthnOperations
  /** 用户管理（注册、查询、更新、密码管理等） */
  readonly user: UserOperations
  /** 授权管理（角色/权限 CRUD、用户角色分配、权限检查） */
  readonly authz: AuthzOperations
  /** 会话管理（创建、查询、验证、删除会话） */
  readonly session: SessionOperations
  /** API Key 管理（创建、列表、吐销、验证），未启用 apikey 登录时返回未初始化代理 */
  readonly apiKey: ApiKeyOperations
}

// ─── 子功能类型 re-export ───

export type { ApiKey, ApiKeyOperations, CreateApiKeyOptions, CreateApiKeyResult } from './authn/apikey/iam-authn-apikey-types.js'
export type { ApiKeyCredentials, AuthnOperations, AuthStrategy, Credentials, LdapCredentials, OtpCredentials, PasswordCredentials } from './authn/iam-authn-types.js'
export type { LdapClientFactory } from './authn/ldap/iam-authn-ldap-strategy.js'
export type { AuthzOperations, Permission, PermissionQueryOptions, PermissionType, Role } from './authz/iam-authz-types.js'
export type { AuthResult, CreateSessionOptions, Session, SessionData, SessionFieldUpdates, SessionOperations, TokenPair } from './session/iam-session-types.js'
export type { AgreementDisplay, ListUsersOptions, RegisterOptions, RegisterResult, StoredUser, UpdateCurrentUserInput, User, UserOperations } from './user/iam-user-types.js'
