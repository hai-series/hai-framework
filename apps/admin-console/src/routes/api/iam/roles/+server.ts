/**
 * =============================================================================
 * Admin Console - 角色管理 API
 * =============================================================================
 */

import { createAdminRole, createRoleCode, listAdminRoles, resolvePermissionIds } from '$lib/server/iam-admin.js'
import { CreateRoleSchema } from '$lib/server/schemas/index.js'
import { kit } from '@h-ai/kit'

/**
 * GET /api/iam/roles - 获取角色列表
 *
 * 需要权限：role:list
 */
export const GET = kit.handler(async ({ locals }) => {
  kit.guard.require(locals.session, 'role:list')

  const roles = await listAdminRoles()
  return kit.response.ok(roles)
})

/**
 * POST /api/iam/roles - 创建角色
 *
 * 需要权限：role:api:create
 */
export const POST = kit.handler(async ({ request, locals }) => {
  kit.guard.require(locals.session, 'role:api:create')

  const { name, description, permissions } = await kit.validate.body(request, CreateRoleSchema)

  const permissionIds = await resolvePermissionIds(permissions) ?? []

  // 创建角色（IAM authz 内部已记录审计日志）
  const createResult = await createAdminRole({
    code: createRoleCode(name),
    name,
    description,
    permissions: permissionIds,
  })

  if (!createResult.success) {
    return kit.response.badRequest(createResult.error.message)
  }

  return kit.response.ok(createResult.data)
})
