/**
 * =============================================================================
 * Admin Console - 单个权限管理 API
 * =============================================================================
 */

import type { RequestHandler } from '@sveltejs/kit'
import * as m from '$lib/paraglide/messages.js'
import { audit, permissionService } from '$lib/server/services/index.js'
import { core } from '@h-ai/core'
import { kit } from '@h-ai/kit'
import { json } from '@sveltejs/kit'

/**
 * DELETE /api/iam/permissions/[id] - 删除权限
 *
 * 需要权限：permission:manage
 */
export const DELETE: RequestHandler = async ({ params, locals, request, getClientAddress }) => {
  const denied = kit.guard.assertPermission(locals.session, 'permission:manage')
  if (denied)
    return denied

  try {
    const permId = params.id!

    // 检查权限是否存在
    const existing = await permissionService.getById(permId)
    if (!existing) {
      return json({ success: false, error: m.api_iam_permissions_not_found() }, { status: 404 })
    }

    // 删除权限
    await permissionService.delete(permId)

    // 记录审计日志
    const ip = getClientAddress()
    const ua = request.headers.get('user-agent') ?? undefined
    await audit.crud(
      locals.session?.userId ?? null,
      'delete',
      'permission',
      permId,
      { name: existing.name },
      ip,
      ua,
    )

    return json({ success: true })
  }
  catch (error) {
    core.logger.error('Failed to delete permission:', { error })
    const message = error instanceof Error ? error.message : m.api_iam_permissions_delete_failed()
    return json({ success: false, error: message }, { status: 500 })
  }
}
