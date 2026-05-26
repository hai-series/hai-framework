/**
 * =============================================================================
 * Admin Console - 单个角色管理 API
 * =============================================================================
 */

import * as m from '$lib/paraglide/messages.js'
import { deleteAdminRole, getAdminRole, resolvePermissionIds, updateAdminRole } from '$lib/server/iam-admin.js'
import { IdParamSchema, UpdateRoleSchema } from '$lib/server/schemas/index.js'
import { kit } from '@h-ai/kit'

/**
 * GET /api/iam/roles/[id] - 获取单个角色
 *
 * 需要权限：role:list
 */
export const GET = kit.handler(async ({ params, locals }) => {
  kit.guard.require(locals.session, 'role:list')

  const { id } = kit.validate.params(params, IdParamSchema)

  const role = await getAdminRole(id)
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
export const PUT = kit.handler(async ({ params, request, locals }) => {
  kit.guard.require(locals.session, 'role:api:update')

  const { id: roleId } = kit.validate.params(params, IdParamSchema)
  const input = await kit.validate.body(request, UpdateRoleSchema)

  // 检查角色是否存在
  const existing = await getAdminRole(roleId)
  if (!existing) {
    return kit.response.notFound(m.api_iam_roles_not_found())
  }

  // 批量转换权限代码为 ID
  const permissionIds = await resolvePermissionIds(input.permissions)

  // 更新角色（IAM authz 内部已记录审计日志）
  const updateResult = await updateAdminRole(roleId, {
    name: input.name,
    description: input.description,
    permissions: permissionIds,
  })

  if (!updateResult.success) {
    return kit.response.badRequest(updateResult.error.message)
  }

  return kit.response.ok(updateResult.data)
})

/**
 * DELETE /api/iam/roles/[id] - 删除角色
 *
 * 需要权限：role:api:delete
 */
export const DELETE = kit.handler(async ({ params, locals }) => {
  kit.guard.require(locals.session, 'role:api:delete')

  const { id: roleId } = kit.validate.params(params, IdParamSchema)

  // 检查角色是否存在
  const existing = await getAdminRole(roleId)
  if (!existing) {
    return kit.response.notFound(m.api_iam_roles_not_found())
  }

  // 删除角色（IAM authz 内部已记录审计日志）
  const deleteResult = await deleteAdminRole(roleId)
  if (!deleteResult.success) {
    return kit.response.badRequest(deleteResult.error.message)
  }

  return kit.response.ok(null)
})
