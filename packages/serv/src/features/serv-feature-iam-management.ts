import type { HaiResult } from '@h-ai/core'
import type { IamFunctions } from '@h-ai/iam'
import type { ServContext } from '../serv-context.js'
import type { AuthenticatedServContext } from '../serv-router.js'
import { apiContract } from '@h-ai/api-contract'
import { core, HaiCommonError } from '@h-ai/core'
import { requireSensitiveOperation } from '../pipelines/serv-pipeline-guard.js'
import { servM } from '../serv-i18n.js'
import { markServResponsePrivate } from '../serv-route-transport.js'
import { implement } from '../serv-router.js'
import { mapHaiResult } from './serv-feature-helpers.js'

/**
 * IAM 管理的资源授权请求。上下文来自已验证会话，账号或角色 ID 是待授权的目标。
 * @example
 * ```ts
 * import type { IamManagementAccessRequest } from '@h-ai/serv'
 * function canManage(request: IamManagementAccessRequest) {
 *   return 'userId' in request && request.userId === request.context.session.userId
 * }
 * ```
 */
export type IamManagementAccessRequest = {
  readonly operation: 'listApiKeys' | 'createApiKey' | 'getApiKey' | 'revokeApiKey'
  readonly context: AuthenticatedServContext
  readonly userId: string
} | {
  readonly operation: 'listRolePermissions' | 'replaceRolePermissions'
  readonly context: AuthenticatedServContext
  readonly roleId: string
}

/**
 * IAM 管理工厂的依赖。应用必须按自己的账号、角色和租户范围授权目标。
 * @example
 * ```ts
 * import type { IamManagementProcedureDeps } from '@h-ai/serv'
 * import { iam } from '@h-ai/iam'
 * const deps: IamManagementProcedureDeps = { iam, authorize: request => 'userId' in request && request.userId === request.context.session.userId }
 * void deps
 * ```
 */
export interface IamManagementProcedureDeps {
  readonly iam: IamFunctions
  /** 只有返回 true 才允许访问目标账号或角色。 */
  readonly authorize: (request: IamManagementAccessRequest) => boolean | Promise<boolean>
}

function forbidden({ locale }: ServContext): HaiResult<never> {
  return core.err(HaiCommonError.FORBIDDEN, servM('serv_errorForbidden', { locale }))
}

function notFound({ locale }: ServContext): HaiResult<never> {
  return core.err(HaiCommonError.NOT_FOUND, core.i18n.coreM('core_errorNotFound', { locale }))
}

function canDelegate(context: AuthenticatedServContext, code: string): boolean {
  return !code.includes('*') && context.session.permissions.some(granted =>
    granted === '*' || granted === code || (granted.endsWith(':*') && code.startsWith(granted.slice(0, -1))))
}

/**
 * 创建显式挂载的 API Key 管理和角色权限 procedures。
 * @param deps - 已初始化的 IAM 和应用提供的目标授权规则。
 * @param deps.iam - 已初始化的 IAM 模块。
 * @param deps.authorize - 当前会话对目标账号或角色的资源授权策略。
 * @returns 可组装进 `serv.createApp` 的 IAM 管理 router。
 * @example
 * ```ts
 * import { iam } from '@h-ai/iam'
 * import { serv } from '@h-ai/serv'
 * const procedures = serv.createIamManagementProcedures({ iam, authorize: request => 'userId' in request && request.userId === request.context.session.userId })
 * void procedures
 * ```
 */
export function createIamManagementProcedures({ iam, authorize }: IamManagementProcedureDeps) {
  async function allowed(request: IamManagementAccessRequest): Promise<boolean> {
    return typeof authorize === 'function' && await authorize(request) === true
  }

  async function checkSensitive(context: AuthenticatedServContext, operation: string): Promise<HaiResult<void>> {
    return requireSensitiveOperation(iam, context, operation)
  }

  return implement(apiContract.extensions.iam)
    .context<ServContext>()
    .route('apiKeys.list')
    .permission('iam.apiKeys.read')
    .handle(async ({ input: { userId, ...options }, context }) => {
      if (!await allowed({ operation: 'listApiKeys', context, userId }))
        return forbidden(context)
      return iam.apiKey.listApiKeys(userId, options)
    })
    .route('apiKeys.create')
    .permission('iam.apiKeys.write')
    .handle(async ({ input: { userId, ...options }, context }) => {
      markServResponsePrivate(context)
      if (!await allowed({ operation: 'createApiKey', context, userId }) || options.scopes?.some(scope => !canDelegate(context, scope)))
        return forbidden(context)
      const user = await iam.user.getUser(userId)
      if (!user.success)
        return user
      if (!user.data)
        return notFound(context)
      const proof = await checkSensitive(context, 'iam.apiKeys.create')
      return proof.success
        ? iam.apiKey.createApiKey(userId, options)
        : proof
    })
    .route('apiKeys.get')
    .permission('iam.apiKeys.read')
    .handle(async ({ input: { id }, context }) => {
      const found = await iam.apiKey.getApiKey(id)
      if (!found.success)
        return found
      if (!found.data || !await allowed({ operation: 'getApiKey', context, userId: found.data.userId }))
        return notFound(context)
      return core.ok(found.data)
    })
    .route('apiKeys.revoke')
    .permission('iam.apiKeys.write')
    .handle(async ({ input: { id }, context }) => {
      const found = await iam.apiKey.getApiKey(id)
      if (!found.success)
        return found
      if (!found.data || !await allowed({ operation: 'revokeApiKey', context, userId: found.data.userId }))
        return notFound(context)
      const proof = await checkSensitive(context, 'iam.apiKeys.delete')
      return proof.success
        ? iam.apiKey.revokeApiKey(id)
        : proof
    })
    .route('roles.listPermissions')
    .permission('iam.roles.read')
    .handle(async ({ input: { id }, context }) => {
      if (!await allowed({ operation: 'listRolePermissions', context, roleId: id }))
        return forbidden(context)
      const found = await iam.authz.getRole(id)
      if (!found.success)
        return found
      if (!found.data)
        return notFound(context)
      return iam.authz.getRolePermissions(id)
    })
    .route('roles.replacePermissions')
    .permission('iam.roles.write')
    .handle(async ({ input: { id, permissionIds }, context }) => {
      if (!await allowed({ operation: 'replaceRolePermissions', context, roleId: id }))
        return forbidden(context)
      const role = await iam.authz.getRole(id)
      if (!role.success)
        return role
      if (!role.data)
        return notFound(context)
      if (role.data.isSystem || role.data.code === iam.config?.rbac.superAdminRole)
        return forbidden(context)
      const existing = await iam.authz.getRolePermissions(id)
      if (!existing.success)
        return existing
      if (existing.data.some(permission => !canDelegate(context, permission.code)))
        return forbidden(context)

      const requestedIds = [
        ...new Set(permissionIds),
      ]
      for (const permissionId of requestedIds) {
        const permission = await iam.authz.getPermission(permissionId)
        if (!permission.success)
          return permission
        if (!permission.data)
          return notFound(context)
        if (!canDelegate(context, permission.data.code))
          return forbidden(context)
      }
      const proof = await checkSensitive(context, 'iam.roles.replacePermissions')
      if (!proof.success)
        return proof
      return mapHaiResult(await iam.authz.updateRole(id, {
        permissionIds: requestedIds,
        expectedPermissionIds: existing.data.map(permission => permission.id),
      }), () => undefined)
    })
    .build()
}
