/**
 * @h-ai/iam — 认证类型定义
 *
 * 包含： - 凭证类型（Credentials） - 认证策略接口（AuthStrategy） - 认证操作接口（AuthnOperations）
 * @module iam-authn-types
 */

import type { HaiResult } from '@h-ai/core'
import type { Challenge } from 'altcha/lib'
import type { AuthStrategyType } from '../iam-config.js'
import type { AuthResult, Session } from '../session/iam-session-types.js'
import type { IssuedTicket } from '../ticket/iam-ticket-types.js'
import type { RegisterOptions, User } from '../user/iam-user-types.js'

// ─── 凭证类型 ───

/**
 * 交互鉴别用途；同一挑战不能用于另一入口，API Key 机器鉴别不使用它。
 * @example
 * ```ts
 * import type { CaptchaOperation } from '@h-ai/iam'
 * const operation: CaptchaOperation = 'login'
 * ```
 */
export type CaptchaOperation = 'login' | 'register' | 'sendOtp' | 'passwordReset' | 'renewPassword'

/**
 * 可公开的 ALTCHA 挑战；签名秘密仅存共享缓存，不包含在返回值中。
 * @example
 * ```ts
 * import { iam, type IamCaptchaChallenge } from '@h-ai/iam'
 * const result = await iam.auth.createCaptcha({ operation: 'login' })
 * if (result.success) { const challenge: IamCaptchaChallenge = result.data; void challenge.id }
 * ```
 */
export interface IamCaptchaChallenge {
  id: string
  challenge: Challenge
}

/**
 * 由可信 HTTP 宿主提供的登录元数据，独立于客户端凭据输入。
 * @example
 * ```ts
 * import type { AuthRequestContext } from '@h-ai/iam'
 * const context: AuthRequestContext = { ip: '192.0.2.10', requestId: 'request-1' }
 * ```
 */
export interface AuthRequestContext {
  /** socket/平台或受信代理解析后的地址；不能直接复制 X-Forwarded-For。 */
  ip?: string
  userAgent?: string
  requestId?: string
}

/**
 * 用户凭证（用于密码登录）
 * @example
 * ```ts
 * import type { PasswordCredentials } from '@h-ai/iam'
 * const value: PasswordCredentials = { identifier: 'alice', password: 'ExampleOnly123!' }
 * ```
 */
export interface PasswordCredentials {
  captcha?: string
  /** 用户名/邮箱/手机号 */
  identifier: string
  /** 密码 */
  password: string
}

/**
 * OTP 凭证（用于验证码登录）
 * @example
 * ```ts
 * import type { OtpCredentials } from '@h-ai/iam'
 * const value: OtpCredentials = { identifier: 'alice@example.com', code: '123456' }
 * ```
 */
export interface OtpCredentials {
  captcha?: string
  /** 邮箱/手机号 */
  identifier: string
  /** 验证码 */
  code: string
}

/**
 * LDAP 凭证
 * @example
 * ```ts
 * import type { LdapCredentials } from '@h-ai/iam'
 * const value: LdapCredentials = { username: 'alice', password: 'ExampleOnly123!' }
 * ```
 */
export interface LdapCredentials {
  captcha?: string
  /** 用户名 */
  username: string
  /** 密码 */
  password: string
}

/**
 * API Key 凭证（用于 API Key 认证）
 * @example
 * ```ts
 * import { iam, type ApiKeyCredentials } from '@h-ai/iam'
 * const created = await iam.apiKey.createApiKey('user-1', { name: 'report-reader', scopes: ['report:read'] })
 * if (created.success) {
 *   const credentials: ApiKeyCredentials = { key: created.data.rawKey }
 *   const authenticated = await iam.auth.loginWithApiKey(credentials)
 *   if (!authenticated.success)
 *     authenticated.error.code
 * }
 * ```
 */
export interface ApiKeyCredentials {
  /** 明文 API Key */
  key: string
}

/**
 * 统一凭证类型
 * @example
 * ```ts
 * import type { Credentials } from '@h-ai/iam'
 * const value: Credentials = { type: 'otp', identifier: 'alice@example.com', code: '123456' }
 * ```
 */
export type Credentials
  = | { type: 'password' } & PasswordCredentials
    | { type: 'otp' } & OtpCredentials
    | { type: 'ldap' } & LdapCredentials
    | { type: 'apikey' } & ApiKeyCredentials

/**
 * 策略内部可信认证快照；凭据代来自实际验证的用户行，不能用会话创建时的新快照替换。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * function credentialSnapshot(user: AuthenticatedUser) {
 *   return { userId: user.id, expectedCredentialVersion: user.credentialVersion }
 * }
 * ```
 */
export interface AuthenticatedUser extends User {
  /** 密码最终提交时更换；仅在服务端策略和会话构造间传递。 */
  credentialVersion: string
}

// ─── 认证策略接口 ───

/**
 * 认证策略接口
 *
 * 所有认证方式（密码/OTP/LDAP）都实现此接口
 * @example
 * ```ts
 * import type { AuthStrategy, Credentials } from '@h-ai/iam'
 * async function authenticate(strategy: AuthStrategy, credentials: Credentials) {
 *   const result = await strategy.authenticate(credentials)
 *   if (!result.success)
 *     return result
 *   return { userId: result.data.id, credentialVersion: result.data.credentialVersion }
 * }
 * ```
 */
export interface AuthStrategy {
  /** 策略类型 */
  readonly type: AuthStrategyType
  /** 策略名称 */
  readonly name: string

  /**
   * 执行认证
   *
   * @param credentials - 统一凭证（包含 type 字段标识认证方式）
   * @returns 认证成功返回用户信息；失败返回对应错误码（INVALID_CREDENTIALS / USER_LOCKED 等）
   */
  authenticate: (credentials: Credentials) => Promise<HaiResult<AuthenticatedUser>>
}

// ─── 认证操作接口 ───

/**
 * 认证子功能接口
 * @example
 * ```ts
 * import { iam, type AuthnOperations } from '@h-ai/iam'
 * // 应用已完成 RelDB、Cache、Crypto 和 IAM 初始化。
 * const operations: AuthnOperations = iam.auth
 * const result = await operations.verifyToken('token-from-authorization-header')
 * if (!result.success) {
 *   result.error.code // 调用方将失败交给统一错误边界。
 * }
 * else {
 *   result.data
 * }
 * ```
 */
export interface AuthnOperations {
  /** 生成短期单用、自托管挑战；启用后各交互入口在服务端校验解答。 */
  createCaptcha: (input: { operation: CaptchaOperation }) => Promise<HaiResult<IamCaptchaChallenge>>
  /**
   * 验证当前会话和原密码，为已配置的敏感操作签发短期单次证明。
   * 不创建新会话，不替代操作本身的权限/资源检查。
   * @param accessToken - 当前会话令牌。
   * @param password - 原密码；失败计数与登录共用。
   * @param operation - 配置中选定的操作 ID。
   * @returns 绑定用户、会话与操作的单次票据，或鉴别失败。
   */
  reauthenticate: (accessToken: string, password: string, operation: string) => Promise<HaiResult<IssuedTicket>>

  /**
   * 操作入口完成权限检查后调用；关闭策略/未选操作仅验证当前会话。
   * 选定操作原子消费证明；不能跨会话、跨操作或重复使用。
   * @param accessToken - 当前会话令牌。
   * @param operation - 服务端确定的操作 ID，不能由客户端选择要执行的守卫。
   * @param ticket - reauthenticate 签发的短期证明。
   * @returns 允许继续时成功；拒绝或基础设施失败时返回错误。
   */
  checkSensitiveOperation: (accessToken: string, operation: string, ticket?: string) => Promise<HaiResult<void>>

  /**
   * 登录（使用密码）
   *
   * 检查登录方式启用 → 密码策略认证 → 创建会话 → 返回令牌。
   *
   * @param credentials - 密码凭证（identifier + password）
   * @param context - 宿主提供的可信登录元数据，不从凭据输入复制 IP。
   * @returns 成功返回 AuthResult（用户信息、令牌、协议展示）；失败返回错误
   */
  login: (credentials: PasswordCredentials, context?: AuthRequestContext) => Promise<HaiResult<AuthResult>>

  /**
   * 使用验证码登录
   *
   * @param credentials - OTP 凭证（identifier + code）
   * @param context - 宿主提供的可信登录元数据，不从凭据输入复制 IP。
   * @returns 成功返回 AuthResult；验证码无效/过期返回 OTP_INVALID
   */
  loginWithOtp: (credentials: OtpCredentials, context?: AuthRequestContext) => Promise<HaiResult<AuthResult>>

  /**
   * 使用 LDAP 登录
   *
   * @param credentials - LDAP 凭证（username + password）
   * @param context - 宿主提供的可信登录元数据，不从凭据输入复制 IP。
   * @returns 成功返回 AuthResult（自动同步本地用户）；失败返回错误
   */
  loginWithLdap: (credentials: LdapCredentials, context?: AuthRequestContext) => Promise<HaiResult<AuthResult>>

  /**
   * 使用 API Key 登录
   *
   * 验证 API Key 有效性 → 查找关联用户 → 按 scopes 收敛授权 → 创建绑定 key 的会话。
   * 空 scopes 无操作权限；显式 * 也不超出主体权限。受限 key 通过 permission 授权，不保留角色入口。
   *
   * @param credentials - API Key 凭证
   * @param context - 宿主提供的可信登录元数据，不从凭据输入复制 IP。
   * @returns 成功返回 AuthResult；API Key 无效/过期/禁用返回对应错误
   */
  loginWithApiKey: (credentials: ApiKeyCredentials, context?: AuthRequestContext) => Promise<HaiResult<AuthResult>>

  /**
   * 登出
   *
   * 按完整访问令牌原子删除会话及关联 refresh，access 已到期也撤销待刷新记录。
   * 无效或不存在的令牌幂等成功；缓存读取/提交失败必须返回错误，不能宣称服务端已退出。
   *
   * @param accessToken - 访问令牌
   * @returns 撤销完成或令牌不存在返回 ok；共享存储失败返回错误，恢复后可用同一令牌重试
   */
  logout: (accessToken: string) => Promise<HaiResult<void>>

  /**
   * 验证令牌
   *
   * 验证会话并读取当前用户状态、角色与权限；重新应用 API Key scopes，依赖失败即拒绝。
   * 会话同步仅是缓存快照，受保护请求使用此入口而非低层 session.verifyToken。
   *
   * @param accessToken - 访问令牌
   * @returns 成功返回会话信息；令牌无效/过期返回 SESSION_INVALID
   */
  verifyToken: (accessToken: string) => Promise<HaiResult<Session>>

  /**
   * 发送验证码
   *
   * @param identifier - 用户标识（邮箱/手机号）
   * @returns 成功返回验证码过期时间；频率限制返回 OTP_RESEND_TOO_FAST
   */
  sendOtp: (identifier: string, options?: { captcha?: string }) => Promise<HaiResult<{ expiresAt: Date }>>

  /**
   * 注册并登录（一站式）
   *
   * 先注册用户（含默认角色分配），成功后立即登录并返回令牌。
   * 注册失败则直接返回注册错误；注册成功但登录失败则返回登录错误。
   *
   * @param options - 注册选项（用户名、密码、邮箱等）
   * @returns 成功返回 AuthResult（用户信息、令牌、协议展示）；失败返回对应错误码
   */
  registerAndLogin: (options: RegisterOptions, context?: AuthRequestContext) => Promise<HaiResult<AuthResult>>
}
