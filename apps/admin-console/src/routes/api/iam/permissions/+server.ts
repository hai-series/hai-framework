/**
 * =============================================================================
 * Admin Console - 权限管理 API
 * =============================================================================
 */

import type { RequestHandler } from '@sveltejs/kit'
import * as m from '$lib/paraglide/messages.js'
import { CreatePermissionSchema } from '$lib/server/schemas/index.js'
import { audit, permissionService } from '$lib/server/services/index.js'
import { core } from '@h-ai/core'
import { kit } from '@h-ai/kit'

/**
 * GET /api/iam/permissions - 获取权限列表
 *
 * 需要权限：permission:read
 */
export const GET: RequestHandler = async ({ locals }) => {
  const denied = kit.guard.assertPermission(locals.session, 'permission:read')
  if (denied)
    return denied

  try {
    const permissions = await permissionService.list()
    return kit.response.ok(permissions)
  }
  catch (error) {
    core.logger.error('Failed to list permissions:', { error })
    return kit.response.internalError(m.api_iam_permissions_list_failed())
  }
}

/**
 * POST /api/iam/permissions - 创建权限
 *
 * 需要权限：permission:manage
 */
export const POST: RequestHandler = async ({ request, locals, getClientAddress }) => {
  const denied = kit.guard.assertPermission(locals.session, 'permission:manage')
  if (denied)
    return denied

  try {
    const { valid, data, errors } = await kit.validate.form(request, CreatePermissionSchema)
    if (!valid) {
      return kit.response.badRequest(errors[0]?.message ?? 'Validation failed')
    }
    const { name, description, resource, action } = data!

    // 生成权限 code
    const code = `${resource}:${action}`

    // 检查权限名称是否已存在
    const existing = await permissionService.getByName(code)
    if (existing) {
      return kit.response.conflict(m.api_iam_permissions_name_exists())
    }

    // 创建权限
    const permission = await permissionService.create({
      code,
      name,
      description,
      resource,
      action,
    })

    // 记录审计日志
    const ip = getClientAddress()
    const ua = request.headers.get('user-agent') ?? undefined
    await audit.crud(
      locals.session?.userId ?? null,
      'create',
      'permission',
      permission.id,
      { name, resource, action },
      ip,
      ua,
    )

    return kit.response.ok(permission)
  }
  catch (error) {
    core.logger.error('Failed to create permission:', { error })
    return kit.response.internalError(m.api_iam_permissions_create_failed())
  }
}
