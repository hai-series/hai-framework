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

import { oc } from '@orpc/contract'
import {
  IamAdminCreateUserInputSchema,
  IamAdminResetPasswordInputSchema,
  IamAdminUpdateUserInputSchema,
  IamAuthResultOutputSchema,
  IamChangePasswordInputSchema,
  IamCreatePermissionInputSchema,
  IamCreateRoleInputSchema,
  IamListPermissionsInputSchema,
  IamListUsersInputSchema,
  IamLoginInputSchema,
  IamLogoutInputSchema,
  IamNullablePermissionOutputSchema,
  IamNullableRoleOutputSchema,
  IamNullableUserOutputSchema,
  IamOtpLoginInputSchema,
  IamPermissionOutputSchema,
  IamPermissionsPageOutputSchema,
  IamRefreshTokenInputSchema,
  IamRefreshTokenOutputSchema,
  IamRegisterInputSchema,
  IamRoleOutputSchema,
  IamRolesPageOutputSchema,
  IamSendOtpInputSchema,
  IamSendOtpOutputSchema,
  IamUpdateCurrentUserInputSchema,
  IamUpdateRoleInputSchema,
  IamUserIdInputSchema,
  IamUserOutputSchema,
  IamUsersPageOutputSchema,
  IamVoidOutputSchema,
} from './iam-schemas.js'

/**
 * IAM auth 端点的路由路径（相对于 apiPrefix）。
 * 作为单一事实来源，供 `@h-ai/serv` 的 cookie 中间件复用，避免硬编码。
 */
export const IAM_AUTH_ROUTES = {
  login: '/auth/login',
  loginWithOtp: '/auth/login/otp',
  register: '/auth/register',
  logout: '/auth/logout',
  refresh: '/auth/refresh',
} as const

/** IAM 领域 oRPC contract。 */
export const iamContract = {
  auth: {
    login: oc
      .route({ method: 'POST', path: IAM_AUTH_ROUTES.login, operationId: 'iam.auth.login', summary: 'Password login', tags: ['iam', 'auth'] })
      .input(IamLoginInputSchema)
      .output(IamAuthResultOutputSchema),
    loginWithOtp: oc
      .route({ method: 'POST', path: IAM_AUTH_ROUTES.loginWithOtp, operationId: 'iam.auth.loginWithOtp', summary: 'OTP login', tags: ['iam', 'auth'] })
      .input(IamOtpLoginInputSchema)
      .output(IamAuthResultOutputSchema),
    logout: oc
      .route({ method: 'POST', path: IAM_AUTH_ROUTES.logout, operationId: 'iam.auth.logout', summary: 'Logout', tags: ['iam', 'auth'] })
      .input(IamLogoutInputSchema)
      .output(IamVoidOutputSchema),
    currentUser: oc
      .route({ method: 'GET', path: '/auth/me', operationId: 'iam.auth.currentUser', summary: 'Get current user', tags: ['iam', 'auth'] })
      .output(IamUserOutputSchema),
    refresh: oc
      .route({ method: 'POST', path: IAM_AUTH_ROUTES.refresh, operationId: 'iam.auth.refresh', summary: 'Refresh access token', tags: ['iam', 'auth'] })
      .input(IamRefreshTokenInputSchema)
      .output(IamRefreshTokenOutputSchema),
    sendOtp: oc
      .route({ method: 'POST', path: '/auth/otp/send', operationId: 'iam.auth.sendOtp', summary: 'Send OTP', tags: ['iam', 'auth'] })
      .input(IamSendOtpInputSchema)
      .output(IamSendOtpOutputSchema),
    register: oc
      .route({ method: 'POST', path: IAM_AUTH_ROUTES.register, operationId: 'iam.auth.register', summary: 'Register and login', tags: ['iam', 'auth'] })
      .input(IamRegisterInputSchema)
      .output(IamAuthResultOutputSchema),
    changePassword: oc
      .route({ method: 'POST', path: '/auth/change-password', operationId: 'iam.auth.changePassword', summary: 'Change current user password', tags: ['iam', 'auth'] })
      .input(IamChangePasswordInputSchema)
      .output(IamVoidOutputSchema),
    updateCurrentUser: oc
      .route({ method: 'PUT', path: '/auth/me', operationId: 'iam.auth.updateCurrentUser', summary: 'Update current user', tags: ['iam', 'auth'] })
      .input(IamUpdateCurrentUserInputSchema)
      .output(IamUserOutputSchema),
  },
  users: {
    list: oc
      .route({ method: 'GET', path: '/iam/users', operationId: 'iam.users.list', summary: 'List users', tags: ['iam', 'users'] })
      .input(IamListUsersInputSchema)
      .output(IamUsersPageOutputSchema),
    get: oc
      .route({ method: 'GET', path: '/iam/users/{id}', operationId: 'iam.users.get', summary: 'Get user', tags: ['iam', 'users'] })
      .input(IamUserIdInputSchema)
      .output(IamNullableUserOutputSchema),
    create: oc
      .route({ method: 'POST', path: '/iam/users', operationId: 'iam.users.create', summary: 'Create user', tags: ['iam', 'users'] })
      .input(IamAdminCreateUserInputSchema)
      .output(IamUserOutputSchema),
    update: oc
      .route({ method: 'PUT', path: '/iam/users/{id}', operationId: 'iam.users.update', summary: 'Update user', tags: ['iam', 'users'] })
      .input(IamAdminUpdateUserInputSchema)
      .output(IamUserOutputSchema),
    delete: oc
      .route({ method: 'DELETE', path: '/iam/users/{id}', operationId: 'iam.users.delete', summary: 'Delete user', tags: ['iam', 'users'] })
      .input(IamUserIdInputSchema)
      .output(IamVoidOutputSchema),
    resetPassword: oc
      .route({ method: 'POST', path: '/iam/users/{id}/reset-password', operationId: 'iam.users.resetPassword', summary: 'Reset user password', tags: ['iam', 'users'] })
      .input(IamAdminResetPasswordInputSchema)
      .output(IamVoidOutputSchema),
  },
  roles: {
    list: oc
      .route({ method: 'GET', path: '/iam/roles', operationId: 'iam.roles.list', summary: 'List roles', tags: ['iam', 'roles'] })
      .output(IamRolesPageOutputSchema),
    get: oc
      .route({ method: 'GET', path: '/iam/roles/{id}', operationId: 'iam.roles.get', summary: 'Get role', tags: ['iam', 'roles'] })
      .input(IamUserIdInputSchema)
      .output(IamNullableRoleOutputSchema),
    create: oc
      .route({ method: 'POST', path: '/iam/roles', operationId: 'iam.roles.create', summary: 'Create role', tags: ['iam', 'roles'] })
      .input(IamCreateRoleInputSchema)
      .output(IamRoleOutputSchema),
    update: oc
      .route({ method: 'PUT', path: '/iam/roles/{id}', operationId: 'iam.roles.update', summary: 'Update role', tags: ['iam', 'roles'] })
      .input(IamUpdateRoleInputSchema)
      .output(IamRoleOutputSchema),
    delete: oc
      .route({ method: 'DELETE', path: '/iam/roles/{id}', operationId: 'iam.roles.delete', summary: 'Delete role', tags: ['iam', 'roles'] })
      .input(IamUserIdInputSchema)
      .output(IamVoidOutputSchema),
  },
  permissions: {
    list: oc
      .route({ method: 'GET', path: '/iam/permissions', operationId: 'iam.permissions.list', summary: 'List permissions', tags: ['iam', 'permissions'] })
      .input(IamListPermissionsInputSchema)
      .output(IamPermissionsPageOutputSchema),
    get: oc
      .route({ method: 'GET', path: '/iam/permissions/{id}', operationId: 'iam.permissions.get', summary: 'Get permission', tags: ['iam', 'permissions'] })
      .input(IamUserIdInputSchema)
      .output(IamNullablePermissionOutputSchema),
    create: oc
      .route({ method: 'POST', path: '/iam/permissions', operationId: 'iam.permissions.create', summary: 'Create permission', tags: ['iam', 'permissions'] })
      .input(IamCreatePermissionInputSchema)
      .output(IamPermissionOutputSchema),
    delete: oc
      .route({ method: 'DELETE', path: '/iam/permissions/{id}', operationId: 'iam.permissions.delete', summary: 'Delete permission', tags: ['iam', 'permissions'] })
      .input(IamUserIdInputSchema)
      .output(IamVoidOutputSchema),
  },
}

export type IamContract = typeof iamContract
