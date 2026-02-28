/**
 * =============================================================================
 * Admin Console - 角色管理 API
 * =============================================================================
 */

import { CreateRoleSchema } from '$lib/server/schemas/index.js'
import { audit, permissionService, roleService } from '$lib/server/services/index.js'
import { kit } from '@h-ai/kit'

/**
 * GET /api/iam/roles - 获取角色列表
 *
 * 需要权限：role:read
 */
export const GET = kit.handler(async ({ locals }) => {
  kit.guard.requirePermission(locals.session, 'role:read')

  const roles = await roleService.list()
  return kit.response.ok(roles)
})

/**
 * POST /api/iam/roles - 创建角色
 *
 * 需要权限：role:create
 */
export const POST = kit.handler(async ({ request, locals, getClientAddress }) => {
  kit.guard.requirePermission(locals.session, 'role:create')

  const { name, description, permissions } = await kit.validate.formOrFail(request, CreateRoleSchema)

  // 生成角色 code（将名称转为 snake_case）
  const code = `role_${name.toLowerCase().replace(/\s+/g, '_')}`

  // 转换权限名称为 ID
  const permissionIds: string[] = []
  if (permissions?.length) {
    for (const permName of permissions) {
      const perm = await permissionService.getByName(permName)
      if (perm) {
        permissionIds.push(perm.id)
      }
    }
  }

  // 创建角色
  const role = await roleService.create({
    code,
    name,
    description,
    permissions: permissionIds,
  })

  // 记录审计日志
  const ip = getClientAddress()
  const ua = request.headers.get('user-agent') ?? undefined
  await audit.crud(
    locals.session?.userId ?? null,
    'create',
    'role',
    role.id,
    { name, permissions },
    ip,
    ua,
  )

  return kit.response.ok(role)
})
