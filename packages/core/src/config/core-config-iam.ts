/**
 * =============================================================================
 * @hai/core - IAM 配置 Schema
 * =============================================================================
 * 定义身份与访问管理相关配置的 Zod schema
 *
 * 对应配置文件: _iam.yml
 * =============================================================================
 */

import { z } from 'zod'

// =============================================================================
// 错误码（认证 2000-2999）
// =============================================================================

/**
 * 认证错误码 (2000-2999)
 */
export const AuthErrorCode = {
  INVALID_CREDENTIALS: 2000,
  TOKEN_EXPIRED: 2001,
  TOKEN_INVALID: 2002,
  SESSION_EXPIRED: 2003,
  SESSION_NOT_FOUND: 2004,
  USER_NOT_FOUND: 2005,
  USER_DISABLED: 2006,
  PASSWORD_WEAK: 2007,
  PASSWORD_MISMATCH: 2008,
  MFA_REQUIRED: 2009,
  MFA_INVALID: 2010,
  OAUTH_FAILED: 2011,
  PERMISSION_DENIED: 2012,
  ROLE_NOT_FOUND: 2013,
} as const
// eslint-disable-next-line ts/no-redeclare -- 同时导出 value/type，提供更直观的公共 API
export type AuthErrorCode = typeof AuthErrorCode[keyof typeof AuthErrorCode]

// =============================================================================
// 配置类型
// =============================================================================

/**
 * IAM 提供者类型
 */
export const IAMProviderTypeSchema = z.enum(['hai', 'firebase', 'supabase', 'auth0', 'custom'])
export type IAMProviderType = z.infer<typeof IAMProviderTypeSchema>

/**
 * 会话配置
 */
export const SessionConfigSchema = z.object({
  /** 会话密钥（用于加密 cookie） */
  secret: z.string().min(32),
  /** 会话名称（cookie name） */
  name: z.string().default('hai_session'),
  /** 会话过期时间（秒） */
  maxAge: z.number().int().positive().default(86400), // 24 hours
  /** Cookie 路径 */
  path: z.string().default('/'),
  /** Cookie 是否仅 HTTPS */
  secure: z.boolean().default(true),
  /** Cookie HttpOnly */
  httpOnly: z.boolean().default(true),
  /** Cookie SameSite */
  sameSite: z.enum(['strict', 'lax', 'none']).default('lax'),
  /** 是否启用滑动过期 */
  sliding: z.boolean().default(true),
})
export type SessionConfig = z.infer<typeof SessionConfigSchema>

/**
 * JWT 配置
 */
export const JwtConfigSchema = z.object({
  /** JWT 密钥 */
  secret: z.string().min(32),
  /** 签发者 */
  issuer: z.string().default('hai-admin'),
  /** 受众 */
  audience: z.string().default('hai-admin-users'),
  /** 访问令牌过期时间（秒） */
  accessTokenExpiry: z.number().int().positive().default(3600), // 1 hour
  /** 刷新令牌过期时间（秒） */
  refreshTokenExpiry: z.number().int().positive().default(604800), // 7 days
  /** 签名算法 */
  algorithm: z.enum(['HS256', 'HS384', 'HS512']).default('HS256'),
})
export type JwtConfig = z.infer<typeof JwtConfigSchema>

/**
 * 密码策略配置
 */
export const PasswordPolicySchema = z.object({
  /** 最小长度 */
  minLength: z.number().int().min(6).default(8),
  /** 最大长度 */
  maxLength: z.number().int().max(128).default(72),
  /** 是否要求大写字母 */
  requireUppercase: z.boolean().default(true),
  /** 是否要求小写字母 */
  requireLowercase: z.boolean().default(true),
  /** 是否要求数字 */
  requireNumbers: z.boolean().default(true),
  /** 是否要求特殊字符 */
  requireSpecial: z.boolean().default(false),
  /** Argon2 内存成本（KB） */
  argon2MemoryCost: z.number().int().min(1024).default(65536),
  /** Argon2 时间成本 */
  argon2TimeCost: z.number().int().min(1).default(3),
  /** Argon2 并行度 */
  argon2Parallelism: z.number().int().min(1).default(4),
})
export type PasswordPolicy = z.infer<typeof PasswordPolicySchema>

/**
 * 登录限制配置
 */
export const LoginLimitsSchema = z.object({
  /** 最大失败尝试次数 */
  maxAttempts: z.number().int().min(1).default(5),
  /** 锁定时间（秒） */
  lockoutDuration: z.number().int().min(60).default(300), // 5 minutes
  /** 重置失败计数的时间窗口（秒） */
  attemptWindow: z.number().int().min(60).default(900), // 15 minutes
  /** 是否启用验证码 */
  captchaEnabled: z.boolean().default(true),
  /** 触发验证码的失败次数 */
  captchaThreshold: z.number().int().min(1).default(3),
})
export type LoginLimits = z.infer<typeof LoginLimitsSchema>

/**
 * OAuth 提供商配置
 */
export const OAuthProviderSchema = z.object({
  /** 是否启用 */
  enabled: z.boolean().default(false),
  /** Client ID */
  clientId: z.string().optional(),
  /** Client Secret */
  clientSecret: z.string().optional(),
  /** 授权范围 */
  scope: z.array(z.string()).optional(),
  /** 授权 URL */
  authorizationUrl: z.string().url().optional(),
  /** Token URL */
  tokenUrl: z.string().url().optional(),
  /** 用户信息 URL */
  userInfoUrl: z.string().url().optional(),
  /** 回调 URL */
  redirectUri: z.string().url().optional(),
})
export type OAuthProvider = z.infer<typeof OAuthProviderSchema>

/**
 * OAuth 配置
 */
export const OAuthConfigSchema = z.object({
  /** GitHub OAuth */
  github: OAuthProviderSchema.optional(),
  /** Google OAuth */
  google: OAuthProviderSchema.optional(),
  /** Microsoft OAuth */
  microsoft: OAuthProviderSchema.optional(),
  /** WeChat OAuth */
  wechat: OAuthProviderSchema.optional(),
  /** Apple OAuth */
  apple: OAuthProviderSchema.optional(),
})
export type OAuthConfig = z.infer<typeof OAuthConfigSchema>

/**
 * 角色定义
 */
export const RoleDefinitionSchema = z.object({
  /** 角色 ID */
  id: z.string(),
  /** 角色名称 */
  name: z.string(),
  /** 角色描述 */
  description: z.string().optional(),
  /** 权限列表 */
  permissions: z.array(z.string()).default([]),
})
export type RoleDefinition = z.infer<typeof RoleDefinitionSchema>

/**
 * 授权配置
 */
export const AuthzConfigSchema = z.object({
  /** 默认角色 */
  defaultRole: z.string().default('user'),
  /** 超级管理员角色 */
  superAdminRole: z.string().default('super_admin'),
  /** 预定义角色 */
  roles: z.array(RoleDefinitionSchema).default([]),
})
export type AuthzConfig = z.infer<typeof AuthzConfigSchema>

/**
 * 第三方提供者配置（Firebase、Supabase、Auth0）
 */
export const ThirdPartyProviderConfigSchema = z.object({
  /** 项目 ID */
  projectId: z.string().optional(),
  /** API Key */
  apiKey: z.string().optional(),
  /** 域名/URL */
  domain: z.string().optional(),
  /** 客户端 ID */
  clientId: z.string().optional(),
  /** 客户端密钥 */
  clientSecret: z.string().optional(),
})
export type ThirdPartyProviderConfig = z.infer<typeof ThirdPartyProviderConfigSchema>

/**
 * IAM 配置
 */
export const IAMConfigSchema = z.object({
  /** 提供者类型 */
  provider: IAMProviderTypeSchema.default('hai'),
  /** 会话配置 */
  session: SessionConfigSchema.optional(),
  /** JWT 配置 */
  jwt: JwtConfigSchema.optional(),
  /** 密码策略 */
  passwordPolicy: PasswordPolicySchema.optional(),
  /** 登录限制 */
  loginLimits: LoginLimitsSchema.optional(),
  /** OAuth 配置 */
  oauth: OAuthConfigSchema.optional(),
  /** 授权配置 */
  authz: AuthzConfigSchema.optional(),
  /** Firebase 配置（当 provider 为 firebase 时） */
  firebase: ThirdPartyProviderConfigSchema.optional(),
  /** Supabase 配置（当 provider 为 supabase 时） */
  supabase: ThirdPartyProviderConfigSchema.optional(),
  /** Auth0 配置（当 provider 为 auth0 时） */
  auth0: ThirdPartyProviderConfigSchema.optional(),
})
export type IAMConfig = z.infer<typeof IAMConfigSchema>

// =============================================================================
// 兼容性导出（保留原有名称）
// =============================================================================

/** @deprecated Use IAMConfigSchema instead */
export const AuthConfigSchema = IAMConfigSchema
/** @deprecated Use IAMConfig instead */
export type AuthConfig = IAMConfig
