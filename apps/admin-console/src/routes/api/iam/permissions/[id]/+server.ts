/**
 * =============================================================================
 * Admin Console - 单个权限管理 API
 * =============================================================================
 */

import * as m from '$lib/paraglide/messages.js'
import { IdParamSchema } from '$lib/server/schemas/index.js'
import { audit, permissionService } from '$lib/server/services/index.js'
import { kit } from '@h-ai/kit'

/**
 * DELETE /api/iam/permissions/[id] - 删除权限
 *
 * 需要权限：permission:manage
 */
export const DELETE = kit.handler(async ({ params, locals, request, getClientAddress }) => {
  kit.guard.requirePermission(locals.session, 'permission:manage')

  const { id: permId } = kit.validate.paramsOrFail(params, IdParamSchema)

  // 检查权限是否存在
  const existing = await permissionService.getById(permId)
  if (!existing) {
    return kit.response.notFound(m.api_iam_permissions_not_found())
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

  return kit.response.ok(null)
})
