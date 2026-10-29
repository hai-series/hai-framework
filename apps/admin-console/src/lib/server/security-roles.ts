/** 示例应用的职责配置；框架 IAM 不绑定这些业务角色名。 */
import type { HaiResult } from '@h-ai/core'
import type { SessionLike } from '@h-ai/kit'
import * as m from '$lib/paraglide/messages.js'
import { listAdminRoles } from '$lib/server/iam-admin.js'
import { core, err, HaiCommonError, ok } from '@h-ai/core'
import { HaiIamError, iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'
import { error } from '@sveltejs/kit'

const common = ['dashboard:view', 'profile:read']
export const ADMIN_DUTIES = {
  admin: [...common, 'user:read', 'user:list', 'user:create', 'user:update', 'user:delete', 'user:api:create', 'user:api:update', 'user:api:delete', 'role:read', 'role:list', 'role:create', 'role:update', 'role:delete', 'role:api:create', 'role:api:update', 'role:api:delete', 'permission:read', 'permission:list', 'permission:manage', 'permission:create', 'permission:delete', 'permission:api:create', 'permission:api:delete', 'system:modules', 'apikey:list', 'apikey:create', 'apikey:delete'],
  audit_admin: [...common, 'system:logs', 'audit:read', 'audit:backup'],
  config_admin: [...common, 'system:settings'],
  business_operator: [...common, 'feedback:create', 'feedback:read', 'feedback:process', 'feedback:reopen', 'feedback:export'],
  user: [...common, 'feedback:create'],
} as const

/** 页面 load 使用 SvelteKit HttpError；API 的 Response 控制流由 kit.handler 处理。 */
export function requirePagePermission(session: SessionLike | null | undefined, permission: string): void {
  if (!session)
    error(401, { message: m.security_auth_required() })
  if (!kit.guard.check(session, permission))
    error(403, { message: m.security_permission_denied() })
}

/** 启动时同步示例职责；原 admin 的审计/基础配置权限会移交独立角色。 */
export async function seedAdminDuties(names: Record<keyof typeof ADMIN_DUTIES, string>): Promise<HaiResult<void>> {
  if (iam.config?.rbac.superAdminRole && iam.config.rbac.superAdminRole in ADMIN_DUTIES)
    return err(HaiCommonError.VALIDATION_ERROR)
  for (const [code, codes] of Object.entries(ADMIN_DUTIES)) {
    const permissionIds: string[] = []
    for (const permissionCode of codes) {
      let permission = await iam.authz.getPermissionByCode(permissionCode)
      if (!permission.success)
        return permission
      if (!permission.data) {
        permission = await iam.authz.createPermission({ code: permissionCode, name: permissionCode, type: 'api' })
        if (!permission.success) {
          permission = await iam.authz.getPermissionByCode(permissionCode)
          if (!permission.success || !permission.data)
            return permission.success ? err(HaiCommonError.INTERNAL_ERROR) : permission
        }
      }
      if (permission.data)
        permissionIds.push(permission.data.id)
    }
    let role = await iam.authz.getRoleByCode(code)
    if (!role.success)
      return role
    if (!role.data) {
      role = await iam.authz.createRole({ code, name: names[code as keyof typeof ADMIN_DUTIES], isSystem: true })
      if (!role.success) {
        role = await iam.authz.getRoleByCode(code)
        if (!role.success || !role.data)
          return role.success ? err(HaiCommonError.INTERNAL_ERROR) : role
      }
    }
    if (!role.data)
      return err(HaiCommonError.INTERNAL_ERROR)
    const updated = await iam.authz.updateRole(role.data.id, { name: names[code as keyof typeof ADMIN_DUTIES], permissionIds })
    if (!updated.success)
      return updated
  }
  return ok(undefined)
}

/** 权限定义和 API Key 的委托范围不能超出操作者已有权限。 */
export function requireGrantablePermissions(actor: SessionLike | null | undefined, codes: string[]): void {
  for (const code of codes) {
    if (code.includes('*') || !kit.guard.check(actor, code))
      throw kit.response.forbidden()
  }
}

/** 账号管理员可配置基础成员；职责权限仍限制在本人可管理的范围。 */
export function canGrantRole(actor: SessionLike | null | undefined, role: { code: string, permissions: string[] }): boolean {
  if (role.code === iam.config?.rbac.superAdminRole)
    return false
  const basicMember = role.code === 'user'
    && (kit.guard.check(actor, 'user:api:create') || kit.guard.check(actor, 'user:api:update'))
    && role.permissions.every(code => (ADMIN_DUTIES.user as readonly string[]).includes(code))
  return basicMember || role.permissions.every(code => !code.includes('*') && kit.guard.check(actor, code))
}

export async function requireManageableRoles(actor: SessionLike | null | undefined, ids: string[] | undefined): Promise<void> {
  for (const id of ids ?? []) {
    const role = await iam.authz.getRole(id)
    if (!role.success)
      throw kit.response.fromError(role.error)
    if (!role.data || role.data.code === iam.config?.rbac.superAdminRole)
      throw kit.response.forbidden()
    const permissions = await iam.authz.getRolePermissions(id)
    if (!permissions.success)
      throw kit.response.fromError(permissions.error)
    if (!canGrantRole(actor, { code: role.data.code, permissions: permissions.data.map(permission => permission.code) }))
      throw kit.response.forbidden()
  }
}

/** 系统管理员可分配所有应用职责；一个账号不能同时承担多个管理职责。 */
export async function requireAssignableRoles(actor: SessionLike | null | undefined, ids: string[] | undefined): Promise<void> {
  if (!ids)
    return
  if (!kit.guard.check(actor, 'user:api:create') && !kit.guard.check(actor, 'user:api:update'))
    throw kit.response.forbidden()
  const duties = new Set<string>()
  for (const id of new Set(ids)) {
    const role = await iam.authz.getRole(id)
    if (!role.success)
      throw kit.response.fromError(role.error)
    if (!role.data || role.data.code === iam.config?.rbac.superAdminRole)
      throw kit.response.forbidden()
    if (role.data.code !== 'user' && Object.hasOwn(ADMIN_DUTIES, role.data.code))
      duties.add(role.data.code)
  }
  if (duties.size > 1)
    throw kit.response.badRequest(m.security_duty_conflict())
}

/** 代发 API Key 会取得目标账号的业务访问能力，继续按权限子集校验。 */
export async function requireManageableApiKeyOwner(actor: SessionLike | null | undefined, id: string): Promise<void> {
  const roles = await iam.authz.getUserRoles(id)
  if (!roles.success)
    throw kit.response.fromError(roles.error)
  await requireManageableRoles(actor, roles.data.map(role => role.id))
}

/** 未分配的自定义定义可清理；删除不能撤销其他职责角色的权限。 */
export async function requireManageablePermission(actor: SessionLike | null | undefined, code: string): Promise<void> {
  const roles = await listAdminRoles()
  if (roles.some(role => role.permissions.includes(code) && !canGrantRole(actor, role)))
    throw kit.response.forbidden()
}

/** 由部署者显式注入独立密码创建另一职责账号；已有账号不改密、不提权。 */
export async function bootstrapDutyAccount(username: 'audit_admin' | 'config_admin' | 'business_operator', providedPassword?: string): Promise<HaiResult<void>> {
  const password = providedPassword?.trim()
  if (!password)
    return ok(undefined)
  const created = await iam.user.createUser({ username, password })
  if (!created.success)
    return created.error.code === HaiIamError.USER_ALREADY_EXISTS.code ? ok(undefined) : created
  const role = await iam.authz.getRoleByCode(username)
  if (!role.success || !role.data)
    return role.success ? err(HaiCommonError.INTERNAL_ERROR) : role
  const assigned = await iam.authz.syncRoles(created.data.user.id, [role.data.id])
  if (!assigned.success) {
    const removed = await iam.user.deleteUser(created.data.user.id)
    if (!removed.success)
      core.logger.error('Failed to roll back duty account bootstrap', { userId: created.data.user.id, errorCode: removed.error.code })
  }
  return assigned
}
