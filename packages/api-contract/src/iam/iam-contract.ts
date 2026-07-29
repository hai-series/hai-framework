/**
 * @h-ai/api-contract — IAM 领域 contract
 *
 * 定义身份认证与权限管理相关 API 的接口边界：
 * - auth：登录、登出、OTP、刷新 Token、注册、修改密码
 * - users：Admin 管理用户（CRUD + 重置密码）
 * - roles：Admin 管理角色（CRUD）
 * - permissions：Admin 管理权限（CRUD）
 *
 * auth.* 入口址前缀为 `/auth`；users/roles/permissions 前缀为 `/iam`。
 * @module iam-contract
 */

import { paginatedSchema } from '../common/pagination-schemas.js'
import { haiResultSchema, HaiVoidResultSchema } from '../common/result-schemas.js'
import { route } from '../common/route.js'
import {
  IamAdminCreateUserInputSchema,
  IamAdminResetPasswordInputSchema,
  IamAdminUpdateUserInputSchema,
  IamAuthResultSchema,
  IamChangePasswordInputSchema,
  IamCreatePermissionInputSchema,
  IamCreateRoleInputSchema,
  IamCurrentUserSchema,
  IamListPermissionsInputSchema,
  IamListUsersInputSchema,
  IamLoginInputSchema,
  IamLogoutInputSchema,
  IamOtpLoginInputSchema,
  IamPermissionSchema,
  IamRefreshTokenDataSchema,
  IamRefreshTokenInputSchema,
  IamRegisterInputSchema,
  IamRoleSchema,
  IamSendOtpDataSchema,
  IamSendOtpInputSchema,
  IamUpdateCurrentUserInputSchema,
  IamUpdateRoleInputSchema,
  IamUserIdInputSchema,
  IamUserSchema,
} from './iam-schemas.js'

// 同一 contract 内被多个接口复用的输出结构保持私有，避免扩大公共 Schema 面。
const authResultOutputSchema = haiResultSchema(IamAuthResultSchema)
const userOutputSchema = haiResultSchema(IamUserSchema)
const roleOutputSchema = haiResultSchema(IamRoleSchema)

/** IAM 领域 oRPC contract。 */
export const iamContract = {
  auth: {
    login: route({ method: 'POST', path: '/auth/login', operationId: 'iam.auth.login', summary: 'Password login', tags: ['iam', 'auth'] })
      .input(IamLoginInputSchema)
      .output(authResultOutputSchema),
    loginWithOtp: route({ method: 'POST', path: '/auth/login/otp', operationId: 'iam.auth.loginWithOtp', summary: 'OTP login', tags: ['iam', 'auth'] })
      .input(IamOtpLoginInputSchema)
      .output(authResultOutputSchema),
    logout: route({ method: 'POST', path: '/auth/logout', operationId: 'iam.auth.logout', summary: 'Logout', tags: ['iam', 'auth'] })
      .input(IamLogoutInputSchema)
      .output(HaiVoidResultSchema),
    currentUser: route({ method: 'GET', path: '/auth/me', operationId: 'iam.auth.currentUser', summary: 'Get current user and access scope', tags: ['iam', 'auth'] })
      .output(haiResultSchema(IamCurrentUserSchema)),
    refresh: route({ method: 'POST', path: '/auth/refresh', operationId: 'iam.auth.refresh', summary: 'Refresh access token', tags: ['iam', 'auth'] })
      .input(IamRefreshTokenInputSchema)
      .output(haiResultSchema(IamRefreshTokenDataSchema)),
    sendOtp: route({ method: 'POST', path: '/auth/otp/send', operationId: 'iam.auth.sendOtp', summary: 'Send OTP', tags: ['iam', 'auth'] })
      .input(IamSendOtpInputSchema)
      .output(haiResultSchema(IamSendOtpDataSchema)),
    register: route({ method: 'POST', path: '/auth/register', operationId: 'iam.auth.register', summary: 'Register and login', tags: ['iam', 'auth'] })
      .input(IamRegisterInputSchema)
      .output(authResultOutputSchema),
    changePassword: route({ method: 'POST', path: '/auth/change-password', operationId: 'iam.auth.changePassword', summary: 'Change current user password', tags: ['iam', 'auth'] })
      .input(IamChangePasswordInputSchema)
      .output(HaiVoidResultSchema),
    updateCurrentUser: route({ method: 'PUT', path: '/auth/me', operationId: 'iam.auth.updateCurrentUser', summary: 'Update current user', tags: ['iam', 'auth'] })
      .input(IamUpdateCurrentUserInputSchema)
      .output(userOutputSchema),
  },
  users: {
    list: route({ method: 'GET', path: '/iam/users', operationId: 'iam.users.list', summary: 'List users', tags: ['iam', 'users'] })
      .input(IamListUsersInputSchema)
      .output(haiResultSchema(paginatedSchema(IamUserSchema))),
    get: route({ method: 'GET', path: '/iam/users/{id}', operationId: 'iam.users.get', summary: 'Get user', tags: ['iam', 'users'] })
      .input(IamUserIdInputSchema)
      .output(haiResultSchema(IamUserSchema.nullable())),
    create: route({ method: 'POST', path: '/iam/users', operationId: 'iam.users.create', summary: 'Create user', tags: ['iam', 'users'] })
      .input(IamAdminCreateUserInputSchema)
      .output(userOutputSchema),
    update: route({ method: 'PUT', path: '/iam/users/{id}', operationId: 'iam.users.update', summary: 'Update user', tags: ['iam', 'users'] })
      .input(IamAdminUpdateUserInputSchema)
      .output(userOutputSchema),
    delete: route({ method: 'DELETE', path: '/iam/users/{id}', operationId: 'iam.users.delete', summary: 'Delete user', tags: ['iam', 'users'] })
      .input(IamUserIdInputSchema)
      .output(HaiVoidResultSchema),
    resetPassword: route({ method: 'POST', path: '/iam/users/{id}/reset-password', operationId: 'iam.users.resetPassword', summary: 'Reset user password', tags: ['iam', 'users'] })
      .input(IamAdminResetPasswordInputSchema)
      .output(HaiVoidResultSchema),
  },
  roles: {
    list: route({ method: 'GET', path: '/iam/roles', operationId: 'iam.roles.list', summary: 'List roles', tags: ['iam', 'roles'] })
      .output(haiResultSchema(paginatedSchema(IamRoleSchema))),
    get: route({ method: 'GET', path: '/iam/roles/{id}', operationId: 'iam.roles.get', summary: 'Get role', tags: ['iam', 'roles'] })
      .input(IamUserIdInputSchema)
      .output(haiResultSchema(IamRoleSchema.nullable())),
    create: route({ method: 'POST', path: '/iam/roles', operationId: 'iam.roles.create', summary: 'Create role', tags: ['iam', 'roles'] })
      .input(IamCreateRoleInputSchema)
      .output(roleOutputSchema),
    update: route({ method: 'PUT', path: '/iam/roles/{id}', operationId: 'iam.roles.update', summary: 'Update role', tags: ['iam', 'roles'] })
      .input(IamUpdateRoleInputSchema)
      .output(roleOutputSchema),
    delete: route({ method: 'DELETE', path: '/iam/roles/{id}', operationId: 'iam.roles.delete', summary: 'Delete role', tags: ['iam', 'roles'] })
      .input(IamUserIdInputSchema)
      .output(HaiVoidResultSchema),
  },
  permissions: {
    list: route({ method: 'GET', path: '/iam/permissions', operationId: 'iam.permissions.list', summary: 'List permissions', tags: ['iam', 'permissions'] })
      .input(IamListPermissionsInputSchema)
      .output(haiResultSchema(paginatedSchema(IamPermissionSchema))),
    get: route({ method: 'GET', path: '/iam/permissions/{id}', operationId: 'iam.permissions.get', summary: 'Get permission', tags: ['iam', 'permissions'] })
      .input(IamUserIdInputSchema)
      .output(haiResultSchema(IamPermissionSchema.nullable())),
    create: route({ method: 'POST', path: '/iam/permissions', operationId: 'iam.permissions.create', summary: 'Create permission', tags: ['iam', 'permissions'] })
      .input(IamCreatePermissionInputSchema)
      .output(haiResultSchema(IamPermissionSchema)),
    delete: route({ method: 'DELETE', path: '/iam/permissions/{id}', operationId: 'iam.permissions.delete', summary: 'Delete permission', tags: ['iam', 'permissions'] })
      .input(IamUserIdInputSchema)
      .output(HaiVoidResultSchema),
  },
}

export type IamContract = typeof iamContract
