/**
 * @h-ai/api-contract — IAM 领域 Schema
 *
 * 包含用户、Token、角色、权限以及相关 input/output 的 Zod Schema 定义。
 * 所有 Output Schema 均用 `haiResultSchema()` 封装，与 `@h-ai/core` HaiResult<T> 保持一致。
 * @module iam-schemas
 */

import { z } from 'zod'
import { paginatedSchema, PaginationQuerySchema } from '../common/pagination-schemas.js'
import { haiResultSchema } from '../common/result-schemas.js'

/** 用户基础信息 Schema。 */
export const IamUserSchema = z.object({
  id: z.string(),
  username: z.string(),
  email: z.string().optional(),
  phone: z.string().optional(),
  displayName: z.string().optional(),
  avatarUrl: z.string().optional(),
  enabled: z.boolean(),
  emailVerified: z.boolean().optional(),
  phoneVerified: z.boolean().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

/** Token 对 Schema。 */
export const IamTokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(),
  tokenType: z.literal('Bearer'),
})

/** 协议展示 Schema。 */
export const IamAgreementDisplaySchema = z.object({
  userAgreementUrl: z.string().optional(),
  privacyPolicyUrl: z.string().optional(),
  showOnRegister: z.boolean(),
  showOnLogin: z.boolean(),
})

/** 登录结果业务数据 Schema。 */
export const IamAuthResultSchema = z.object({
  user: IamUserSchema,
  tokens: IamTokenPairSchema,
  roles: z.array(z.string()).default([]),
  permissions: z.array(z.string()).default([]),
  agreements: IamAgreementDisplaySchema.optional(),
})

/** 密码登录入参 Schema。 */
export const IamLoginInputSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
  rememberMe: z.boolean().optional(),
})

/** OTP 登录入参 Schema。 */
export const IamOtpLoginInputSchema = z.object({
  identifier: z.string().min(1),
  code: z.string().min(1),
})

/** 登出入参 Schema。 */
export const IamLogoutInputSchema = z.object({
  accessToken: z.string().min(1).optional(),
})

/** 发送 OTP 入参 Schema。 */
export const IamSendOtpInputSchema = z.object({
  identifier: z.string().min(1),
})

/** 发送 OTP 业务数据 Schema。 */
export const IamSendOtpDataSchema = z.object({
  expiresAt: z.coerce.date(),
})

/** Token 刷新入参 Schema。 */
export const IamRefreshTokenInputSchema = z.object({
  refreshToken: z.string().min(1),
})

/** Token 刷新业务数据 Schema。 */
export const IamRefreshTokenDataSchema = z.object({
  tokens: IamTokenPairSchema,
})

/** 注册入参 Schema。 */
export const IamRegisterInputSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(6),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  displayName: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

/** 修改密码入参 Schema。 */
export const IamChangePasswordInputSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(6),
})

/** 当前用户更新入参 Schema。 */
export const IamUpdateCurrentUserInputSchema = z.object({
  username: z.string().min(1).optional(),
  email: z.string().email().optional(),
  displayName: z.string().optional(),
  avatarUrl: z.string().optional(),
  phone: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

/** 用户列表查询入参 Schema。 */
export const IamListUsersInputSchema = PaginationQuerySchema.extend({
  search: z.string().optional(),
  enabled: z.coerce.boolean().optional(),
})

/** Admin 创建用户入参 Schema。 */
export const IamAdminCreateUserInputSchema = z.object({
  username: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  password: z.string().min(6),
  displayName: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  roleIds: z.array(z.string()).optional(),
  enabled: z.boolean().optional(),
})

/** Admin 更新用户入参 Schema。 */
export const IamAdminUpdateUserInputSchema = z.object({
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

/** Admin 删除用户入参 Schema。 */
export const IamUserIdInputSchema = z.object({
  id: z.string().min(1),
})

/** Admin 重置密码入参 Schema。 */
export const IamAdminResetPasswordInputSchema = z.object({
  id: z.string().min(1),
  newPassword: z.string().min(6),
})

/** 角色基础信息 Schema。 */
export const IamRoleSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string().optional(),
  isSystem: z.boolean().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

/** 创建角色入参 Schema。 */
export const IamCreateRoleInputSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  isSystem: z.boolean().optional(),
})

/** 更新角色入参 Schema。 */
export const IamUpdateRoleInputSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
})

/** 权限类型 Schema。 */
export const IamPermissionTypeSchema = z.enum(['menu', 'api', 'button'])

/** 权限基础信息 Schema。 */
export const IamPermissionSchema = z.object({
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

/** 权限列表查询入参 Schema。 */
export const IamListPermissionsInputSchema = PaginationQuerySchema.extend({
  search: z.string().optional(),
  type: IamPermissionTypeSchema.optional(),
})

/** 创建权限入参 Schema。 */
export const IamCreatePermissionInputSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  resource: z.string().optional(),
  action: z.string().optional(),
  type: IamPermissionTypeSchema.optional(),
})

export const IamAuthResultOutputSchema = haiResultSchema(IamAuthResultSchema)
export const IamRefreshTokenOutputSchema = haiResultSchema(IamRefreshTokenDataSchema)
export const IamSendOtpOutputSchema = haiResultSchema(IamSendOtpDataSchema)
export const IamUserOutputSchema = haiResultSchema(IamUserSchema)
export const IamNullableUserOutputSchema = haiResultSchema(IamUserSchema.nullable())
export const IamUsersPageOutputSchema = haiResultSchema(paginatedSchema(IamUserSchema))
export const IamRoleOutputSchema = haiResultSchema(IamRoleSchema)
export const IamNullableRoleOutputSchema = haiResultSchema(IamRoleSchema.nullable())
export const IamRolesPageOutputSchema = haiResultSchema(paginatedSchema(IamRoleSchema))
export const IamPermissionOutputSchema = haiResultSchema(IamPermissionSchema)
export const IamNullablePermissionOutputSchema = haiResultSchema(IamPermissionSchema.nullable())
export const IamPermissionsPageOutputSchema = haiResultSchema(paginatedSchema(IamPermissionSchema))
export const IamVoidOutputSchema = haiResultSchema(z.void())

export type IamLoginInput = z.infer<typeof IamLoginInputSchema>
export type IamOtpLoginInput = z.infer<typeof IamOtpLoginInputSchema>
export type IamLogoutInput = z.infer<typeof IamLogoutInputSchema>
export type IamSendOtpInput = z.infer<typeof IamSendOtpInputSchema>
export type IamAuthResultOutput = z.infer<typeof IamAuthResultOutputSchema>
export type IamRefreshTokenInput = z.infer<typeof IamRefreshTokenInputSchema>
export type IamRefreshTokenOutput = z.infer<typeof IamRefreshTokenOutputSchema>
export type IamRegisterInput = z.infer<typeof IamRegisterInputSchema>
export type IamChangePasswordInput = z.infer<typeof IamChangePasswordInputSchema>
export type IamUpdateCurrentUserInput = z.infer<typeof IamUpdateCurrentUserInputSchema>
export type IamListUsersInput = z.infer<typeof IamListUsersInputSchema>
export type IamAdminCreateUserInput = z.infer<typeof IamAdminCreateUserInputSchema>
export type IamAdminUpdateUserInput = z.infer<typeof IamAdminUpdateUserInputSchema>
export type IamUserIdInput = z.infer<typeof IamUserIdInputSchema>
export type IamAdminResetPasswordInput = z.infer<typeof IamAdminResetPasswordInputSchema>
export type IamCreateRoleInput = z.infer<typeof IamCreateRoleInputSchema>
export type IamUpdateRoleInput = z.infer<typeof IamUpdateRoleInputSchema>
export type IamListPermissionsInput = z.infer<typeof IamListPermissionsInputSchema>
export type IamCreatePermissionInput = z.infer<typeof IamCreatePermissionInputSchema>
