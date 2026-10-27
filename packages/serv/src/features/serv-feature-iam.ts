/**
 * @h-ai/serv — IAM 默认 procedures
 *
 * 基于 `@h-ai/iam` 提供开箱即用的 IAM procedures 实现：认证、用户管理、角色权限 CRUD。
 * @module features/serv-feature-iam
 */

import type {
  IamAdminCreateUserInput,
  IamAdminUpdateUserInput,
  IamCurrentUser,
  IamInviteUserInput,
} from '@h-ai/api-contract'
import type { HaiResult } from '@h-ai/core'
import type { IamFunctions, TokenPair, User } from '@h-ai/iam'
import type { ServContext } from '../serv-context.js'
import { apiContract } from '@h-ai/api-contract'
import { core, err, HaiCommonError, ok } from '@h-ai/core'
import { servM } from '../serv-i18n.js'
import { implement } from '../serv-router.js'
import { mapHaiResult } from './serv-feature-helpers.js'

const iamContract = apiContract.iam

const iamFeatureLogger = core.logger.child({ module: 'serv', scope: 'feature-iam' })

/**
 * IAM 默认 procedures 依赖。
 *
 * @example
 * ```ts
 * import { iam } from '@h-ai/iam'
 * import { createIamProcedures } from '@h-ai/serv/features/iam'
 *
 * // 宿主已初始化 IAM 及共享依赖。
 * const procedures = createIamProcedures({ iam })
 * // logout 撤销请求持有的 opaque access token；过期 access 也可撤销 refresh，
 * // 不接收 userId，不要求有效 access 的 auth guard，失败仍检查 HaiResult。
 * ```
 */
export interface IamProcedureDeps {
  readonly iam: IamFunctions
}

/**
 * 创建默认 IAM procedures；按操作声明认证/权限。logout 只撤销请求持有的完整 opaque token，不要求该 access 尚有效，也不能按 userId 撤销。
 *
 * @example
 * ```ts
 * import { iam } from '@h-ai/iam'
 * import { createIamProcedures } from '@h-ai/serv/features/iam'
 *
 * // 宿主已初始化 IAM 及共享依赖。
 * const procedures = createIamProcedures({ iam })
 * // logout 撤销请求持有的 opaque access token；过期 access 也可撤销 refresh，
 * // 不接收 userId，不要求有效 access 的 auth guard，失败仍检查 HaiResult。
 * ```
 */
export function createIamProcedures(deps: IamProcedureDeps) {
  const { iam } = deps

  // 权限守卫先执行；额外鉴别只绑定已授权操作，不提升原有权限。
  async function sensitive<T>(context: ServContext, operation: string, run: () => Promise<HaiResult<T>>): Promise<HaiResult<T>> {
    const policy = iam.publicConfig?.reauthentication
    if (policy?.enabled) {
      const checked = await iam.auth.checkSensitiveOperation(context.accessToken ?? '', operation, context.request.headers.get('x-hai-reauthentication') ?? undefined)
      if (!checked.success)
        return checked
    }
    return run()
  }

  return implement(iamContract)
    .context<ServContext>()

    .route('auth.reauthenticate')
    .auth()
    .handle(({ input, context }) => iam.auth.reauthenticate(context.accessToken ?? '', input.password, input.operation))

    .route('auth.login', ({ input, context }) => iam.auth.login(input, context))
    .route('auth.createCaptcha', ({ input }) => iam.auth.createCaptcha(input))
    .route('auth.loginWithOtp', ({ input, context }) => iam.auth.loginWithOtp(input, context))
    .route('auth.loginWithLdap', ({ input, context }) => iam.auth.loginWithLdap(input, context))
    .route('auth.publicConfig', () => iam.getPublicConfig())
    .route('auth.renewPassword', ({ input }) => iam.user.renewPassword(input))
    .route('auth.requestPasswordReset', ({ input }) => iam.user.requestPasswordReset(input.identifier, input))
    .route('auth.confirmPasswordReset', ({ input }) => iam.user.confirmPasswordReset(input.token, input.newPassword))

    .route('auth.logout', ({ input, context }) => {
      // 仅撤销调用方持有的完整随机令牌；不要求 access 仍有效，也不接受 userId 撤销。
      const token = input.accessToken ?? context.accessToken
      if (!token)
        return err(HaiCommonError.UNAUTHORIZED, servM('serv_errorUnauthorized', { locale: context.locale }))
      return iam.auth.logout(token)
    })

    .route('auth.closeSession', ({ input, context }) => {
      // 页面离开只撤销持有的会话，不清 Cookie，避免迟到响应覆盖下一文档的新登录。
      const token = input.accessToken ?? context.accessToken
      if (!token)
        return err(HaiCommonError.UNAUTHORIZED, servM('serv_errorUnauthorized', { locale: context.locale }))
      return iam.auth.logout(token)
    })

    .route('auth.currentUser')
    .auth()
    .handle(async ({ context }) => {
      const token = context.accessToken
      if (!token)
        return err(HaiCommonError.UNAUTHORIZED, servM('serv_errorUnauthorized', { locale: context.locale }))

      return mapHaiResult<User, IamCurrentUser>(
        await iam.user.getCurrentUser(token),
        user => ({
          ...user,
          roles: context.session.roles,
          permissions: context.session.permissions,
        }),
      )
    })

    .route('auth.refresh', async ({ input }) => {
      return mapHaiResult(await iam.session.refresh(input.refreshToken), tokens => ({ tokens }))
    })
    .route('auth.sendOtp', ({ input }) => iam.auth.sendOtp(input.identifier, input))
    .route('auth.register', ({ input, context }) => iam.auth.registerAndLogin(input, context))

    .route('auth.changePassword')
    .auth()
    .handle(({ input, context }) => {
      const token = context.accessToken
      if (!token)
        return err(HaiCommonError.UNAUTHORIZED, servM('serv_errorUnauthorized', { locale: context.locale }))
      return iam.user.changeCurrentUserPassword(token, input.oldPassword, input.newPassword)
    })

    .route('auth.updateCurrentUser')
    .auth()
    .handle(async ({ input, context }) => {
      const token = context.accessToken
      if (!token)
        return err(HaiCommonError.UNAUTHORIZED, servM('serv_errorUnauthorized', { locale: context.locale }))
      const policy = await iam.getPublicConfig()
      if (!policy.success)
        return policy
      // 标准资料入口与独立资料/头像入口共用策略；混合更新优先使用资料用途。
      const operations = [
        ...(Object.keys(input).some(key => key !== 'avatarUrl') ? ['iam.profile.update'] : []),
        ...(input.avatarUrl !== undefined ? ['iam.profile.avatar'] : []),
      ]
      const operation = operations.find(value => policy.data.reauthentication.operations.includes(value)) ?? operations[0] ?? 'iam.profile.update'
      return sensitive(context, operation, () => iam.user.updateCurrentUser(token, input))
    })

    .route('users.list')
    .permission('iam.users.read')
    .handle(({ input }) => iam.user.listUsers(input))

    .route('users.get')
    .permission('iam.users.read')
    .handle(({ input }) => iam.user.getUser(input.id, { include: ['roles'] }))

    .route('users.create')
    .permission('iam.users.write')
    .handle(({ input, context }) => sensitive(context, 'iam.users.create', () => createUser(iam, input)))

    .route('users.invite')
    .permission('iam.users.write')
    .handle(({ input, context }) => sensitive(context, 'iam.users.invite', () => createUser(iam, input)))

    .route('users.update')
    .permission('iam.users.write')
    .handle(({ input, context }) => sensitive(context, 'iam.users.update', () => updateUser(iam, input)))

    .route('users.delete')
    .permission('iam.users.write')
    .handle(({ input, context }) => {
      // 防止自删：避免管理员误删自己的账号导致授权锁死。
      if (context.session.userId === input.id)
        return err(HaiCommonError.FORBIDDEN, servM('serv_iamCannotDeleteCurrentUser', { locale: context.locale }))
      return sensitive(context, 'iam.users.delete', () => iam.user.deleteUser(input.id))
    })

    .route('users.resetPassword')
    .permission('iam.users.write')
    .handle(({ input, context }) => sensitive(context, 'iam.users.resetPassword', () => iam.user.adminResetPassword(input.id, input.newPassword)))

    .route('roles.list')
    .permission('iam.roles.read')
    .handle(() => iam.authz.getAllRoles())

    .route('roles.get')
    .permission('iam.roles.read')
    .handle(({ input }) => iam.authz.getRole(input.id))

    .route('roles.create')
    .permission('iam.roles.write')
    .handle(({ input, context }) => sensitive(context, 'iam.roles.create', () => iam.authz.createRole(input)))

    .route('roles.update')
    .permission('iam.roles.write')
    .handle(({ input, context }) => {
      const { id, ...data } = input
      return sensitive(context, 'iam.roles.update', () => iam.authz.updateRole(id, data))
    })

    .route('roles.delete')
    .permission('iam.roles.write')
    .handle(({ input, context }) => sensitive(context, 'iam.roles.delete', () => iam.authz.deleteRole(input.id)))

    .route('permissions.list')
    .permission('iam.permissions.read')
    .handle(({ input }) => iam.authz.getAllPermissions(input))

    .route('permissions.get')
    .permission('iam.permissions.read')
    .handle(({ input }) => iam.authz.getPermission(input.id))

    .route('permissions.create')
    .permission('iam.permissions.write')
    .handle(({ input, context }) => sensitive(context, 'iam.permissions.create', () => iam.authz.createPermission(input)))

    .route('permissions.setSensitiveOperations')
    .permission('iam.permissions.write')
    .handle(({ input, context }) => sensitive(context, 'iam.permissions.sensitiveOperations', () => iam.authz.setPermissionSensitiveOperations(input.id, input.sensitiveOperations)))

    .route('permissions.delete')
    .permission('iam.permissions.write')
    .handle(({ input, context }) => sensitive(context, 'iam.permissions.delete', () => iam.authz.deletePermission(input.id)))

    .build()
}

async function createUser(iam: IamFunctions, input: IamAdminCreateUserInput | IamInviteUserInput): Promise<HaiResult<User>> {
  const invited = !('password' in input)
  const registerResult = 'password' in input ? await iam.user.createUser(input) : await iam.user.inviteUser(input)
  if (!registerResult.success)
    return registerResult

  const userId = registerResult.data.user.id

  // 任何后续步骤失败都需要回滚刚创建的用户，以避免重复用户名/邮箱错误阅存。
  async function rollback(reason: string): Promise<void> {
    if (invited) {
      // 邀请可能已经送达，不能回滚外部已发布凭据；保留账号供管理员补齐配置。
      iamFeatureLogger.error('Invited account requires configuration repair', { userId, reason })
      return
    }
    const deleteResult = await iam.user.deleteUser(userId)
    if (!deleteResult.success)
      iamFeatureLogger.error('createUser rollback failed, orphan user may exist', { userId, reason, error: deleteResult.error })
  }

  if (input.roleIds !== undefined) {
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
