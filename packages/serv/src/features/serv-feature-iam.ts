/**
 * @h-ai/serv — IAM 默认 procedures
 *
 * 基于 `@h-ai/iam` 提供开箱即用的 IAM procedures 实现：认证、用户管理、角色权限 CRUD。
 * 通过 `createIamProcedures(deps)` 组装后直接挂载到 oRPC router。
 * @module features/serv-feature-iam
 */

import type {
  IamAdminCreateUserInput,
  IamAdminResetPasswordInput,
  IamAdminUpdateUserInput,
  IamChangePasswordInput,
  IamCreatePermissionInput,
  IamCreateRoleInput,
  IamListPermissionsInput,
  IamListUsersInput,
  IamLoginInput,
  IamLogoutInput,
  IamOtpLoginInput,
  IamRegisterInput,
  IamSendOtpInput,
  IamUpdateCurrentUserInput,
  IamUpdateRoleInput,
  IamUserIdInput,
} from '@h-ai/api-contract'
import type { HaiResult, PaginatedResult } from '@h-ai/core'
import type { IamFunctions, Permission, Role, TokenPair, User } from '@h-ai/iam'
import type { ServContext } from '../serv-context.js'
import { apiContract } from '@h-ai/api-contract'
import { core, err, HaiCommonError, ok } from '@h-ai/core'
import { implement } from '@orpc/server'
import { requireAuth } from '../pipelines/serv-pipeline-require-auth.js'
import { requirePermission } from '../pipelines/serv-pipeline-require-permission.js'
import { servM } from '../serv-i18n.js'
import { mapHaiResult } from './serv-feature-helpers.js'

const iamContract = apiContract.iam

const iamFeatureLogger = core.logger.child({ module: 'serv', scope: 'feature-iam' })

/** IAM 默认 procedures 依赖。 */
export interface IamProcedureDeps {
  readonly iam: IamFunctions
}

/** 创建 IAM 默认 procedures。 */
export function createIamProcedures(deps: IamProcedureDeps) {
  const p = implement(iamContract).$context<ServContext>()
  const { iam } = deps

  return p.router({
    auth: {
      login: p.auth.login.handler(({ input }: { input: IamLoginInput }) => iam.auth.login(input)),
      loginWithOtp: p.auth.loginWithOtp.handler(({ input }: { input: IamOtpLoginInput }) => iam.auth.loginWithOtp(input)),
      logout: p.auth.logout.handler(requireAuth<IamLogoutInput, void>(({ input, context }) => {
        // 不再使用空字符串兜底：requireAuth 已确保 session 存在，但 accessToken 字段可能仍缺失
        // （例如自定义 createContext 未填充）；此时显式返回 UNAUTHORIZED 而非把空 token 透传给 IAM。
        const token = input.accessToken ?? context.accessToken
        if (!token)
          return Promise.resolve(err(HaiCommonError.UNAUTHORIZED, servM('serv_errorUnauthorized', { locale: context.locale })))
        return iam.auth.logout(token)
      })),
      currentUser: p.auth.currentUser.handler(requireAuth<unknown, User>(({ context }) => {
        const token = context.accessToken
        if (!token)
          return Promise.resolve(err(HaiCommonError.UNAUTHORIZED, servM('serv_errorUnauthorized', { locale: context.locale })))
        return iam.user.getCurrentUser(token)
      })),
      refresh: p.auth.refresh.handler(async ({ input }: { input: { refreshToken: string } }) => {
        return mapHaiResult(await iam.session.refresh(input.refreshToken), tokens => ({ tokens }))
      }),
      sendOtp: p.auth.sendOtp.handler(({ input }: { input: IamSendOtpInput }) => iam.auth.sendOtp(input.identifier)),
      register: p.auth.register.handler(({ input }: { input: IamRegisterInput }) => iam.auth.registerAndLogin(input)),
      changePassword: p.auth.changePassword.handler(requireAuth<IamChangePasswordInput, void>(({ input, context }) => {
        const token = context.accessToken
        if (!token)
          return Promise.resolve(err(HaiCommonError.UNAUTHORIZED, servM('serv_errorUnauthorized', { locale: context.locale })))
        return iam.user.changeCurrentUserPassword(token, input.oldPassword, input.newPassword)
      })),
      updateCurrentUser: p.auth.updateCurrentUser.handler(requireAuth<IamUpdateCurrentUserInput, User>(({ input, context }) => {
        const token = context.accessToken
        if (!token)
          return Promise.resolve(err(HaiCommonError.UNAUTHORIZED, servM('serv_errorUnauthorized', { locale: context.locale })))
        return iam.user.updateCurrentUser(token, input)
      })),
    },
    users: {
      list: p.users.list.handler(requirePermission<IamListUsersInput, PaginatedResult<User>>('iam.users.read', ({ input }) => {
        return iam.user.listUsers(input)
      })),
      get: p.users.get.handler(requirePermission<IamUserIdInput, User | null>('iam.users.read', ({ input }) => {
        return iam.user.getUser(input.id, { include: ['roles'] })
      })),
      create: p.users.create.handler(requirePermission<IamAdminCreateUserInput, User>('iam.users.write', ({ input }) => {
        return createUser(iam, input)
      })),
      update: p.users.update.handler(requirePermission<IamAdminUpdateUserInput, User>('iam.users.write', ({ input }) => {
        return updateUser(iam, input)
      })),
      delete: p.users.delete.handler(requirePermission<IamUserIdInput, void>('iam.users.write', ({ input, context }) => {
        // 防止自删：避免管理员误删自己的账号导致授权锁死。
        if (context.session?.userId === input.id)
          return Promise.resolve(err(HaiCommonError.FORBIDDEN, servM('serv_iamCannotDeleteCurrentUser', { locale: context.locale })))
        return iam.user.deleteUser(input.id)
      })),
      resetPassword: p.users.resetPassword.handler(requirePermission<IamAdminResetPasswordInput, void>('iam.users.write', ({ input }) => {
        return iam.user.adminResetPassword(input.id, input.newPassword)
      })),
    },
    roles: {
      list: p.roles.list.handler(requirePermission<unknown, PaginatedResult<Role>>('iam.roles.read', () => {
        return iam.authz.getAllRoles()
      })),
      get: p.roles.get.handler(requirePermission<IamUserIdInput, Role | null>('iam.roles.read', ({ input }) => {
        return iam.authz.getRole(input.id)
      })),
      create: p.roles.create.handler(requirePermission<IamCreateRoleInput, Role>('iam.roles.write', ({ input }) => {
        return iam.authz.createRole(input)
      })),
      update: p.roles.update.handler(requirePermission<IamUpdateRoleInput, Role>('iam.roles.write', ({ input }) => {
        const { id, ...data } = input
        return iam.authz.updateRole(id, data)
      })),
      delete: p.roles.delete.handler(requirePermission<IamUserIdInput, void>('iam.roles.write', ({ input }) => {
        return iam.authz.deleteRole(input.id)
      })),
    },
    permissions: {
      list: p.permissions.list.handler(requirePermission<IamListPermissionsInput, PaginatedResult<Permission>>('iam.permissions.read', ({ input }) => {
        return iam.authz.getAllPermissions(input)
      })),
      get: p.permissions.get.handler(requirePermission<IamUserIdInput, Permission | null>('iam.permissions.read', ({ input }) => {
        return iam.authz.getPermission(input.id)
      })),
      create: p.permissions.create.handler(requirePermission<IamCreatePermissionInput, Permission>('iam.permissions.write', ({ input }) => {
        return iam.authz.createPermission(input)
      })),
      delete: p.permissions.delete.handler(requirePermission<IamUserIdInput, void>('iam.permissions.write', ({ input }) => {
        return iam.authz.deletePermission(input.id)
      })),
    },
  })
}

async function createUser(iam: IamFunctions, input: IamAdminCreateUserInput): Promise<HaiResult<User>> {
  const registerResult = await iam.user.register(input)
  if (!registerResult.success)
    return registerResult

  const userId = registerResult.data.user.id

  // 任何后续步骤失败都需要回滚刚创建的用户，以避免重复用户名/邮箱错误阅存。
  async function rollback(reason: string): Promise<void> {
    const deleteResult = await iam.user.deleteUser(userId)
    if (!deleteResult.success)
      iamFeatureLogger.error('createUser rollback failed, orphan user may exist', { userId, reason, error: deleteResult.error })
  }

  if (input.roleIds?.length) {
    const rolesResult = await iam.authz.syncRoles(userId, input.roleIds)
    if (!rolesResult.success) {
      await rollback('syncRoles failed')
      return rolesResult
    }
  }

  if (input.enabled === false) {
    const updateResult = await iam.user.updateUser(userId, { enabled: false })
    if (!updateResult.success) {
      await rollback('initial disable failed')
      return updateResult
    }
    return updateResult
  }

  return ok(registerResult.data.user)
}

async function updateUser(iam: IamFunctions, input: IamAdminUpdateUserInput): Promise<HaiResult<User>> {
  const { id, roleIds, ...data } = input
  const updateResult = await iam.user.updateUser(id, data)
  if (!updateResult.success)
    return updateResult

  if (roleIds) {
    const rolesResult = await iam.authz.syncRoles(id, roleIds)
    if (!rolesResult.success)
      return rolesResult
  }

  return updateResult
}

// re-export 类型以便 IDE 跳转
export type { TokenPair }
