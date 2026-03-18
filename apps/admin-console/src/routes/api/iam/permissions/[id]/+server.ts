/**
 * =============================================================================
 * Admin Console - 单个权限管理 API
 * =============================================================================
 */

import * as m from '$lib/paraglide/messages.js'
import { IdParamSchema } from '$lib/server/schemas/index.js'
import { permissionService } from '$lib/server/services/index.js'
import { kit } from '@h-ai/kit'

/**
 * DELETE /api/iam/permissions/[id] - 删除权限
 *
 * 需要权限：permission:api:delete
 */
export const DELETE = kit.handler(async ({ params, locals }) => {
  kit.guard.require(locals.session, 'permission:api:delete')

  const { id: permId } = kit.validate.params(params, IdParamSchema)

  // 检查权限是否存在
  const existing = await permissionService.getById(permId)
  if (!existing) {
    return kit.response.notFound(m.api_iam_permissions_not_found())
  }

  // 系统权限不可删除
  if (existing.is_system) {
    return kit.response.badRequest(m.api_iam_permissions_system_cannot_delete())
  }

  // 删除权限（IAM authz 内部已记录审计日志）
  await permissionService.delete(permId)

  return kit.response.ok(null)
})
