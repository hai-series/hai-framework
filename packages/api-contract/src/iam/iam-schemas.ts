/**
 * @h-ai/api-contract — IAM 领域 Schema
 *
 * 包含用户、Token、角色、权限以及相关 input/data 的 Zod Schema 定义。
 * 一次性输出包装在 contract 中内联，仅保留跨接口、跨层复用的数据结构。
 * @module iam-schemas
 */

import type { HaiResult } from '@h-ai/core'
import { z } from 'zod'
import { PaginationQuerySchema } from '../common/pagination-schemas.js'

const captchaProofSchema = z.string().min(1).max(4096).optional()

/**
 * 交互挑战生成入参，证明只能用于指定入口。
 * @example
 * ```ts
 * import { IamCreateCaptchaInputSchema } from '@h-ai/api-contract'
 * const input = IamCreateCaptchaInputSchema.parse({ operation: 'login' })
 * ```
 */
export const IamCreateCaptchaInputSchema = z.object({ operation: z.enum(['login', 'register', 'sendOtp', 'passwordReset', 'renewPassword']) })

/**
 * 自托管 ALTCHA 可公开挑战；不会返回签名秘密。
 * @example
 * ```ts
 * import { IamCaptchaChallengeSchema } from '@h-ai/api-contract'
 * function parseResponse(value: unknown) { return IamCaptchaChallengeSchema.parse(value) }
 * ```
 */
export const IamCaptchaChallengeSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{64}$/),
  challenge: z.object({
    signature: z.string().max(256).optional(),
    parameters: z.object({
      algorithm: z.string().refine(value => value === 'PBKDF2/SHA-256'),
      nonce: z.string().min(1).max(256),
      salt: z.string().min(1).max(256),
      cost: z.number().int().min(100).max(50000),
      keyLength: z.number().int().min(16).max(64),
      keyPrefix: z.string().min(1).max(128),
      keySignature: z.string().max(256).optional(),
      data: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
    }),
  }),
})

/**
 * 用户基础信息 Schema。
 * @example
 * ```ts
 * import { IamUserSchema } from '@h-ai/api-contract'
 *
 * const value = IamUserSchema.parse({
 *   id: 'example-1',
 *   username: 'alice',
 *   enabled: true,
 *   createdAt: null,
 *   updatedAt: null
 * })
 * void value
 * ```
 */
export const IamUserSchema = z.object({
  id: z.string(),
  username: z.string(),
  email: z.string().optional(),
  phone: z.string().optional(),
  displayName: z.string().optional(),
  avatarUrl: z.string().optional(),
  enabled: z.boolean(),
  accountType: z.enum(['permanent', 'temporary']).optional(),
  accountStatus: z.enum(['active', 'dormant', 'closed']).optional(),
  accountExpiresAt: z.coerce.date().nullable().optional(),
  lastLoginAt: z.coerce.date().nullable().optional(),
  mustChangePassword: z.boolean().optional(),
  emailVerified: z.boolean().optional(),
  phoneVerified: z.boolean().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

/**
 * Token 对 Schema。
 * @example
 * ```ts
 * import { IamTokenPairSchema } from '@h-ai/api-contract'
 *
 * const value = IamTokenPairSchema.parse({
 *   accessToken: 'example-only-access',
 *   expiresIn: 0,
 *   tokenType: 'Bearer'
 * })
 * void value
 * ```
 */
export const IamTokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  expiresIn: z.number(),
  tokenType: z.literal('Bearer'),
})

/**
 * 协议展示 Schema。
 * @example
 * ```ts
 * import { IamAgreementDisplaySchema } from '@h-ai/api-contract'
 *
 * const value = IamAgreementDisplaySchema.parse({
 *   showOnRegister: true,
 *   showOnLogin: true
 * })
 * void value
 * ```
 */
export const IamAgreementDisplaySchema = z.object({
  /** 配置中的 Markdown 原文由客户端安全渲染。 */
  userAgreementMarkdown: z.string().min(1).optional(),
  privacyPolicyMarkdown: z.string().min(1).optional(),
  userAgreementUrl: z.string().optional(),
  privacyPolicyUrl: z.string().optional(),
  showOnRegister: z.boolean(),
  showOnLogin: z.boolean(),
})

/**
 * 登录结果业务数据 Schema。
 * @example
 * ```ts
 * import { IamAuthResultSchema } from '@h-ai/api-contract'
 *
 * const value = IamAuthResultSchema.parse({
 *   user: {
 *     id: 'example-1',
 *     username: 'alice',
 *     enabled: true,
 *     createdAt: null,
 *     updatedAt: null
 *   },
 *   tokens: {
 *     accessToken: 'example-only-access',
 *     expiresIn: 0,
 *     tokenType: 'Bearer'
 *   }
 * })
 * void value
 * ```
 */
export const IamAuthResultSchema = z.object({
  user: IamUserSchema,
  tokens: IamTokenPairSchema,
  roles: z.array(z.string()).default([]),
  permissions: z.array(z.string()).default([]),
  agreements: IamAgreementDisplaySchema.optional(),
})

/**
 * 当前会话用户信息；包含服务端重新校验后的角色与权限快照。
 * @example
 * ```ts
 * import { IamCurrentUserSchema } from '@h-ai/api-contract'
 *
 * const value = IamCurrentUserSchema.parse({
 *   id: 'example-1',
 *   username: 'alice',
 *   enabled: true,
 *   createdAt: null,
 *   updatedAt: null,
 *   roles: [
 *     'example'
 *   ],
 *   permissions: [
 *     'example'
 *   ]
 * })
 * void value
 * ```
 */
export const IamCurrentUserSchema = IamUserSchema.extend({
  roles: z.array(z.string()),
  permissions: z.array(z.string()),
})

/**
 * 密码登录入参 Schema。
 * @example
 * ```ts
 * import { IamLoginInputSchema } from '@h-ai/api-contract'
 *
 * const value = IamLoginInputSchema.parse({
 *   identifier: 'alice',
 *   password: 'example-only-password'
 * })
 * void value
 * ```
 */
export const IamLoginInputSchema = z.object({
  expectedUserId: z.string().min(1).max(200).optional(),
  captcha: captchaProofSchema,
  identifier: z.string().min(1),
  password: z.string().min(1),
})

/**
 * 可以尝试刷新或恢复登录的IAM会话错误码；密码错误、初始/过期改密与操作二次认证不属于会话恢复。
 * @example
 * ```ts
 * import { IamSessionErrorCodeSchema } from '@h-ai/api-contract'
 * const expired = IamSessionErrorCodeSchema.safeParse('hai:iam:103').success
 * ```
 */
export const IamSessionErrorCodeSchema = z.enum(['hai:iam:101', 'hai:iam:102', 'hai:iam:103', 'hai:iam:105', 'hai:iam:106', 'hai:iam:107'])

/**
 * LDAP 登录与密码找回入参。
 * @example
 * ```ts
 * import { IamLdapLoginInputSchema } from '@h-ai/api-contract'
 *
 * const value = IamLdapLoginInputSchema.parse({
 *   username: 'alice',
 *   password: 'example-only-password'
 * })
 * void value
 * ```
 */
export const IamLdapLoginInputSchema = z.object({ username: z.string().trim().min(1), password: z.string().min(1), captcha: captchaProofSchema, expectedUserId: z.string().min(1).max(200).optional() })
/**
 * IamRequestPasswordResetInput 数据的运行时 Zod 校验约束。
 * @example
 * ```ts
 * import { IamRequestPasswordResetInputSchema } from '@h-ai/api-contract'
 *
 * const value = IamRequestPasswordResetInputSchema.parse({
 *   identifier: 'alice'
 * })
 * void value
 * ```
 */
export const IamRequestPasswordResetInputSchema = z.object({ identifier: z.string().trim().min(1), captcha: captchaProofSchema })
/**
 * IamConfirmPasswordResetInput 数据的运行时 Zod 校验约束。
 * @example
 * ```ts
 * import { IamConfirmPasswordResetInputSchema } from '@h-ai/api-contract'
 *
 * const value = IamConfirmPasswordResetInputSchema.parse({
 *   token: 'example-only-token',
 *   newPassword: 'example-only-password'
 * })
 * void value
 * ```
 */
export const IamConfirmPasswordResetInputSchema = z.object({ token: z.string().min(1), newPassword: z.string().min(1) })

/**
 * 无普通会话的首次或过期改密；必须重新验证原密码。
 * @example
 * ```ts
 * import { IamRenewPasswordInputSchema } from '@h-ai/api-contract'
 * const input = IamRenewPasswordInputSchema.parse({ identifier: 'alice', password: 'Initial123!', newPassword: 'Chosen456!' })
 * ```
 */
export const IamRenewPasswordInputSchema = z.object({ identifier: z.string().trim().min(1), password: z.string().min(1), newPassword: z.string().min(1), captcha: captchaProofSchema })

/**
 * 对当前会话的指定操作重新鉴别；操作本身仍需独立授权。
 * @example
 * ```ts
 * import { IamReauthenticateInputSchema } from '@h-ai/api-contract'
 * const input = IamReauthenticateInputSchema.parse({ password: 'ChosenPassword123!', operation: 'iam.users.delete' })
 * ```
 */
export const IamReauthenticateInputSchema = z.object({ password: z.string().min(1), operation: z.string().trim().min(1).max(128) })

/**
 * 短期、用途绑定的单次操作证明，不能持久化到浏览器存储。
 * @example
 * ```ts
 * import { IamReauthenticationProofSchema } from '@h-ai/api-contract'
 * const proof = IamReauthenticationProofSchema.parse({ ticket: 'example-only-ticket', expiresAt: Date.now() + 300000 })
 * ```
 */
export const IamReauthenticationProofSchema = z.object({ ticket: z.string().min(1), expiresAt: z.number() })

/**
 * 认证页面公开配置白名单，独立于服务端连接/凭据配置。
 * @example
 * ```ts
 * import { IamPublicConfigSchema } from '@h-ai/api-contract'
 *
 * const value = IamPublicConfigSchema.parse({
 *   password: {
 *     minLength: 0,
 *     maxLength: 0,
 *     requireUppercase: true,
 *     requireLowercase: true,
 *     requireNumber: true,
 *     requireSpecialChar: true,
 *     expirationDays: 0
 *   },
 *   register: {
 *     enabled: true
 *   },
 *   login: {
 *     password: true,
 *     otp: true,
 *     ldap: true,
 *     email: true,
 *     sms: true
 *   },
 *   passwordReset: {
 *     enabled: true,
 *     mode: 'email'
 *   },
 *   otp: {
 *     length: 0,
 *     resendInterval: 0
 *   },
 *   agreements: {
 *     showOnRegister: true,
 *     showOnLogin: true
 *   },
 *   ui: {
 *     variant: 'card'
 *   },
 *   session: {
 *     maxAge: 0
 *   }
 * })
 * void value
 * ```
 */
export const IamPublicConfigSchema = z.object({
  captcha: z.object({ enabled: z.boolean() }).default({ enabled: false }),
  reauthentication: z.object({ enabled: z.boolean(), operations: z.array(z.string()) }).optional(),
  initialCredentials: z.object({ enabled: z.boolean() }).optional(),
  password: z.object({ minLength: z.number(), maxLength: z.number(), requireUppercase: z.boolean(), requireLowercase: z.boolean(), requireNumber: z.boolean(), requireSpecialChar: z.boolean(), expirationDays: z.number(), minCharacterClasses: z.number().optional(), preventSamePassword: z.boolean().optional(), requireInitialChange: z.boolean().optional() }),
  register: z.object({ enabled: z.boolean() }),
  login: z.object({ password: z.boolean(), otp: z.boolean(), ldap: z.boolean(), email: z.boolean(), sms: z.boolean() }),
  passwordReset: z.object({ enabled: z.boolean(), mode: z.enum(['email', 'phone']) }),
  otp: z.object({ length: z.number(), resendInterval: z.number() }),
  agreements: IamAgreementDisplaySchema,
  ui: z.object({ variant: z.enum(['card', 'split']), title: z.string().optional(), subtitle: z.string().optional(), brandTitle: z.string().optional(), brandText: z.string().optional(), logoUrl: z.string().optional(), illustrationUrl: z.string().optional() }),
  session: z.object({ maxAge: z.number(), endOnPageHide: z.boolean().default(false) }),
})

/**
 * OTP 登录入参 Schema。
 * @example
 * ```ts
 * import { IamOtpLoginInputSchema } from '@h-ai/api-contract'
 *
 * const value = IamOtpLoginInputSchema.parse({
 *   identifier: 'alice',
 *   code: 'example-1'
 * })
 * void value
 * ```
 */
export const IamOtpLoginInputSchema = z.object({
  expectedUserId: z.string().min(1).max(200).optional(),
  captcha: captchaProofSchema,
  identifier: z.string().min(1),
  code: z.string().min(1),
})

/**
 * 登出入参 Schema。
 * 仅撤销调用方持有的完整 accessToken；省略时使用 Authorization Bearer，二者均无值则失败。
 * access 已到期仍可撤销关联 refresh；此入口不按 userId 撤销，也不授予任何身份权限。
 * @example
 * ```ts
 * import { IamLogoutInputSchema } from '@h-ai/api-contract'
 *
 * const value = IamLogoutInputSchema.parse({})
 * void value
 * ```
 */
export const IamLogoutInputSchema = z.object({
  accessToken: z.string().min(1).optional(),
})

/**
 * 发送 OTP 入参 Schema。
 * @example
 * ```ts
 * import { IamSendOtpInputSchema } from '@h-ai/api-contract'
 *
 * const value = IamSendOtpInputSchema.parse({
 *   identifier: 'alice'
 * })
 * void value
 * ```
 */
export const IamSendOtpInputSchema = z.object({
  captcha: captchaProofSchema,
  identifier: z.string().min(1),
})

/**
 * 发送 OTP 业务数据 Schema。
 * @example
 * ```ts
 * import { IamSendOtpDataSchema } from '@h-ai/api-contract'
 *
 * const value = IamSendOtpDataSchema.parse({
 *   expiresAt: null
 * })
 * void value
 * ```
 */
export const IamSendOtpDataSchema = z.object({
  expiresAt: z.coerce.date(),
})

/**
 * Token 刷新入参 Schema。
 * @example
 * ```ts
 * import { IamRefreshTokenInputSchema } from '@h-ai/api-contract'
 *
 * const value = IamRefreshTokenInputSchema.parse({
 *   refreshToken: 'example-only-refresh'
 * })
 * void value
 * ```
 */
export const IamRefreshTokenInputSchema = z.object({
  refreshToken: z.string().min(1),
})

/**
 * Token 刷新业务数据 Schema。
 * @example
 * ```ts
 * import { IamRefreshTokenDataSchema } from '@h-ai/api-contract'
 *
 * const value = IamRefreshTokenDataSchema.parse({
 *   tokens: {
 *     accessToken: 'example-only-access',
 *     expiresIn: 0,
 *     tokenType: 'Bearer'
 *   }
 * })
 * void value
 * ```
 */
export const IamRefreshTokenDataSchema = z.object({
  tokens: IamTokenPairSchema,
})

/**
 * 注册入参 Schema。
 * @example
 * ```ts
 * import { IamRegisterInputSchema } from '@h-ai/api-contract'
 *
 * const value = IamRegisterInputSchema.parse({
 *   username: 'alice',
 *   password: 'example-only-password'
 * })
 * void value
 * ```
 */
export const IamRegisterInputSchema = z.object({
  captcha: captchaProofSchema,
  username: z.string().min(1),
  password: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  displayName: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

/**
 * 修改密码入参 Schema。
 * @example
 * ```ts
 * import { IamChangePasswordInputSchema } from '@h-ai/api-contract'
 *
 * const value = IamChangePasswordInputSchema.parse({
 *   oldPassword: 'example',
 *   newPassword: 'example-only-password'
 * })
 * void value
 * ```
 */
export const IamChangePasswordInputSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(1),
})

/**
 * 当前用户更新入参 Schema。
 * @example
 * ```ts
 * import { IamUpdateCurrentUserInputSchema } from '@h-ai/api-contract'
 *
 * const value = IamUpdateCurrentUserInputSchema.parse({})
 * void value
 * ```
 */
export const IamUpdateCurrentUserInputSchema = z.object({
  username: z.string().min(1).optional(),
  email: z.string().email().optional(),
  displayName: z.string().optional(),
  avatarUrl: z.string().optional(),
  phone: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

/**
 * 用户列表查询入参 Schema。
 * @example
 * ```ts
 * import { IamListUsersInputSchema } from '@h-ai/api-contract'
 *
 * const value = IamListUsersInputSchema.parse({})
 * void value
 * ```
 */
export const IamListUsersInputSchema = PaginationQuerySchema.extend({
  sortBy: z.enum(['username', 'email', 'displayName', 'enabled', 'createdAt']).optional(),
  sortDirection: z.enum(['asc', 'desc']).optional(),
  roleCode: z.string().trim().min(1).max(100).optional(),
  search: z.string().optional(),
  // 注意：HTTP query 是字符串，使用枚举 + transform 避免 z.coerce.boolean 的 'false' → true 陷阱。
  enabled: z.enum(['true', 'false']).optional().transform(v => v === undefined ? undefined : v === 'true'),
})

/**
 * Admin 创建用户入参 Schema。
 * @example
 * ```ts
 * import { IamAdminCreateUserInputSchema } from '@h-ai/api-contract'
 *
 * const value = IamAdminCreateUserInputSchema.parse({
 *   username: 'alice',
 *   password: 'example-only-password'
 * })
 * void value
 * ```
 */
export const IamAdminCreateUserInputSchema = z.object({
  accountType: z.enum(['permanent', 'temporary']).optional(),
  accountStatus: z.enum(['active', 'dormant', 'closed']).optional(),
  accountExpiresAt: z.coerce.date().optional(),
  username: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  password: z.string().min(1),
  displayName: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  roleIds: z.array(z.string()).optional(),
  enabled: z.boolean().optional(),
})

/**
 * 管理端单次邀请不接收共享初始密码；初始账号必须启用且激活。
 * @example
 * ```ts
 * import { IamInviteUserInputSchema } from '@h-ai/api-contract'
 * const input = IamInviteUserInputSchema.parse({ username: 'alice', email: 'alice@example.com' })
 * ```
 */
export const IamInviteUserInputSchema = IamAdminCreateUserInputSchema.omit({ password: true }).extend({ enabled: z.literal(true).optional(), accountStatus: z.literal('active').optional() })

/**
 * 单次邀请的管理端输入。
 * @example
 * ```ts
 * import type { IamInviteUserInput } from '@h-ai/api-contract'
 * const input: IamInviteUserInput = { username: 'alice', email: 'alice@example.com' }
 * ```
 */
export type IamInviteUserInput = z.infer<typeof IamInviteUserInputSchema>

/**
 * Admin 更新用户入参 Schema。
 * @example
 * ```ts
 * import { IamAdminUpdateUserInputSchema } from '@h-ai/api-contract'
 *
 * const value = IamAdminUpdateUserInputSchema.parse({
 *   id: 'example-1'
 * })
 * void value
 * ```
 */
export const IamAdminUpdateUserInputSchema = z.object({
  accountType: z.enum(['permanent', 'temporary']).optional(),
  accountStatus: z.enum(['active', 'dormant', 'closed']).optional(),
  accountExpiresAt: z.coerce.date().nullable().optional(),
  id: z.string().min(1),
  username: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  displayName: z.string().optional(),
  avatarUrl: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  enabled: z.boolean().optional(),
  roleIds: z.array(z.string()).optional(),
})

/**
 * Admin 删除用户入参 Schema。
 * @example
 * ```ts
 * import { IamUserIdInputSchema } from '@h-ai/api-contract'
 *
 * const value = IamUserIdInputSchema.parse({
 *   id: 'example-1'
 * })
 * void value
 * ```
 */
export const IamUserIdInputSchema = z.object({
  id: z.string().min(1),
})

/**
 * Admin 重置密码入参 Schema。
 * @example
 * ```ts
 * import { IamAdminResetPasswordInputSchema } from '@h-ai/api-contract'
 *
 * const value = IamAdminResetPasswordInputSchema.parse({
 *   id: 'example-1',
 *   newPassword: 'example-only-password'
 * })
 * void value
 * ```
 */
export const IamAdminResetPasswordInputSchema = z.object({
  id: z.string().min(1),
  newPassword: z.string().min(1),
})

/**
 * 角色基础信息 Schema。
 * @example
 * ```ts
 * import { IamRoleSchema } from '@h-ai/api-contract'
 *
 * const value = IamRoleSchema.parse({
 *   id: 'example-1',
 *   code: 'example-1',
 *   name: 'Example',
 *   createdAt: null,
 *   updatedAt: null
 * })
 * void value
 * ```
 */
export const IamRoleSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string().optional(),
  isSystem: z.boolean().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

/**
 * 创建角色入参 Schema。
 * @example
 * ```ts
 * import { IamCreateRoleInputSchema } from '@h-ai/api-contract'
 *
 * const value = IamCreateRoleInputSchema.parse({
 *   code: 'example-1',
 *   name: 'Example'
 * })
 * void value
 * ```
 */
export const IamCreateRoleInputSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  isSystem: z.boolean().optional(),
})

/**
 * 更新角色入参 Schema。
 * @example
 * ```ts
 * import { IamUpdateRoleInputSchema } from '@h-ai/api-contract'
 *
 * const value = IamUpdateRoleInputSchema.parse({
 *   id: 'example-1'
 * })
 * void value
 * ```
 */
export const IamUpdateRoleInputSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
})

/**
 * 权限类型 Schema。
 * @example
 * ```ts
 * import { IamPermissionTypeSchema } from '@h-ai/api-contract'
 *
 * const value = IamPermissionTypeSchema.parse('menu')
 * void value
 * ```
 */
export const IamPermissionTypeSchema = z.enum(['menu', 'api', 'button'])

/**
 * 权限基础信息 Schema。
 * @example
 * ```ts
 * import { IamPermissionSchema } from '@h-ai/api-contract'
 *
 * const value = IamPermissionSchema.parse({
 *   id: 'example-1',
 *   code: 'example-1',
 *   name: 'Example',
 *   createdAt: null,
 *   updatedAt: null
 * })
 * void value
 * ```
 */
export const IamPermissionSchema = z.object({
  sensitiveOperations: z.array(z.string().trim().min(1).max(128)).max(1000).nullish().transform(value => value ?? []),
  id: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string().optional(),
  type: IamPermissionTypeSchema.optional(),
  resource: z.string().optional(),
  action: z.string().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

/**
 * 权限列表查询入参 Schema。
 * @example
 * ```ts
 * import { IamListPermissionsInputSchema } from '@h-ai/api-contract'
 *
 * const value = IamListPermissionsInputSchema.parse({})
 * void value
 * ```
 */
export const IamListPermissionsInputSchema = PaginationQuerySchema.extend({
  search: z.string().optional(),
  type: IamPermissionTypeSchema.optional(),
})

/**
 * 创建权限入参 Schema。
 * @example
 * ```ts
 * import { IamCreatePermissionInputSchema } from '@h-ai/api-contract'
 *
 * const value = IamCreatePermissionInputSchema.parse({
 *   code: 'example-1',
 *   name: 'Example'
 * })
 * void value
 * ```
 */
export const IamCreatePermissionInputSchema = z.object({
  sensitiveOperations: z.array(z.string().trim().min(1).max(128)).max(1000).default([]),
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  resource: z.string().optional(),
  action: z.string().optional(),
  type: IamPermissionTypeSchema.optional(),
})

/**
 * 账号密码登录请求。
 * @example
 * ```ts
 * import type { IamLoginInput } from '@h-ai/api-contract'
 * import { IamLoginInputSchema } from '@h-ai/api-contract'
 *
 * const value: IamLoginInput = IamLoginInputSchema.parse({
 *   identifier: 'alice',
 *   password: 'example-only-password'
 * })
 * void value
 * ```
 */
export type IamLoginInput = z.infer<typeof IamLoginInputSchema>
/**
 * LDAP 登录请求。
 * @example
 * ```ts
 * import type { IamLdapLoginInput } from '@h-ai/api-contract'
 * import { IamLdapLoginInputSchema } from '@h-ai/api-contract'
 *
 * const value: IamLdapLoginInput = IamLdapLoginInputSchema.parse({
 *   username: 'alice',
 *   password: 'example-only-password'
 * })
 * void value
 * ```
 */
export type IamLdapLoginInput = z.infer<typeof IamLdapLoginInputSchema>
/**
 * 允许下发客户端的身份认证配置。
 * @example
 * ```ts
 * import type { IamPublicConfig } from '@h-ai/api-contract'
 * import { IamPublicConfigSchema } from '@h-ai/api-contract'
 *
 * const value: IamPublicConfig = IamPublicConfigSchema.parse({
 *   password: {
 *     minLength: 0,
 *     maxLength: 0,
 *     requireUppercase: true,
 *     requireLowercase: true,
 *     requireNumber: true,
 *     requireSpecialChar: true,
 *     expirationDays: 0
 *   },
 *   register: {
 *     enabled: true
 *   },
 *   login: {
 *     password: true,
 *     otp: true,
 *     ldap: true,
 *     email: true,
 *     sms: true
 *   },
 *   passwordReset: {
 *     enabled: true,
 *     mode: 'email'
 *   },
 *   otp: {
 *     length: 0,
 *     resendInterval: 0
 *   },
 *   agreements: {
 *     showOnRegister: true,
 *     showOnLogin: true
 *   },
 *   ui: {
 *     variant: 'card'
 *   },
 *   session: {
 *     maxAge: 0
 *   }
 * })
 * void value
 * ```
 */
export type IamPublicConfig = z.infer<typeof IamPublicConfigSchema>
/**
 * 一次性验证码登录请求。
 * @example
 * ```ts
 * import type { IamOtpLoginInput } from '@h-ai/api-contract'
 * import { IamOtpLoginInputSchema } from '@h-ai/api-contract'
 *
 * const value: IamOtpLoginInput = IamOtpLoginInputSchema.parse({
 *   identifier: 'alice',
 *   code: 'example-1'
 * })
 * void value
 * ```
 */
export type IamOtpLoginInput = z.infer<typeof IamOtpLoginInputSchema>
/**
 * 注销当前会话的请求。
 * @example
 * ```ts
 * import type { IamLogoutInput } from '@h-ai/api-contract'
 * import { IamLogoutInputSchema } from '@h-ai/api-contract'
 *
 * const value: IamLogoutInput = IamLogoutInputSchema.parse({})
 * void value
 * ```
 */
export type IamLogoutInput = z.infer<typeof IamLogoutInputSchema>
/**
 * 发送一次性验证码的请求。
 * @example
 * ```ts
 * import type { IamSendOtpInput } from '@h-ai/api-contract'
 * import { IamSendOtpInputSchema } from '@h-ai/api-contract'
 *
 * const value: IamSendOtpInput = IamSendOtpInputSchema.parse({
 *   identifier: 'alice'
 * })
 * void value
 * ```
 */
export type IamSendOtpInput = z.infer<typeof IamSendOtpInputSchema>
/**
 * 以 HaiResult 区分成功业务数据和公共错误的 IamAuthResultOutput 响应。
 * @example
 * ```ts
 * import type { IamAuthResultOutput } from '@h-ai/api-contract'
 * import { IamAuthResultSchema } from '@h-ai/api-contract'
 * import { ok } from '@h-ai/core'
 *
 * const response: IamAuthResultOutput = ok(IamAuthResultSchema.parse({
 *   user: {
 *     id: 'example-1',
 *     username: 'alice',
 *     enabled: true,
 *     createdAt: null,
 *     updatedAt: null
 *   },
 *   tokens: {
 *     accessToken: 'example-only-access',
 *     expiresIn: 0,
 *     tokenType: 'Bearer'
 *   }
 * }))
 * if (response.success) void response.data
 * ```
 */
export type IamAuthResultOutput = HaiResult<z.infer<typeof IamAuthResultSchema>>
/**
 * 当前登录用户及其有效权限。
 * @example
 * ```ts
 * import type { IamCurrentUser } from '@h-ai/api-contract'
 * import { IamCurrentUserSchema } from '@h-ai/api-contract'
 *
 * const value: IamCurrentUser = IamCurrentUserSchema.parse({
 *   id: 'example-1',
 *   username: 'alice',
 *   enabled: true,
 *   createdAt: null,
 *   updatedAt: null,
 *   roles: [
 *     'example'
 *   ],
 *   permissions: [
 *     'example'
 *   ]
 * })
 * void value
 * ```
 */
export type IamCurrentUser = z.infer<typeof IamCurrentUserSchema>
/**
 * 以 HaiResult 区分成功业务数据和公共错误的 IamCurrentUserOutput 响应。
 * @example
 * ```ts
 * import type { IamCurrentUserOutput } from '@h-ai/api-contract'
 * import { IamCurrentUserSchema } from '@h-ai/api-contract'
 * import { ok } from '@h-ai/core'
 *
 * const response: IamCurrentUserOutput = ok(IamCurrentUserSchema.parse({
 *   id: 'example-1',
 *   username: 'alice',
 *   enabled: true,
 *   createdAt: null,
 *   updatedAt: null,
 *   roles: [
 *     'example'
 *   ],
 *   permissions: [
 *     'example'
 *   ]
 * }))
 * if (response.success) void response.data
 * ```
 */
export type IamCurrentUserOutput = HaiResult<IamCurrentUser>
/**
 * 使用刷新凭据换取会话令牌的请求。
 * @example
 * ```ts
 * import type { IamRefreshTokenInput } from '@h-ai/api-contract'
 * import { IamRefreshTokenInputSchema } from '@h-ai/api-contract'
 *
 * const value: IamRefreshTokenInput = IamRefreshTokenInputSchema.parse({
 *   refreshToken: 'example-only-refresh'
 * })
 * void value
 * ```
 */
export type IamRefreshTokenInput = z.infer<typeof IamRefreshTokenInputSchema>
/**
 * 以 HaiResult 区分成功业务数据和公共错误的 IamRefreshTokenOutput 响应。
 * @example
 * ```ts
 * import type { IamRefreshTokenOutput } from '@h-ai/api-contract'
 * import { IamRefreshTokenDataSchema } from '@h-ai/api-contract'
 * import { ok } from '@h-ai/core'
 *
 * const response: IamRefreshTokenOutput = ok(IamRefreshTokenDataSchema.parse({
 *   tokens: {
 *     accessToken: 'example-only-access',
 *     expiresIn: 0,
 *     tokenType: 'Bearer'
 *   }
 * }))
 * if (response.success) void response.data
 * ```
 */
export type IamRefreshTokenOutput = HaiResult<z.infer<typeof IamRefreshTokenDataSchema>>
/**
 * 用户注册请求。
 * @example
 * ```ts
 * import type { IamRegisterInput } from '@h-ai/api-contract'
 * import { IamRegisterInputSchema } from '@h-ai/api-contract'
 *
 * const value: IamRegisterInput = IamRegisterInputSchema.parse({
 *   username: 'alice',
 *   password: 'example-only-password'
 * })
 * void value
 * ```
 */
export type IamRegisterInput = z.infer<typeof IamRegisterInputSchema>
/**
 * 当前用户修改密码的请求。
 * @example
 * ```ts
 * import type { IamChangePasswordInput } from '@h-ai/api-contract'
 * import { IamChangePasswordInputSchema } from '@h-ai/api-contract'
 *
 * const value: IamChangePasswordInput = IamChangePasswordInputSchema.parse({
 *   oldPassword: 'example',
 *   newPassword: 'example-only-password'
 * })
 * void value
 * ```
 */
export type IamChangePasswordInput = z.infer<typeof IamChangePasswordInputSchema>
/**
 * 修改当前用户资料的请求。
 * @example
 * ```ts
 * import type { IamUpdateCurrentUserInput } from '@h-ai/api-contract'
 * import { IamUpdateCurrentUserInputSchema } from '@h-ai/api-contract'
 *
 * const value: IamUpdateCurrentUserInput = IamUpdateCurrentUserInputSchema.parse({})
 * void value
 * ```
 */
export type IamUpdateCurrentUserInput = z.infer<typeof IamUpdateCurrentUserInputSchema>
/**
 * 管理员分页查询用户的请求。
 * @example
 * ```ts
 * import type { IamListUsersInput } from '@h-ai/api-contract'
 * import { IamListUsersInputSchema } from '@h-ai/api-contract'
 *
 * const value: IamListUsersInput = IamListUsersInputSchema.parse({})
 * void value
 * ```
 */
export type IamListUsersInput = z.infer<typeof IamListUsersInputSchema>
/**
 * 管理员创建用户的请求。
 * @example
 * ```ts
 * import type { IamAdminCreateUserInput } from '@h-ai/api-contract'
 * import { IamAdminCreateUserInputSchema } from '@h-ai/api-contract'
 *
 * const value: IamAdminCreateUserInput = IamAdminCreateUserInputSchema.parse({
 *   username: 'alice',
 *   password: 'example-only-password'
 * })
 * void value
 * ```
 */
export type IamAdminCreateUserInput = z.infer<typeof IamAdminCreateUserInputSchema>
/**
 * 管理员修改用户的请求。
 * @example
 * ```ts
 * import type { IamAdminUpdateUserInput } from '@h-ai/api-contract'
 * import { IamAdminUpdateUserInputSchema } from '@h-ai/api-contract'
 *
 * const value: IamAdminUpdateUserInput = IamAdminUpdateUserInputSchema.parse({
 *   id: 'example-1'
 * })
 * void value
 * ```
 */
export type IamAdminUpdateUserInput = z.infer<typeof IamAdminUpdateUserInputSchema>
/**
 * 以用户 ID 定位目标的请求。
 * @example
 * ```ts
 * import type { IamUserIdInput } from '@h-ai/api-contract'
 * import { IamUserIdInputSchema } from '@h-ai/api-contract'
 *
 * const value: IamUserIdInput = IamUserIdInputSchema.parse({
 *   id: 'example-1'
 * })
 * void value
 * ```
 */
export type IamUserIdInput = z.infer<typeof IamUserIdInputSchema>
/**
 * 管理员重置用户密码的请求。
 * @example
 * ```ts
 * import type { IamAdminResetPasswordInput } from '@h-ai/api-contract'
 * import { IamAdminResetPasswordInputSchema } from '@h-ai/api-contract'
 *
 * const value: IamAdminResetPasswordInput = IamAdminResetPasswordInputSchema.parse({
 *   id: 'example-1',
 *   newPassword: 'example-only-password'
 * })
 * void value
 * ```
 */
export type IamAdminResetPasswordInput = z.infer<typeof IamAdminResetPasswordInputSchema>
/**
 * 创建角色的请求。
 * @example
 * ```ts
 * import type { IamCreateRoleInput } from '@h-ai/api-contract'
 * import { IamCreateRoleInputSchema } from '@h-ai/api-contract'
 *
 * const value: IamCreateRoleInput = IamCreateRoleInputSchema.parse({
 *   code: 'example-1',
 *   name: 'Example'
 * })
 * void value
 * ```
 */
export type IamCreateRoleInput = z.infer<typeof IamCreateRoleInputSchema>
/**
 * 修改角色的请求。
 * @example
 * ```ts
 * import type { IamUpdateRoleInput } from '@h-ai/api-contract'
 * import { IamUpdateRoleInputSchema } from '@h-ai/api-contract'
 *
 * const value: IamUpdateRoleInput = IamUpdateRoleInputSchema.parse({
 *   id: 'example-1'
 * })
 * void value
 * ```
 */
export type IamUpdateRoleInput = z.infer<typeof IamUpdateRoleInputSchema>
/**
 * 分页查询权限定义的请求。
 * @example
 * ```ts
 * import type { IamListPermissionsInput } from '@h-ai/api-contract'
 * import { IamListPermissionsInputSchema } from '@h-ai/api-contract'
 *
 * const value: IamListPermissionsInput = IamListPermissionsInputSchema.parse({})
 * void value
 * ```
 */
export type IamListPermissionsInput = z.infer<typeof IamListPermissionsInputSchema>
/**
 * 创建权限定义的请求。
 * @example
 * ```ts
 * import type { IamCreatePermissionInput } from '@h-ai/api-contract'
 * import { IamCreatePermissionInputSchema } from '@h-ai/api-contract'
 *
 * const value: IamCreatePermissionInput = IamCreatePermissionInputSchema.parse({
 *   code: 'example-1',
 *   name: 'Example'
 * })
 * void value
 * ```
 */
export type IamCreatePermissionInput = z.infer<typeof IamCreatePermissionInputSchema>
