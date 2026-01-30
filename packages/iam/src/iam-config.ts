/**
 * =============================================================================
 * @hai/iam - 配置 Schema
 * =============================================================================
 *
 * 本文件定义 IAM 模块的配置结构，使用 Zod 进行运行时校验。
 *
 * 包含：
 * - 错误码常量（5000-5999 范围）
 * - 认证策略类型枚举
 * - 会话配置
 * - JWT 配置
 * - RBAC 配置
 * - 统一的 IamConfig 配置结构
 *
 * @example
 * ```ts
 * import { IamConfigSchema, IamErrorCode } from '@hai/iam'
 *
 * // 校验配置
 * const config = IamConfigSchema.parse({
 *     strategies: ['password'],
 *     session: { type: 'jwt' }
 * })
 *
 * // 使用错误码
 * if (error.code === IamErrorCode.INVALID_CREDENTIALS) {
 *     // 处理错误：凭证无效
 * }
 * ```
 *
 * @module iam-config
 * =============================================================================
 */

import { z } from 'zod'

// =============================================================================
// 错误码常量
// =============================================================================

/**
 * IAM 错误码（数值范围 5000-5999）
 *
 * 用于标识 IAM 操作中的各类错误，便于错误处理和日志记录。
 *
 * @example
 * ```ts
 * import { IamErrorCode } from '@hai/iam'
 *
 * if (result.error?.code === IamErrorCode.INVALID_CREDENTIALS) {
 *     // 处理错误：凭证无效
 * }
 * ```
 */
export const IamErrorCode = {
  // =========================================================================
  // 认证错误 (5000-5099)
  // =========================================================================
  /** 认证失败 */
  AUTH_FAILED: 5000,
  /** 凭证无效 */
  INVALID_CREDENTIALS: 5001,
  /** 用户不存在 */
  USER_NOT_FOUND: 5002,
  /** 用户已禁用 */
  USER_DISABLED: 5003,
  /** 用户已锁定 */
  USER_LOCKED: 5004,
  /** 用户已存在 */
  USER_ALREADY_EXISTS: 5005,
  /** 密码已过期 */
  PASSWORD_EXPIRED: 5006,
  /** 密码不符合策略 */
  PASSWORD_POLICY_VIOLATION: 5007,
  /** 需要多因素认证 */
  MFA_REQUIRED: 5008,
  /** 多因素认证无效 */
  MFA_INVALID: 5009,
  /** 验证码无效 */
  OTP_INVALID: 5010,
  /** 验证码已过期 */
  OTP_EXPIRED: 5011,
  /** 认证策略不支持 */
  STRATEGY_NOT_SUPPORTED: 5012,

  // =========================================================================
  // 会话错误 (5100-5199)
  // =========================================================================
  /** 会话不存在 */
  SESSION_NOT_FOUND: 5100,
  /** 会话已过期 */
  SESSION_EXPIRED: 5101,
  /** 会话无效 */
  SESSION_INVALID: 5102,
  /** 会话创建失败 */
  SESSION_CREATE_FAILED: 5103,
  /** 令牌已过期 */
  TOKEN_EXPIRED: 5104,
  /** 令牌无效 */
  TOKEN_INVALID: 5105,
  /** 令牌刷新失败 */
  TOKEN_REFRESH_FAILED: 5106,

  // =========================================================================
  // 授权错误 (5200-5299)
  // =========================================================================
  /** 权限不足 */
  PERMISSION_DENIED: 5200,
  /** 角色不存在 */
  ROLE_NOT_FOUND: 5201,
  /** 权限不存在 */
  PERMISSION_NOT_FOUND: 5202,
  /** 角色已存在 */
  ROLE_ALREADY_EXISTS: 5203,
  /** 权限已存在 */
  PERMISSION_ALREADY_EXISTS: 5204,

  // =========================================================================
  // OAuth 错误 (5300-5399)
  // =========================================================================
  /** OAuth 提供商不存在 */
  OAUTH_PROVIDER_NOT_FOUND: 5300,
  /** OAuth 状态无效 */
  OAUTH_INVALID_STATE: 5301,
  /** OAuth 令牌错误 */
  OAUTH_TOKEN_ERROR: 5302,
  /** OAuth 回调错误 */
  OAUTH_CALLBACK_ERROR: 5303,

  // =========================================================================
  // LDAP 错误 (5400-5499)
  // =========================================================================
  /** LDAP 连接失败 */
  LDAP_CONNECTION_FAILED: 5400,
  /** LDAP 绑定失败 */
  LDAP_BIND_FAILED: 5401,
  /** LDAP 搜索失败 */
  LDAP_SEARCH_FAILED: 5402,

  // =========================================================================
  // 存储层错误 (5500-5599)
  // =========================================================================
  /** 存储层操作错误 */
  REPOSITORY_ERROR: 5500,
  /** 资源不存在 */
  NOT_FOUND: 5501,
  /** 资源已存在（冲突） */
  CONFLICT: 5502,

  // =========================================================================
  // 通用错误 (5800-5899)
  // =========================================================================
  /** 禁止访问 */
  FORBIDDEN: 5800,
  /** 参数无效 */
  INVALID_ARGUMENT: 5801,

  // =========================================================================
  // 系统错误 (5900-5999)
  // =========================================================================
  /** 配置错误 */
  CONFIG_ERROR: 5900,
  /** 未初始化 */
  NOT_INITIALIZED: 5901,
  /** 内部错误 */
  INTERNAL_ERROR: 5999,
} as const

/** IAM 错误码类型 */
export type IamErrorCodeType = typeof IamErrorCode[keyof typeof IamErrorCode]

// =============================================================================
// 认证策略配置
// =============================================================================

/**
 * 认证策略类型
 *
 * 支持的认证方式：
 * - `password` - 用户名/邮箱 + 密码
 * - `otp` - 邮箱/短信 + 验证码
 * - `ldap` - LDAP 目录认证
 * - `oauth` - OAuth2 第三方登录
 */
export const AuthStrategyTypeSchema = z.enum(['password', 'otp', 'ldap', 'oauth'])

/** 认证策略类型 */
export type AuthStrategyType = z.infer<typeof AuthStrategyTypeSchema>

/**
 * 密码配置 Schema
 */
export const PasswordConfigSchema = z.object({
  /** 最小长度（默认 8） */
  minLength: z.number().int().min(1).default(8),
  /** 最大长度（默认 128） */
  maxLength: z.number().int().max(256).default(128),
  /** 需要大写字母 */
  requireUppercase: z.boolean().default(true),
  /** 需要小写字母 */
  requireLowercase: z.boolean().default(true),
  /** 需要数字 */
  requireNumber: z.boolean().default(true),
  /** 需要特殊字符 */
  requireSpecialChar: z.boolean().default(false),
  /** 密码历史记录数量（不能重复使用） */
  historyCount: z.number().int().min(0).default(0),
  /** 密码过期天数（0 表示不过期） */
  expirationDays: z.number().int().min(0).default(0),
})

/** 密码配置类型 */
export type PasswordConfig = z.infer<typeof PasswordConfigSchema>

/**
 * OTP 配置 Schema
 */
export const OtpConfigSchema = z.object({
  /** 验证码长度（默认 6） */
  length: z.number().int().min(4).max(8).default(6),
  /** 验证码过期时间（秒，默认 300） */
  expiresIn: z.number().int().min(60).default(300),
  /** 最大重试次数（默认 3） */
  maxAttempts: z.number().int().min(1).default(3),
  /** 发送间隔（秒，默认 60） */
  resendInterval: z.number().int().min(30).default(60),
})

/** OTP 配置类型 */
export type OtpConfig = z.infer<typeof OtpConfigSchema>

/**
 * LDAP 配置 Schema
 */
export const LdapConfigSchema = z.object({
  /** LDAP 服务器 URL */
  url: z.string().url(),
  /** 绑定 DN */
  bindDn: z.string(),
  /** 绑定密码 */
  bindPassword: z.string(),
  /** 搜索基础 DN */
  searchBase: z.string(),
  /** 搜索过滤器（默认使用 uid） */
  searchFilter: z.string().default('(uid={{username}})'),
  /** 用户名属性 */
  usernameAttribute: z.string().default('uid'),
  /** 邮箱属性 */
  emailAttribute: z.string().default('mail'),
  /** 显示名称属性 */
  displayNameAttribute: z.string().default('cn'),
  /** 启用 TLS */
  useTls: z.boolean().default(false),
  /** 连接超时（毫秒） */
  connectTimeout: z.number().int().min(1000).default(5000),
})

/** LDAP 配置类型 */
export type LdapConfig = z.infer<typeof LdapConfigSchema>

/**
 * OAuth 提供商配置 Schema
 */
export const OAuthProviderConfigSchema = z.object({
  /** 提供商 ID（如 github, google） */
  id: z.string(),
  /** 提供商名称 */
  name: z.string(),
  /** 客户端 ID */
  clientId: z.string(),
  /** 客户端密钥 */
  clientSecret: z.string(),
  /** 授权 URL */
  authorizationUrl: z.string().url(),
  /** 令牌 URL */
  tokenUrl: z.string().url(),
  /** 用户信息 URL */
  userInfoUrl: z.string().url().optional(),
  /** 作用域 */
  scopes: z.array(z.string()).default([]),
  /** 回调 URL */
  redirectUrl: z.string().url(),
})

/** OAuth 提供商配置类型 */
export type OAuthProviderConfig = z.infer<typeof OAuthProviderConfigSchema>

/**
 * OAuth 配置 Schema
 */
export const OAuthConfigSchema = z.object({
  /** 提供商列表 */
  providers: z.array(OAuthProviderConfigSchema).default([]),
  /** 状态令牌过期时间（秒，默认 600） */
  stateExpiresIn: z.number().int().min(60).default(600),
})

/** OAuth 配置类型 */
export type OAuthConfig = z.infer<typeof OAuthConfigSchema>

// =============================================================================
// 会话配置
// =============================================================================

/**
 * 会话类型
 *
 * - `jwt` - 无状态 JWT 会话
 * - `stateful` - 有状态会话（存储在 cache 中）
 */
export const SessionTypeSchema = z.enum(['jwt', 'stateful'])

/** 会话类型 */
export type SessionType = z.infer<typeof SessionTypeSchema>

/**
 * JWT 配置 Schema
 */
export const JwtConfigSchema = z.object({
  /** 密钥（HS256）或私钥（RS256/ES256） */
  secret: z.string().min(32),
  /** 签名算法 */
  algorithm: z.enum(['HS256', 'HS384', 'HS512', 'RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512']).default('HS256'),
  /** 访问令牌过期时间（秒，默认 900 = 15分钟） */
  accessTokenExpiresIn: z.number().int().min(60).default(900),
  /** 刷新令牌过期时间（秒，默认 604800 = 7天） */
  refreshTokenExpiresIn: z.number().int().min(60).default(604800),
  /** 发行者 */
  issuer: z.string().optional(),
  /** 受众 */
  audience: z.string().optional(),
})

/** JWT 配置类型 */
export type JwtConfig = z.infer<typeof JwtConfigSchema>

/**
 * 会话配置 Schema
 */
export const SessionConfigSchema = z.object({
  /** 会话类型 */
  type: SessionTypeSchema.default('jwt'),
  /** 会话超时时间（秒，默认 86400 = 24小时） */
  maxAge: z.number().int().min(60).default(86400),
  /** 是否滑动窗口（每次访问刷新过期时间） */
  sliding: z.boolean().default(true),
  /** JWT 配置（type 为 jwt 时使用） */
  jwt: JwtConfigSchema.optional(),
  /** 单设备登录（踢掉其他设备） */
  singleDevice: z.boolean().default(false),
})

/** 会话配置类型 */
export type SessionConfig = z.infer<typeof SessionConfigSchema>

// =============================================================================
// RBAC 配置
// =============================================================================

/**
 * RBAC 配置 Schema
 */
export const RbacConfigSchema = z.object({
  /** 是否启用 RBAC */
  enabled: z.boolean().default(true),
  /** 超级管理员角色代码 */
  superAdminRole: z.string().default('super_admin'),
  /** 默认用户角色 */
  defaultRole: z.string().default('user'),
  /** 是否缓存权限（提高性能） */
  cachePermissions: z.boolean().default(true),
  /** 权限缓存过期时间（秒） */
  cacheTtl: z.number().int().min(60).default(300),
})

/** RBAC 配置类型 */
export type RbacConfig = z.infer<typeof RbacConfigSchema>

// =============================================================================
// 统一配置
// =============================================================================

/**
 * IAM 统一配置 Schema
 *
 * @example
 * ```ts
 * const config: IamConfig = {
 *     strategies: ['password', 'oauth'],
 *     password: { minLength: 8 },
 *     session: {
 *         type: 'jwt',
 *         jwt: { secret: 'your-secret-key' }
 *     },
 *     rbac: { enabled: true }
 * }
 * ```
 */
export const IamConfigSchema = z.object({
  // =========================================================================
  // 认证策略配置
  // =========================================================================

  /** 启用的认证策略列表 */
  strategies: z.array(AuthStrategyTypeSchema).default(['password']),

  /** 密码配置 */
  password: PasswordConfigSchema.optional(),

  /** OTP 配置 */
  otp: OtpConfigSchema.optional(),

  /** LDAP 配置 */
  ldap: LdapConfigSchema.optional(),

  /** OAuth 配置 */
  oauth: OAuthConfigSchema.optional(),

  // =========================================================================
  // 会话配置
  // =========================================================================

  /** 会话配置 */
  session: SessionConfigSchema.optional(),

  // =========================================================================
  // 授权配置
  // =========================================================================

  /** RBAC 配置 */
  rbac: RbacConfigSchema.optional(),

  // =========================================================================
  // 运行时选项
  // =========================================================================

  /** 静默模式，不输出日志（默认 false） */
  silent: z.boolean().default(false),
})

/** IAM 配置类型 */
export type IamConfig = z.infer<typeof IamConfigSchema>

/**
 * IAM 配置输入类型（用于 init 等入口）
 *
 * 说明：Zod 的 default 会让输入端字段可省略，但输出端字段为必填。
 * 因此对外 API（如 iam.init）更适合接收 IamConfigInput。
 */
export type IamConfigInput = z.input<typeof IamConfigSchema>
