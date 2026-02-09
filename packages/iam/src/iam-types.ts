/**
 * @hai/iam — 公共类型定义
 *
 * 包含：
 * - 错误类型（IamError）
 * - 函数接口（IamFunctions）
 * - 初始化配置（IamConfigInput）
 * - 客户端操作（IamClientOperations）
 * - 子功能类型 re-export
 */

import type { CacheFunctions } from '@hai/cache'
import type { Result } from '@hai/core'
import type { DbFunctions } from '@hai/db'

import type { IamAuthnFunctions } from './authn/iam-authn-types.js'
import type { LdapClientFactory } from './authn/ldap/iam-authn-ldap-strategy.js'
import type { IamAuthzFunctions } from './authz/iam-authz-types.js'
import type { IamClient, IamClientConfig } from './client/iam-client.js'
import type { IamConfig, IamConfigSettingsInput, IamErrorCodeType } from './iam-config.js'
import type { IamSessionFunctions } from './session/iam-session-types.js'
import type { IamUserFunctions } from './user/iam-user-types.js'

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
  /** 初始化 IAM 服务 */
  init: (config: IamConfigInput) => Promise<Result<void, IamError>>
  /** 关闭 IAM 服务 */
  close: () => Promise<void>
  /** 当前配置 */
  readonly config: IamConfig | null
  /** 是否已初始化 */
  readonly isInitialized: boolean
  /** 认证操作 */
  readonly auth: IamAuthnFunctions
  /** 用户管理 */
  readonly user: IamUserFunctions
  /** 授权管理 */
  readonly authz: IamAuthzFunctions
  /** 会话管理 */
  readonly session: IamSessionFunctions
  /** 前端客户端操作（无需 init 即可使用） */
  readonly client: IamClientOperations
}

// ─── 子功能类型 re-export ───

export type { AuthStrategy, Credentials, IamAuthnFunctions, LdapCredentials, OtpCredentials, PasswordCredentials } from './authn/iam-authn-types.js'
export type { AuthzContext, IamAuthzFunctions, Permission, Role, RolePermission, UserRole } from './authz/iam-authz-types.js'
export type { AuthResult, CreateSessionOptions, IamSessionFunctions, Session } from './session/iam-session-types.js'
export type { AgreementDisplay, IamUserFunctions, RegisterOptions, RegisterResult, StoredUser, User } from './user/iam-user-types.js'
