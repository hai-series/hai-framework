/**
 * @h-ai/iam — API 端点契约定义
 *
 * 所有 iam 模块的 API 端点（path + method + schema），
 * 客户端和服务端都从此处引用，编译时保证一致性。
 * @module iam-api-contract
 */

import { z } from 'zod'
import {
  AdminCreateUserInputSchema,
  AdminResetPasswordInputSchema,
  AdminUpdateUserInputSchema,
  ChangePasswordInputSchema,
  CreatePermissionInputSchema,
  CreateRoleInputSchema,
  CurrentUserOutputSchema,
  IdParamSchema,
  ListPermissionsInputSchema,
  ListPermissionsOutputSchema,
  ListRolesOutputSchema,
  ListUsersInputSchema,
  ListUsersOutputSchema,
  LoginInputSchema,
  LoginOutputSchema,
  LogoutInputSchema,
  OtpLoginInputSchema,
  PaginationQuerySchema,
  PermissionSchema,
  RefreshTokenInputSchema,
  RefreshTokenOutputSchema,
  RegisterInputSchema,
  RegisterOutputSchema,
  RoleSchema,
  SendOtpInputSchema,
  SendOtpOutputSchema,
  UpdateCurrentUserInputSchema,
  UpdateRoleInputSchema,
  UserSchema,
} from './iam-api-schemas.js'

// ─── 端点定义辅助（内联，避免对 @h-ai/api-client 的循环依赖） ───

interface EndpointDef<TInput = unknown, TOutput = unknown> {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  path: string
  input: z.ZodType<TInput>
  output: z.ZodType<TOutput>
  requireAuth?: boolean
  meta?: { summary?: string, tags?: string[] }
}

function defineEndpoint<TInput, TOutput>(def: EndpointDef<TInput, TOutput>): EndpointDef<TInput, TOutput> {
  return def
}

// ─── iam API 端点 ───

/**
 * iam 所有 API 端点
 *
 * @example
 * ```ts
 * // 客户端
 * import { iamEndpoints } from '@h-ai/iam/api'
 * const result = await api.call(iamEndpoints.login, { identifier: 'alice', password: 'xxx' })
 *
 * // 服务端
 * export const POST = kit.fromContract(iamEndpoints.login, async (input, event) => { ... })
 * ```
 */
export const iamEndpoints = {
  /** 密码登录 */
  login: defineEndpoint({
    method: 'POST',
    path: '/auth/login',
    input: LoginInputSchema,
    output: LoginOutputSchema,
    requireAuth: false,
    meta: { summary: 'Password login', tags: ['auth'] },
  }),

  /** OTP 验证码登录 */
  loginWithOtp: defineEndpoint({
    method: 'POST',
    path: '/auth/login/otp',
    input: OtpLoginInputSchema,
    output: LoginOutputSchema,
    requireAuth: false,
    meta: { summary: 'OTP login', tags: ['auth'] },
  }),

  /** 登出 */
  logout: defineEndpoint({
    method: 'POST',
    path: '/auth/logout',
    input: LogoutInputSchema,
    output: z.void(),
    meta: { summary: 'Logout', tags: ['auth'] },
  }),

  /** 获取当前用户 */
  currentUser: defineEndpoint({
    method: 'GET',
    path: '/auth/me',
    input: z.object({}),
    output: CurrentUserOutputSchema,
    meta: { summary: 'Get current user info', tags: ['auth'] },
  }),

  /** 刷新 Token */
  refreshToken: defineEndpoint({
    method: 'POST',
    path: '/auth/refresh',
    input: RefreshTokenInputSchema,
    output: RefreshTokenOutputSchema,
    requireAuth: false,
    meta: { summary: 'Refresh access token', tags: ['auth'] },
  }),

  /** 发送验证码 */
  sendOtp: defineEndpoint({
    method: 'POST',
    path: '/auth/otp/send',
    input: SendOtpInputSchema,
    output: SendOtpOutputSchema,
    requireAuth: false,
    meta: { summary: 'Send OTP code', tags: ['auth'] },
  }),

  /** 用户注册 */
  register: defineEndpoint({
    method: 'POST',
    path: '/auth/register',
    input: RegisterInputSchema,
    output: RegisterOutputSchema,
    requireAuth: false,
    meta: { summary: 'User registration', tags: ['auth'] },
  }),

  /** 修改密码 */
  changePassword: defineEndpoint({
    method: 'POST',
    path: '/auth/change-password',
    input: ChangePasswordInputSchema,
    output: z.void(),
    meta: { summary: 'Change password', tags: ['auth'] },
  }),

  /** 更新当前用户信息 */
  updateCurrentUser: defineEndpoint({
    method: 'PUT',
    path: '/auth/me',
    input: UpdateCurrentUserInputSchema,
    output: UserSchema,
    meta: { summary: 'Update current user profile', tags: ['auth'] },
  }),

  // ─── Admin — 用户管理 ───

  /** 用户列表（分页 + 搜索 + 状态过滤） */
  listUsers: defineEndpoint({
    method: 'GET',
    path: '/iam/users',
    input: ListUsersInputSchema,
    output: ListUsersOutputSchema,
    meta: { summary: 'List users (admin)', tags: ['admin', 'user'] },
  }),

  /** 获取单个用户 */
  getUser: defineEndpoint({
    method: 'GET',
    path: '/iam/users/:id',
    input: IdParamSchema,
    output: UserSchema,
    meta: { summary: 'Get user by ID (admin)', tags: ['admin', 'user'] },
  }),

  /** 创建用户 */
  createUser: defineEndpoint({
    method: 'POST',
    path: '/iam/users',
    input: AdminCreateUserInputSchema,
    output: UserSchema,
    meta: { summary: 'Create user (admin)', tags: ['admin', 'user'] },
  }),

  /** 更新用户 */
  updateUser: defineEndpoint({
    method: 'PUT',
    path: '/iam/users/:id',
    input: AdminUpdateUserInputSchema,
    output: UserSchema,
    meta: { summary: 'Update user (admin)', tags: ['admin', 'user'] },
  }),

  /** 删除用户 */
  deleteUser: defineEndpoint({
    method: 'DELETE',
    path: '/iam/users/:id',
    input: IdParamSchema,
    output: z.void(),
    meta: { summary: 'Delete user (admin)', tags: ['admin', 'user'] },
  }),

  /** Admin 重置用户密码 */
  adminResetPassword: defineEndpoint({
    method: 'POST',
    path: '/iam/users/:id/reset-password',
    input: AdminResetPasswordInputSchema,
    output: z.void(),
    meta: { summary: 'Reset user password (admin)', tags: ['admin', 'user'] },
  }),

  // ─── Admin — 角色管理 ───

  /** 角色列表 */
  listRoles: defineEndpoint({
    method: 'GET',
    path: '/iam/roles',
    input: PaginationQuerySchema,
    output: ListRolesOutputSchema,
    meta: { summary: 'List roles (admin)', tags: ['admin', 'role'] },
  }),

  /** 获取单个角色 */
  getRole: defineEndpoint({
    method: 'GET',
    path: '/iam/roles/:id',
    input: IdParamSchema,
    output: RoleSchema,
    meta: { summary: 'Get role by ID (admin)', tags: ['admin', 'role'] },
  }),

  /** 创建角色 */
  createRole: defineEndpoint({
    method: 'POST',
    path: '/iam/roles',
    input: CreateRoleInputSchema,
    output: RoleSchema,
    meta: { summary: 'Create role (admin)', tags: ['admin', 'role'] },
  }),

  /** 更新角色 */
  updateRole: defineEndpoint({
    method: 'PUT',
    path: '/iam/roles/:id',
    input: UpdateRoleInputSchema,
    output: RoleSchema,
    meta: { summary: 'Update role (admin)', tags: ['admin', 'role'] },
  }),

  /** 删除角色 */
  deleteRole: defineEndpoint({
    method: 'DELETE',
    path: '/iam/roles/:id',
    input: IdParamSchema,
    output: z.void(),
    meta: { summary: 'Delete role (admin)', tags: ['admin', 'role'] },
  }),

  // ─── Admin — 权限管理 ───

  /** 权限列表（分页 + 搜索 + 类型过滤） */
  listPermissions: defineEndpoint({
    method: 'GET',
    path: '/iam/permissions',
    input: ListPermissionsInputSchema,
    output: ListPermissionsOutputSchema,
    meta: { summary: 'List permissions (admin)', tags: ['admin', 'permission'] },
  }),

  /** 获取单个权限 */
  getPermission: defineEndpoint({
    method: 'GET',
    path: '/iam/permissions/:id',
    input: IdParamSchema,
    output: PermissionSchema,
    meta: { summary: 'Get permission by ID (admin)', tags: ['admin', 'permission'] },
  }),

  /** 创建权限 */
  createPermission: defineEndpoint({
    method: 'POST',
    path: '/iam/permissions',
    input: CreatePermissionInputSchema,
    output: PermissionSchema,
    meta: { summary: 'Create permission (admin)', tags: ['admin', 'permission'] },
  }),

  /** 删除权限 */
  deletePermission: defineEndpoint({
    method: 'DELETE',
    path: '/iam/permissions/:id',
    input: IdParamSchema,
    output: z.void(),
    meta: { summary: 'Delete permission (admin)', tags: ['admin', 'permission'] },
  }),
} as const
