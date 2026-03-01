/**
 * =============================================================================
 * Admin Console - 单个角色管理 API
 * =============================================================================
 */

import * as m from '$lib/paraglide/messages.js'
import { IdParamSchema, UpdateRoleSchema } from '$lib/server/schemas/index.js'
import { permissionService, roleService } from '$lib/server/services/index.js'
import { audit } from '@h-ai/audit'
import { kit } from '@h-ai/kit'

/**
 * GET /api/iam/roles/[id] - 获取单个角色
 *
 * 需要权限：role:list
 */
export const GET = kit.handler(async ({ params, locals }) => {
  kit.guard.requirePermission(locals.session, 'role:list')

  const { id } = kit.validate.paramsOrFail(params, IdParamSchema)

  const role = await roleService.getById(id)
  if (!role) {
    return kit.response.notFound(m.api_iam_roles_not_found())
  }
  return kit.response.ok(role)
})

/**
 * PUT /api/iam/roles/[id] - 更新角色
 *
 * 需要权限：role:api:update
 */
export const PUT = kit.handler(async ({ params, request, locals, getClientAddress }) => {
  kit.guard.requirePermission(locals.session, 'role:api:update')

  const { id: roleId } = kit.validate.paramsOrFail(params, IdParamSchema)
  const input = await kit.validate.formOrFail(request, UpdateRoleSchema)

  // 检查角色是否存在
  const existing = await roleService.getById(roleId)
  if (!existing) {
    return kit.response.notFound(m.api_iam_roles_not_found())
  }

  // 转换权限代码为 ID
  let permissionIds: string[] | undefined
  if (input.permissions !== undefined) {
    permissionIds = []
    for (const permCode of input.permissions) {
      const perm = await permissionService.getByCode(permCode)
      if (perm) {
        permissionIds.push(perm.id)
      }
    }
  }

  // 更新角色
  const role = await roleService.update(roleId, {
    name: input.name,
    description: input.description,
    permissions: permissionIds,
  })

  // 记录审计日志
  const ip = getClientAddress()
  const ua = request.headers.get('user-agent') ?? undefined
  await audit.helper.crud(
    locals.session!.userId,
    'update',
    'role',
    roleId,
    { name: input.name, permissions: input.permissions },
    ip,
    ua,
  )

  return kit.response.ok(role)
})

/**
 * DELETE /api/iam/roles/[id] - 删除角色
 *
 * 需要权限：role:api:delete
 */
export const DELETE = kit.handler(async ({ params, locals, request, getClientAddress }) => {
  kit.guard.requirePermission(locals.session, 'role:api:delete')

  const { id: roleId } = kit.validate.paramsOrFail(params, IdParamSchema)

  // 检查角色是否存在
  const existing = await roleService.getById(roleId)
  if (!existing) {
    return kit.response.notFound(m.api_iam_roles_not_found())
  }

  // 删除角色
  await roleService.delete(roleId)

  // 记录审计日志
  const ip = getClientAddress()
  const ua = request.headers.get('user-agent') ?? undefined
  await audit.helper.crud(
    locals.session!.userId,
    'delete',
    'role',
    roleId,
    { name: existing.name },
    ip,
    ua,
  )

  return kit.response.ok(null)
})
