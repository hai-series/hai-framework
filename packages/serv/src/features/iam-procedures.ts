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
import type { ServContext } from '../context/context-types.js'
import { iamContract } from '@h-ai/api-contract'
import { ok } from '@h-ai/core'
import { implement } from '@orpc/server'
import { requireAuth, requirePermission } from '../pipeline/orpc.js'

/** IAM 默认 procedures 依赖。 */
export interface IamProcedureDeps {
  readonly iam: IamFunctions
}

/** 创建 IAM 默认 procedures。 */
export function createIamProcedures(deps: IamProcedureDeps) {
  const p = implement(iamContract).$context<ServContext>()

  return p.router({
    auth: {
      login: p.auth.login.handler(async ({ input }: { input: IamLoginInput }) => deps.iam.auth.login(input)),
      loginWithOtp: p.auth.loginWithOtp.handler(async ({ input }: { input: IamOtpLoginInput }) => deps.iam.auth.loginWithOtp(input)),
      logout: p.auth.logout.handler(requireAuth<IamLogoutInput, void>(async ({ input, context }) => {
        return deps.iam.auth.logout(input.accessToken ?? context.accessToken ?? '')
      })),
      currentUser: p.auth.currentUser.handler(requireAuth<unknown, User>(async ({ context }) => {
        return deps.iam.user.getCurrentUser(context.accessToken ?? '')
      })),
      refresh: p.auth.refresh.handler(async ({ input }: { input: { refreshToken: string } }) => {
        return wrapTokenPairResult(await deps.iam.session.refresh(input.refreshToken))
      }),
      sendOtp: p.auth.sendOtp.handler(async ({ input }: { input: IamSendOtpInput }) => deps.iam.auth.sendOtp(input.identifier)),
      register: p.auth.register.handler(async ({ input }: { input: IamRegisterInput }) => deps.iam.auth.registerAndLogin(input)),
      changePassword: p.auth.changePassword.handler(requireAuth<IamChangePasswordInput, void>(async ({ input, context }) => {
        return deps.iam.user.changeCurrentUserPassword(context.accessToken ?? '', input.oldPassword, input.newPassword)
      })),
      updateCurrentUser: p.auth.updateCurrentUser.handler(requireAuth<IamUpdateCurrentUserInput, User>(async ({ input, context }) => {
        return deps.iam.user.updateCurrentUser(context.accessToken ?? '', input)
      })),
    },
    users: {
      list: p.users.list.handler(requirePermission<IamListUsersInput, PaginatedResult<User>>('iam.users.read', async ({ input }) => {
        return deps.iam.user.listUsers(input)
      })),
      get: p.users.get.handler(requirePermission<IamUserIdInput, User | null>('iam.users.read', async ({ input }) => {
        return deps.iam.user.getUser(input.id, { include: ['roles'] })
      })),
      create: p.users.create.handler(requirePermission<IamAdminCreateUserInput, User>('iam.users.write', async ({ input }) => {
        return createUser(deps, input)
      })),
      update: p.users.update.handler(requirePermission<IamAdminUpdateUserInput, User>('iam.users.write', async ({ input }) => {
        return updateUser(deps, input)
      })),
      delete: p.users.delete.handler(requirePermission<IamUserIdInput, void>('iam.users.write', async ({ input }) => {
        return deps.iam.user.deleteUser(input.id)
      })),
      resetPassword: p.users.resetPassword.handler(requirePermission<IamAdminResetPasswordInput, void>('iam.users.write', async ({ input }) => {
        return deps.iam.user.adminResetPassword(input.id, input.newPassword)
      })),
    },
    roles: {
      list: p.roles.list.handler(requirePermission<unknown, PaginatedResult<Role>>('iam.roles.read', async () => {
        return deps.iam.authz.getAllRoles()
      })),
      get: p.roles.get.handler(requirePermission<IamUserIdInput, Role | null>('iam.roles.read', async ({ input }) => {
        return deps.iam.authz.getRole(input.id)
      })),
      create: p.roles.create.handler(requirePermission<IamCreateRoleInput, Role>('iam.roles.write', async ({ input }) => {
        return deps.iam.authz.createRole(input)
      })),
      update: p.roles.update.handler(requirePermission<IamUpdateRoleInput, Role>('iam.roles.write', async ({ input }) => {
        const { id, ...data } = input
        return deps.iam.authz.updateRole(id, data)
      })),
      delete: p.roles.delete.handler(requirePermission<IamUserIdInput, void>('iam.roles.write', async ({ input }) => {
        return deps.iam.authz.deleteRole(input.id)
      })),
    },
    permissions: {
      list: p.permissions.list.handler(requirePermission<IamListPermissionsInput, PaginatedResult<Permission>>('iam.permissions.read', async ({ input }) => {
        return deps.iam.authz.getAllPermissions(input)
      })),
      get: p.permissions.get.handler(requirePermission<IamUserIdInput, Permission | null>('iam.permissions.read', async ({ input }) => {
        return deps.iam.authz.getPermission(input.id)
      })),
      create: p.permissions.create.handler(requirePermission<IamCreatePermissionInput, Permission>('iam.permissions.write', async ({ input }) => {
        return deps.iam.authz.createPermission(input)
      })),
      delete: p.permissions.delete.handler(requirePermission<IamUserIdInput, void>('iam.permissions.write', async ({ input }) => {
        return deps.iam.authz.deletePermission(input.id)
      })),
    },
  })
}

async function createUser(deps: IamProcedureDeps, input: IamAdminCreateUserInput): Promise<HaiResult<User>> {
  const registerResult = await deps.iam.user.register(input)
  if (!registerResult.success) {
    return registerResult
  }

  if (input.roleIds?.length) {
    const rolesResult = await deps.iam.authz.syncRoles(registerResult.data.user.id, input.roleIds)
    if (!rolesResult.success) {
      return rolesResult
    }
  }

  if (input.enabled === false) {
    return deps.iam.user.updateUser(registerResult.data.user.id, { enabled: false })
  }

  return ok(registerResult.data.user)
}

async function updateUser(deps: IamProcedureDeps, input: IamAdminUpdateUserInput): Promise<HaiResult<User>> {
  const { id, roleIds, ...data } = input
  const updateResult = await deps.iam.user.updateUser(id, data)
  if (!updateResult.success) {
    return updateResult
  }

  if (roleIds) {
    const rolesResult = await deps.iam.authz.syncRoles(id, roleIds)
    if (!rolesResult.success) {
      return rolesResult
    }
  }

  return updateResult
}

function wrapTokenPairResult(result: HaiResult<TokenPair>): HaiResult<{ tokens: TokenPair }> {
  if (!result.success) {
    return result
  }

  return ok({ tokens: result.data })
}
