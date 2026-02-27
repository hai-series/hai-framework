/**
 * =============================================================================
 * Admin Console - 角色管理 API
 * =============================================================================
 */

import type { RequestHandler } from '@sveltejs/kit'
import * as m from '$lib/paraglide/messages.js'
import { CreateRoleSchema } from '$lib/server/schemas/index.js'
import { audit, permissionService, roleService } from '$lib/server/services/index.js'
import { core } from '@h-ai/core'
import { kit } from '@h-ai/kit'

/**
 * GET /api/iam/roles - 获取角色列表
 *
 * 需要权限：role:read
 */
export const GET: RequestHandler = async ({ locals }) => {
  const denied = kit.guard.assertPermission(locals.session, 'role:read')
  if (denied)
    return denied

  try {
    const roles = await roleService.list()
    return kit.response.ok(roles)
  }
  catch (error) {
    core.logger.error('Failed to list roles:', { error })
    return kit.response.internalError(m.api_iam_roles_list_failed())
  }
}

/**
 * POST /api/iam/roles - 创建角色
 *
 * 需要权限：role:create
 */
export const POST: RequestHandler = async ({ request, locals, getClientAddress }) => {
  const denied = kit.guard.assertPermission(locals.session, 'role:create')
  if (denied)
    return denied

  try {
    const { valid, data, errors } = await kit.validate.form(request, CreateRoleSchema)
    if (!valid) {
      return kit.response.badRequest(errors[0]?.message ?? 'Validation failed')
    }
    const { name, description, permissions } = data!

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
  }
  catch (error) {
    core.logger.error('Failed to create role:', { error })
    return kit.response.internalError(m.api_iam_roles_create_failed())
  }
}
