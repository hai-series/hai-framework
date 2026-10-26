/**
 * @h-ai/iam — 配置 Schema
 *
 * 本文件定义 IAM 模块的配置结构，使用 Zod 进行运行时校验。
 * @module iam-config
 */

import { z } from 'zod'

/** 浏览器可访问链接仅接受 HTTP(S)，避免配置被用于脚本协议。 */
const WebUrlSchema = z.url().refine(value => ['http:', 'https:'].includes(new URL(value).protocol))

// ─── 认证策略配置 ───

/**
 * 认证策略类型
 *
 * 支持的认证方式：
 * - `password` - 用户名/邮箱 + 密码
 * - `otp` - 邮箱/短信 + 验证码
 * - `ldap` - LDAP 目录认证
 * - `apikey` - API Key 认证并按 scopes 收敛权限
 * @example
 * ```ts
 * import { AuthStrategyTypeSchema } from '@h-ai/iam'
 * const result = AuthStrategyTypeSchema.safeParse('password')
 * if (result.success) {
 *   result.data // 输出已应用 Schema 默认值。
 * }
 * ```
 */
export const AuthStrategyTypeSchema = z.enum(['password', 'otp', 'ldap', 'apikey'])

/**
 * 认证策略类型
 * @example
 * ```ts
 * import { AuthStrategyTypeSchema, type AuthStrategyType } from '@h-ai/iam'
 * const value: AuthStrategyType = AuthStrategyTypeSchema.parse('password')
 * ```
 */
export type AuthStrategyType = z.infer<typeof AuthStrategyTypeSchema>

/**
 * 密码配置 Schema
 * @example
 * ```ts
 * import { PasswordConfigSchema } from '@h-ai/iam'
 * const result = PasswordConfigSchema.safeParse({ minLength: 12, requireSpecialChar: true })
 * if (result.success) {
 *   result.data // 输出已应用 Schema 默认值。
 * }
 * ```
 */
export const PasswordConfigSchema = z.object({
  /** 最小长度（默认 8） */
  minLength: z.number().int().min(1).default(8),
  /** 最大长度（默认 128） */
  maxLength: z.number().int().min(1).max(256).default(128),
  /** 需要大写字母 */
  requireUppercase: z.boolean().default(true),
  /** 需要小写字母 */
  requireLowercase: z.boolean().default(true),
  /** 需要数字 */
  requireNumber: z.boolean().default(true),
  /** 需要特殊字符 */
  requireSpecialChar: z.boolean().default(false),
  /** 至少包含的字符类别数（大小写、数字、特殊字符），0 不额外限制。 */
  minCharacterClasses: z.number().int().min(0).max(4).default(0),
  /** 密码过期天数（0 表示不过期） */
  expirationDays: z.number().int().min(0).default(0),
  /** 拒绝新旧密码相同；启用口令期限或首次强改时也始终拒绝相同密码。 */
  preventSamePassword: z.boolean().default(false),
  /** 管理员创建或重置的初始密码必须先更换；不影响用户自行注册设密。 */
  requireInitialChange: z.boolean().default(false),
}).refine(config => config.maxLength >= config.minLength, { message: 'maxLength must be >= minLength', path: ['maxLength'] })

/**
 * 密码配置类型
 * @example
 * ```ts
 * import { PasswordConfigSchema, type PasswordConfig } from '@h-ai/iam'
 * const value: PasswordConfig = PasswordConfigSchema.parse({ minLength: 12, requireSpecialChar: true })
 * ```
 */
export type PasswordConfig = z.infer<typeof PasswordConfigSchema>

/**
 * OTP 配置 Schema
 * @example
 * ```ts
 * import { OtpConfigSchema } from '@h-ai/iam'
 * const result = OtpConfigSchema.safeParse({ email: true, sms: false, length: 6 })
 * if (result.success) {
 *   result.data // 输出已应用 Schema 默认值。
 * }
 * ```
 */
export const OtpConfigSchema = z.object({
  /** 分别启用邮件、短信验证码 */
  email: z.boolean().default(true),
  sms: z.boolean().default(true),
  /** 验证码长度（默认 6） */
  length: z.number().int().min(4).max(8).default(6),
  /** 验证码过期时间（秒，默认 300） */
  expiresIn: z.number().int().min(60).default(300),
  /** 最大重试次数（默认 3） */
  maxAttempts: z.number().int().min(1).default(3),
  /** 发送间隔（秒，默认 60） */
  resendInterval: z.number().int().min(30).default(60),
})

/**
 * OTP 配置类型
 * @example
 * ```ts
 * import { OtpConfigSchema, type OtpConfig } from '@h-ai/iam'
 * const value: OtpConfig = OtpConfigSchema.parse({ email: true, sms: false, length: 6 })
 * ```
 */
export type OtpConfig = z.infer<typeof OtpConfigSchema>

/**
 * 密码重置配置 Schema
 * @example
 * ```ts
 * import { PasswordResetConfigSchema } from '@h-ai/iam'
 * const result = PasswordResetConfigSchema.safeParse({ enabled: true, mode: 'email', resetUrl: 'https://app.example.com/reset-password' })
 * if (result.success) {
 *   result.data // 输出已应用 Schema 默认值。
 * }
 * ```
 */
export const PasswordResetConfigSchema = z.object({
  /** 重置通知渠道，phone 使用 password_reset_sms 模板。 */
  mode: z.enum(['email', 'phone']).default('email'),
  /** 重置页面的绝对地址，通知模板可使用 resetUrl。 */
  resetUrl: WebUrlSchema.optional(),
  /** 是否启用密码重置 */
  enabled: z.boolean().default(true),
  /** 重置令牌有效期（秒，默认 3600 = 1小时） */
  tokenExpiresIn: z.number().int().min(300).default(3600),
  /** 最大验证尝试次数（默认 3） */
  maxAttempts: z.number().int().min(1).default(3),
})

/**
 * 密码重置配置类型
 * @example
 * ```ts
 * import { PasswordResetConfigSchema, type PasswordResetConfig } from '@h-ai/iam'
 * const value: PasswordResetConfig = PasswordResetConfigSchema.parse({ enabled: true, mode: 'email', resetUrl: 'https://app.example.com/reset-password' })
 * ```
 */
export type PasswordResetConfig = z.infer<typeof PasswordResetConfigSchema>

/**
 * LDAP 配置 Schema
 * @example
 * ```ts
 * import { LdapConfigSchema } from '@h-ai/iam'
 * const bindPassword = process.env.LDAP_BIND_PASSWORD
 * if (bindPassword) {
 *   const result = LdapConfigSchema.safeParse({ url: 'ldaps://directory.example.com', bindDn: 'cn=service,dc=example,dc=com', bindPassword: bindPassword, searchBase: 'ou=users,dc=example,dc=com' })
 *   if (result.success)
 *     result.data.searchBase
 * }
 * ```
 */
export const LdapConfigSchema = z.object({
  /** LDAP 服务器 URL */
  url: z.url().refine(value => ['ldap:', 'ldaps:'].includes(new URL(value).protocol)),
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

/**
 * LDAP 配置类型
 * @example
 * ```ts
 * import { LdapConfigSchema, type LdapConfig } from '@h-ai/iam'
 * const bindPassword = process.env.LDAP_BIND_PASSWORD
 * if (bindPassword) {
 *   const value: LdapConfig = LdapConfigSchema.parse({ url: 'ldaps://directory.example.com', bindDn: 'cn=service,dc=example,dc=com', bindPassword: bindPassword, searchBase: 'ou=users,dc=example,dc=com' })
 *   value.url
 * }
 * ```
 */
export type LdapConfig = z.infer<typeof LdapConfigSchema>

/**
 * API Key 配置 Schema
 * @example
 * ```ts
 * import { ApiKeyConfigSchema } from '@h-ai/iam'
 * const result = ApiKeyConfigSchema.safeParse({ maxKeysPerUser: 5, defaultExpirationDays: 30 })
 * if (result.success) {
 *   result.data // 输出已应用 Schema 默认值。
 * }
 * ```
 */
export const ApiKeyConfigSchema = z.object({
  /** 单用户最大 API Key 数量（默认 10） */
  maxKeysPerUser: z.number().int().min(1).default(10),
  /** API Key 默认有效期（天，0 表示永不过期，默认 0） */
  defaultExpirationDays: z.number().int().min(0).default(0),
  /** API Key 前缀（默认 'hai_'） */
  prefix: z.string().default('hai_'),
})

/**
 * API Key 配置类型
 * @example
 * ```ts
 * import { ApiKeyConfigSchema, type ApiKeyConfig } from '@h-ai/iam'
 * const value: ApiKeyConfig = ApiKeyConfigSchema.parse({ maxKeysPerUser: 5, defaultExpirationDays: 30 })
 * ```
 */
export type ApiKeyConfig = z.infer<typeof ApiKeyConfigSchema>

// ─── 登录/注册与安全策略配置 ───

/**
 * 登录类型启用配置
 * @example
 * ```ts
 * import { LoginConfigSchema } from '@h-ai/iam'
 * const result = LoginConfigSchema.safeParse({ password: true, otp: false })
 * if (result.success) {
 *   result.data // 输出已应用 Schema 默认值。
 * }
 * ```
 */
export const LoginConfigSchema = z.object({
  /** 是否启用密码登录 */
  password: z.boolean().default(true),
  /** 是否启用 OTP 登录 */
  otp: z.boolean().default(true),
  /** 是否启用 LDAP 登录；需要显式开启并提供 ldap 配置。 */
  ldap: z.boolean().default(false),
  /** 是否启用 API Key 登录 */
  apikey: z.boolean().default(false),
})

/**
 * 登录方式开关配置。
 * @example
 * ```ts
 * import { LoginConfigSchema, type LoginConfig } from '@h-ai/iam'
 * const value: LoginConfig = LoginConfigSchema.parse({ password: true, otp: false })
 * ```
 */
export type LoginConfig = z.infer<typeof LoginConfigSchema>

/**
 * 注册配置
 * @example
 * ```ts
 * import { RegisterConfigSchema } from '@h-ai/iam'
 * const result = RegisterConfigSchema.safeParse({ enabled: false })
 * if (result.success) {
 *   result.data // 输出已应用 Schema 默认值。
 * }
 * ```
 */
export const RegisterConfigSchema = z.object({
  /** 是否启用注册 */
  enabled: z.boolean().default(true),
  /** 新注册用户是否默认启用 */
  defaultEnabled: z.boolean().default(true),
})

/**
 * 注册开关及新用户默认状态。
 * @example
 * ```ts
 * import { RegisterConfigSchema, type RegisterConfig } from '@h-ai/iam'
 * const value: RegisterConfig = RegisterConfigSchema.parse({ enabled: false })
 * ```
 */
export type RegisterConfig = z.infer<typeof RegisterConfigSchema>

/**
 * 安全策略配置
 * @example
 * ```ts
 * import { SecurityConfigSchema } from '@h-ai/iam'
 * const result = SecurityConfigSchema.safeParse({ maxLoginAttempts: 5, lockoutDuration: 900 })
 * if (result.success) {
 *   result.data // 输出已应用 Schema 默认值。
 * }
 * ```
 */
export const SecurityConfigSchema = z.object({
  /** 是否启用失败计数锁定；关闭时忽略历史锁。 */
  lockoutEnabled: z.boolean().default(true),
  /** 从首次失败起的固定计数窗口（秒）。 */
  failureWindow: z.number().int().min(1).max(31536000).default(86400),
  /** 最大登录失败次数（默认 5） */
  maxLoginAttempts: z.number().int().min(1).default(5),
  /** 锁定时长（秒，默认 900） */
  lockoutDuration: z.number().int().min(60).default(900),
})


/**
 * 服务端账户失败计数与锁定策略。
 * @example
 * ```ts
 * import { SecurityConfigSchema, type SecurityConfig } from '@h-ai/iam'
 * const value: SecurityConfig = SecurityConfigSchema.parse({ maxLoginAttempts: 5, lockoutDuration: 900 })
 * ```
 */
export type SecurityConfig = z.infer<typeof SecurityConfigSchema>


/**
 * 协议展示配置
 * @example
 * ```ts
 * import { AgreementConfigSchema } from '@h-ai/iam'
 * const result = AgreementConfigSchema.safeParse({ userAgreementUrl: 'https://app.example.com/terms', showOnRegister: true })
 * if (result.success) {
 *   result.data // 输出已应用 Schema 默认值。
 * }
 * ```
 */
export const AgreementConfigSchema = z.object({
  /** 用户协议 Markdown 正文；同时配置 URL 时优先显示正文。 */
  userAgreementMarkdown: z.string().min(1).optional(),
  /** 隐私协议 Markdown 正文；YAML 使用 | 保留段落和换行。 */
  privacyPolicyMarkdown: z.string().min(1).optional(),
  /** 用户协议 URL */
  userAgreementUrl: WebUrlSchema.optional(),
  /** 隐私协议 URL */
  privacyPolicyUrl: WebUrlSchema.optional(),
  /** 注册时展示协议 */
  showOnRegister: z.boolean().default(true),
  /** 登录时展示协议 */
  showOnLogin: z.boolean().default(false),
})

/**
 * 登录和注册的协议展示设置。
 * @example
 * ```ts
 * import { AgreementConfigSchema, type AgreementConfig } from '@h-ai/iam'
 * const value: AgreementConfig = AgreementConfigSchema.parse({ userAgreementUrl: 'https://app.example.com/terms', showOnRegister: true })
 * ```
 */
export type AgreementConfig = z.infer<typeof AgreementConfigSchema>

/** 认证页面外观；文本由应用配置或 i18n 提供，图片只接受 HTTP(S) 或站内路径。 */
const AuthImageSchema = z.string().refine(value => /^https?:\/\//.test(value) || (value.startsWith('/') && !value.startsWith('//')))
/**
 * 认证页面外观 Schema；图片仅接受 HTTP(S) 或站内路径，输出包含默认展示模式。
 * @example
 * ```ts
 * import { AuthUiConfigSchema } from '@h-ai/iam'
 * const result = AuthUiConfigSchema.safeParse({ variant: 'split', logoUrl: '/logo.svg' })
 * if (result.success) {
 *   result.data // 输出已应用 Schema 默认值。
 * }
 * ```
 */
export const AuthUiConfigSchema = z.object({
  variant: z.enum(['card', 'split']).default('card'),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  brandTitle: z.string().optional(),
  brandText: z.string().optional(),
  logoUrl: AuthImageSchema.optional(),
  illustrationUrl: AuthImageSchema.optional(),
})
/**
 * 认证页外观设置；不包含服务端秘密。
 * @example
 * ```ts
 * import { AuthUiConfigSchema, type AuthUiConfig } from '@h-ai/iam'
 * const value: AuthUiConfig = AuthUiConfigSchema.parse({ variant: 'split', logoUrl: '/logo.svg' })
 * ```
 */
export type AuthUiConfig = z.infer<typeof AuthUiConfigSchema>

// ─── 会话配置 ───

/**
 * 会话配置 Schema
 * @example
 * ```ts
 * import { SessionConfigSchema } from '@h-ai/iam'
 * const result = SessionConfigSchema.safeParse({ maxAge: 3600, refreshTokenMaxAge: 604800 })
 * if (result.success) {
 *   result.data // 输出已应用 Schema 默认值。
 * }
 * ```
 */
export const SessionConfigSchema = z.object({
  /** 新会话的默认 access 时长（秒）；创建时可用 maxAge 覆盖，滑动/刷新沿用会话固有时长。 */
  maxAge: z.number().int().min(60).default(86400),
  /** 页面离开时尽力撤销会话；浏览器关闭不可保证，仍应配置服务端闲置/绝对期限。 */
  endOnPageHide: z.boolean().default(false),
  /** 是否滑动窗口（每次访问刷新过期时间） */
  sliding: z.boolean().default(true),
  /** 单设备登录（踢掉其他设备） */
  singleDevice: z.boolean().default(false),
  /** 单设备超限策略：replace 顶旧保新，reject 保留旧会话并拒绝新登录。 */
  singleDeviceMode: z.enum(['replace', 'reject']).default('replace'),
  /** 每个用户的最大有效会话数，0 不限制；包含 access 到期但仍可刷新的会话。 */
  maxSessions: z.number().int().min(0).max(10000).default(0),
  /** 闲置期限（秒），0 关闭；真实访问记录活动，自动刷新不延长闲置；access/refresh 均执行。 */
  idleTimeout: z.number().int().min(0).max(31536000).default(0),
  /** 从首次登录起的绝对期限（秒），0 关闭；刷新不能重新起算。 */
  absoluteTimeout: z.number().int().min(0).max(31536000).default(0),
  /** refreshToken 独立有效期（秒，默认 604800 = 7天）；从签发时刻起算，access 到期仍可刷新。 */
  refreshTokenMaxAge: z.number().int().min(3600).default(604800),
})

/**
 * 会话配置类型
 * @example
 * ```ts
 * import { SessionConfigSchema, type SessionConfig } from '@h-ai/iam'
 * const value: SessionConfig = SessionConfigSchema.parse({ maxAge: 3600, refreshTokenMaxAge: 604800 })
 * ```
 */
export type SessionConfig = z.infer<typeof SessionConfigSchema>

// ─── RBAC 配置 ───

/**
 * RBAC 配置 Schema
 * @example
 * ```ts
 * import { RbacConfigSchema } from '@h-ai/iam'
 * const result = RbacConfigSchema.safeParse({ enabled: true, defaultRole: 'user' })
 * if (result.success) {
 *   result.data // 输出已应用 Schema 默认值。
 * }
 * ```
 */
export const RbacConfigSchema = z.object({
  /** 是否启用 RBAC */
  enabled: z.boolean().default(true),
  /** 超级管理员角色代码 */
  superAdminRole: z.string().default('super_admin'),
  /** 默认用户角色 */
  defaultRole: z.string().default('user'),
})

/**
 * RBAC 配置类型
 * @example
 * ```ts
 * import { RbacConfigSchema, type RbacConfig } from '@h-ai/iam'
 * const value: RbacConfig = RbacConfigSchema.parse({ enabled: true, defaultRole: 'user' })
 * ```
 */
export type RbacConfig = z.infer<typeof RbacConfigSchema>

/**
 * 可选账号闲置扫描；0天关闭自动休眠，不影响明确设置的账号状态与到期时间。
 * @example
 * ```ts
 * import { AccountConfigSchema } from '@h-ai/iam'
 * const config = AccountConfigSchema.parse({ dormantAfterDays: 90, scanIntervalSeconds: 3600 })
 * ```
 */
export const AccountConfigSchema = z.object({
  /** 连续未成功登录多少天后休眠，0 关闭。未登录账号从创建时间起算。 */
  dormantAfterDays: z.number().int().min(0).max(36500).default(0),
  /** 自动扫描间隔（秒）；开启自动休眠时执行，默认每小时。 */
  scanIntervalSeconds: z.number().int().min(60).max(86400).default(3600),
})

// ─── 统一配置 ───

/**
 * IAM 统一配置 Schema
 * @example
 * ```ts
 * import { IamConfigSchema } from '@h-ai/iam'
 * const result = IamConfigSchema.safeParse({ seedDefaultData: false, session: { maxAge: 3600 } })
 * if (result.success) {
 *   result.data // 输出已应用 Schema 默认值。
 * }
 * ```
 */
export const IamConfigSchema = z.object({
  /** 管理端可用单次邀请代替共享初始密码；需要已配置的密码重置通知通道。 */
  initialCredentials: z.object({ enabled: z.boolean().default(false) }).optional(),
  /** 账号自动休眠策略；未配置时不启动扫描。 */
  accounts: AccountConfigSchema.optional(),
  /** 认证页外观 */
  ui: AuthUiConfigSchema.optional(),
  // ─── 认证策略配置 ───

  /** 密码配置 */
  password: PasswordConfigSchema.optional(),

  /** OTP 配置 */
  otp: OtpConfigSchema.optional(),

  /** LDAP 配置 */
  ldap: LdapConfigSchema.optional(),

  /** API Key 配置 */
  apikey: ApiKeyConfigSchema.optional(),

  /** 密码重置配置 */
  passwordReset: PasswordResetConfigSchema.optional(),

  /** 登录启用配置 */
  login: LoginConfigSchema.default({
    password: true,
    otp: true,
    ldap: false,
    apikey: false,
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
    lockoutEnabled: true,
    failureWindow: 86400,
    maxLoginAttempts: 5,
    lockoutDuration: 900,
  }),

  // ─── 会话配置 ───

  /** 会话配置 */
  session: SessionConfigSchema.optional(),

  // ─── 授权配置 ───

  /** RBAC 配置 */
  rbac: RbacConfigSchema.default(() => RbacConfigSchema.parse({})),

  // ─── 运行时选项 ───

  /** 是否初始化默认角色和权限（默认 true） */
  seedDefaultData: z.boolean().default(true),
})

/**
 * IAM 配置类型
 * @example
 * ```ts
 * import { IamConfigSchema, type IamConfig } from '@h-ai/iam'
 * const value: IamConfig = IamConfigSchema.parse({ seedDefaultData: false, session: { maxAge: 3600 } })
 * ```
 */
export type IamConfig = z.infer<typeof IamConfigSchema>

/**
 * IAM 配置设置输入类型（仅设置字段，不含运行时依赖）
 *
 * 说明：Zod 的 default 会让输入端字段可省略，但输出端字段为必填。
 * @example
 * ```ts
 * import type { IamConfigSettingsInput } from '@h-ai/iam'
 * const value: IamConfigSettingsInput = { session: { maxAge: 3600 }, seedDefaultData: false }
 * ```
 */
export type IamConfigSettingsInput = z.input<typeof IamConfigSchema>
