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
import { json } from '@sveltejs/kit'

/**
 * GET /api/iam/permissions - 获取权限列表
 */
export const GET: RequestHandler = async () => {
  try {
    const permissions = await permissionService.list()
    return json({ success: true, data: permissions })
  }
  catch (error) {
    core.logger.error('Failed to list permissions:', { error })
    return json({ success: false, error: m.api_iam_permissions_list_failed() }, { status: 500 })
  }
}

/**
 * POST /api/iam/permissions - 创建权限
 */
export const POST: RequestHandler = async ({ request, locals, getClientAddress }) => {
  try {
    const { valid, data, errors } = await kit.validate.form(request, CreatePermissionSchema)
    if (!valid) {
      return json({ success: false, error: errors[0]?.message }, { status: 400 })
    }
    const { name, description, resource, action } = data!

    // 生成权限 code
    const code = `${resource}:${action}`

    // 检查权限名称是否已存在
    const existing = await permissionService.getByName(code)
    if (existing) {
      return json({ success: false, error: m.api_iam_permissions_name_exists() }, { status: 409 })
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

    return json({ success: true, data: permission })
  }
  catch (error) {
    core.logger.error('Failed to create permission:', { error })
    return json({ success: false, error: m.api_iam_permissions_create_failed() }, { status: 500 })
  }
}
