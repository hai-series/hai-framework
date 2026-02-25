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
 * - RBAC 配置
 * - 统一的 IamConfig 配置结构
 *
 * @example
 * ```ts
 * import { IamConfigSchema } from './iam-config'
 *
 * // 校验配置
 * const config = IamConfigSchema.parse({
 *     session: { maxAge: 86400 }
 * })
 *
 * // 使用错误码
 * if (error.code === iam.errorCode.INVALID_CREDENTIALS) {
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
 * import { iam } from '@hai/iam'
 *
 * if (result.error?.code === iam.errorCode.INVALID_CREDENTIALS) {
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
  /** 验证码无效 */
  OTP_INVALID: 5010,
  /** 验证码已过期 */
  OTP_EXPIRED: 5011,
  /** 验证码发送过于频繁 */
  OTP_RESEND_TOO_FAST: 5012,
  /** 登录方式已禁用 */
  LOGIN_DISABLED: 5013,
  /** 注册已禁用 */
  REGISTER_DISABLED: 5014,
  /** 认证策略不支持 */
  STRATEGY_NOT_SUPPORTED: 5015,

  /** 密码重置令牌无效 */
  RESET_TOKEN_INVALID: 5020,
  /** 密码重置令牌已过期 */
  RESET_TOKEN_EXPIRED: 5021,
  /** 密码重置验证次数超限 */
  RESET_TOKEN_MAX_ATTEMPTS: 5022,

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
  NOT_INITIALIZED: 5910,
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
 */
export const AuthStrategyTypeSchema = z.enum(['password', 'otp', 'ldap'])

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
 * 密码重置配置 Schema
 */
export const PasswordResetConfigSchema = z.object({
  /** 重置令牌有效期（秒，默认 3600 = 1小时） */
  tokenExpiresIn: z.number().int().min(300).default(3600),
  /** 最大验证尝试次数（默认 3） */
  maxAttempts: z.number().int().min(1).default(3),
})

/** 密码重置配置类型 */
export type PasswordResetConfig = z.infer<typeof PasswordResetConfigSchema>

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

// =============================================================================
// 登录/注册与安全策略配置
// =============================================================================

/** 登录类型启用配置 */
export const LoginConfigSchema = z.object({
  /** 是否启用密码登录 */
  password: z.boolean().default(true),
  /** 是否启用 OTP 登录 */
  otp: z.boolean().default(true),
  /** 是否启用 LDAP 登录 */
  ldap: z.boolean().default(true),
})

export type LoginConfig = z.infer<typeof LoginConfigSchema>

/** 注册配置 */
export const RegisterConfigSchema = z.object({
  /** 是否启用注册 */
  enabled: z.boolean().default(true),
  /** 新注册用户是否默认启用 */
  defaultEnabled: z.boolean().default(true),
})

export type RegisterConfig = z.infer<typeof RegisterConfigSchema>

/** 安全策略配置 */
export const SecurityConfigSchema = z.object({
  /** 最大登录失败次数（默认 5） */
  maxLoginAttempts: z.number().int().min(1).default(5),
  /** 锁定时长（秒，默认 900） */
  lockoutDuration: z.number().int().min(60).default(900),
})

export type SecurityConfig = z.infer<typeof SecurityConfigSchema>

/** 协议展示配置 */
export const AgreementConfigSchema = z.object({
  /** 用户协议 URL */
  userAgreementUrl: z.url().optional(),
  /** 隐私协议 URL */
  privacyPolicyUrl: z.url().optional(),
  /** 注册时展示协议 */
  showOnRegister: z.boolean().default(true),
  /** 登录时展示协议 */
  showOnLogin: z.boolean().default(false),
})

export type AgreementConfig = z.infer<typeof AgreementConfigSchema>

// =============================================================================
// 会话配置
// =============================================================================

/**
 * 会话配置 Schema
 */
export const SessionConfigSchema = z.object({
  /** 会话超时时间（秒，默认 86400 = 24小时） */
  maxAge: z.number().int().min(60).default(86400),
  /** 是否滑动窗口（每次访问刷新过期时间） */
  sliding: z.boolean().default(true),
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
 *     password: { minLength: 8 },
 *     session: {
 *         maxAge: 86400,
 *         sliding: true
 *     },
 *     login: { password: true, otp: true },
 *     register: { enabled: true, defaultEnabled: true },
 *     rbac: { enabled: true }
 * }
 * ```
 */
export const IamConfigSchema = z.object({
  // =========================================================================
  // 认证策略配置
  // =========================================================================

  /** 密码配置 */
  password: PasswordConfigSchema.optional(),

  /** OTP 配置 */
  otp: OtpConfigSchema.optional(),

  /** LDAP 配置 */
  ldap: LdapConfigSchema.optional(),

  /** 密码重置配置 */
  passwordReset: PasswordResetConfigSchema.optional(),

  /** 登录启用配置 */
  login: LoginConfigSchema.default({
    password: true,
    otp: true,
    ldap: true,
  }),

  /** 注册配置 */
  register: RegisterConfigSchema.default({
    enabled: true,
    defaultEnabled: true,
  }),

  /** 协议展示配置 */
  agreements: AgreementConfigSchema.default({
    showOnRegister: true,
    showOnLogin: false,
  }),

  /** 安全策略配置 */
  security: SecurityConfigSchema.default({
    maxLoginAttempts: 5,
    lockoutDuration: 900,
  }),

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

  /** 是否初始化默认角色和权限（默认 true） */
  seedDefaultData: z.boolean().default(true),
})

/** IAM 配置类型 */
export type IamConfig = z.infer<typeof IamConfigSchema>

/**
 * IAM 配置设置输入类型（仅设置字段，不含运行时依赖）
 *
 * 说明：Zod 的 default 会让输入端字段可省略，但输出端字段为必填。
 */
export type IamConfigSettingsInput = z.input<typeof IamConfigSchema>
