/**
 * =============================================================================
 * Admin Console - 单个角色管理 API
 * =============================================================================
 */

import type { RequestHandler } from '@sveltejs/kit'
import * as m from '$lib/paraglide/messages.js'
import { IdParamSchema } from '$lib/server/schemas/index.js'
import { audit, permissionService, roleService } from '$lib/server/services/index.js'
import { core } from '@h-ai/core'
import { kit } from '@h-ai/kit'

/**
 * GET /api/iam/roles/[id] - 获取单个角色
 *
 * 需要权限：role:read
 */
export const GET: RequestHandler = async ({ params, locals }) => {
  const denied = kit.guard.assertPermission(locals.session, 'role:read')
  if (denied)
    return denied

  const { valid: paramsValid, data: validatedParams } = kit.validate.params(params, IdParamSchema)
  if (!paramsValid)
    return kit.response.badRequest('Invalid role ID')

  try {
    const role = await roleService.getById(validatedParams!.id)
    if (!role) {
      return kit.response.notFound(m.api_iam_roles_not_found())
    }
    return kit.response.ok(role)
  }
  catch (error) {
    core.logger.error('Failed to get role:', { error })
    return kit.response.internalError(m.api_iam_roles_get_failed())
  }
}

/**
 * PUT /api/iam/roles/[id] - 更新角色
 *
 * 需要权限：role:update
 */
export const PUT: RequestHandler = async ({ params, request, locals, getClientAddress }) => {
  const denied = kit.guard.assertPermission(locals.session, 'role:update')
  if (denied)
    return denied

  try {
    const { valid: paramsValid, data: validatedParams } = kit.validate.params(params, IdParamSchema)
    if (!paramsValid)
      return kit.response.badRequest('Invalid role ID')

    const roleId = validatedParams!.id
    const body = await request.json()
    const { name, description, permissions } = body as {
      name?: string
      description?: string
      permissions?: string[]
    }

    // 检查角色是否存在
    const existing = await roleService.getById(roleId)
    if (!existing) {
      return kit.response.notFound(m.api_iam_roles_not_found())
    }

    // 转换权限名称为 ID
    let permissionIds: string[] | undefined
    if (permissions !== undefined) {
      permissionIds = []
      for (const permName of permissions) {
        const perm = await permissionService.getByName(permName)
        if (perm) {
          permissionIds.push(perm.id)
        }
      }
    }

    // 更新角色
    const role = await roleService.update(roleId, {
      name,
      description,
      permissions: permissionIds,
    })

    // 记录审计日志
    const ip = getClientAddress()
    const ua = request.headers.get('user-agent') ?? undefined
    await audit.crud(
      locals.session?.userId ?? null,
      'update',
      'role',
      roleId,
      { name, permissions },
      ip,
      ua,
    )

    return kit.response.ok(role)
  }
  catch (error) {
    core.logger.error('Failed to update role:', { error })
    const message = error instanceof Error ? error.message : m.api_iam_roles_update_failed()
    return kit.response.internalError(message)
  }
}

/**
 * DELETE /api/iam/roles/[id] - 删除角色
 *
 * 需要权限：role:delete
 */
export const DELETE: RequestHandler = async ({ params, locals, request, getClientAddress }) => {
  const denied = kit.guard.assertPermission(locals.session, 'role:delete')
  if (denied)
    return denied

  try {
    const { valid: paramsValid, data: validatedParams } = kit.validate.params(params, IdParamSchema)
    if (!paramsValid)
      return kit.response.badRequest('Invalid role ID')

    const roleId = validatedParams!.id

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
    await audit.crud(
      locals.session?.userId ?? null,
      'delete',
      'role',
      roleId,
      { name: existing.name },
      ip,
      ua,
    )

    return kit.response.ok(null)
  }
  catch (error) {
    core.logger.error('Failed to delete role:', { error })
    const message = error instanceof Error ? error.message : m.api_iam_roles_delete_failed()
    return kit.response.internalError(message)
  }
}
