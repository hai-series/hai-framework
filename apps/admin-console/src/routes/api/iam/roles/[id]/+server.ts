/**
 * =============================================================================
 * Admin Console - 单个角色管理 API
 * =============================================================================
 */

import type { RequestHandler } from '@sveltejs/kit'
import * as m from '$lib/paraglide/messages.js'
import { audit, permissionService, roleService } from '$lib/server/services/index.js'
import { core } from '@h-ai/core'
import { json } from '@sveltejs/kit'

/**
 * GET /api/iam/roles/[id] - 获取单个角色
 */
export const GET: RequestHandler = async ({ params }) => {
  try {
    const role = await roleService.getById(params.id!)
    if (!role) {
      return json({ success: false, error: m.api_iam_roles_not_found() }, { status: 404 })
    }
    return json({ success: true, data: role })
  }
  catch (error) {
    core.logger.error('Failed to get role:', { error })
    return json({ success: false, error: m.api_iam_roles_get_failed() }, { status: 500 })
  }
}

/**
 * PUT /api/iam/roles/[id] - 更新角色
 */
export const PUT: RequestHandler = async ({ params, request, locals, getClientAddress }) => {
  try {
    const roleId = params.id!
    const body = await request.json()
    const { name, description, permissions } = body as {
      name?: string
      description?: string
      permissions?: string[]
    }

    // 检查角色是否存在
    const existing = await roleService.getById(roleId)
    if (!existing) {
      return json({ success: false, error: m.api_iam_roles_not_found() }, { status: 404 })
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

    return json({ success: true, data: role })
  }
  catch (error) {
    core.logger.error('Failed to update role:', { error })
    const message = error instanceof Error ? error.message : m.api_iam_roles_update_failed()
    return json({ success: false, error: message }, { status: 500 })
  }
}

/**
 * DELETE /api/iam/roles/[id] - 删除角色
 */
export const DELETE: RequestHandler = async ({ params, locals, request, getClientAddress }) => {
  try {
    const roleId = params.id!

    // 检查角色是否存在
    const existing = await roleService.getById(roleId)
    if (!existing) {
      return json({ success: false, error: m.api_iam_roles_not_found() }, { status: 404 })
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

    return json({ success: true })
  }
  catch (error) {
    core.logger.error('Failed to delete role:', { error })
    const message = error instanceof Error ? error.message : m.api_iam_roles_delete_failed()
    return json({ success: false, error: message }, { status: 500 })
  }
}
