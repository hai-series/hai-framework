/**
 * =============================================================================
 * @hai/config - 认证配置 Schema
 * =============================================================================
 * 定义认证相关配置的 Zod schema
 * 
 * 对应配置文件: _auth.yml
 * =============================================================================
 */

import { z } from 'zod'

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
    /** 客户端 ID */
    clientId: z.string().optional(),
    /** 客户端密钥 */
    clientSecret: z.string().optional(),
    /** 授权 URL */
    authorizationUrl: z.string().url().optional(),
    /** 令牌 URL */
    tokenUrl: z.string().url().optional(),
    /** 用户信息 URL */
    userInfoUrl: z.string().url().optional(),
    /** 权限范围 */
    scopes: z.array(z.string()).default([]),
})
export type OAuthProvider = z.infer<typeof OAuthProviderSchema>

/**
 * 认证配置
 */
export const AuthConfigSchema = z.object({
    /** 会话配置 */
    session: SessionConfigSchema,
    /** JWT 配置 */
    jwt: JwtConfigSchema.optional(),
    /** 密码策略 */
    passwordPolicy: PasswordPolicySchema.default({}),
    /** 登录限制 */
    loginLimits: LoginLimitsSchema.default({}),
    /** 是否启用 E2EE 登录 */
    e2eeEnabled: z.boolean().default(true),
    /** SM2 公钥（E2EE 登录用） */
    sm2PublicKey: z.string().optional(),
    /** OAuth 提供商 */
    oauth: z.record(z.string(), OAuthProviderSchema).default({}),
    /** 允许的回调 URL 模式 */
    allowedCallbackUrls: z.array(z.string()).default([]),
    /** 是否允许密码登录 */
    allowPasswordLogin: z.boolean().default(true),
    /** 是否允许短信登录 */
    allowSmsLogin: z.boolean().default(false),
})
export type AuthConfig = z.infer<typeof AuthConfigSchema>
