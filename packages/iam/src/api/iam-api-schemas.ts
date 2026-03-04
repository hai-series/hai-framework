/**
 * @h-ai/iam — API 契约 Zod Schema
 *
 * 入参/出参 Schema，作为服务端校验和客户端类型推导的唯一真相源。
 * @module iam-api-schemas
 */

import { z } from 'zod'

// ─── 通用 Schema ───

/** 用户基础信息 */
export const UserSchema = z.object({
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

/** Token 对 */
export const TokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(),
  tokenType: z.literal('Bearer'),
})

/** 协议展示 */
export const AgreementDisplaySchema = z.object({
  userAgreementUrl: z.string().optional(),
  privacyPolicyUrl: z.string().optional(),
  showOnRegister: z.boolean(),
  showOnLogin: z.boolean(),
})

// ─── 认证 Schema ───

/** 密码登录入参 */
export const LoginInputSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
  rememberMe: z.boolean().optional(),
})

/** 登录出参 */
export const LoginOutputSchema = z.object({
  user: UserSchema,
  tokens: TokenPairSchema,
  agreements: AgreementDisplaySchema.optional(),
})

/** OTP 登录入参 */
export const OtpLoginInputSchema = z.object({
  identifier: z.string().min(1),
  code: z.string().min(1),
})

/** 登出入参 */
export const LogoutInputSchema = z.object({
  accessToken: z.string().min(1),
})

/** 发送 OTP 入参 */
export const SendOtpInputSchema = z.object({
  identifier: z.string().min(1),
})

/** 发送 OTP 出参 */
export const SendOtpOutputSchema = z.object({
  expiresAt: z.coerce.date(),
})

/** Token 刷新入参 */
export const RefreshTokenInputSchema = z.object({
  refreshToken: z.string().min(1),
})

/** Token 刷新出参 */
export const RefreshTokenOutputSchema = z.object({
  tokens: TokenPairSchema,
})

// ─── 用户管理 Schema ───

/** 注册入参 */
export const RegisterInputSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(6),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  displayName: z.string().optional(),
})

/** 注册出参 */
export const RegisterOutputSchema = z.object({
  user: UserSchema,
  tokens: TokenPairSchema,
})

/** 修改密码入参 */
export const ChangePasswordInputSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(6),
})

/** 当前用户信息出参 */
export const CurrentUserOutputSchema = UserSchema

/** 更新当前用户入参 */
export const UpdateCurrentUserInputSchema = z.object({
  displayName: z.string().optional(),
  avatarUrl: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
})

// ─── Admin — 用户管理 Schema ───

/** 通用分页参数 */
export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
})

/** 分页结果包装 */
function paginatedSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    total: z.number(),
    page: z.number(),
    pageSize: z.number(),
  })
}

/** 用户列表查询入参 */
export const ListUsersInputSchema = PaginationQuerySchema.extend({
  search: z.string().optional(),
  enabled: z.coerce.boolean().optional(),
})

/** 用户列表出参 */
export const ListUsersOutputSchema = paginatedSchema(UserSchema)

/** Admin 创建用户入参 */
export const AdminCreateUserInputSchema = z.object({
  username: z.string().min(1),
  email: z.string().email().optional(),
  password: z.string().min(6),
  displayName: z.string().optional(),
  roles: z.array(z.string()).optional(),
  enabled: z.boolean().optional(),
})

/** Admin 更新用户入参 */
export const AdminUpdateUserInputSchema = z.object({
  username: z.string().min(1).optional(),
  email: z.string().email().optional(),
  displayName: z.string().optional(),
  enabled: z.boolean().optional(),
  password: z.string().min(6).optional(),
  roles: z.array(z.string()).optional(),
})

/** ID 路径参数 */
export const IdParamSchema = z.object({
  id: z.string().min(1),
})

/** Admin 重置密码入参 */
export const AdminResetPasswordInputSchema = z.object({
  newPassword: z.string().min(6),
})

// ─── Admin — 角色管理 Schema ───

/** 角色基础信息 */
export const RoleSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string().optional(),
  isSystem: z.boolean().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

/** 角色列表出参 */
export const ListRolesOutputSchema = paginatedSchema(RoleSchema)

/** 创建角色入参 */
export const CreateRoleInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  permissions: z.array(z.string()).optional(),
})

/** 更新角色入参 */
export const UpdateRoleInputSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  permissions: z.array(z.string()).optional(),
})

// ─── Admin — 权限管理 Schema ───

/** 权限类型 */
export const PermissionTypeSchema = z.enum(['menu', 'api', 'button'])

/** 权限基础信息 */
export const PermissionSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string().optional(),
  type: PermissionTypeSchema.optional(),
  resource: z.string().optional(),
  action: z.string().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

/** 权限列表查询入参 */
export const ListPermissionsInputSchema = PaginationQuerySchema.extend({
  search: z.string().optional(),
  type: PermissionTypeSchema.optional(),
})

/** 权限列表出参 */
export const ListPermissionsOutputSchema = paginatedSchema(PermissionSchema)

/** 创建权限入参 */
export const CreatePermissionInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  resource: z.string().min(1),
  action: z.string().min(1),
  type: PermissionTypeSchema.optional(),
})

// ─── 推导类型 ───

export type LoginInput = z.infer<typeof LoginInputSchema>
export type LoginOutput = z.infer<typeof LoginOutputSchema>
export type OtpLoginInput = z.infer<typeof OtpLoginInputSchema>
export type RegisterInput = z.infer<typeof RegisterInputSchema>
export type RegisterOutput = z.infer<typeof RegisterOutputSchema>
export type ChangePasswordInput = z.infer<typeof ChangePasswordInputSchema>
export type RefreshTokenInput = z.infer<typeof RefreshTokenInputSchema>
export type RefreshTokenOutput = z.infer<typeof RefreshTokenOutputSchema>
export type UpdateCurrentUserInput = z.infer<typeof UpdateCurrentUserInputSchema>
export type SendOtpInput = z.infer<typeof SendOtpInputSchema>
export type SendOtpOutput = z.infer<typeof SendOtpOutputSchema>
export type ListUsersInput = z.infer<typeof ListUsersInputSchema>
export type AdminCreateUserInput = z.infer<typeof AdminCreateUserInputSchema>
export type AdminUpdateUserInput = z.infer<typeof AdminUpdateUserInputSchema>
export type CreateRoleInput = z.infer<typeof CreateRoleInputSchema>
export type UpdateRoleInput = z.infer<typeof UpdateRoleInputSchema>
export type ListPermissionsInput = z.infer<typeof ListPermissionsInputSchema>
export type CreatePermissionInput = z.infer<typeof CreatePermissionInputSchema>
