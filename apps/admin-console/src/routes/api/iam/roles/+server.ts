/**
 * =============================================================================
 * Admin Console - 角色管理 API
 * =============================================================================
 */

import { CreateRoleSchema } from '$lib/server/schemas/index.js'
import { permissionService, roleService } from '$lib/server/services/index.js'
import { audit } from '@h-ai/audit'
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
export const POST = kit.handler(async ({ request, locals, getClientAddress }) => {
  kit.guard.require(locals.session, 'role:api:create')

  const { name, description, permissions } = await kit.validate.body(request, CreateRoleSchema)

  // 生成角色 code：仅保留字母、数字、下划线，防止特殊字符注入
  const code = `role_${name.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')}`

  // 转换权限名称为 ID
  const permissionIds: string[] = []
  if (permissions?.length) {
    for (const permCode of permissions) {
      const perm = await permissionService.getByCode(permCode)
      if (perm) {
        permissionIds.push(perm.id)
      }
    }
  }

  // 创建角色
  const createResult = await roleService.create({
    code,
    name,
    description,
    permissions: permissionIds,
  })

  if (!createResult.success) {
    return kit.response.badRequest(createResult.error.message)
  }

  const role = createResult.data

  // 记录审计日志
  const ip = getClientAddress()
  const ua = request.headers.get('user-agent') ?? undefined
  await audit.helper.crud(
    locals.session!.userId,
    'create',
    'role',
    role.id,
    { name, permissions },
    ip,
    ua,
  )

  return kit.response.ok(role)
})
