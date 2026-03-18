/**
 * =============================================================================
 * Admin Console - 角色管理 API
 * =============================================================================
 */

import { CreateRoleSchema } from '$lib/server/schemas/index.js'
import { permissionService, roleService } from '$lib/server/services/index.js'
import { kit } from '@h-ai/kit'

/**
 * GET /api/iam/roles - 获取角色列表
 *
 * 需要权限：role:list
 */
export const GET = kit.handler(async ({ locals }) => {
  kit.guard.require(locals.session, 'role:list')

  const roles = await roleService.list()
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

  // 生成角色 code：仅保留字母、数字、下划线，防止特殊字符注入
  const code = `role_${name.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')}`

  // 批量转换权限名称为 ID
  const permissionIds = permissions?.length
    ? (await Promise.all(permissions.map(code => permissionService.getByCode(code))))
        .filter((p): p is NonNullable<typeof p> => p !== null)
        .map(p => p.id)
    : []

  // 创建角色（IAM authz 内部已记录审计日志）
  const createResult = await roleService.create({
    code,
    name,
    description,
    permissions: permissionIds,
  })

  if (!createResult.success) {
    return kit.response.badRequest(createResult.error.message)
  }

  return kit.response.ok(createResult.data)
})
